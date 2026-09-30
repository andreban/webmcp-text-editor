// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { Tool, ToolContext, ToolDefinition } from "@mast-ai/core";
import type { EditorContext } from "./context";
import type { WorkspaceContext } from "../workspace/context";

export class GetEditorStateTool implements Tool<Record<string, never>, string> {
  constructor(
    private ctx: EditorContext,
    private activeDocRef: WorkspaceContext["activeDocRef"],
  ) {}

  definition(): ToolDefinition {
    return {
      name: "get_editor_state",
      description:
        "Returns the open document's id and title, whether the editor or the read-only preview is showing, whether text is selected, and character, word, and line counts. Use to orient before reading or editing, or to answer length questions.",
      parameters: { type: "object", properties: {} },
      scope: "read",
    };
  }

  async call(_args: Record<string, never>, _ctx: ToolContext): Promise<string> {
    const editor = this.ctx.editorRef.current;
    const text = editor?.getValue() ?? this.ctx.editorContentRef.current;
    const selection = editor?.getSelection();
    const hasSelection =
      !!selection &&
      (selection.startLineNumber !== selection.endLineNumber ||
        selection.startColumn !== selection.endColumn);
    const doc = this.activeDocRef.current;
    return JSON.stringify({
      document: doc ? { id: doc.id, title: doc.title } : null,
      mode: this.ctx.activeTabRef.current,
      has_selection: hasSelection,
      stats: {
        characters: text.length,
        words: text.trim() === "" ? 0 : text.trim().split(/\s+/).length,
        lines: text === "" ? 0 : text.split("\n").length,
      },
    });
  }
}
