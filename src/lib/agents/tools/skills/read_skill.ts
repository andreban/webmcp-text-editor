// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { SkillsContext } from "./context";

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
        "Returns the full definition of a skill (id, name, description, instructions, optional model) given its id or name. Use this before delegate_to_skill to inspect what a skill does.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The skill id. Either id or name must be provided.",
          },
          name: {
            type: "string",
            description:
              "The skill name (case-insensitive). Either id or name must be provided.",
          },
        },
      },
      scope: "read",
    };
  }

  async call(args: ReadSkillArgs, _ctx: ToolContext): Promise<string> {
    if (!args.id && !args.name) {
      return JSON.stringify({ error: "id or name is required" });
    }
    const skills = this.ctx.skillsRef.current;
    const lookup = args.id
      ? skills.find((s) => s.id === args.id)
      : skills.find((s) => s.name.toLowerCase() === args.name!.toLowerCase());
    if (!lookup) return JSON.stringify({ error: "Skill not found" });
    return JSON.stringify(lookup);
  }
}
