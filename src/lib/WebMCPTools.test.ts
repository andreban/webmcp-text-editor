// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerWebMCPTools } from "./WebMCPTools";
import { ToolActivityLog } from "./toolActivityLog";
import { createToolRegistry } from "./agents/tools/registries";
import type { EditorContext } from "./agents/tools/editor/context";
import type { WorkspaceContext } from "./agents/tools/workspace/context";
import type { SkillsContext } from "./agents/tools/skills/context";

const skillsCtx: SkillsContext = { skillsRef: { current: [] } };

function makeEditorCtx(): EditorContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockEditor: any = {
    getValue: vi.fn().mockReturnValue("editor content"),
    setValue: vi.fn(),
    getModel: vi.fn().mockReturnValue({
      findMatches: vi.fn().mockReturnValue([]),
      pushEditOperations: vi.fn(),
      getFullModelRange: vi.fn().mockReturnValue({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
      }),
    }),
    getSelection: vi.fn().mockReturnValue(null),
  };
  return {
    editorRef: { current: mockEditor },
    editorContentRef: { current: "" },
    activeTabRef: { current: "editor" },
    requestTabSwitch: vi.fn().mockResolvedValue(false),
    setSuggestions: vi.fn(),
    approveAllRef: { current: false },
  };
}

