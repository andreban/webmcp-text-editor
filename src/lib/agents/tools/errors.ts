// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export type ToolErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "REJECTED"
  | "NOT_READY"
  | "STALE_EDIT"
  | "TOOL_FAILED";

export interface ToolErrorOptions {
  retryable?: boolean;
  suggestion?: string;
}

/**
 * Serializes a failure as a structured payload. WebMCP turns a rejected
 * `execute()` into a generic `UnknownError`, so tools resolve this instead.
 */
export function toolError(
  error: string,
  code: ToolErrorCode,
  { retryable = false, suggestion }: ToolErrorOptions = {},
): string {
  return JSON.stringify({
    error,
    code,
    retryable,
    ...(suggestion ? { suggestion } : {}),
  });
}

/** Returns the error message when `result` is a structured error payload. */
export function toolErrorMessage(result: unknown): string | null {
  if (typeof result !== "string" || !result.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(result);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { error?: unknown }).error === "string"
    ) {
      return (parsed as { error: string }).error;
    }
  } catch {
    // Not JSON — treat as a successful plain-text result.
  }
  return null;
}

/** Shortens user-supplied text before echoing it back in an error. */
export function truncateForError(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
