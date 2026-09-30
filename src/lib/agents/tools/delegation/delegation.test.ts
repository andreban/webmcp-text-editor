// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { registerDelegationTools } from "./index";
import { ToolRegistry } from "@mast-ai/core";
import type { AgentRunnerFactory } from "../../";
import type { AgentEvent, ToolContext } from "@mast-ai/core";
import type { EditorContext } from "../editor/context";
import type { WorkspaceContext } from "../workspace/context";
import type { SkillsContext } from "../skills/context";
import { createToolRegistry } from "../registries";
import type { ApprovalRequest, PlanConfirmationRequest } from "../../../store";

const skillsCtx: SkillsContext = { skillsRef: { current: [] } };

function makeMockStream(
  output: string,
  extraEvents: AgentEvent[] = [],
): AsyncIterable<AgentEvent> {
  return (async function* () {
    for (const e of extraEvents) yield e;
    yield { type: "done", output, history: [] };
  })();
}

function makeFactory(mockRunStream: ReturnType<typeof vi.fn>): {
  factory: AgentRunnerFactory;
  mockCreate: ReturnType<typeof vi.fn>;
  mockRunBuilder: ReturnType<typeof vi.fn>;
} {
  const callStream = mockRunStream as unknown as (
    input: string,
  ) => AsyncIterable<AgentEvent>;
  const mockRunBuilder = vi.fn().mockImplementation(() => {
    let ctx: ToolContext | undefined;
    const builder = {
      forwardTo: vi.fn().mockImplementation((c: ToolContext) => {
        ctx = c;
        return builder;
      }),
      runStream: vi.fn().mockImplementation(async function* (input: string) {
        for await (const event of callStream(input)) {
          if (event.type !== "done") ctx?.onEvent?.(event);
          yield event;
        }
      }),
    };
    return builder;
  });
  const mockCreate = vi.fn().mockReturnValue({ runBuilder: mockRunBuilder });
  return { factory: { create: mockCreate }, mockCreate, mockRunBuilder };
}

async function callTool(
  registry: ToolRegistry,
  name: string,
  args: unknown,
  context: { onEvent?: (event: AgentEvent) => void } = {},
) {
  const tool = registry.getTool(name);
  if (!tool) throw new Error(`Tool '${name}' not registered`);
  return tool.call(args, context);
}

