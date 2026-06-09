// The consistent error envelope used by every worker (/api-design skill).
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHENTICATED"
  | "INTERNAL";

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Build the standard error envelope. Never put secrets/stack traces in `message`. */
export function errorBody(code: ErrorCode, message: string, details?: unknown): ErrorEnvelope {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/** Collection response shape: `{ data, page }` (/api-design skill). */
export interface Page {
  nextCursor: string | null;
  limit: number;
}
export interface Collection<T> {
  data: T[];
  page: Page;
}
