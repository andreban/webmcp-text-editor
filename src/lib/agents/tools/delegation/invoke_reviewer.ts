// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { runReview } from "../../";

interface InvokeReviewerArgs {
  text: string;
  criteria: string[];
}

export class InvokeReviewerTool implements Tool<InvokeReviewerArgs, string> {
  constructor(private factory: AgentRunnerFactory) {}

  definition(): ToolDefinition {
    return {
      name: "invoke_reviewer",
      description:
        "Checks a draft against criteria and reports whether it passes, with each issue's severity and a suggested fix. Use after invoke_writer before applying a draft; after three failed revisions, apply the best draft and tell the user what remains.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The draft text to review.",
          },
          criteria: {
            type: "array",
            items: { type: "string" },
            description:
              "Criteria to check, e.g. 'grammatical correctness', 'consistent past tense', 'no unsupported claims'.",
          },
        },
        required: ["text", "criteria"],
      },
      scope: "read",
    };
  }

  async call(args: InvokeReviewerArgs, context: ToolContext): Promise<string> {
    const result = await runReview(
      args.text,
      args.criteria,
      this.factory,
      context,
    );
    return JSON.stringify(result);
  }
}
