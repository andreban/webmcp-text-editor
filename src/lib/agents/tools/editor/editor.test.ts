// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as monaco from "monaco-editor";
import type { EditorContext } from "./context";
import { ReadSelectionTool } from "./read_selection";
import { MAX_SEARCH_MATCHES, SearchDocumentTool } from "./search_document";
import { GetEditorStateTool } from "./get_editor_state";
import { RequestSwitchToEditorTool } from "./request_switch_to_editor";
import { EditDocumentTool } from "./edit_document";
import { RewriteDocumentTool } from "./rewrite_document";
import type { Suggestion } from "../../../store";

function makeCtx(
  overrides: Partial<EditorContext> = {},
  mockEditor?: monaco.editor.IStandaloneCodeEditor,
): EditorContext {
  return {
    editorRef: { current: mockEditor ?? null },
    editorContentRef: { current: "" },
    activeTabRef: { current: "editor" },
    requestTabSwitch: () => Promise.resolve(false),
    setSuggestions: vi.fn(),
    approveAllRef: { current: false },
    ...overrides,
  };
}

/** Captures the suggestion queued by edit_document / rewrite_document. */
function lastSuggestion(setSuggestions: ReturnType<typeof vi.fn>): Suggestion {
  const updateFn = setSuggestions.mock.calls[0][0];
  return updateFn([])[0];
}

describe("GetEditorStateTool", () => {
  function state(
    ctx: EditorContext,
    activeDoc: { id: string; title: string } | null = null,
  ) {
    return new GetEditorStateTool(ctx, { current: activeDoc })
      .call({}, {})
      .then((s) => JSON.parse(s));
  }

  it("reports mode, open document, and zero counts for an empty document", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor: any = {
      getValue: () => "",
      getSelection: () => null,
    };
    expect(
      await state(makeCtx({}, editor), { id: "d1", title: "Essay" }),
    ).toEqual({
      document: { id: "d1", title: "Essay" },
      mode: "editor",
      has_selection: false,
      stats: { characters: 0, words: 0, lines: 0 },
    });
  });

  it("counts characters, words, and lines", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor: any = {
      getValue: () => "line one\nline two\nline three",
      getSelection: () => null,
    };
    expect((await state(makeCtx({}, editor))).stats).toEqual({
      characters: 28,
      words: 6,
      lines: 3,
    });
  });

  it("reports preview mode and no open document", async () => {
    const result = await state(
      makeCtx({ activeTabRef: { current: "preview" } }),
    );
    expect(result.mode).toBe("preview");
    expect(result.document).toBeNull();
  });

  it("falls back to editorContentRef when the editor is not mounted", async () => {
    const result = await state(
      makeCtx({ editorContentRef: { current: "hello world" } }),
    );
    expect(result.stats.words).toBe(2);
  });

  it("detects a non-empty selection", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor: any = {
      getValue: () => "hello",
      getSelection: () => ({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 3,
      }),
    };
    expect((await state(makeCtx({}, editor))).has_selection).toBe(true);
  });
});

describe("RequestSwitchToEditorTool", () => {
  it("returns already-in-editor message when in editor mode", async () => {
    expect(await new RequestSwitchToEditorTool(makeCtx()).call({}, {})).toBe(
      "Already in editor mode.",
    );
  });

  it("returns success message when user accepts switch", async () => {
    const ctx = makeCtx({
      activeTabRef: { current: "preview" },
      requestTabSwitch: vi.fn().mockResolvedValue(true),
    });
    expect(await new RequestSwitchToEditorTool(ctx).call({}, {})).toBe(
      "Switched to editor mode.",
    );
  });

  it("returns a REJECTED error when user declines the switch", async () => {
    const ctx = makeCtx({
      activeTabRef: { current: "preview" },
      requestTabSwitch: vi.fn().mockResolvedValue(false),
    });
    const result = JSON.parse(
      await new RequestSwitchToEditorTool(ctx).call({}, {}),
    );
    expect(result).toMatchObject({
      error: "User declined to switch to editor mode.",
      code: "REJECTED",
    });
  });
});

