// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";
import { applySuggestion } from "./apply_suggestion";
import { toolError, truncateForError } from "../errors";

// monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges. Inlined
// so this module does not pull in the Monaco runtime.
const NEVER_GROWS_WHEN_TYPING_AT_EDGES = 1;

interface EditArgs {
  originalText: string;
  replacementText: string;
}

function linesBefore(text: string, pos: number, n: number): string {
  if (pos === 0) return "";
  let start = pos;
  for (let i = 0; i < n; i++) {
    const prev = text.lastIndexOf("\n", start - 2);
    if (prev === -1) {
      start = 0;
      break;
    }
    start = prev + 1;
  }
  return text.slice(start, pos).trimEnd();
}

function linesAfter(text: string, pos: number, n: number): string {
  if (pos >= text.length) return "";
  let end = pos;
  for (let i = 0; i < n; i++) {
    const next = text.indexOf("\n", end);
    if (next === -1) {
      end = text.length;
      break;
    }
    end = next + 1;
  }
  return text.slice(pos, end).trimEnd();
}

export class EditDocumentTool implements Tool<EditArgs, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "edit_document",
      description:
        "Proposes replacing one short passage (a word to a few sentences) in the open document and waits for the user to accept or reject it inline. Use for fixes, rewording, or inserting text near existing text. For a full rewrite, use rewrite_document.",
      parameters: {
        type: "object",
        properties: {
          originalText: {
            type: "string",
            description:
              "Exact current text to replace, case-sensitive. Must occur exactly once; add surrounding words if it repeats.",
          },
          replacementText: {
            type: "string",
            description: "Text that replaces originalText.",
          },
        },
        required: ["originalText", "replacementText"],
      },
      scope: "write",
      requiresApproval: true,
    };
  }

  async call(args: EditArgs, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return toolError("The editor is still loading.", "NOT_READY", {
        retryable: true,
      });
    }
    if (!args.originalText) {
      return toolError("originalText must not be empty.", "INVALID_INPUT", {
        suggestion:
          "To insert text, pass the adjacent existing text as originalText and repeat it in replacementText.",
      });
    }

    const fullText = editor.getValue();
    if (
      args.originalText.length > 3000 ||
      (fullText.length > 200 &&
        args.originalText.length > fullText.length * 0.8)
    ) {
      return toolError(
        "originalText is too large for a targeted edit.",
        "INVALID_INPUT",
        {
          suggestion:
            "Pass a shorter passage, or use rewrite_document if the whole document should change.",
        },
      );
    }

    const matches = model.findMatches(
      args.originalText,
      true,
      false,
      true,
      null,
      false,
    );
    if (matches.length === 0) {
      return toolError(
        `Could not find "${truncateForError(args.originalText)}" in the document.`,
        "NOT_FOUND",
        {
          suggestion:
            "Use read_document or search_document to copy the exact current text, including case and punctuation.",
        },
      );
    }
    if (matches.length > 1) {
      const lines = matches
        .slice(0, 10)
        .map((m) => m.range.startLineNumber)
        .join(", ");
      return toolError(
        `originalText occurs ${matches.length} times (lines ${lines}).`,
        "AMBIGUOUS",
        {
          suggestion:
            "Include more surrounding text so originalText matches exactly once.",
        },
      );
    }

    const range = matches[0].range;
    const idx = model.getOffsetAt({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });
    const endIdx = idx + args.originalText.length;

    // Expand match to full line boundaries for the diff display
    const lineStart = fullText.lastIndexOf("\n", idx) + 1;
    const lineEndNl = fullText.indexOf("\n", endIdx);
    const lineEnd = lineEndNl === -1 ? fullText.length : lineEndNl;

    const beforeLines = fullText.slice(lineStart, lineEnd);
    const afterLines =
      fullText.slice(lineStart, idx) +
      args.replacementText +
      fullText.slice(endIdx, lineEnd);

    const contextBefore = linesBefore(fullText, lineStart, 2);
    const contextAfter = linesAfter(fullText, lineEnd + 1, 2);
    const startLine =
      (fullText.slice(0, lineStart).match(/\n/g)?.length ?? 0) + 1;

    // Follows the target text through any typing that happens while the
    // suggestion is pending, so it is applied (or refused) at its real place.
    const tracker = editor.createDecorationsCollection([
      { range, options: { stickiness: NEVER_GROWS_WHEN_TYPING_AT_EDGES } },
    ]);

    const revealInEditor = () => {
      const startPos = model.getPositionAt(idx);
      const endPos = model.getPositionAt(endIdx);
      const revealRange = tracker.getRange(0) ?? {
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      };
      editor.revealRangeInCenter(revealRange);
      const collection = editor.createDecorationsCollection([
        {
          range: revealRange,
          options: { inlineClassName: "agent-reveal-highlight" },
        },
      ]);
      setTimeout(() => collection.clear(), 1700);
    };

    return applySuggestion(
      {
        originalText: beforeLines,
        replacementText: afterLines,
        contextBefore,
        contextAfter,
        startLine,
        revealInEditor,
      },
      () => {
        const current = tracker.getRange(0);
        if (!current || model.getValueInRange(current) !== args.originalText) {
          return false;
        }
        model.pushEditOperations(
          [],
          [{ range: current, text: args.replacementText }],
          () => null,
        );
        return true;
      },
      "Change applied automatically (Approve All is ON).",
      this.ctx.setSuggestions,
      this.ctx.approveAllRef,
      () => tracker.clear(),
    );
  }
}
