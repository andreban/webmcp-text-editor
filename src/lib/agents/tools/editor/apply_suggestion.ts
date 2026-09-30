// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { v4 as uuidv4 } from "uuid";
import type { Suggestion } from "../../../store";
import { toolError } from "../errors";

export const STALE_EDIT_ERROR = toolError(
  "The document changed while the edit was pending, so it was not applied.",
  "STALE_EDIT",
  {
    retryable: true,
    suggestion:
      "Read the document again and propose the edit against the current text.",
  },
);

export const REJECTED_EDIT_ERROR = toolError(
  "User rejected the edit.",
  "REJECTED",
  { suggestion: "Ask the user what they would like changed." },
);

/**
 * Queues an inline suggestion and resolves once the user decides.
 * `applyEdit` returns false when the target text changed after the proposal;
 * `onSettled` runs exactly once after the suggestion is resolved either way.
 */
export function applySuggestion(
  data: Omit<Suggestion, "id" | "status" | "resolve">,
  applyEdit: () => boolean,
  autoMessage: string,
  setSuggestions: (fn: (prev: Suggestion[]) => Suggestion[]) => void,
  approveAllRef: { current: boolean },
  onSettled?: () => void,
): Promise<string> {
  if (approveAllRef.current) {
    const applied = applyEdit();
    onSettled?.();
    return Promise.resolve(applied ? autoMessage : STALE_EDIT_ERROR);
  }
  return new Promise((resolve) => {
    const suggestion: Suggestion = {
      id: uuidv4(),
      ...data,
      status: "pending",
      resolve: (result: string) => {
        const applied = result === "applied" && applyEdit();
        onSettled?.();
        setSuggestions((prev) =>
          prev.map((s) =>
            s.id === suggestion.id
              ? { ...s, status: applied ? "accepted" : "rejected" }
              : s,
          ),
        );
        if (applied) {
          resolve("User accepted the edit. The document has been updated.");
        } else if (result === "applied") {
          resolve(STALE_EDIT_ERROR);
        } else {
          resolve(REJECTED_EDIT_ERROR);
        }
      },
    };
    setSuggestions((prev) => [...prev, suggestion]);
  });
}