describe("SearchDocumentTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockModel: any;

  beforeEach(() => {
    mockModel = {
      findMatches: vi.fn(),
      getLineContent: vi.fn().mockReturnValue("the Foo line"),
      getValueInRange: vi.fn().mockReturnValue("Foo"),
    };
    mockEditor = { getModel: vi.fn().mockReturnValue(mockModel) };
  });

  function search(query: string, editor = mockEditor) {
    return new SearchDocumentTool(makeCtx({}, editor))
      .call({ query }, {})
      .then((s) => JSON.parse(s));
  }

  it("returns a retryable NOT_READY error if editor not initialized", async () => {
    expect(await search("hello", null)).toMatchObject({
      code: "NOT_READY",
      retryable: true,
    });
  });

  it("returns INVALID_INPUT for an empty query", async () => {
    expect((await search("")).code).toBe("INVALID_INPUT");
  });

  it("returns an empty match list when nothing matches", async () => {
    mockModel.findMatches.mockReturnValue([]);
    expect(await search("xyz")).toEqual({
      query: "xyz",
      total: 0,
      truncated: false,
      matches: [],
    });
  });

  it("returns location, exact text, and line context for each match", async () => {
    mockModel.findMatches.mockReturnValue([
      { range: { startLineNumber: 3, startColumn: 5 } },
    ]);
    expect((await search("foo")).matches).toEqual([
      { line: 3, column: 5, text: "Foo", context: "the Foo line" },
    ]);
  });

  it("caps the number of matches and reports truncation", async () => {
    mockModel.findMatches.mockReturnValue(
      Array.from({ length: MAX_SEARCH_MATCHES + 5 }, (_, i) => ({
        range: { startLineNumber: i + 1, startColumn: 1 },
      })),
    );
    const result = await search("foo");
    expect(result.total).toBe(MAX_SEARCH_MATCHES + 5);
    expect(result.truncated).toBe(true);
    expect(result.matches).toHaveLength(MAX_SEARCH_MATCHES);
  });

  it("keeps the match visible in the context of a long line", async () => {
    const line = `${"a".repeat(300)}Foo${"b".repeat(300)}`;
    mockModel.getLineContent.mockReturnValue(line);
    mockModel.findMatches.mockReturnValue([
      { range: { startLineNumber: 1, startColumn: 301 } },
    ]);
    const { context } = (await search("foo")).matches[0];
    expect(context).toContain("Foo");
    expect(context.startsWith("…")).toBe(true);
    expect(context.endsWith("…")).toBe(true);
  });
});

describe("ReadSelectionTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockModel: any;

  beforeEach(() => {
    mockModel = { getValueInRange: vi.fn() };
    mockEditor = {
      getSelection: vi.fn().mockReturnValue(null),
      getModel: vi.fn().mockReturnValue(mockModel),
    };
  });

  it("reports no selection if editor not initialized", async () => {
    expect(
      JSON.parse(await new ReadSelectionTool(makeCtx()).call({}, {})),
    ).toMatchObject({ has_selection: false, text: "" });
  });

  it("reports no selection when selection is null", async () => {
    expect(
      JSON.parse(
        await new ReadSelectionTool(makeCtx({}, mockEditor)).call({}, {}),
      ),
    ).toMatchObject({ has_selection: false });
  });

  it("returns the selected text", async () => {
    const selection = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 6,
    };
    mockEditor.getSelection.mockReturnValue(selection);
    mockModel.getValueInRange.mockReturnValue("hello");
    expect(
      JSON.parse(
        await new ReadSelectionTool(makeCtx({}, mockEditor)).call({}, {}),
      ),
    ).toEqual({ has_selection: true, text: "hello", truncated: false });
    expect(mockModel.getValueInRange).toHaveBeenCalledWith(selection);
  });
});

