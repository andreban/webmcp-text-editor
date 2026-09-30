// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";
import { requestApproval } from "./request_approval";
import { toolError } from "../errors";
import { DOCUMENT_REF_DESCRIPTION, resolveDocument } from "./resolve_document";

interface DeleteDocumentArgs {
  document: string;
}

export class DeleteDocumentTool implements Tool<DeleteDocumentArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "delete_document",
      description:
        "Permanently deletes a document after the user confirms; this cannot be undone. Use only when the user explicitly asks to delete or remove a document. If it was open, another document opens.",
      parameters: {
        type: "object",
        properties: {
          document: {
            type: "string",
            description: DOCUMENT_REF_DESCRIPTION,
          },
        },
        required: ["document"],
      },
      scope: "write",
      requiresApproval: true,
    };
  }

  async call(args: DeleteDocumentArgs, _ctx: ToolContext): Promise<string> {
    const { doc, error } = resolveDocument(
      this.ctx.docsRef.current,
      args.document,
    );
    if (error !== undefined) return error;
    // Deletion is irreversible, so it is confirmed even with "Approve All" on.
    const approved = await requestApproval(
      "delete_document",
      `Delete document "${doc.title}"`,
      this.ctx.setPendingApprovals,
      this.ctx.approveAllRef,
      { alwaysAsk: true },
    );
    if (!approved) {
      return toolError("User rejected deleting the document.", "REJECTED");
    }
    this.ctx.deleteDocumentFn(doc.id);
    return JSON.stringify({ deleted: true, id: doc.id, title: doc.title });
  }
}
