// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";
import { PAGINATION_PROPERTIES, paginateText } from "../paginate";
import {
  DOCUMENT_REF_DESCRIPTION,
  documentText,
  editorText,
  resolveDocument,
} from "./resolve_document";

interface ReadDocumentArgs {
  document?: string;
  offset?: number;
  limit?: number;
}

export class ReadDocumentTool implements Tool<ReadDocumentArgs, string> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "read_document",
      description:
        "Returns the text of a document, one page at a time, reading the open document unless another is named. Use to read, quote, summarize, or copy exact text before editing. Keep reading from next_offset until it is null.",
      parameters: {
        type: "object",
        properties: {
          document: {
            type: "string",
            description: `${DOCUMENT_REF_DESCRIPTION} Omit to read the open document.`,
          },
          ...PAGINATION_PROPERTIES,
        },
      },
      scope: "read",
    };
  }

  async call(args: ReadDocumentArgs, _ctx: ToolContext): Promise<string> {
    if (args.document === undefined || args.document === "") {
      const active = this.ctx.activeDocRef.current;
      return JSON.stringify({
        id: active?.id ?? null,
        title: active?.title ?? null,
        ...paginateText(editorText(this.ctx), args.offset, args.limit),
      });
    }
    const { doc, error } = resolveDocument(
      this.ctx.docsRef.current,
      args.document,
    );
    if (error !== undefined) return error;
    return JSON.stringify({
      id: doc.id,
      title: doc.title,
      ...paginateText(documentText(this.ctx, doc), args.offset, args.limit),
    });
  }
}
