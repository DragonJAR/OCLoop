import { describe, expect, it } from "bun:test"
import { foldPathCase, isCaseInsensitiveFs, normalizePathForComparison, pathsEqual } from "./path-semantics"

describe("isCaseInsensitiveFs", () => {
  it("returns true for win32 and darwin", () => {
    expect(isCaseInsensitiveFs("win32")).toBe(true)
    expect(isCaseInsensitiveFs("darwin")).toBe(true)
  })

  it("returns false for linux and other posix platforms", () => {
    expect(isCaseInsensitiveFs("linux")).toBe(false)
    expect(isCaseInsensitiveFs("freebsd")).toBe(false)
    expect(isCaseInsensitiveFs("openbsd")).toBe(false)
    expect(isCaseInsensitiveFs("sunos")).toBe(false)
  })

  it("defaults to process.platform", () => {
    expect(isCaseInsensitiveFs()).toBe(process.platform === "win32" || process.platform === "darwin")
  })
})

describe("foldPathCase", () => {
  it("folds to lowercase on win32 and darwin", () => {
    expect(foldPathCase("Src/App.TSX", "win32")).toBe("src/app.tsx")
    expect(foldPathCase("Src/App.TSX", "darwin")).toBe("src/app.tsx")
  })

  it("preserves case on linux", () => {
    expect(foldPathCase("Src/App.TSX", "linux")).toBe("Src/App.TSX")
  })
})

describe("normalizePathForComparison", () => {
  it("normalizes slashes and case on win32", () => {
    expect(normalizePathForComparison("C:/Repo/Sub/../PLAN.md", "win32")).toBe("c:\\repo\\plan.md")
    expect(normalizePathForComparison("C:\\Repo\\PLAN.md\\", "win32")).toBe("c:\\repo\\plan.md")
  })

  it("preserves Windows drive root", () => {
    expect(normalizePathForComparison("C:\\", "win32")).toBe("c:\\")
  })

  it("normalizes redundant slashes and case on darwin", () => {
    expect(normalizePathForComparison("/Users/Repo//PLAN.md", "darwin")).toBe("/users/repo/plan.md")
    expect(normalizePathForComparison("/Users/Repo/PLAN.md/", "darwin")).toBe("/users/repo/plan.md")
  })

  it("preserves root slash on POSIX", () => {
    expect(normalizePathForComparison("/", "darwin")).toBe("/")
    expect(normalizePathForComparison("/", "linux")).toBe("/")
  })

  it("normalizes segments on linux without case-folding", () => {
    expect(normalizePathForComparison("/home/repo/./PLAN.md", "linux")).toBe("/home/repo/PLAN.md")
    expect(normalizePathForComparison("/home/repo/plan.md", "linux")).toBe("/home/repo/plan.md")
  })
})

describe("pathsEqual", () => {
  it("returns true for identical string shortcuts", () => {
    expect(pathsEqual("foo/bar", "foo/bar")).toBe(true)
  })

  it("handles case-insensitivity on win32 and darwin", () => {
    expect(pathsEqual("PLAN.md", "plan.md", "win32")).toBe(true)
    expect(pathsEqual("PLAN.md", "plan.md", "darwin")).toBe(true)
    expect(pathsEqual("PLAN.md", "plan.md", "linux")).toBe(false)
  })

  it("handles separator variations on win32", () => {
    expect(pathsEqual("C:/repo/plan.md", "c:\\repo\\PLAN.MD", "win32")).toBe(true)
    expect(pathsEqual("a/b/c", "a\\B\\c", "win32")).toBe(true)
  })

  it("handles relative segments and trailing slashes", () => {
    expect(pathsEqual("/repo/sub/../plan.md", "/repo/plan.md", "darwin")).toBe(true)
    expect(pathsEqual("/repo/sub/../plan.md", "/repo/plan.md", "linux")).toBe(true)
    expect(pathsEqual("/repo/dir/", "/repo/dir", "linux")).toBe(true)
    expect(pathsEqual("C:\\repo\\dir\\", "c:\\repo\\dir", "win32")).toBe(true)
  })

  it("respects case on linux", () => {
    expect(pathsEqual("src/App.tsx", "src/app.tsx", "linux")).toBe(false)
    expect(pathsEqual("src/App.tsx", "src/App.tsx", "linux")).toBe(true)
  })
})
