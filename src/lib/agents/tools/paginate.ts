// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export const DEFAULT_PAGE_CHARS = 4000;
export const MAX_PAGE_CHARS = 20000;

export const PAGINATION_PROPERTIES = {
  offset: {
    type: "integer",
    minimum: 0,
    description:
      "Character offset to start reading from. Use next_offset from the previous page. Defaults to 0.",
  },
  limit: {
    type: "integer",
    minimum: 1,
    maximum: MAX_PAGE_CHARS,
    description: `Maximum characters to return. Defaults to ${DEFAULT_PAGE_CHARS}.`,
  },
} as const;

export interface TextPage {
  content: string;
  offset: number;
  total_chars: number;
  next_offset: number | null;
}

export function paginateText(
  text: string,
  offset: number = 0,
  limit: number = DEFAULT_PAGE_CHARS,
): TextPage {
  const start = Math.min(Math.max(0, Math.floor(offset) || 0), text.length);
  const size = Math.min(
    Math.max(1, Math.floor(limit) || DEFAULT_PAGE_CHARS),
    MAX_PAGE_CHARS,
  );
  const end = Math.min(start + size, text.length);
  return {
    content: text.slice(start, end),
    offset: start,
    total_chars: text.length,
    next_offset: end < text.length ? end : null,
  };
}
