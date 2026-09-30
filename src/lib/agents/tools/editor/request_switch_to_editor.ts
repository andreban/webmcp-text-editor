// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";
import { toolError } from "../errors";

export class RequestSwitchToEditorTool implements Tool<
  Record<string, never>,
  string
> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "request_switch_to_editor",
      description:
        "Asks the user to leave the read-only preview and show the editor, waiting for their answer. Use before editing when get_editor_state reports preview mode.",
      parameters: { type: "object", properties: {} },
      scope: "write",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    if (this.ctx.activeTabRef.current === "editor") {
      return "Already in editor mode.";
    }
    const accepted = await this.ctx.requestTabSwitch();
    if (accepted) {
      return "Switched to editor mode.";
    }
    return toolError("User declined to switch to editor mode.", "REJECTED", {
      suggestion: "Ask the user whether they still want the change made.",
    });
  }
}
