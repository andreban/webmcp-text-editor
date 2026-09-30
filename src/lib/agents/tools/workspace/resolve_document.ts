// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { WorkspaceDocument } from "../../../workspace";
import type { WorkspaceContext } from "./context";
import { toolError } from "../errors";

export const DOCUMENT_REF_DESCRIPTION =
  "The document's id or exact title (case-insensitive).";

export type ResolveResult =
  | { doc: WorkspaceDocument; error?: undefined }
  | { doc?: undefined; error: string };

/** Finds a document by id, falling back to a case-insensitive title match. */
export function resolveDocument(
  docs: WorkspaceDocument[],
  ref: string | undefined,
): ResolveResult {
  const needle = ref?.trim();
  if (!needle) {
    return {
      error: toolError("A document id or title is required.", "INVALID_INPUT", {
        suggestion: "Call list_workspace_docs to see available documents.",
      }),
    };
  }
  const byId = docs.find((d) => d.id === needle);
  if (byId) return { doc: byId };

  const lower = needle.toLowerCase();
  const byTitle = docs.filter((d) => d.title.trim().toLowerCase() === lower);
  if (byTitle.length === 1) return { doc: byTitle[0] };
  if (byTitle.length > 1) {
    return {
      error: toolError(
        `${byTitle.length} documents are titled "${needle}".`,
        "AMBIGUOUS",
        {
          suggestion: `Retry with one of these ids: ${byTitle.map((d) => d.id).join(", ")}.`,
        },
      ),
    };
  }
  return {
    error: toolError(`No document matches "${needle}".`, "NOT_FOUND", {
      suggestion: "Call list_workspace_docs to see available documents.",
    }),
  };
}

/** Text currently open in the editor, falling back to the last known value. */
export function editorText(
  ctx: Pick<WorkspaceContext, "editorRef" | "editorContentRef">,
): string {
  return ctx.editorRef.current?.getValue() || ctx.editorContentRef.current;
}

/**
 * A document's latest text. The open document's stored copy can lag behind
 * the editor, so it is read from the editor instead.
 */
export function documentText(
  ctx: Pick<
    WorkspaceContext,
    "editorRef" | "editorContentRef" | "activeDocRef"
  >,
  doc: WorkspaceDocument,
): string {
  return doc.id === ctx.activeDocRef.current?.id
    ? editorText(ctx)
    : doc.content;
}
