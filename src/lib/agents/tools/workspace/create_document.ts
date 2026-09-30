// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";
import { requestApproval } from "./request_approval";
import { toolError } from "../errors";

interface CreateDocumentArgs {
  title: string;
  content?: string;
}

export class CreateDocumentTool implements Tool<CreateDocumentArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "create_document",
      description:
        "Creates a new document, after the user approves, and opens it in the editor. Use when the user wants a new file, draft, or copy; include the initial text to avoid a separate rewrite step.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title for the new document.",
          },
          content: {
            type: "string",
            description: "Initial text. Omit for a blank document.",
          },
        },
        required: ["title"],
      },
      scope: "write",
      requiresApproval: true,
    };
  }

  async call(args: CreateDocumentArgs, _ctx: ToolContext): Promise<string> {
    if (!args.title?.trim()) {
      return toolError("title must not be empty.", "INVALID_INPUT");
    }
    const approved = await requestApproval(
      "create_document",
      `Create document "${args.title}"`,
      this.ctx.setPendingApprovals,
      this.ctx.approveAllRef,
    );
    if (!approved) {
      return toolError("User rejected creating the document.", "REJECTED");
    }
    const currentDoc = this.ctx.activeDocRef.current;
    if (currentDoc) {
      const content =
        this.ctx.editorRef.current?.getValue() ??
        this.ctx.editorContentRef.current;
      this.ctx.saveDocContentFn(currentDoc.id, content);
    }
    const newId = this.ctx.createDocumentFn(args.title);
    const initialContent = args.content ?? "";
    this.ctx.editorRef.current?.setValue(initialContent);
    if (args.content && newId) {
      this.ctx.saveDocContentFn(newId, args.content);
    }
    return JSON.stringify({
      created: true,
      id: newId,
      title: args.title,
      active: true,
    });
  }
}
