// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { SkillsContext } from "./context";

export class ListSkillsTool implements Tool<Record<string, never>, string> {
  constructor(private ctx: SkillsContext) {}

  definition(): ToolDefinition {
    return {
      name: "list_skills",
      description:
        "Lists all skills available in this workspace. Returns an array of { id, name, description } entries. Use read_skill to fetch the full instructions for a skill, or delegate_to_skill to run one.",
      parameters: {
        type: "object",
        properties: {},
      },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    const summary = this.ctx.skillsRef.current.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    }));
    return JSON.stringify(summary);
  }
}
