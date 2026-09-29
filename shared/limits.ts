// Request size limits enforced by the server and respected by the client.

export const SUGGEST_LIMITS = {
  instruction: 500,
  selection: 8_000,
  contextSide: 4_000,
  heading: 200,
  historyTurns: 10,
} as const
