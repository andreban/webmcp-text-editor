// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { WorkspaceContext, EditorLike } from "./context";
import type { WorkspaceDocument } from "../../../workspace";
import type { AgentRunnerFactory } from "../..";
import type { ApprovalRequest } from "../../../store";
import { ListWorkspaceDocsTool } from "./list_workspace_docs";
import { ReadDocumentTool } from "./read_document";
import { QueryWorkspaceDocTool } from "./query_workspace_doc";
import { CreateDocumentTool } from "./create_document";
import { RenameDocumentTool } from "./rename_document";
import { DeleteDocumentTool } from "./delete_document";
import { SwitchActiveDocumentTool } from "./switch_active_document";
import { resolveDocument } from "./resolve_document";
import { requestApproval } from "./request_approval";
import { MAX_PAGE_CHARS } from "../paginate";

/** Captures queued approval requests instead of rendering the modal. */
function captureApprovals() {
  const requests: ApprovalRequest[] = [];
  const setPendingApprovals = (
    fn: (prev: ApprovalRequest[]) => ApprovalRequest[],
  ) => {
    const next = fn([]);
    if (next[0]) requests.push(next[0]);
  };
  return { requests, setPendingApprovals };
}

function makeDoc(
  overrides: Partial<WorkspaceDocument> = {},
): WorkspaceDocument {
  return {
    id: "doc-1",
    title: "Test Doc",
    content: "Hello world",
    updatedAt: 1000,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<WorkspaceContext> = {}): WorkspaceContext {
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
    ...overrides,
  };
}

describe("resolveDocument", () => {
  const docs = [
    makeDoc({ id: "a", title: "Alpha" }),
    makeDoc({ id: "b", title: "Beta" }),
    makeDoc({ id: "c", title: "Beta" }),
  ];

  it("finds a document by id", () => {
    expect(resolveDocument(docs, "a").doc?.id).toBe("a");
  });

  it("finds a document by case-insensitive title", () => {
    expect(resolveDocument(docs, "  alpha ").doc?.id).toBe("a");
  });

  it("returns AMBIGUOUS listing candidate ids when titles repeat", () => {
    const error = JSON.parse(resolveDocument(docs, "beta").error!);
    expect(error.code).toBe("AMBIGUOUS");
    expect(error.suggestion).toContain("b, c");
  });

  it("returns NOT_FOUND pointing to list_workspace_docs", () => {
    const error = JSON.parse(resolveDocument(docs, "Gamma").error!);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.suggestion).toContain("list_workspace_docs");
  });

  it("returns INVALID_INPUT for a blank reference", () => {
    expect(JSON.parse(resolveDocument(docs, " ").error!).code).toBe(
      "INVALID_INPUT",
    );
  });
});

