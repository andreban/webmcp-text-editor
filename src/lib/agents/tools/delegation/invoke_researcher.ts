// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { runResearch } from "../../";
import type { WorkspaceContext } from "../workspace/context";
import { documentText, resolveDocument } from "../workspace/resolve_document";

interface InvokeResearcherArgs {
  query: string;
  documents?: string[];
}

export class InvokeResearcherTool implements Tool<
  InvokeResearcherArgs,
  string
> {
  constructor(
    private factory: AgentRunnerFactory,
    private workspace: Pick<
      WorkspaceContext,
      "docsRef" | "activeDocRef" | "editorRef" | "editorContentRef"
    >,
  ) {}

  definition(): ToolDefinition {
    return {
      name: "invoke_researcher",
      description:
        "Answers a question from the workspace's documents and cites the passages it used. Use when information may be spread across several documents, or before drafting text that should draw on them.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question to answer.",
          },
          documents: {
            type: "array",
            items: { type: "string" },
            description:
              "Ids or exact titles of documents to limit the search to. Omit to search every document.",
          },
        },
        required: ["query"],
      },
      scope: "read",
    };
  }

  async call(
    args: InvokeResearcherArgs,
    context: ToolContext,
  ): Promise<string> {
    const allDocs = this.workspace.docsRef.current;
    let docIds: string[] | undefined;
    if (args.documents?.length) {
      docIds = [];
      for (const ref of args.documents) {
        const { doc, error } = resolveDocument(allDocs, ref);
        if (error !== undefined) return error;
        docIds.push(doc.id);
      }
    }
    // Research the editor's live text for the open document, not its last save.
    const docs = allDocs.map((d) => ({
      ...d,
      content: documentText(this.workspace, d),
    }));
    const result = await runResearch(
      args.query,
      docs,
      this.factory,
      docIds,
      context,
    );
    return JSON.stringify(result);
  }
}