describe("EditDocumentTool", () => {
  const RANGE = {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 4,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockModel: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tracker: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setSuggestions: any;

  beforeEach(() => {
    mockModel = {
      findMatches: vi.fn().mockReturnValue([{ range: RANGE }]),
      pushEditOperations: vi.fn(),
      getOffsetAt: vi.fn().mockReturnValue(0),
      getPositionAt: vi.fn().mockReturnValue({ lineNumber: 1, column: 1 }),
      getValueInRange: vi.fn().mockReturnValue("old"),
    };
    tracker = { clear: vi.fn(), getRange: vi.fn().mockReturnValue(RANGE) };
    mockEditor = {
      getValue: vi.fn().mockReturnValue("old content"),
      setValue: vi.fn(),
      getModel: vi.fn().mockReturnValue(mockModel),
      revealRangeInCenter: vi.fn(),
      createDecorationsCollection: vi.fn().mockReturnValue(tracker),
    };
    setSuggestions = vi.fn();
  });

  function edit(
    originalText: string,
    overrides: Partial<EditorContext> = {},
    editor = mockEditor,
  ) {
    return new EditDocumentTool(
      makeCtx({ setSuggestions, ...overrides }, editor),
    ).call({ originalText, replacementText: "new" }, {});
  }

  it("returns a retryable NOT_READY error if editor not initialized", async () => {
    expect(JSON.parse(await edit("old", {}, null))).toMatchObject({
      code: "NOT_READY",
      retryable: true,
    });
  });

  it("returns NOT_FOUND with a hint if text not found", async () => {
    mockModel.findMatches.mockReturnValue([]);
    const result = JSON.parse(await edit("missing"));
    expect(result.code).toBe("NOT_FOUND");
    expect(result.error).toContain('"missing"');
    expect(result.suggestion).toContain("search_document");
  });

  it("truncates long missing text in the error", async () => {
    mockModel.findMatches.mockReturnValue([]);
    const result = JSON.parse(await edit("x".repeat(500)));
    expect(result.error.length).toBeLessThan(150);
  });

  it("returns AMBIGUOUS without queuing a suggestion when the text occurs more than once", async () => {
    mockModel.findMatches.mockReturnValue([
      { range: RANGE },
      { range: { ...RANGE, startLineNumber: 7, endLineNumber: 7 } },
    ]);
    const result = JSON.parse(await edit("old"));
    expect(result.code).toBe("AMBIGUOUS");
    expect(result.error).toContain("2 times (lines 1, 7)");
    expect(setSuggestions).not.toHaveBeenCalled();
  });

  it("returns INVALID_INPUT for empty originalText", async () => {
    expect(JSON.parse(await edit("")).code).toBe("INVALID_INPUT");
  });

  it("points to rewrite_document when originalText is too large", async () => {
    const result = JSON.parse(await edit("x".repeat(3001)));
    expect(result.code).toBe("INVALID_INPUT");
    expect(result.suggestion).toContain("rewrite_document");
  });

  it("creates a suggestion and resolves with accepted message on apply", async () => {
    const promise = edit("old");
    const suggestion = lastSuggestion(setSuggestions);
    expect(suggestion.status).toBe("pending");

    suggestion.resolve("applied");
    expect(await promise).toBe(
      "User accepted the edit. The document has been updated.",
    );
    expect(mockModel.pushEditOperations).toHaveBeenCalledWith(
      [],
      [{ range: RANGE, text: "new" }],
      expect.any(Function),
    );
    expect(tracker.clear).toHaveBeenCalled();
  });

  it("applies the edit where the text has moved to while pending", async () => {
    const moved = { ...RANGE, startLineNumber: 3, endLineNumber: 3 };
    const promise = edit("old");
    tracker.getRange.mockReturnValue(moved);
    lastSuggestion(setSuggestions).resolve("applied");
    await promise;
    expect(mockModel.pushEditOperations).toHaveBeenCalledWith(
      [],
      [{ range: moved, text: "new" }],
      expect.any(Function),
    );
  });

  it("refuses with STALE_EDIT when the target text changed while pending", async () => {
    const promise = edit("old");
    mockModel.getValueInRange.mockReturnValue("olden");
    lastSuggestion(setSuggestions).resolve("applied");
    expect(JSON.parse(await promise)).toMatchObject({
      code: "STALE_EDIT",
      retryable: true,
    });
    expect(mockModel.pushEditOperations).not.toHaveBeenCalled();
    expect(tracker.clear).toHaveBeenCalled();
  });

  it("resolves with a REJECTED error on reject", async () => {
    const promise = edit("old");
    lastSuggestion(setSuggestions).resolve("rejected");
    expect(JSON.parse(await promise)).toMatchObject({
      error: "User rejected the edit.",
      code: "REJECTED",
    });
    expect(mockModel.pushEditOperations).not.toHaveBeenCalled();
    expect(tracker.clear).toHaveBeenCalled();
  });

  it("applies edit immediately if approveAll is true", async () => {
    const result = await edit("old", { approveAllRef: { current: true } });
    expect(result).toBe("Change applied automatically (Approve All is ON).");
    expect(mockModel.pushEditOperations).toHaveBeenCalled();
    expect(setSuggestions).not.toHaveBeenCalled();
  });
});

describe("RewriteDocumentTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockEditor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let setSuggestions: any;

  beforeEach(() => {
    mockEditor = {
      getValue: vi.fn().mockReturnValue("Initial content"),
      setValue: vi.fn(),
      getModel: vi.fn().mockReturnValue(null),
    };
    setSuggestions = vi.fn();
  });

  it("returns a retryable NOT_READY error if editor not initialized", async () => {
    const result = await new RewriteDocumentTool(makeCtx()).call(
      { content: "x" },
      {},
    );
    expect(JSON.parse(result)).toMatchObject({ code: "NOT_READY" });
  });

  it("creates a suggestion for the full document if not approveAll", async () => {
    const ctx = makeCtx({ setSuggestions }, mockEditor);
    const promise = new RewriteDocumentTool(ctx).call(
      { content: "New document content" },
      {},
    );

    const suggestion = lastSuggestion(setSuggestions);
    expect(suggestion.originalText).toBe("Initial content");
    expect(suggestion.replacementText).toBe("New document content");
    expect(suggestion.status).toBe("pending");

    suggestion.resolve("rejected");
    expect(JSON.parse(await promise).code).toBe("REJECTED");
  });

  it("resolves with accepted message when user applies", async () => {
    const ctx = makeCtx({ setSuggestions }, mockEditor);
    const promise = new RewriteDocumentTool(ctx).call(
      { content: "New document content" },
      {},
    );

    lastSuggestion(setSuggestions).resolve("applied");
    expect(await promise).toBe(
      "User accepted the edit. The document has been updated.",
    );
    expect(mockEditor.setValue).toHaveBeenCalledWith("New document content");
  });

  it("refuses with STALE_EDIT when the user typed while it was pending", async () => {
    const ctx = makeCtx({ setSuggestions }, mockEditor);
    const promise = new RewriteDocumentTool(ctx).call(
      { content: "New document content" },
      {},
    );

    mockEditor.getValue.mockReturnValue("Initial content, plus typing");
    lastSuggestion(setSuggestions).resolve("applied");
    expect(JSON.parse(await promise).code).toBe("STALE_EDIT");
    expect(mockEditor.setValue).not.toHaveBeenCalled();
  });

  it("applies full replacement immediately if approveAll is true", async () => {
    const ctx = makeCtx(
      { setSuggestions, approveAllRef: { current: true } },
      mockEditor,
    );
    const result = await new RewriteDocumentTool(ctx).call(
      { content: "New document content" },
      {},
    );
    expect(result).toBe("Document updated automatically (Approve All is ON).");
    expect(mockEditor.setValue).toHaveBeenCalledWith("New document content");
    expect(setSuggestions).not.toHaveBeenCalled();
  });
});
