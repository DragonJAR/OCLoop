import { describe, expect, test } from "bun:test";
import { truncate, titlecase } from "./locale";

describe("locale utilities", () => {
  describe("truncate", () => {
    test("returns original string if length is less than or equal to limit", () => {
      expect(truncate("hello", 10)).toBe("hello");
      expect(truncate("hello", 5)).toBe("hello");
    });

    test("truncates string and adds ellipsis if length exceeds limit", () => {
      expect(truncate("hello world", 8)).toBe("hello w…");
      expect(truncate("hello world", 5)).toBe("hell…");
    });

    test("never overflows for len <= 0 (negative slice index bug)", () => {
      // A naive slice(0, len-1) with len<=0 is a from-end index that returns a
      // near-full string — longer than the requested width. Must be "".
      expect(truncate("hello world", 0)).toBe("");
      expect(truncate("hello world", -3)).toBe("");
      // len === 1 keeps only the ellipsis, never a negative index.
      expect(truncate("hello world", 1)).toBe("…");
    });
  });

  describe("titlecase", () => {
    test("capitalizes first letter of each word", () => {
      expect(titlecase("hello world")).toBe("Hello World");
      expect(titlecase("HELLO WORLD")).toBe("Hello World");
      expect(titlecase("hello")).toBe("Hello");
    });

    test("handles mixed case", () => {
      expect(titlecase("hElLo wOrLd")).toBe("Hello World");
    });
  });
});
