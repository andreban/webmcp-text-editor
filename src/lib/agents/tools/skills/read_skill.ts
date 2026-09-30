// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import { findSkillByName, type SkillsContext } from "./context";
import { toolError } from "../errors";

interface ReadSkillArgs {
  id?: string;
  name?: string;
}

export class ReadSkillTool implements Tool<ReadSkillArgs, string> {
  constructor(private ctx: SkillsContext) {}

  definition(): ToolDefinition {
    return {
      name: "read_skill",
      description:
        "Returns a skill's full instructions. Use to check what a skill does before running it with delegate_to_skill, or when the user asks how a skill works.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The skill id. Provide id or name.",
          },
          name: {
            type: "string",
            description:
              "The skill name, case-insensitive. Provide id or name.",
          },
        },
      },
      scope: "read",
    };
  }

  async call(args: ReadSkillArgs, _ctx: ToolContext): Promise<string> {
    if (!args.id && !args.name) {
      return toolError("Provide a skill id or name.", "INVALID_INPUT", {
        suggestion: "Call list_skills to see available skills.",
      });
    }
    const skills = this.ctx.skillsRef.current;
    const lookup = args.id
      ? skills.find((s) => s.id === args.id)
      : findSkillByName(skills, args.name!);
    if (!lookup) {
      return toolError("Skill not found.", "NOT_FOUND", {
        suggestion: "Call list_skills to see available skills.",
      });
    }
    return JSON.stringify(lookup);
  }
}
