// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { WorkspaceContext } from "./context";
import { DOCUMENT_REF_DESCRIPTION, resolveDocument } from "./resolve_document";

interface SwitchActiveDocumentArgs {
  document: string;
}

export class SwitchActiveDocumentTool implements Tool<
  SwitchActiveDocumentArgs,
  string
> {
  constructor(private ctx: WorkspaceContext) {}

  definition(): ToolDefinition {
    return {
      name: "switch_active_document",
      description:
        "Opens another document in the editor, saving the current one first so no work is lost. Use before editing a document that is not currently open.",
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
    };
  }

  async call(
    args: SwitchActiveDocumentArgs,
    _ctx: ToolContext,
  ): Promise<string> {
    const { doc, error } = resolveDocument(
      this.ctx.docsRef.current,
      args.document,
    );
    if (error !== undefined) return error;

    const currentDoc = this.ctx.activeDocRef.current;
    if (currentDoc) {
      const content =
        this.ctx.editorRef.current?.getValue() ??
        this.ctx.editorContentRef.current;
      this.ctx.saveDocContentFn(currentDoc.id, content);
    }
    this.ctx.setActiveDocumentIdFn(doc.id);
    this.ctx.editorRef.current?.setValue(doc.content);
    return JSON.stringify({ switched: true, id: doc.id, title: doc.title });
  }
}
