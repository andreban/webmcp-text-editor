// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from "@mast-ai/core";
import type { ToolProvider } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import type { PlanConfirmationRequest } from "../../../store";
import type { WorkspaceContext } from "../workspace/context";
import { InvokeAgentTool } from "./invoke_agent";
import { InvokePlannerTool } from "./invoke_planner";
import { InvokeResearcherTool } from "./invoke_researcher";
import { InvokeWriterTool } from "./invoke_writer";
import { InvokeReviewerTool } from "./invoke_reviewer";

export const DELEGATION_TOOL_NAMES = [
  "invoke_agent",
  "invoke_planner",
  "invoke_researcher",
  "invoke_writer",
  "invoke_reviewer",
] as const;

export function registerDelegationTools(
  registry: ToolRegistry,
  factory: AgentRunnerFactory,
  readonlyRegistry: ToolProvider,
  workspace: WorkspaceContext,
  setPendingPlanConfirmation: (req: PlanConfirmationRequest | null) => void,
): void {
  registry.register(new InvokeAgentTool(factory, readonlyRegistry, workspace));
  registry.register(new InvokePlannerTool(factory, setPendingPlanConfirmation));
  registry.register(new InvokeResearcherTool(factory, workspace));
  registry.register(new InvokeWriterTool(factory));
  registry.register(new InvokeReviewerTool(factory));
}
