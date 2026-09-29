// Wire contract for POST /api/suggest, shared by the server and the client.
// Types only: nothing here may import runtime code.

/** One completed round of a suggestion, replayed to the model when refining. */
export interface RefinementTurn {
  instruction: string
  replacement: string
  rationale: string
}

export interface SuggestRequest {
  /** Free text. Quick actions are just preset instructions. */
  instruction: string
  /** Exact markdown the replacement will substitute. */
  selection: string
  /** Read-only surroundings so the model can match tone and structure. */
  context: {
    heading?: string
    before: string
    after: string
  }
  /** Earlier rounds for this suggestion, oldest first. Empty on the first ask. */
  history: RefinementTurn[]
}

export interface SuggestResponse {
  /** Markdown that replaces `selection`. May be empty (deletion). */
  replacement: string
  /** One short sentence explaining the change. */
  rationale: string
}

export type ApiErrorCode =
  | 'bad_request'
  | 'missing_api_key'
  | 'upstream_error'
  | 'invalid_model_output'

export interface ApiError {
  error: {
    code: ApiErrorCode
    message: string
  }
}
