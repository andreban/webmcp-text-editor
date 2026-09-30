// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type {
  AgentConfig,
  Tool,
  ToolContext,
  ToolDefinition,
} from "@mast-ai/core";
import { DOC_QUERIER_SYSTEM_PROMPT } from "../../";
import type { AgentRunnerFactory } from "../../";
import type { WorkspaceContext } from "./context";
import {
  DOCUMENT_REF_DESCRIPTION,
  documentText,
  resolveDocument,
} from "./resolve_document";

interface QueryWorkspaceDocArgs {
  document: string;
  query: string;
}

export class QueryWorkspaceDocTool implements Tool<
  QueryWorkspaceDocArgs,
  string
> {
  constructor(
    private ctx: WorkspaceContext,
    private factory: AgentRunnerFactory,
  ) {}

  definition(): ToolDefinition {
    return {
      name: "query_workspace_doc",
      description:
        "Answers a question about one document and returns a short answer plus the most relevant verbatim passage. Use for a quick lookup in a long document instead of reading all of it; for questions across documents, use invoke_researcher.",
      parameters: {
        type: "object",
        properties: {
          document: { type: "string", description: DOCUMENT_REF_DESCRIPTION },
          query: {
            type: "string",
            description: "The question to answer from the document.",
          },
        },
        required: ["document", "query"],
      },
      scope: "read",
    };
  }

  async call(args: QueryWorkspaceDocArgs, _ctx: ToolContext): Promise<string> {
    const { doc, error } = resolveDocument(
      this.ctx.docsRef.current,
      args.document,
    );
    if (error !== undefined) return error;

    const agent: AgentConfig = {
      name: "DocQuerier",
      instructions: DOC_QUERIER_SYSTEM_PROMPT,
      tools: [],
    };
    const runner = this.factory.create({
      systemPrompt: agent.instructions,
    });
    const input = `Document title: ${doc.title}\n\nDocument content:\n${documentText(this.ctx, doc)}\n\nQuery: ${args.query}`;
    const result = await runner.run(agent, input);
    let parsed: { summary: string; excerpt: string };
    try {
      parsed = JSON.parse(result.output) as {
        summary: string;
        excerpt: string;
      };
    } catch {
      parsed = { summary: result.output, excerpt: "" };
    }
    return JSON.stringify({
      summary: parsed.summary,
      excerpt: parsed.excerpt ?? "",
    });
  }
}
