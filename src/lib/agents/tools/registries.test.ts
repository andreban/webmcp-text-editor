// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { createToolRegistry } from "./registries";
import type { EditorContext } from "./editor/context";
import type { WorkspaceContext } from "./workspace/context";
import type { SkillsContext } from "./skills/context";

const skillsCtx: SkillsContext = { skillsRef: { current: [] } };

function makeContexts() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEditor: any = {
    getValue: vi.fn().mockReturnValue(""),
    setValue: vi.fn(),
    getModel: vi.fn().mockReturnValue(null),
    getSelection: vi.fn().mockReturnValue(null),
  };

  const editorCtx: EditorContext = {
    editorRef: { current: mockEditor },
    editorContentRef: { current: "" },
    activeTabRef: { current: "editor" },
    requestTabSwitch: () => Promise.resolve(false),
    setSuggestions: vi.fn(),
    approveAllRef: { current: false },
  };
  const workspaceCtx: WorkspaceContext = {
    docsRef: { current: [] },
    activeDocRef: { current: null },
    createDocumentFn: vi.fn().mockReturnValue(""),
    renameDocumentFn: vi.fn(),
    deleteDocumentFn: vi.fn(),
    setActiveDocumentIdFn: vi.fn(),
    saveDocContentFn: vi.fn(),
    editorRef: { current: null },
    editorContentRef: { current: "" },
    setPendingApprovals: vi.fn(),
    approveAllRef: { current: true },
  };
  return { editorCtx, workspaceCtx };
}

describe("createToolRegistry", () => {
  it("includes all read-only tools", () => {
    const { editorCtx, workspaceCtx } = makeContexts();
    const registry = createToolRegistry(editorCtx, workspaceCtx, skillsCtx);
    const names = registry.getTools().map((d) => d.name);
    expect(names).toContain("read_document");
    expect(names).toContain("read_selection");
    expect(names).toContain("search_document");
    expect(names).toContain("get_editor_state");
    expect(names).toContain("list_workspace_docs");
  });

  it("includes edit_document, rewrite_document, request_switch_to_editor", () => {
    const { editorCtx, workspaceCtx } = makeContexts();
    const registry = createToolRegistry(editorCtx, workspaceCtx, skillsCtx);
    const names = registry.getTools().map((d) => d.name);
    expect(names).toContain("edit_document");
    expect(names).toContain("rewrite_document");
    expect(names).toContain("request_switch_to_editor");
  });

  it("leaves out model-backed tools, which need an API key", () => {
    const { editorCtx, workspaceCtx } = makeContexts();
    const registry = createToolRegistry(editorCtx, workspaceCtx, skillsCtx);
    const names = registry.getTools().map((d) => d.name);
    expect(names).not.toContain("query_workspace_doc");
    expect(names).not.toContain("delegate_to_skill");
    expect(names.filter((n) => n.startsWith("invoke_"))).toEqual([]);
  });

  it("includes workspace write tools", () => {
    const { editorCtx, workspaceCtx } = makeContexts();
    const registry = createToolRegistry(editorCtx, workspaceCtx, skillsCtx);
    const names = registry.getTools().map((d) => d.name);
    expect(names).toContain("create_document");
    expect(names).toContain("rename_document");
    expect(names).toContain("delete_document");
    expect(names).toContain("switch_active_document");
  });
});
