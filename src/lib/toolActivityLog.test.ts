// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from "vitest";
import { ToolActivityLog } from "./toolActivityLog";

describe("ToolActivityLog", () => {
  it("records a tool call as pending then ok", () => {
    const log = new ToolActivityLog();
    const id = log.startCall("read", { foo: 1 });
    let entries = log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "tool-call",
      name: "read",
      status: "pending",
    });

    log.finishCall(id, { ok: true, result: "hello" });
    entries = log.getEntries();
    expect(entries[0]).toMatchObject({
      kind: "tool-call",
      status: "ok",
      result: "hello",
    });
  });

  it("records errors with status 'error' and the error message", () => {
    const log = new ToolActivityLog();
    const id = log.startCall("write", {});
    log.finishCall(id, { ok: false, error: "boom" });
    const entry = log.getEntries()[0];
    expect(entry.kind === "tool-call" && entry.status).toBe("error");
    expect(entry.kind === "tool-call" && entry.error).toBe("boom");
  });

  it("records chatter linked to a parent call", () => {
    const log = new ToolActivityLog();
    const id = log.startCall("invoke_planner", {});
    log.chatter(id, "text_delta", "hello");
    log.chatter(id, "thinking", "hmm");
    const chatter = log.getEntries().filter((e) => e.kind === "chatter");
    expect(chatter).toHaveLength(2);
    expect(chatter[0]).toMatchObject({
      parentId: id,
      eventType: "text_delta",
      text: "hello",
    });
  });

  it("notifies subscribers on every change and replays current entries on subscribe", () => {
    const log = new ToolActivityLog();
    const listener = vi.fn();
    log.startCall("a", {});
    const unsubscribe = log.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1); // initial replay
    log.startCall("b", {});
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    log.startCall("c", {});
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clear() empties the log", () => {
    const log = new ToolActivityLog();
    log.startCall("a", {});
    log.clear();
    expect(log.getEntries()).toEqual([]);
  });
});
