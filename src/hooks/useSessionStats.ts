import { createSignal, Accessor } from "solid-js";

/**
 * Shape entregado por el evento SSE `session.diff` (una entrada por archivo
 * editado en la sesión). Se reduce a {@link SessionDiff} vía
 * {@link UseSessionStatsReturn.setDiffFromFiles}. Vive aquí (y se re-exporta
 * desde `useSSE.ts` para el handler del stream) para que el hook sea la
 * única fuente de verdad del shape que la UI consume.
 */
export interface FileDiff {
  file: string;
  additions: number;
  deletions: number;
}

export interface SessionTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface SessionDiff {
  additions: number;
  deletions: number;
  files: number;
}

export interface UseSessionStatsReturn {
  tokens: Accessor<SessionTokens>;
  /** Tokens for the CURRENT task/iteration only (zeroed via resetTaskTokens). */
  taskTokens: Accessor<SessionTokens>;
  diff: Accessor<SessionDiff>;
  totalTokens: Accessor<number>;
  addTokens: (tokens: Partial<SessionTokens>) => void;
  setDiff: (diff: SessionDiff) => void;
  /**
   * Reduce a `session.diff` payload (one entry per file edited in the session)
   * into the aggregate {@link SessionDiff} and store it. The SSE event is the
   * session's accumulated state (not a per-edit delta), so this replaces (not
   * adds to) the previous value — matching the contract of `setDiff`.
   * Single-sources the reduction so App.tsx's `onSessionDiff` handler is a
   * one-liner and the math is unit-testable in isolation.
   */
  setDiffFromFiles: (diffs: FileDiff[]) => void;
  /** Zero the per-task counter — call at each fresh iteration start. */
  resetTaskTokens: () => void;
  reset: () => void;
}

const INITIAL_TOKENS: SessionTokens = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

const INITIAL_DIFF: SessionDiff = {
  additions: 0,
  deletions: 0,
  files: 0,
};

export function useSessionStats(): UseSessionStatsReturn {
  const [tokens, setTokens] = createSignal<SessionTokens>({ ...INITIAL_TOKENS });
  // Per-task tokens: same stream as `tokens`, zeroed at each iteration start.
  const [taskTokens, setTaskTokens] = createSignal<SessionTokens>({ ...INITIAL_TOKENS });
  const [diff, setDiff] = createSignal<SessionDiff>({ ...INITIAL_DIFF });

  const totalTokens = () => {
    const t = tokens();
    return t.input + t.output + t.reasoning;
  };

  function addTokens(newTokens: Partial<SessionTokens>) {
    const add = (prev: SessionTokens): SessionTokens => ({
      input: prev.input + (newTokens.input || 0),
      output: prev.output + (newTokens.output || 0),
      reasoning: prev.reasoning + (newTokens.reasoning || 0),
      cacheRead: prev.cacheRead + (newTokens.cacheRead || 0),
      cacheWrite: prev.cacheWrite + (newTokens.cacheWrite || 0),
    });
    setTokens(add);
    setTaskTokens(add);
  }

  function resetTaskTokens() {
    setTaskTokens({ ...INITIAL_TOKENS });
  }

  function setDiffFromFiles(diffs: FileDiff[]): void {
    // Reduce one-entry-per-file into the aggregate the UI shows. The SSE
    // `session.diff` event carries the session's accumulated state (not a
    // per-edit delta), so this replaces rather than accumulates. Guards
    // against non-finite counts so a malformed payload can't paint `NaN` in
    // the BottomPanel's `+N/-M (F)` summary.
    let additions = 0;
    let deletions = 0;
    for (const d of diffs) {
      const a = Number(d?.additions);
      const del = Number(d?.deletions);
      if (Number.isFinite(a)) additions += a;
      if (Number.isFinite(del)) deletions += del;
    }
    setDiff({ additions, deletions, files: diffs.length });
  }

  function reset() {
    setTokens({ ...INITIAL_TOKENS });
    setTaskTokens({ ...INITIAL_TOKENS });
    setDiff({ ...INITIAL_DIFF });
  }

  return {
    tokens,
    taskTokens,
    diff,
    totalTokens,
    addTokens,
    setDiff,
    setDiffFromFiles,
    resetTaskTokens,
    reset,
  };
}