describe("requestApproval", () => {
  it("skips the prompt when Approve All is on", async () => {
    const { requests, setPendingApprovals } = captureApprovals();
    expect(
      await requestApproval("t", "d", setPendingApprovals, { current: true }),
    ).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it("still prompts with alwaysAsk even when Approve All is on", async () => {
    const { requests, setPendingApprovals } = captureApprovals();
    const promise = requestApproval(
      "t",
      "d",
      setPendingApprovals,
      { current: true },
      { alwaysAsk: true },
    );
    expect(requests).toHaveLength(1);
    requests[0].resolve(false);
    expect(await promise).toBe(false);
  });
});

describe("ListWorkspaceDocsTool", () => {
  it("returns id, title, and active flag only — no content", async () => {
    const docs = [
      makeDoc({ id: "a", title: "Alpha", content: "secret" }),
      makeDoc({ id: "b", title: "Beta", content: "also secret" }),
    ];
    const ctx = makeCtx({
      docsRef: { current: docs },
      activeDocRef: { current: { id: "b", title: "Beta" } },
    });
    const result = JSON.parse(
      await new ListWorkspaceDocsTool(ctx).call({}, {}),
    );
    expect(result).toEqual({
      total: 2,
      documents: [
        { id: "a", title: "Alpha", active: false },
        { id: "b", title: "Beta", active: true },
      ],
      next_offset: null,
    });
  });

  it("returns an empty list when workspace has no documents", async () => {
    expect(
      JSON.parse(await new ListWorkspaceDocsTool(makeCtx()).call({}, {})),
    ).toEqual({ total: 0, documents: [], next_offset: null });
  });

  it("pages through documents with offset and limit", async () => {
    const docs = ["a", "b", "c"].map((id) => makeDoc({ id, title: id }));
    const tool = new ListWorkspaceDocsTool(
      makeCtx({ docsRef: { current: docs } }),
    );
    const first = JSON.parse(await tool.call({ limit: 2 }, {}));
    expect(first.documents.map((d: { id: string }) => d.id)).toEqual([
      "a",
      "b",
    ]);
    expect(first.next_offset).toBe(2);
    const second = JSON.parse(await tool.call({ offset: 2, limit: 2 }, {}));
    expect(second.documents.map((d: { id: string }) => d.id)).toEqual(["c"]);
    expect(second.next_offset).toBeNull();
  });
});

describe("ReadDocumentTool", () => {
  it("reads a document by id", async () => {
    const doc = makeDoc({ id: "x", title: "My Doc", content: "content here" });
    const ctx = makeCtx({ docsRef: { current: [doc] } });
    const result = JSON.parse(
      await new ReadDocumentTool(ctx).call({ document: "x" }, {}),
    );
    expect(result).toEqual({
      id: "x",
      title: "My Doc",
      content: "content here",
      offset: 0,
      total_chars: 12,
      next_offset: null,
    });
  });

  it("reads a document by title", async () => {
    const doc = makeDoc({ id: "x", title: "My Doc" });
    const ctx = makeCtx({ docsRef: { current: [doc] } });
    const result = JSON.parse(
      await new ReadDocumentTool(ctx).call({ document: "my doc" }, {}),
    );
    expect(result.id).toBe("x");
  });

  it("reads the open document from the editor when no document is named", async () => {
    const ctx = makeCtx({
      activeDocRef: { current: { id: "x", title: "Open" } },
      editorRef: {
        current: { getValue: () => "live text", setValue: vi.fn() },
      },
    });
    const result = JSON.parse(await new ReadDocumentTool(ctx).call({}, {}));
    expect(result).toMatchObject({
      id: "x",
      title: "Open",
      content: "live text",
    });
  });

  it("falls back to editorContentRef when the editor is empty", async () => {
    const ctx = makeCtx({
      editorRef: { current: { getValue: () => "", setValue: vi.fn() } },
      editorContentRef: { current: "fallback content" },
    });
    const result = JSON.parse(await new ReadDocumentTool(ctx).call({}, {}));
    expect(result.content).toBe("fallback content");
    expect(result.id).toBeNull();
  });

  it("uses the editor's live text, not the saved copy, for the open document", async () => {
    const doc = makeDoc({ id: "x", content: "stale saved copy" });
    const ctx = makeCtx({
      docsRef: { current: [doc] },
      activeDocRef: { current: { id: "x", title: "Test Doc" } },
      editorRef: {
        current: { getValue: () => "unsaved edits", setValue: vi.fn() },
      },
    });
    const result = JSON.parse(
      await new ReadDocumentTool(ctx).call({ document: "x" }, {}),
    );
    expect(result.content).toBe("unsaved edits");
  });

  it("pages through long documents", async () => {
    const doc = makeDoc({ id: "x", content: "abcdefghij" });
    const tool = new ReadDocumentTool(makeCtx({ docsRef: { current: [doc] } }));
    const first = JSON.parse(await tool.call({ document: "x", limit: 4 }, {}));
    expect(first).toMatchObject({
      content: "abcd",
      offset: 0,
      total_chars: 10,
      next_offset: 4,
    });
    const last = JSON.parse(
      await tool.call({ document: "x", offset: 8, limit: 4 }, {}),
    );
    expect(last).toMatchObject({ content: "ij", next_offset: null });
  });

  it("caps the page size", async () => {
    const doc = makeDoc({ id: "x", content: "a".repeat(MAX_PAGE_CHARS + 10) });
    const tool = new ReadDocumentTool(makeCtx({ docsRef: { current: [doc] } }));
    const page = JSON.parse(
      await tool.call({ document: "x", limit: MAX_PAGE_CHARS * 2 }, {}),
    );
    expect(page.content).toHaveLength(MAX_PAGE_CHARS);
    expect(page.next_offset).toBe(MAX_PAGE_CHARS);
  });

  it("returns NOT_FOUND for an unknown document", async () => {
    const ctx = makeCtx({ docsRef: { current: [makeDoc()] } });
    const result = JSON.parse(
      await new ReadDocumentTool(ctx).call({ document: "unknown" }, {}),
    );
    expect(result.code).toBe("NOT_FOUND");
  });
});

describe("QueryWorkspaceDocTool", () => {
  function makeFactory(output = "mock answer") {
    const mockRun = vi.fn().mockResolvedValue({ output });
    const factory: AgentRunnerFactory = {
      create: vi.fn().mockReturnValue({ run: mockRun }),
    };
    return { factory, mockRun };
  }

  it("returns NOT_FOUND for an unknown document", async () => {
    const result = JSON.parse(
      await new QueryWorkspaceDocTool(makeCtx(), makeFactory().factory).call(
        { document: "nope", query: "anything" },
        {},
      ),
    );
    expect(result.code).toBe("NOT_FOUND");
  });

  it("creates a sub-agent runner with doc content and query, returns summary and excerpt", async () => {
    const { factory: mockFactory, mockRun } = makeFactory(
      '{"summary":"A concise summary.","excerpt":"The sky is blue."}',
    );
    const doc = makeDoc({
      id: "d1",
      title: "Brief",
      content: "The sky is blue.",
    });
    const ctx = makeCtx({ docsRef: { current: [doc] } });

    const result = JSON.parse(
      await new QueryWorkspaceDocTool(ctx, mockFactory).call(
        { document: "d1", query: "What color is the sky?" },
        {},
      ),
    );
    expect(result).toEqual({
      summary: "A concise summary.",
      excerpt: "The sky is blue.",
    });
    expect(mockFactory.create).toHaveBeenCalledOnce();

    const [agentConfig, input] = mockRun.mock.calls[0];
    expect(agentConfig.name).toBe("DocQuerier");
    expect(input).toContain("Brief");
    expect(input).toContain("The sky is blue.");
    expect(input).toContain("What color is the sky?");
  });
});

// In the WebMCP build, the mutating workspace tools self-gate via
// `requestApproval`. The default mock context sets `approveAllRef.current = true`
// so calls short-circuit through; an explicit test below verifies rejection.

describe("CreateDocumentTool", () => {
  let createDocumentFn: Mock;
  let setEditorValueFn: Mock;
  let mockEditorRef: { current: EditorLike };

  beforeEach(() => {
    createDocumentFn = vi.fn().mockReturnValue("new-doc-id");
    setEditorValueFn = vi.fn();
    mockEditorRef = {
      current: {
        getValue: vi.fn().mockReturnValue(""),
        setValue: setEditorValueFn,
      },
    };
  });

  function makeTool() {
    return new CreateDocumentTool(
      makeCtx({ createDocumentFn, editorRef: mockEditorRef }),
    );
  }

  it("returns INVALID_INPUT when title is empty", async () => {
    const result = JSON.parse(await makeTool().call({ title: "" }, {}));
    expect(result.code).toBe("INVALID_INPUT");
    expect(createDocumentFn).not.toHaveBeenCalled();
  });

  it("creates the document, clears the editor, and returns its id", async () => {
    const result = JSON.parse(await makeTool().call({ title: "My Doc" }, {}));
    expect(createDocumentFn).toHaveBeenCalledWith("My Doc");
    expect(setEditorValueFn).toHaveBeenCalledWith("");
    expect(result).toEqual({
      created: true,
      id: "new-doc-id",
      title: "My Doc",
      active: true,
    });
  });

  it("seeds the editor with provided content and persists it", async () => {
    const saveDocContentFn = vi.fn();
    const tool = new CreateDocumentTool(
      makeCtx({ createDocumentFn, saveDocContentFn, editorRef: mockEditorRef }),
    );
    await tool.call({ title: "My Doc", content: "Hello world" }, {});
    expect(setEditorValueFn).toHaveBeenCalledWith("Hello world");
    expect(saveDocContentFn).toHaveBeenCalledWith("new-doc-id", "Hello world");
  });

  it("does not persist content when none is provided", async () => {
    const saveDocContentFn = vi.fn();
    const tool = new CreateDocumentTool(
      makeCtx({ createDocumentFn, saveDocContentFn, editorRef: mockEditorRef }),
    );
    await tool.call({ title: "My Doc" }, {});
    expect(setEditorValueFn).toHaveBeenCalledWith("");
    expect(saveDocContentFn).not.toHaveBeenCalledWith(
      "new-doc-id",
      expect.anything(),
    );
  });

  it("queues an approval request and aborts when the user rejects", async () => {
    let captured: ApprovalRequest | null = null;
    const setPendingApprovals = (
      fn: (prev: ApprovalRequest[]) => ApprovalRequest[],
    ) => {
      const next = fn([]);
      if (next[0]) captured = next[0];
    };
    const tool = new CreateDocumentTool(
      makeCtx({
        createDocumentFn,
        editorRef: mockEditorRef,
        approveAllRef: { current: false },
        setPendingApprovals,
      }),
    );
    const promise = tool.call({ title: "Reject Me" }, {});
    await Promise.resolve();
    if (!captured) throw new Error("Approval was not queued");
    (captured as ApprovalRequest).resolve(false);
    const result = JSON.parse(await promise);
    expect(result.code).toBe("REJECTED");
    expect(createDocumentFn).not.toHaveBeenCalled();
  });
});

describe("RenameDocumentTool", () => {
  let renameDocumentFn: Mock;

  beforeEach(() => {
    renameDocumentFn = vi.fn();
  });

  function makeTool(docs: WorkspaceDocument[]) {
    return new RenameDocumentTool(
      makeCtx({ docsRef: { current: docs }, renameDocumentFn }),
    );
  }

  it("returns NOT_FOUND when document is not found", async () => {
    const result = JSON.parse(
      await makeTool([]).call({ document: "nope", newTitle: "New" }, {}),
    );
    expect(result.code).toBe("NOT_FOUND");
    expect(renameDocumentFn).not.toHaveBeenCalled();
  });

  it("returns INVALID_INPUT when newTitle is empty", async () => {
    const result = JSON.parse(
      await makeTool([makeDoc({ id: "d1" })]).call(
        { document: "d1", newTitle: "" },
        {},
      ),
    );
    expect(result.code).toBe("INVALID_INPUT");
    expect(renameDocumentFn).not.toHaveBeenCalled();
  });

  it("renames the document found by title", async () => {
    const result = JSON.parse(
      await makeTool([makeDoc({ id: "d1", title: "Old" })]).call(
        { document: "old", newTitle: "New" },
        {},
      ),
    );
    expect(renameDocumentFn).toHaveBeenCalledWith("d1", "New");
    expect(result).toEqual({ renamed: true, id: "d1", title: "New" });
  });
});

describe("DeleteDocumentTool", () => {
  let deleteDocumentFn: Mock;

  beforeEach(() => {
    deleteDocumentFn = vi.fn();
  });

  function makeTool(
    docs: WorkspaceDocument[],
    overrides: Partial<WorkspaceContext> = {},
  ) {
    return new DeleteDocumentTool(
      makeCtx({ docsRef: { current: docs }, deleteDocumentFn, ...overrides }),
    );
  }

  it("returns NOT_FOUND when document is not found", async () => {
    const result = JSON.parse(
      await makeTool([]).call({ document: "nope" }, {}),
    );
    expect(result.code).toBe("NOT_FOUND");
    expect(deleteDocumentFn).not.toHaveBeenCalled();
  });

  it("asks for confirmation even when Approve All is on, then deletes", async () => {
    const { requests, setPendingApprovals } = captureApprovals();
    const promise = makeTool([makeDoc({ id: "d1", title: "My Essay" })], {
      approveAllRef: { current: true },
      setPendingApprovals,
    }).call({ document: "My Essay" }, {});

    expect(requests).toHaveLength(1);
    expect(requests[0].description).toContain("My Essay");
    expect(deleteDocumentFn).not.toHaveBeenCalled();

    requests[0].resolve(true);
    expect(JSON.parse(await promise)).toEqual({
      deleted: true,
      id: "d1",
      title: "My Essay",
    });
    expect(deleteDocumentFn).toHaveBeenCalledWith("d1");
  });

  it("returns REJECTED and keeps the document when the user declines", async () => {
    const { requests, setPendingApprovals } = captureApprovals();
    const promise = makeTool([makeDoc({ id: "d1" })], {
      setPendingApprovals,
    }).call({ document: "d1" }, {});
    requests[0].resolve(false);
    expect(JSON.parse(await promise).code).toBe("REJECTED");
    expect(deleteDocumentFn).not.toHaveBeenCalled();
  });
});

describe("SwitchActiveDocumentTool", () => {
  let setActiveDocumentIdFn: Mock;
  let saveDocContentFn: Mock;
  let setEditorValueFn: Mock;
  let mockEditorRef: { current: EditorLike };

  beforeEach(() => {
    setActiveDocumentIdFn = vi.fn();
    saveDocContentFn = vi.fn();
    setEditorValueFn = vi.fn();
    mockEditorRef = {
      current: {
        getValue: vi.fn().mockReturnValue("editor content"),
        setValue: setEditorValueFn,
      },
    };
  });

  function makeTool(
    docs: WorkspaceDocument[],
    activeDoc: { id: string; title: string } | null = null,
  ) {
    return new SwitchActiveDocumentTool(
      makeCtx({
        docsRef: { current: docs },
        activeDocRef: { current: activeDoc },
        setActiveDocumentIdFn,
        saveDocContentFn,
        editorRef: mockEditorRef,
      }),
    );
  }

  it("returns NOT_FOUND when document is not found", async () => {
    const result = JSON.parse(
      await makeTool([]).call({ document: "nope" }, {}),
    );
    expect(result.code).toBe("NOT_FOUND");
    expect(setActiveDocumentIdFn).not.toHaveBeenCalled();
  });

  it("switches document without authorization", async () => {
    const result = JSON.parse(
      await makeTool([makeDoc({ id: "d1", title: "Doc 1" })]).call(
        { document: "d1" },
        {},
      ),
    );
    expect(result).toEqual({ switched: true, id: "d1", title: "Doc 1" });
    expect(setActiveDocumentIdFn).toHaveBeenCalledWith("d1");
  });

  it("saves current document content before switching", async () => {
    await makeTool([makeDoc({ id: "d2", title: "Target" })], {
      id: "d1",
      title: "Current",
    }).call({ document: "d2" }, {});
    expect(saveDocContentFn).toHaveBeenCalledWith("d1", "editor content");
    expect(setActiveDocumentIdFn).toHaveBeenCalledWith("d2");
  });

  it("does not save content when no active document", async () => {
    await makeTool([makeDoc({ id: "d1" })], null).call({ document: "d1" }, {});
    expect(saveDocContentFn).not.toHaveBeenCalled();
  });

  it("syncs editor value to new document content immediately", async () => {
    await makeTool([makeDoc({ id: "d1", content: "new content" })]).call(
      { document: "d1" },
      {},
    );
    expect(setEditorValueFn).toHaveBeenCalledWith("new content");
  });
});
