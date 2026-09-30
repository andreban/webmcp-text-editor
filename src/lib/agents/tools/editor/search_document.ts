// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";

import { toolError } from "../errors";

interface SearchArgs {
  query: string;
}

export const MAX_SEARCH_MATCHES = 50;
const MAX_LINE_CHARS = 120;

export class SearchDocumentTool implements Tool<SearchArgs, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "search_document",
      description:
        "Finds text in the open document, ignoring case, and returns each match's line, column, exact text, and surrounding line. Use to locate a passage before editing it or to check whether something appears.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The text to look for." },
        },
        required: ["query"],
      },
      scope: "read",
    };
  }

  async call(args: SearchArgs, _ctx: ToolContext): Promise<string> {
    if (!args.query) {
      return toolError("query must not be empty.", "INVALID_INPUT");
    }
    const model = this.ctx.editorRef.current?.getModel();
    if (!model) {
      return toolError("The editor is still loading.", "NOT_READY", {
        retryable: true,
      });
    }

    const matches = model.findMatches(
      args.query,
      true,
      false,
      false,
      null,
      false,
    );
    return JSON.stringify({
      query: args.query,
      total: matches.length,
      truncated: matches.length > MAX_SEARCH_MATCHES,
      matches: matches.slice(0, MAX_SEARCH_MATCHES).map((m) => ({
        line: m.range.startLineNumber,
        column: m.range.startColumn,
        // Exact casing as it appears, ready to pass to edit_document.
        text: model.getValueInRange(m.range),
        context: snippet(
          model.getLineContent(m.range.startLineNumber),
          m.range.startColumn - 1,
        ),
      })),
    });
  }
}

/** Returns up to MAX_LINE_CHARS of `line`, keeping the match in view. */
function snippet(line: string, matchIndex: number): string {
  if (line.length <= MAX_LINE_CHARS) return line;
  const start = Math.max(
    0,
    Math.min(matchIndex - 40, line.length - MAX_LINE_CHARS),
  );
  const end = start + MAX_LINE_CHARS;
  return `${start > 0 ? "…" : ""}${line.slice(start, end)}${end < line.length ? "…" : ""}`;
}
