// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type {
  AgentConfig,
  Tool,
  ToolContext,
  ToolDefinition,
} from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { createPlannerAgent, Plan, PLANNER_SYSTEM_PROMPT } from "../../";
import type { PlanConfirmationRequest } from "../../../store";
import { toolError } from "../errors";

interface InvokePlannerArgs {
  task: string;
  context?: string;
}

export class InvokePlannerTool implements Tool<InvokePlannerArgs, string> {
  constructor(
    private factory: AgentRunnerFactory,
    private setPendingPlanConfirmation: (
      req: PlanConfirmationRequest | null,
    ) => void,
  ) {}

  definition(): ToolDefinition {
    return {
      name: "invoke_planner",
      description:
        "Breaks a multi-step or whole-document task into ordered steps and shows the plan to the user for approval. Use before large changes such as revising every section; then carry out each approved step yourself.",
      parameters: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "The overall goal, in the user's terms.",
          },
          context: {
            type: "string",
            description:
              "Background that shapes the plan, such as the document outline or related document titles.",
          },
        },
        required: ["task"],
      },
      scope: "write",
    };
  }

  async call(args: InvokePlannerArgs, context: ToolContext): Promise<string> {
    const runner = createPlannerAgent(this.factory);
    const prompt = args.context ? `${args.task}\n\n${args.context}` : args.task;
    const agentConfig: AgentConfig = {
      name: "Planner",
      instructions: PLANNER_SYSTEM_PROMPT,
      tools: [],
    };

    for await (const event of runner
      .runBuilder(agentConfig)
      .forwardTo(context)
      .runStream(prompt)) {
      if (event.type !== "done") continue;
      let plan: Plan;
      try {
        plan = JSON.parse(event.output) as Plan;
      } catch {
        return toolError(
          "The planner returned an invalid plan (not JSON).",
          "TOOL_FAILED",
          { retryable: true },
        );
      }
      if (typeof plan.goal !== "string" || !Array.isArray(plan.steps)) {
        return toolError(
          "The planner returned a plan without a goal or steps.",
          "TOOL_FAILED",
          { retryable: true },
        );
      }

      const accepted = await new Promise<boolean>((resolve) => {
        this.setPendingPlanConfirmation({ plan, resolve });
      });
      this.setPendingPlanConfirmation(null);

      if (!accepted) {
        return toolError("Plan rejected by user.", "REJECTED", {
          suggestion: "Ask the user how they would like to proceed.",
        });
      }
      return JSON.stringify(plan);
    }

    throw new Error("invoke_planner: planner agent ended without a done event");
  }
}
