// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { v4 as uuidv4 } from "uuid";
import type { ApprovalRequest } from "../../../store";

export interface ApprovalOptions {
  /** Prompt even when "Approve All" is on. Used for irreversible actions. */
  alwaysAsk?: boolean;
}

export function requestApproval(
  toolName: string,
  description: string,
  setPendingApprovals: (
    fn: (prev: ApprovalRequest[]) => ApprovalRequest[],
  ) => void,
  approveAllRef: { current: boolean },
  { alwaysAsk = false }: ApprovalOptions = {},
): Promise<boolean> {
  if (approveAllRef.current && !alwaysAsk) return Promise.resolve(true);
  return new Promise((resolve) => {
    const id = uuidv4();
    const request: ApprovalRequest = {
      id,
      toolName,
      description,
      resolve: (accepted: boolean) => {
        setPendingApprovals((prev) => prev.filter((r) => r.id !== id));
        resolve(accepted);
      },
    };
    setPendingApprovals((prev) => [...prev, request]);
  });
}
