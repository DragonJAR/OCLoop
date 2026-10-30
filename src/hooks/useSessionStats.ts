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
  addTokens: (tokens: Partial<SessionTokens>, sessionId?: string) => void;
  /** Zero the per-task counter — call at each fresh iteration start. */
  resetTaskTokens: () => void;
  /** Read accumulated tokens for a specific session (parallel worker accounting). */
  getSessionTokens: (sessionId: string) => SessionTokens;
  /** Consume and clear accumulated tokens for a specific session. */
  takeSessionTokens: (sessionId: string) => SessionTokens;
}

const INITIAL_TOKENS: SessionTokens = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

/** Sum of all four token categories (input, output, cacheRead, cacheWrite). */
export function totalDisplayTokens(tokens: SessionTokens): number {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
}

function mergeTokens(prev: SessionTokens, newTokens: Partial<SessionTokens>): SessionTokens {
  return {
    input: prev.input + (newTokens.input || 0),
    output: prev.output + (newTokens.output || 0),
    cacheRead: prev.cacheRead + (newTokens.cacheRead || 0),
    cacheWrite: prev.cacheWrite + (newTokens.cacheWrite || 0),
  };
}

export function useSessionStats(): UseSessionStatsReturn {
  const [tokens, setTokens] = createSignal<SessionTokens>({ ...INITIAL_TOKENS });
  // Per-task tokens: same stream as `tokens`, zeroed at each iteration start.
  const [taskTokens, setTaskTokens] = createSignal<SessionTokens>({ ...INITIAL_TOKENS });
  const perSessionTokens = new Map<string, SessionTokens>();

  const totalTokens = () => totalDisplayTokens(tokens());

  function addTokens(newTokens: Partial<SessionTokens>, sessionId?: string) {
    const add = (prev: SessionTokens): SessionTokens => mergeTokens(prev, newTokens);
    setTokens(add);
    setTaskTokens(add);
    if (sessionId) {
      const current = perSessionTokens.get(sessionId) ?? { ...INITIAL_TOKENS };
      perSessionTokens.set(sessionId, mergeTokens(current, newTokens));
    }
  }

  function resetTaskTokens() {
    setTaskTokens({ ...INITIAL_TOKENS });
  }

  function getSessionTokens(sessionId: string): SessionTokens {
    return { ...(perSessionTokens.get(sessionId) ?? INITIAL_TOKENS) };
  }

  function takeSessionTokens(sessionId: string): SessionTokens {
    const out = getSessionTokens(sessionId);
    perSessionTokens.delete(sessionId);
    return out;
  }

  return {
    tokens,
    taskTokens,
    totalTokens,
    addTokens,
    resetTaskTokens,
    getSessionTokens,
    takeSessionTokens,
  };
}
