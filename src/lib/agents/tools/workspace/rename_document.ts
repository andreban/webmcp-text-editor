// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";
import { requestApproval } from "./request_approval";
import { toolError } from "../errors";
import { DOCUMENT_REF_DESCRIPTION, resolveDocument } from "./resolve_document";

interface RenameDocumentArgs {
  document: string;
  newTitle: string;
}

export class RenameDocumentTool implements Tool<RenameDocumentArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "rename_document",
      description:
        "Changes a document's title after the user approves. Use when the user asks to rename or retitle a document.",
      parameters: {
        type: "object",
        properties: {
          document: {
            type: "string",
            description: DOCUMENT_REF_DESCRIPTION,
          },
          newTitle: {
            type: "string",
            description: "The title to give the document.",
          },
        },
        required: ["document", "newTitle"],
      },
      scope: "write",
      requiresApproval: true,
    };
  }

  async call(args: RenameDocumentArgs, _ctx: ToolContext): Promise<string> {
    const { doc, error } = resolveDocument(
      this.ctx.docsRef.current,
      args.document,
    );
    if (error !== undefined) return error;
    if (!args.newTitle?.trim()) {
      return toolError("newTitle must not be empty.", "INVALID_INPUT");
    }
    const approved = await requestApproval(
      "rename_document",
      `Rename document "${doc.title}" to "${args.newTitle}"`,
      this.ctx.setPendingApprovals,
      this.ctx.approveAllRef,
    );
    if (!approved) {
      return toolError("User rejected renaming the document.", "REJECTED");
    }
    this.ctx.renameDocumentFn(doc.id, args.newTitle);
    return JSON.stringify({ renamed: true, id: doc.id, title: args.newTitle });
  }
}
