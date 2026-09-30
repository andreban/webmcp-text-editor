// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";

interface ListWorkspaceDocsArgs {
  offset?: number;
  limit?: number;
}

export const DEFAULT_LIST_LIMIT = 50;

export class ListWorkspaceDocsTool implements Tool<
  ListWorkspaceDocsArgs,
  string
> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "list_workspace_docs",
      description:
        "Lists the workspace's documents by id and title, marking the open one. Use to find a document the user mentions before reading, opening, renaming, or deleting it.",
      parameters: {
        type: "object",
        properties: {
          offset: {
            type: "integer",
            minimum: 0,
            description:
              "Number of documents to skip. Use next_offset from the previous page.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description: `Maximum documents to return. Defaults to ${DEFAULT_LIST_LIMIT}.`,
          },
        },
      },
      scope: "read",
    };
  }

  async call(args: ListWorkspaceDocsArgs, _ctx: ToolContext): Promise<string> {
    const docs = this.ctx.docsRef.current;
    const activeId = this.ctx.activeDocRef.current?.id;
    const start = Math.min(
      Math.max(0, Math.floor(args.offset ?? 0)),
      docs.length,
    );
    const limit = Math.min(
      Math.max(1, Math.floor(args.limit ?? DEFAULT_LIST_LIMIT)),
      200,
    );
    const end = Math.min(start + limit, docs.length);
    return JSON.stringify({
      total: docs.length,
      documents: docs.slice(start, end).map((d) => ({
        id: d.id,
        title: d.title,
        active: d.id === activeId,
      })),
      next_offset: end < docs.length ? end : null,
    });
  }
}
