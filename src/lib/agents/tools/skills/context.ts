// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Skill } from "../../../skills";

export interface SkillsContext {
  skillsRef: { current: Skill[] };
}
