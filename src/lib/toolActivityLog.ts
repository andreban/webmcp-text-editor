// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

export type ToolCallStatus = "pending" | "ok" | "error";

export interface ToolCallEntry {
  id: string;
  name: string;
  args: unknown;
  startedAt: number;
  endedAt?: number;
  status: ToolCallStatus;
  result?: string;
  error?: string;
  parentId?: string;
}

export interface SubAgentChatterEntry {
  id: string;
  parentId: string;
  at: number;
  eventType: string;
  text: string;
}

export type ActivityEntry =
  | ({ kind: "tool-call" } & ToolCallEntry)
  | ({ kind: "chatter" } & SubAgentChatterEntry);

type Listener = (entries: ActivityEntry[]) => void;

export class ToolActivityLog {
  private entries: ActivityEntry[] = [];
  private listeners = new Set<Listener>();
  private maxEntries = 500;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.entries);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getEntries(): readonly ActivityEntry[] {
    return this.entries;
  }

  startCall(name: string, args: unknown, parentId?: string): string {
    const id = crypto.randomUUID();
    this.push({
      kind: "tool-call",
      id,
      name,
      args,
      startedAt: Date.now(),
      status: "pending",
      parentId,
    });
    return id;
  }

  finishCall(
    id: string,
    outcome: { ok: true; result: string } | { ok: false; error: string },
  ): void {
    this.update(id, (e) => {
      if (e.kind !== "tool-call") return e;
      return {
        ...e,
        endedAt: Date.now(),
        status: outcome.ok ? "ok" : "error",
        result: outcome.ok ? outcome.result : undefined,
        error: outcome.ok ? undefined : outcome.error,
      };
    });
  }

  chatter(parentId: string, eventType: string, text: string): void {
    this.push({
      kind: "chatter",
      id: crypto.randomUUID(),
      parentId,
      at: Date.now(),
      eventType,
      text,
    });
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  private push(entry: ActivityEntry): void {
    this.entries = [...this.entries, entry].slice(-this.maxEntries);
    this.emit();
  }

  private update(id: string, transform: (e: ActivityEntry) => ActivityEntry) {
    this.entries = this.entries.map((e) => (e.id === id ? transform(e) : e));
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.entries);
  }
}
