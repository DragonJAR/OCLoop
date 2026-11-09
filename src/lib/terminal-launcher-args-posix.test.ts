/**
 * POSIX branch of the custom-terminal args parser (T13-D P10-N2): backslash
 * is an escape outside quotes and inside double quotes. Pinned to linux via
 * `withPlatform`; the win32 branch (backslash preserved) is covered in
 * terminal-launcher.test.ts.
 */
import { describe, expect, it } from "bun:test"
import { parseCustomArgsPattern } from "./terminal-launcher"
import { withPlatform } from "./test-helpers/with-platform"

const parse = (pattern: string) =>
  withPlatform("linux", () => parseCustomArgsPattern(pattern))

describe("parseCustomArgsPattern — POSIX (linux)", () => {
  it("treats an unquoted backslash as an escape for the next char", async () => {
    expect(await parse(String.raw`--title a\ b -e {cmd}`)).toEqual([
      { value: "--title", quoted: false },
      { value: "a b", quoted: false },
      { value: "-e", quoted: false },
      { value: "{cmd}", quoted: false },
    ])
  })

  it("lets a backslash escape a quote inside double quotes", async () => {
    expect(await parse(String.raw`-e "say \"hi\" {cmd}"`)).toEqual([
      { value: "-e", quoted: false },
      { value: 'say "hi" {cmd}', quoted: true },
    ])
  })

  it("lets a backslash escape a backslash inside double quotes", async () => {
    expect((await parse(String.raw`"a\\b"`))[0].value).toBe(String.raw`a\b`)
  })

  it("keeps a backslash literal inside single quotes", async () => {
    expect(await parse(String.raw`'a\b' {cmd}`)).toEqual([
      { value: String.raw`a\b`, quoted: true },
      { value: "{cmd}", quoted: false },
    ])
  })

  it("keeps a trailing lone backslash as a literal backslash", async () => {
    expect((await parse("-e {cmd} \\")).at(-1)?.value).toBe("\\")
  })

  it("rejects an unterminated quote", async () => {
    await expect(parse(`-e "{cmd}`)).rejects.toThrow()
  })
})
