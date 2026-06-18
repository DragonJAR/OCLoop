import { createSignal, Accessor } from "solid-js";

export interface SessionTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface UseSessionStatsReturn {
  tokens: Accessor<SessionTokens>;
  /** Tokens for the CURRENT task/iteration only (zeroed via resetTaskTokens). */
  taskTokens: Accessor<SessionTokens>;
  totalTokens: Accessor<number>;
  addTokens: (tokens: Partial<SessionTokens>) => void;
  /** Zero the per-task counter — call at each fresh iteration start. */
  resetTaskTokens: () => void;
}

const INITIAL_TOKENS: SessionTokens = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export function useSessionStats(): UseSessionStatsReturn {
  const [tokens, setTokens] = createSignal<SessionTokens>({ ...INITIAL_TOKENS });
  // Per-task tokens: same stream as `tokens`, zeroed at each iteration start.
  const [taskTokens, setTaskTokens] = createSignal<SessionTokens>({ ...INITIAL_TOKENS });

  const totalTokens = () => {
    const t = tokens();
    return t.input + t.output;
  };

  function addTokens(newTokens: Partial<SessionTokens>) {
    const add = (prev: SessionTokens): SessionTokens => ({
      input: prev.input + (newTokens.input || 0),
      output: prev.output + (newTokens.output || 0),
      cacheRead: prev.cacheRead + (newTokens.cacheRead || 0),
      cacheWrite: prev.cacheWrite + (newTokens.cacheWrite || 0),
    });
    setTokens(add);
    setTaskTokens(add);
  }

  function resetTaskTokens() {
    setTaskTokens({ ...INITIAL_TOKENS });
  }

  return {
    tokens,
    taskTokens,
    totalTokens,
    addTokens,
    resetTaskTokens,
  };
}
