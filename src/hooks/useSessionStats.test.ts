import { describe, expect, it } from "bun:test";
import { useSessionStats } from "./useSessionStats";
import { createRoot } from "solid-js";

describe("useSessionStats", () => {
  it("should initialize with zero values", () => {
    createRoot((dispose) => {
      const stats = useSessionStats();
      expect(stats.tokens()).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      expect(stats.totalTokens()).toBe(0);
      dispose();
    });
  });

  it("accumulates tokens globally (no per-call reset)", () => {
    createRoot((dispose) => {
      const stats = useSessionStats();
      stats.addTokens({ input: 100, output: 50 });
      expect(stats.tokens()).toEqual({ input: 100, output: 50, cacheRead: 0, cacheWrite: 0 });
      expect(stats.totalTokens()).toBe(150);
      stats.addTokens({ input: 200 });
      expect(stats.tokens()).toEqual({ input: 300, output: 50, cacheRead: 0, cacheWrite: 0 });
      expect(stats.totalTokens()).toBe(350);
      dispose();
    });
  });

  it("totalTokens includes cacheRead and cacheWrite (C3)", () => {
    createRoot((dispose) => {
      const stats = useSessionStats();
      stats.addTokens({ input: 100, output: 50, cacheRead: 20, cacheWrite: 10 });
      expect(stats.totalTokens()).toBe(180);
      dispose();
    });
  });

  it("resetTaskTokens zeroes ONLY the per-task counter, never the global run total (Parte D)", () => {
    createRoot((dispose) => {
      const stats = useSessionStats();
      stats.addTokens({ input: 100, output: 50 });
      stats.resetTaskTokens();
      expect(stats.taskTokens()).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      expect(stats.tokens()).toEqual({ input: 100, output: 50, cacheRead: 0, cacheWrite: 0 });
      dispose();
    });
  });
});
