// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import type { ToolDefinition } from "@mast-ai/core";
import { toolError, toolErrorMessage, truncateForError } from "./errors";
import { toolAnnotations } from "./annotations";
import { DEFAULT_PAGE_CHARS, MAX_PAGE_CHARS, paginateText } from "./paginate";

function def(name: string, scope: "read" | "write"): ToolDefinition {
  return { name, description: "", parameters: {}, scope };
}

describe("toolError", () => {
  it("serializes error, code, and retryable", () => {
    expect(JSON.parse(toolError("Nope.", "NOT_FOUND"))).toEqual({
      error: "Nope.",
      code: "NOT_FOUND",
      retryable: false,
    });
  });

  it("includes a suggestion and retryable flag when given", () => {
    expect(
      JSON.parse(
        toolError("Busy.", "NOT_READY", {
          retryable: true,
          suggestion: "Wait.",
        }),
      ),
    ).toEqual({
      error: "Busy.",
      code: "NOT_READY",
      retryable: true,
      suggestion: "Wait.",
    });
  });
});

describe("toolErrorMessage", () => {
  it("extracts the message from an error payload", () => {
    expect(toolErrorMessage(toolError("Nope.", "NOT_FOUND"))).toBe("Nope.");
  });

  it("returns null for plain text and non-error JSON", () => {
    expect(toolErrorMessage("Document updated.")).toBeNull();
    expect(toolErrorMessage('{"switched":true}')).toBeNull();
    expect(toolErrorMessage("{not json")).toBeNull();
    expect(toolErrorMessage(undefined)).toBeNull();
  });
});

describe("truncateForError", () => {
  it("keeps short text and shortens long text", () => {
    expect(truncateForError("short")).toBe("short");
    expect(truncateForError("x".repeat(100), 10)).toBe(`${"x".repeat(10)}…`);
  });
});

describe("toolAnnotations", () => {
  it("marks read-scope tools read-only and their output untrusted", () => {
    expect(toolAnnotations(def("read_document", "read"))).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
  });

  it("omits untrustedContentHint for tools that return only fixed text", () => {
    expect(toolAnnotations(def("edit_document", "write"))).toEqual({
      readOnlyHint: false,
    });
  });

  it("marks delete_document consequential", () => {
    expect(
      toolAnnotations(def("delete_document", "write")).consequentialHint,
    ).toBe(true);
  });

  it("treats unknown tools as returning untrusted content", () => {
    expect(toolAnnotations(def("summarize", "read")).untrustedContentHint).toBe(
      true,
    );
  });
});

describe("paginateText", () => {
  it("returns the whole text when it fits", () => {
    expect(paginateText("hello")).toEqual({
      content: "hello",
      offset: 0,
      total_chars: 5,
      next_offset: null,
    });
  });

  it("defaults to DEFAULT_PAGE_CHARS and reports the next offset", () => {
    const page = paginateText("a".repeat(DEFAULT_PAGE_CHARS + 1));
    expect(page.content).toHaveLength(DEFAULT_PAGE_CHARS);
    expect(page.next_offset).toBe(DEFAULT_PAGE_CHARS);
  });

  it("clamps offsets and limits to valid ranges", () => {
    expect(paginateText("abc", -5, 2).content).toBe("ab");
    expect(paginateText("abc", 99).content).toBe("");
    expect(paginateText("abc", 1, 0).content).toBe("bc");
    expect(
      paginateText("a".repeat(MAX_PAGE_CHARS + 1), 0, 1e9).content,
    ).toHaveLength(MAX_PAGE_CHARS);
  });
});