function makeWorkspaceCtx(): WorkspaceContext {
  return {
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
}

interface CapturedTool {
  name: string;
  annotations?: Record<string, boolean>;
  execute: (
    args: Record<string, unknown>,
    client?: { reportProgress?: (msg: string) => void },
  ) => unknown;
}

function makeReadTool(name: string, call: () => Promise<string>) {
  return {
    definition: () => ({
      name,
      description: "test tool",
      parameters: { type: "object", properties: {} },
      scope: "read" as const,
    }),
    call: vi.fn().mockImplementation(call),
  };
}

describe("registerWebMCPTools", () => {
  const registeredTools: Map<string, CapturedTool & { signal?: AbortSignal }> =
    new Map();

  beforeEach(() => {
    registeredTools.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).modelContext = {
      registerTool: vi.fn(
        (tool: CapturedTool, options?: { signal?: AbortSignal }) => {
          registeredTools.set(tool.name, { ...tool, signal: options?.signal });
        },
      ),
    };
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).modelContext;
  });

  it("returns a no-op cleanup and warns when registerTool throws (old API shape)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).modelContext = {
      registerTool: vi.fn(() => {
        throw new TypeError("unregisterTool is not a function");
      }),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cleanup = registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "WebMCP tool registration failed:",
      expect.any(TypeError),
    );
    expect(() => cleanup()).not.toThrow();
    warnSpy.mockRestore();
  });

  it("stops registering after the first registerTool throw", () => {
    let calls = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).modelContext = {
      registerTool: vi.fn(() => {
        calls += 1;
        throw new TypeError("broken");
      }),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    expect(calls).toBe(1);
    warnSpy.mockRestore();
  });

  it("returns a no-op cleanup when document.modelContext is undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).modelContext;
    const cleanup = registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    expect(() => cleanup()).not.toThrow();
  });

  it("registers all expected tools", () => {
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    const expected = [
      "list_skills",
      "read_skill",
      "get_editor_state",
      "read_selection",
      "search_document",
      "request_switch_to_editor",
      "edit_document",
      "rewrite_document",
      "list_workspace_docs",
      "read_document",
      "create_document",
      "rename_document",
      "delete_document",
      "switch_active_document",
    ];
    for (const name of expected) {
      expect(registeredTools.has(name), `missing tool: ${name}`).toBe(true);
    }
    expect(registeredTools.size).toBe(expected.length);
  });

  it("passes an AbortSignal to each registered tool", () => {
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    for (const [, entry] of registeredTools) {
      expect(entry.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("cleanup aborts every registered signal", () => {
    const cleanup = registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    const signals = [...registeredTools.values()].map((e) => e.signal!);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => !s.aborted)).toBe(true);
    cleanup();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("registers tools added to the registry after subscription", () => {
    const registry = createToolRegistry(
      makeEditorCtx(),
      makeWorkspaceCtx(),
      skillsCtx,
    );
    registerWebMCPTools(registry);
    const initialCount = registeredTools.size;
    const lateTool = {
      definition: () => ({
        name: "late_tool",
        description: "registered after subscription",
        parameters: { type: "object", properties: {} },
        scope: "read" as const,
      }),
      call: vi.fn().mockResolvedValue("late result"),
    };
    registry.register(lateTool);
    expect(registeredTools.size).toBe(initialCount + 1);
    expect(registeredTools.has("late_tool")).toBe(true);
  });

  it("unregistering from the registry aborts only that tool's signal", () => {
    const registry = createToolRegistry(
      makeEditorCtx(),
      makeWorkspaceCtx(),
      skillsCtx,
    );
    registerWebMCPTools(registry);
    const readSignal = registeredTools.get("read_document")!.signal!;
    const editSignal = registeredTools.get("edit_document")!.signal!;
    registry.unregister("edit_document");
    expect(editSignal.aborted).toBe(true);
    expect(readSignal.aborted).toBe(false);
  });

  it("get_editor_state execute returns the current mode", async () => {
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    const state = JSON.parse(
      (await registeredTools.get("get_editor_state")!.execute({})) as string,
    );
    expect(state.mode).toBe("editor");
  });

  it("declares annotations derived from scope and content trust", () => {
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    expect(registeredTools.get("read_document")!.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(registeredTools.get("edit_document")!.annotations).toEqual({
      readOnlyHint: false,
    });
    expect(registeredTools.get("delete_document")!.annotations).toEqual({
      readOnlyHint: false,
      consequentialHint: true,
      untrustedContentHint: true,
    });
  });

  it("resolves a structured error instead of rejecting when a tool throws", async () => {
    const registry = createToolRegistry(
      makeEditorCtx(),
      makeWorkspaceCtx(),
      skillsCtx,
    );
    registry.register(
      makeReadTool("broken_tool", () => Promise.reject(new Error("boom"))),
    );
    const log = new ToolActivityLog();
    const finishSpy = vi.spyOn(log, "finishCall");
    registerWebMCPTools(registry, log);

    const result = await registeredTools.get("broken_tool")!.execute({});
    expect(JSON.parse(result as string)).toEqual({
      error: "boom",
      code: "TOOL_FAILED",
      retryable: false,
    });
    expect(finishSpy).toHaveBeenCalledWith(expect.any(String), {
      ok: false,
      error: "boom",
    });
  });

  it("logs a structured error result as a failed call", async () => {
    const registry = createToolRegistry(
      makeEditorCtx(),
      makeWorkspaceCtx(),
      skillsCtx,
    );
    registry.register(
      makeReadTool("soft_fail", () =>
        Promise.resolve(JSON.stringify({ error: "nope", code: "NOT_FOUND" })),
      ),
    );
    const log = new ToolActivityLog();
    const finishSpy = vi.spyOn(log, "finishCall");
    registerWebMCPTools(registry, log);

    await registeredTools.get("soft_fail")!.execute({});
    expect(finishSpy).toHaveBeenCalledWith(expect.any(String), {
      ok: false,
      error: "nope",
    });
  });

  it("skips a tool that fails to register after others succeeded", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).modelContext = {
      registerTool: vi.fn((tool: CapturedTool) => {
        if (tool.name === "read_skill") throw new TypeError("name clash");
        registeredTools.set(tool.name, tool);
      }),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerWebMCPTools(
      createToolRegistry(makeEditorCtx(), makeWorkspaceCtx(), skillsCtx),
    );
    expect(registeredTools.has("read_skill")).toBe(false);
    expect(registeredTools.has("list_skills")).toBe(true);
    expect(registeredTools.has("delete_document")).toBe(true);
    warnSpy.mockRestore();
  });

  it("calls client.reportProgress when tool call triggers events", async () => {
    const registry = createToolRegistry(
      makeEditorCtx(),
      makeWorkspaceCtx(),
      skillsCtx,
    );
    const eventTool = {
      definition: () => ({
        name: "event_tool",
        description: "triggers agent events",
        parameters: { type: "object", properties: {} },
        scope: "read" as const,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      call: vi.fn().mockImplementation(async (_args: any, ctx: any) => {
        if (ctx?.onEvent) {
          ctx.onEvent({ type: "thinking", delta: "analyzing" });
          ctx.onEvent({ type: "text_delta", delta: "hello" });
          ctx.onEvent({ type: "done", output: "finished", history: [] });
        }
        return "result content";
      }),
    };
    registry.register(eventTool);
    registerWebMCPTools(registry);

    const reportProgress = vi.fn();
    const executeResult = await registeredTools
      .get("event_tool")!
      .execute({}, { reportProgress });

    expect(executeResult).toBe("result content");
    expect(reportProgress).toHaveBeenCalledTimes(2);
    expect(reportProgress).toHaveBeenNthCalledWith(
      1,
      JSON.stringify({ type: "thinking", delta: "analyzing" }),
    );
    expect(reportProgress).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ type: "text_delta", delta: "hello" }),
    );
  });
});
