// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from "@mast-ai/core";
import type {
  AgentConfig,
  Tool,
  ToolContext,
  ToolDefinition,
  ToolProvider,
} from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { createGenericAgent } from "../../";
import type { WorkspaceContext } from "../workspace/context";
import { requestApproval } from "../workspace/request_approval";
import { toolError, truncateForError } from "../errors";

interface InvokeAgentArgs {
  systemPrompt: string;
  task: string;
  tools?: string[];
}

export class InvokeAgentTool implements Tool<InvokeAgentArgs, string> {
  constructor(
    private factory: AgentRunnerFactory,
    private readonlyRegistry: ToolProvider,
    private approval: Pick<
      WorkspaceContext,
      "setPendingApprovals" | "approveAllRef"
    >,
  ) {}

  definition(): ToolDefinition {
    return {
      name: "invoke_agent",
      description:
        "Runs a one-off helper with custom instructions, after the user approves, and returns its answer. Use for a self-contained task no saved skill or specialist tool covers; it cannot change documents.",
      parameters: {
        type: "object",
        properties: {
          systemPrompt: {
            type: "string",
            description: "Instructions describing the helper's role.",
          },
          task: {
            type: "string",
            description: "The task or question for the helper.",
          },
          tools: {
            type: "array",
            items: { type: "string", enum: ["workspace_readonly"] },
            description:
              "Extra access to grant. 'workspace_readonly' lets the helper read workspace documents.",
          },
        },
        required: ["systemPrompt", "task"],
      },
      scope: "write",
      requiresApproval: true,
    };
  }

  async call(args: InvokeAgentArgs, context: ToolContext): Promise<string> {
    // Runs arbitrary instructions on the user's API key, so the user confirms.
    const approved = await requestApproval(
      "invoke_agent",
      `Run a helper agent: "${truncateForError(args.task, 200)}"`,
      this.approval.setPendingApprovals,
      this.approval.approveAllRef,
    );
    if (!approved) {
      return toolError("User rejected running the helper agent.", "REJECTED");
    }

    const groups = args.tools ?? [];
    const resolvedRegistry = groups.includes("workspace_readonly")
      ? this.readonlyRegistry
      : new ToolRegistry();

    const runner = createGenericAgent(
      this.factory,
      args.systemPrompt,
      resolvedRegistry,
    );
    const agentConfig: AgentConfig = {
      name: "Agent",
      instructions: args.systemPrompt,
      tools: resolvedRegistry.getTools().map((d) => d.name),
    };

    for await (const event of runner
      .runBuilder(agentConfig)
      .forwardTo(context)
      .runStream(args.task)) {
      if (event.type === "done") {
        return JSON.stringify({ result: event.output });
      }
    }

    throw new Error("invoke_agent: sub-agent ended without a done event");
  }
}
