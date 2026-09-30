// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Skill } from "../../../skills";

export interface SkillsContext {
  skillsRef: { current: Skill[] };
}

/** Case-insensitive skill lookup shared by read_skill and delegate_to_skill. */
export function findSkillByName(
  skills: Skill[],
  name: string,
): Skill | undefined {
  const needle = name.trim().toLowerCase();
  return skills.find((s) => s.name.trim().toLowerCase() === needle);
}
