// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import type { ResearchResult } from "../../";
import { runWriter } from "../../";

interface InvokeWriterArgs {
  instruction: string;
  researchContext?: string;
  styleContext?: string;
}

export class InvokeWriterTool implements Tool<InvokeWriterArgs, string> {
  constructor(private factory: AgentRunnerFactory) {}

  definition(): ToolDefinition {
    return {
      name: "invoke_writer",
      description:
        "Drafts text for one section and returns it without changing the document. Use when a section needs new or substantially rewritten prose, then apply the draft with edit_document. For whole-document work, plan per-section steps with invoke_planner first.",
      parameters: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description:
              "What to write: the target section, desired length, and any constraints.",
          },
          researchContext: {
            type: "string",
            description:
              "The unmodified result of invoke_researcher, when the draft should cite workspace documents.",
          },
          styleContext: {
            type: "string",
            description:
              "A verbatim passage from the document whose tone, voice, and formatting the draft should match.",
          },
        },
        required: ["instruction"],
      },
      scope: "write",
    };
  }

  async call(args: InvokeWriterArgs, context: ToolContext): Promise<string> {
    let parsedResearch: ResearchResult | undefined;
    if (args.researchContext) {
      try {
        parsedResearch = JSON.parse(args.researchContext) as ResearchResult;
      } catch {
        // malformed JSON — proceed without research context
      }
    }
    const draft = await runWriter(
      args.instruction,
      this.factory,
      parsedResearch,
      args.styleContext,
      context,
    );
    return JSON.stringify({ draft });
  }
}
