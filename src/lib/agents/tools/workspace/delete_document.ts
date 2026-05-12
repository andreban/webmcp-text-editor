// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";
import { requestApproval } from "./request_approval";

interface DeleteDocumentArgs {
  id: string;
}

export class DeleteDocumentTool implements Tool<DeleteDocumentArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "delete_document",
      description:
        "Deletes a document from the workspace. Pauses for user authorization before deleting. If the deleted document was active, a different document becomes active.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The document ID to delete.",
          },
        },
        required: ["id"],
      },
      scope: "write",
      requiresApproval: true,
    };
  }

  async call(args: DeleteDocumentArgs, _ctx: ToolContext): Promise<string> {
    const doc = this.ctx.docsRef.current.find((d) => d.id === args.id);
    if (!doc) return JSON.stringify({ error: "Document not found" });
    const approved = await requestApproval(
      "delete_document",
      `Delete document "${doc.title}"`,
      this.ctx.setPendingApprovals,
      this.ctx.approveAllRef,
    );
    if (!approved) return JSON.stringify({ error: "Rejected by user" });
    this.ctx.deleteDocumentFn(args.id);
    return `Document "${doc.title}" deleted.`;
  }
}
