// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";
import { MAX_PAGE_CHARS } from "../paginate";

export class ReadSelectionTool implements Tool<Record<string, never>, string> {
  constructor(private ctx: EditorContext) {}

  definition(): ToolDefinition {
    return {
      name: "read_selection",
      description:
        "Returns the text the user has selected in the editor. Use when the user refers to 'this', 'the selection', or highlighted text.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    const selection = editor?.getSelection();
    const text =
      (selection && editor?.getModel()?.getValueInRange(selection)) || "";
    if (!text) {
      return JSON.stringify({
        has_selection: false,
        text: "",
        suggestion:
          "Nothing is selected. Ask the user to select text, or use read_document.",
      });
    }
    return JSON.stringify({
      has_selection: true,
      text: text.slice(0, MAX_PAGE_CHARS),
      truncated: text.length > MAX_PAGE_CHARS,
    });
  }
}
