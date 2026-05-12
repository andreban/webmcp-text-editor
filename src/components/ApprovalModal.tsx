// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEditorUI } from "@/lib/store";

export function ApprovalModal() {
  const {
    pendingApprovals,
    pendingPlanConfirmation,
    setPendingPlanConfirmation,
  } = useEditorUI();

  const nextApproval = pendingApprovals[0] ?? null;

  if (nextApproval) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) nextApproval.resolve(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authorize Tool Call</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-xs font-mono text-muted-foreground mb-2">
              {nextApproval.toolName}
            </p>
            <p className="text-sm">{nextApproval.description}</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => nextApproval.resolve(false)}
            >
              Reject
            </Button>
            <Button onClick={() => nextApproval.resolve(true)}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (pendingPlanConfirmation) {
    const { plan, resolve } = pendingPlanConfirmation;
    const close = (accepted: boolean) => {
      resolve(accepted);
      setPendingPlanConfirmation(null);
    };
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Plan</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm mb-3">{plan.goal}</p>
            <ol className="list-decimal list-inside space-y-1 max-h-72 overflow-y-auto">
              {plan.steps.map((step) => (
                <li key={step.id} className="text-sm text-muted-foreground">
                  {step.instruction}
                </li>
              ))}
            </ol>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button onClick={() => close(true)}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
