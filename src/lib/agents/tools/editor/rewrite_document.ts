// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";
import { applySuggestion } from "./apply_suggestion";
import { toolError } from "../errors";

interface RewriteArgs {
  content: string;
}

export class RewriteDocumentTool implements Tool<RewriteArgs, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "rewrite_document",
      description:
        "Proposes replacing the entire open document and waits for the user to accept or reject it. Use only when the user explicitly asks for a full rewrite; for anything smaller, use edit_document.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The complete new document text.",
          },
        },
        required: ["content"],
      },
      scope: "write",
      requiresApproval: true,
    };
  }

  async call(args: RewriteArgs, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    if (!editor) {
      return toolError("The editor is still loading.", "NOT_READY", {
        retryable: true,
      });
    }

    const originalText = editor.getValue();
    return applySuggestion(
      {
        originalText,
        replacementText: args.content,
        contextBefore: "",
        contextAfter: "",
        startLine: 1,
      },
      () => {
        // Refuse to overwrite anything the user typed while this was pending.
        if (editor.getValue() !== originalText) return false;
        editor.setValue(args.content);
        return true;
      },
      "Document updated automatically (Approve All is ON).",
      this.ctx.setSuggestions,
      this.ctx.approveAllRef,
    );
  }
}