function makeContexts(
  factory: AgentRunnerFactory,
  docs: {
    id: string;
    title: string;
    content: string;
    updatedAt: number;
  }[] = [],
) {
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
    docsRef: { current: docs },
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

describe("registerDelegationTools / invoke_agent", () => {
  let mockRunStream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRunStream = vi.fn().mockReturnValue(makeMockStream("sub-agent output"));
  });

  it("calls factory.create with the provided systemPrompt", async () => {
    const { factory, mockCreate } = makeFactory(mockRunStream);
    const { editorCtx, workspaceCtx } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(editorCtx, workspaceCtx, skillsCtx).readOnly(),
      workspaceCtx,
      vi.fn(),
    );

    await callTool(registry, "invoke_agent", {
      systemPrompt: "Be brief.",
      task: "Summarize AI.",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "Be brief." }),
    );
  });

  it("returns { result } with the sub-agent output", async () => {
    mockRunStream.mockReturnValue(makeMockStream("Great summary."));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const raw = await callTool(registry, "invoke_agent", {
      systemPrompt: "Help.",
      task: "Summarize.",
    });
    expect(JSON.parse(raw as string)).toEqual({ result: "Great summary." });
  });

  it("relays non-done child events via context.onEvent", async () => {
    mockRunStream.mockReturnValue(
      makeMockStream("done", [
        { type: "text_delta", delta: "hello" },
        { type: "thinking", delta: "hmm" },
      ]),
    );
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const onEvent = vi.fn();
    await callTool(
      registry,
      "invoke_agent",
      { systemPrompt: "s", task: "t" },
      { onEvent },
    );

    expect(onEvent).toHaveBeenCalledWith({
      type: "text_delta",
      delta: "hello",
    });
    expect(onEvent).toHaveBeenCalledWith({ type: "thinking", delta: "hmm" });
    expect(onEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "done" }),
    );
  });

  it("uses empty tools list when no tool groups are requested", async () => {
    const { factory, mockRunBuilder } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    await callTool(registry, "invoke_agent", {
      systemPrompt: "s",
      task: "t",
      tools: [],
    });
    const [agentConfig] = mockRunBuilder.mock.calls[0];
    expect(agentConfig.tools).toEqual([]);
  });

  it("invoke_agent tool is registered on the registry", () => {
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const tool = registry.getTool("invoke_agent");
    expect(tool).toBeDefined();
    expect(tool?.definition().name).toBe("invoke_agent");
  });

  it("workspace_readonly group yields only read workspace tools (no create_document etc.)", async () => {
    const { factory, mockRunBuilder } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    await callTool(registry, "invoke_agent", {
      systemPrompt: "s",
      task: "t",
      tools: ["workspace_readonly"],
    });

    const [agentConfig] = mockRunBuilder.mock.calls[0];
    expect(agentConfig.tools).toContain("list_workspace_docs");
    expect(agentConfig.tools).toContain("read_document");
    expect(agentConfig.tools).not.toContain("create_document");
    expect(agentConfig.tools).not.toContain("rename_document");
    expect(agentConfig.tools).not.toContain("delete_document");
    expect(agentConfig.tools).not.toContain("switch_active_document");
  });

  it("asks for approval and does not run the sub-agent when the user rejects", async () => {
    const { factory, mockCreate } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    let captured: ApprovalRequest | null = null;
    wt.approveAllRef.current = false;
    wt.setPendingApprovals = (fn) => {
      const next = fn([]);
      if (next[0]) captured = next[0];
    };
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const promise = callTool(registry, "invoke_agent", {
      systemPrompt: "s",
      task: "Summarize the doc",
    });
    await Promise.resolve();
    if (!captured) throw new Error("Approval was not queued");
    expect((captured as ApprovalRequest).toolName).toBe("invoke_agent");
    expect((captured as ApprovalRequest).description).toContain(
      "Summarize the doc",
    );
    (captured as ApprovalRequest).resolve(false);

    expect(JSON.parse((await promise) as string)).toMatchObject({
      code: "REJECTED",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("registerDelegationTools / invoke_planner", () => {
  let autoConfirm: Mock<(req: PlanConfirmationRequest | null) => void>;

  beforeEach(() => {
    autoConfirm = vi
      .fn<(req: PlanConfirmationRequest | null) => void>()
      .mockImplementation((req) => {
        if (req) req.resolve(true);
      });
  });

  const validPlan = {
    goal: "Write a blog post",
    steps: [{ id: "step_1", instruction: "Research the topic", dependsOn: [] }],
  };

  it("invoke_planner tool is registered on the registry", () => {
    const mockRunStream = vi.fn();
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const tool = registry.getTool("invoke_planner");
    expect(tool).toBeDefined();
    expect(tool?.definition().name).toBe("invoke_planner");
  });

  it("returns a JSON string that parses to a Plan with goal and steps", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      autoConfirm,
    );

    const raw = await callTool(registry, "invoke_planner", {
      task: "Write a blog post about AI",
    });
    const parsed = JSON.parse(raw as string);
    expect(parsed.goal).toBe("Write a blog post");
    expect(Array.isArray(parsed.steps)).toBe(true);
    expect(parsed.steps).toHaveLength(1);
  });

  it("appends context to the task prompt when context is provided", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      autoConfirm,
    );

    await callTool(registry, "invoke_planner", {
      task: "Write a blog post",
      context: "Style: formal",
    });
    expect(mockRunStream).toHaveBeenCalledWith(
      "Write a blog post\n\nStyle: formal",
    );
  });

  it("returns a retryable TOOL_FAILED error when agent output is not valid JSON", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream("not json at all"));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const result = JSON.parse(
      (await callTool(registry, "invoke_planner", { task: "t" })) as string,
    );
    expect(result).toMatchObject({ code: "TOOL_FAILED", retryable: true });
    expect(result.error).toContain("not JSON");
  });

  it("returns a retryable TOOL_FAILED error when the plan is missing required fields", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify({ steps: [] })));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const result = JSON.parse(
      (await callTool(registry, "invoke_planner", { task: "t" })) as string,
    );
    expect(result).toMatchObject({ code: "TOOL_FAILED", retryable: true });
    expect(result.error).toContain("without a goal or steps");
  });

  it("calls setPendingPlanConfirmation with the plan before awaiting", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      autoConfirm,
    );

    await callTool(registry, "invoke_planner", { task: "Write a blog post" });
    expect(autoConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ plan: validPlan }),
    );
  });

  it("clears pendingPlanConfirmation with null after resolution", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      autoConfirm,
    );

    await callTool(registry, "invoke_planner", { task: "t" });
    expect(autoConfirm).toHaveBeenCalledWith(null);
  });

  it("returns a REJECTED error when confirmation resolves with false", async () => {
    const rejectConfirm = vi.fn().mockImplementation((req) => {
      if (req) req.resolve(false);
    });
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      rejectConfirm,
    );

    const result = JSON.parse(
      (await callTool(registry, "invoke_planner", { task: "t" })) as string,
    );
    expect(result).toMatchObject({
      error: "Plan rejected by user.",
      code: "REJECTED",
    });
  });

  it("clears pendingPlanConfirmation with null even when rejected", async () => {
    const rejectConfirm = vi.fn().mockImplementation((req) => {
      if (req) req.resolve(false);
    });
    const mockRunStream = vi
      .fn()
      .mockReturnValue(makeMockStream(JSON.stringify(validPlan)));
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      rejectConfirm,
    );

    await callTool(registry, "invoke_planner", { task: "t" });
    expect(rejectConfirm).toHaveBeenCalledWith(null);
  });
});

