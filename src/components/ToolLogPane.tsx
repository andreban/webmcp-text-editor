// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useRef } from "react";
import { ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { useMCP } from "@/context/MCPProvider";
import type { ActivityEntry, ToolCallEntry } from "@/lib/toolActivityLog";

function formatDuration(start: number, end?: number): string {
  if (!end) return "…";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function CallRow({
  call,
  chatter,
}: {
  call: ToolCallEntry;
  chatter: ActivityEntry[];
}) {
  const [expanded, setExpanded] = useState(false);
  const argsStr = (() => {
    try {
      return JSON.stringify(call.args);
    } catch {
      return String(call.args);
    }
  })();
  const statusColor =
    call.status === "ok"
      ? "text-green-600 dark:text-green-400"
      : call.status === "error"
        ? "text-red-600 dark:text-red-400"
        : "text-amber-600 dark:text-amber-400";
  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-1 px-2 py-1 text-left hover:bg-muted/40"
      >
        {expanded ? (
          <ChevronDown className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <span className={`font-semibold shrink-0 ${statusColor}`}>
          {call.name}
        </span>
        <span className="text-muted-foreground truncate flex-1">
          {truncate(argsStr, 120)}
        </span>
        <span className="text-muted-foreground/70 shrink-0 tabular-nums">
          {formatDuration(call.startedAt, call.endedAt)}
        </span>
      </button>
      {expanded && (
        <div className="px-6 py-1 space-y-1 bg-muted/20">
          <div>
            <span className="text-muted-foreground">args: </span>
            <span className="break-all">{argsStr}</span>
          </div>
          {call.result !== undefined && (
            <div>
              <span className="text-muted-foreground">result: </span>
              <span className="break-all">{truncate(call.result, 800)}</span>
            </div>
          )}
          {call.error && (
            <div className="text-red-600 dark:text-red-400">
              <span>error: </span>
              <span className="break-all">{call.error}</span>
            </div>
          )}
          {chatter.length > 0 && (
            <div>
              <div className="text-muted-foreground mt-1">chatter:</div>
              <ul className="space-y-0.5 ml-2">
                {chatter.map((c) => {
                  if (c.kind !== "chatter") return null;
                  return (
                    <li key={c.id} className="break-all">
                      <span className="text-muted-foreground/70">
                        [{c.eventType}]
                      </span>{" "}
                      {c.text}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolLogPane() {
  const { activityLog } = useMCP();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => activityLog.subscribe(setEntries), [activityLog]);

  useEffect(() => {
    if (!autoScrollRef.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries]);

  const calls = entries.filter(
    (e): e is ActivityEntry & ToolCallEntry & { kind: "tool-call" } =>
      e.kind === "tool-call",
  );
  const chatterByParent = new Map<string, ActivityEntry[]>();
  for (const e of entries) {
    if (e.kind === "chatter") {
      const arr = chatterByParent.get(e.parentId) ?? [];
      arr.push(e);
      chatterByParent.set(e.parentId, arr);
    }
  }

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    autoScrollRef.current = atBottom;
  };

  if (calls.length === 0) {
    return (
      <div className="h-full overflow-auto px-3 py-2 text-xs text-muted-foreground italic">
        Waiting for tool calls from a WebMCP client…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end px-2 py-0.5 border-b border-border/50">
        <button
          type="button"
          onClick={() => activityLog.clear()}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted/60"
          aria-label="Clear log"
        >
          <Trash2 className="size-3" />
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto text-xs font-mono"
      >
        {calls.map((c) => (
          <CallRow
            key={c.id}
            call={c}
            chatter={chatterByParent.get(c.id) ?? []}
          />
        ))}
      </div>
    </div>
  );
}
