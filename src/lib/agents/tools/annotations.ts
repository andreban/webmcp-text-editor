// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type { ToolDefinition } from "@mast-ai/core";

export interface ToolAnnotations {
  readOnlyHint: boolean;
  consequentialHint?: boolean;
  untrustedContentHint?: boolean;
}

/** Irreversible actions the host should confirm before running. */
const CONSEQUENTIAL_TOOLS = new Set(["delete_document"]);

/**
 * Tools whose output never contains user- or model-authored text. Every other
 * tool is marked untrusted, so tools added later default to the safe side.
 */
const TRUSTED_OUTPUT_TOOLS = new Set([
  "request_switch_to_editor",
  "edit_document",
  "rewrite_document",
  "create_document",
  "rename_document",
]);

export function toolAnnotations(def: ToolDefinition): ToolAnnotations {
  return {
    readOnlyHint: def.scope === "read",
    ...(CONSEQUENTIAL_TOOLS.has(def.name) ? { consequentialHint: true } : {}),
    ...(TRUSTED_OUTPUT_TOOLS.has(def.name)
      ? {}
      : { untrustedContentHint: true }),
  };
}