describe("registerDelegationTools / invoke_researcher", () => {
  const docs = [
    { id: "doc1", title: "Doc One", content: "Alpha content", updatedAt: 1 },
    { id: "doc2", title: "Doc Two", content: "Beta content", updatedAt: 2 },
  ];

  it("invoke_researcher tool is registered on the registry", () => {
    const mockRunStream = vi.fn();
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory, docs);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const tool = registry.getTool("invoke_researcher");
    expect(tool).toBeDefined();
    expect(tool?.definition().name).toBe("invoke_researcher");
  });

  it("returns ResearchResult with summary string and sources array for two docs", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValueOnce(
        makeMockStream(
          '{"summary":"Alpha summary.","excerpt":"alpha passage"}',
        ),
      )
      .mockReturnValueOnce(
        makeMockStream('{"summary":"Beta summary.","excerpt":"beta passage"}'),
      )
      .mockReturnValueOnce(makeMockStream('{"summary":"Combined answer."}'));

    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory, docs);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const raw = await callTool(registry, "invoke_researcher", {
      query: "What do the docs say?",
    });
    const result = JSON.parse(raw as string);

    expect(typeof result.summary).toBe("string");
    expect(result.summary).toBe("Combined answer.");
    expect(Array.isArray(result.sources)).toBe(true);
    expect(result.sources).toHaveLength(2);
  });

  it("each source has id, title, and excerpt fields", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValueOnce(
        makeMockStream(
          '{"summary":"Alpha summary.","excerpt":"alpha excerpt"}',
        ),
      )
      .mockReturnValueOnce(
        makeMockStream('{"summary":"Beta summary.","excerpt":"beta excerpt"}'),
      )
      .mockReturnValueOnce(makeMockStream('{"summary":"Combined."}'));

    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory, docs);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const raw = await callTool(registry, "invoke_researcher", { query: "q" });
    const result = JSON.parse(raw as string);

    for (const source of result.sources) {
      expect(typeof source.id).toBe("string");
      expect(typeof source.title).toBe("string");
      expect(typeof source.excerpt).toBe("string");
    }
    expect(result.sources[0]).toMatchObject({
      id: "doc1",
      title: "Doc One",
      excerpt: "alpha excerpt",
    });
    expect(result.sources[1]).toMatchObject({
      id: "doc2",
      title: "Doc Two",
      excerpt: "beta excerpt",
    });
  });

  it("filters to only the named documents", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValueOnce(
        makeMockStream('{"summary":"Doc Two only.","excerpt":"beta"}'),
      )
      .mockReturnValueOnce(makeMockStream('{"summary":"Only doc two."}'));

    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory, docs);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const raw = await callTool(registry, "invoke_researcher", {
      query: "q",
      documents: ["doc2"],
    });
    const result = JSON.parse(raw as string);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe("doc2");
    expect(mockRunStream).toHaveBeenCalledTimes(2);
  });

  it("returns empty sources and no-content summary when no docs have relevant content", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValueOnce(
        makeMockStream('{"summary":"No relevant content.","excerpt":""}'),
      )
      .mockReturnValueOnce(
        makeMockStream('{"summary":"No relevant content.","excerpt":""}'),
      );

    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx: wt } = makeContexts(factory, docs);
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );

    const raw = await callTool(registry, "invoke_researcher", { query: "q" });
    const result = JSON.parse(raw as string);

    expect(result.sources).toHaveLength(0);
    expect(result.summary).toContain("No relevant content");
  });

  function registerResearcher(
    mockRunStream: ReturnType<typeof vi.fn>,
    overrides: Partial<WorkspaceContext> = {},
  ) {
    const { factory } = makeFactory(mockRunStream);
    const { editorCtx: et, workspaceCtx } = makeContexts(factory, docs);
    const wt = { ...workspaceCtx, ...overrides };
    const registry = new ToolRegistry();
    registerDelegationTools(
      registry,
      factory,
      createToolRegistry(et, wt, skillsCtx).readOnly(),
      wt,
      vi.fn(),
    );
    return registry;
  }

  it("accepts document titles as well as ids", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValueOnce(
        makeMockStream('{"summary":"Doc One only.","excerpt":"alpha"}'),
      )
      .mockReturnValueOnce(makeMockStream('{"summary":"Only doc one."}'));
    const registry = registerResearcher(mockRunStream);

    const result = JSON.parse(
      (await callTool(registry, "invoke_researcher", {
        query: "q",
        documents: ["doc one"],
      })) as string,
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].id).toBe("doc1");
  });

  it("returns NOT_FOUND without running research for an unknown document", async () => {
    const mockRunStream = vi.fn();
    const registry = registerResearcher(mockRunStream);

    const result = JSON.parse(
      (await callTool(registry, "invoke_researcher", {
        query: "q",
        documents: ["Missing"],
      })) as string,
    );
    expect(result.code).toBe("NOT_FOUND");
    expect(mockRunStream).not.toHaveBeenCalled();
  });

  it("researches the editor's live text for the open document", async () => {
    const mockRunStream = vi
      .fn()
      .mockReturnValueOnce(
        makeMockStream('{"summary":"Live.","excerpt":"unsaved"}'),
      )
      .mockReturnValueOnce(makeMockStream('{"summary":"Done."}'));
    const registry = registerResearcher(mockRunStream, {
      activeDocRef: { current: { id: "doc1", title: "Doc One" } },
      editorRef: {
        current: { getValue: () => "Unsaved edits", setValue: vi.fn() },
      },
    });

    await callTool(registry, "invoke_researcher", {
      query: "q",
      documents: ["doc1"],
    });
    expect(mockRunStream.mock.calls[0][0]).toContain("Unsaved edits");
    expect(mockRunStream.mock.calls[0][0]).not.toContain("Alpha content");
  });
});
