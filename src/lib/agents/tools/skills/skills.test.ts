// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { ListSkillsTool } from "./list_skills";
import { ReadSkillTool } from "./read_skill";
import type { SkillsContext } from "./context";
import type { Skill } from "../../../skills";

function makeCtx(skills: Skill[]): SkillsContext {
  return { skillsRef: { current: skills } };
}

const sample: Skill[] = [
  {
    id: "a",
    name: "Alpha",
    description: "First",
    instructions: "Step 1.",
  },
  {
    id: "b",
    name: "Beta",
    description: "Second",
    instructions: "Step 2.",
    model: "gemini-2.5-pro",
  },
];

describe("ListSkillsTool", () => {
  it("returns id/name/description for each skill, no instructions", async () => {
    const tool = new ListSkillsTool(makeCtx(sample));
    const out = JSON.parse(await tool.call({}, {}));
    expect(out).toEqual([
      { id: "a", name: "Alpha", description: "First" },
      { id: "b", name: "Beta", description: "Second" },
    ]);
  });

  it("returns empty array when no skills exist", async () => {
    const tool = new ListSkillsTool(makeCtx([]));
    const out = JSON.parse(await tool.call({}, {}));
    expect(out).toEqual([]);
  });
});

describe("ReadSkillTool", () => {
  it("looks up by id", async () => {
    const tool = new ReadSkillTool(makeCtx(sample));
    const out = JSON.parse(await tool.call({ id: "a" }, {}));
    expect(out.name).toBe("Alpha");
    expect(out.instructions).toBe("Step 1.");
  });

  it("looks up by name (case-insensitive)", async () => {
    const tool = new ReadSkillTool(makeCtx(sample));
    const out = JSON.parse(await tool.call({ name: "beta" }, {}));
    expect(out.id).toBe("b");
    expect(out.model).toBe("gemini-2.5-pro");
  });

  it("returns error when neither id nor name is provided", async () => {
    const tool = new ReadSkillTool(makeCtx(sample));
    const out = JSON.parse(await tool.call({}, {}));
    expect(out.error).toMatch(/required/i);
  });

  it("returns error for missing skill", async () => {
    const tool = new ReadSkillTool(makeCtx(sample));
    const out = JSON.parse(await tool.call({ id: "missing" }, {}));
    expect(out.error).toMatch(/not found/i);
  });
});
