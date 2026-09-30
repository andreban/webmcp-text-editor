// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type {
  AgentConfig,
  AgentEvent,
  Tool,
  ToolContext,
  ToolDefinition,
  ToolProvider,
} from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import { findSkillByName, type SkillsContext } from "../skills/context";
import { toolError } from "../errors";

type RunBuilderLike = {
  forwardTo(parentContext: ToolContext): RunBuilderLike;
  runStream(input: string): AsyncIterable<AgentEvent>;
};

type RunnerLike = {
  runBuilder: (agent: AgentConfig) => RunBuilderLike;
};

interface DelegateToSkillArgs {
  skillName: string;
  task: string;
}

export class DelegateToSkillTool implements Tool<DelegateToSkillArgs, string> {
  private runnerFactory: (registry: ToolProvider, model?: string) => RunnerLike;

  constructor(
    private factory: AgentRunnerFactory,
    private readonlyRegistry: ToolProvider,
    private skillsCtx: SkillsContext,
    runnerFactory?: (registry: ToolProvider, model?: string) => RunnerLike,
  ) {
    this.runnerFactory =
      runnerFactory ??
      ((registry, model) => factory.create({ tools: registry, model }));
  }

  definition(): ToolDefinition {
    return {
      name: "delegate_to_skill",
      description:
        "Runs one of the user's saved skills on a task and returns its answer without changing any documents. Use when a skill from list_skills fits the request, then apply any suggested changes yourself with edit_document.",
      parameters: {
        type: "object",
        properties: {
          skillName: {
            type: "string",
            description: "The skill's name, case-insensitive.",
          },
          task: {
            type: "string",
            description: "What the skill should do, in the user's terms.",
          },
        },
        required: ["skillName", "task"],
      },
      scope: "write",
    };
  }

  async call(
    { skillName, task }: DelegateToSkillArgs,
    context: ToolContext,
  ): Promise<string> {
    const skills = this.skillsCtx.skillsRef.current;
    const skill = findSkillByName(skills, skillName ?? "");
    if (!skill) {
      const names = skills.map((s) => s.name).join(", ");
      return toolError(`Skill "${skillName}" not found.`, "NOT_FOUND", {
        suggestion: `Available skills: ${names || "none"}.`,
      });
    }

    const readonlyToolNames = this.readonlyRegistry
      .getTools()
      .map((d) => d.name);
    const childRunner = this.runnerFactory(this.readonlyRegistry, skill.model);
    const agentConfig: AgentConfig = {
      name: skill.name,
      instructions: skill.instructions,
      tools: readonlyToolNames,
    };

    for await (const event of childRunner
      .runBuilder(agentConfig)
      .forwardTo(context)
      .runStream(task)) {
      if (event.type === "done") {
        return event.output;
      }
    }
    throw new Error("Child runner ended without a done event");
  }
}
