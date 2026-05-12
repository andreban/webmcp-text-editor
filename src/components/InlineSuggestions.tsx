// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useReducer, useRef } from "react";
import { createPortal } from "react-dom";
import type * as monaco from "monaco-editor";
import { useEditorUI, type Suggestion } from "@/lib/store";
import { SuggestionCard } from "./SuggestionCard";

type ZoneEntry = {
  id: string;
  desc: monaco.editor.IViewZone;
  node: HTMLDivElement;
  observer: ResizeObserver;
};

export function InlineSuggestions({
  editor,
}: {
  editor: monaco.editor.IStandaloneCodeEditor | null;
}) {
  const { suggestions, setSuggestions } = useEditorUI();
  const entriesRef = useRef(new Map<string, ZoneEntry>());
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!editor) return;
    const pending = suggestions.filter((s) => s.status === "pending");
    const pendingIds = new Set(pending.map((s) => s.id));

    let changed = false;
    editor.changeViewZones((accessor) => {
      for (const [sid, entry] of entriesRef.current) {
        if (!pendingIds.has(sid)) {
          accessor.removeZone(entry.id);
          entry.observer.disconnect();
          entriesRef.current.delete(sid);
          changed = true;
        }
      }
      for (const s of pending) {
        if (entriesRef.current.has(s.id)) continue;
        const node = document.createElement("div");
        // Monaco's view-zone layer disables pointer events on children by
        // default; re-enable them and stack above the editor's mouse-target
        // overlay so buttons inside the portal receive clicks.
        node.style.pointerEvents = "auto";
        node.style.position = "relative";
        node.style.zIndex = "10";
        const desc: monaco.editor.IViewZone = {
          afterLineNumber: Math.max(0, s.startLine - 1),
          heightInPx: 80,
          domNode: node,
        };
        const zoneId = accessor.addZone(desc);
        const observer = new ResizeObserver(() => {
          const h = node.scrollHeight;
          if (h <= 0 || h === desc.heightInPx) return;
          desc.heightInPx = h;
          editor.changeViewZones((acc) => acc.layoutZone(zoneId));
        });
        observer.observe(node);
        entriesRef.current.set(s.id, { id: zoneId, desc, node, observer });
        changed = true;
      }
    });
    if (changed) force();
  }, [editor, suggestions]);

  useEffect(() => {
    return () => {
      if (!editor) return;
      const entries = entriesRef.current;
      editor.changeViewZones((accessor) => {
        for (const [, entry] of entries) {
          accessor.removeZone(entry.id);
          entry.observer.disconnect();
        }
        entries.clear();
      });
    };
  }, [editor]);

  const handleAccept = (s: Suggestion) => s.resolve("applied");

  const handleReject = (s: Suggestion) => {
    s.resolve("rejected");
    setSuggestions((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, status: "rejected" } : x)),
    );
  };

  // Reading entriesRef.current here is intentional: the effect above keeps
  // it in sync with Monaco's view zones and calls `force()` whenever the
  // map changes, so this render is gated on a state update.
  // eslint-disable-next-line react-hooks/refs
  const entries = Array.from(entriesRef.current.entries());

  return (
    <>
      {entries.map(([sid, entry]) => {
        const s = suggestions.find((x) => x.id === sid);
        if (!s) return null;
        return createPortal(
          <SuggestionCard
            suggestion={s}
            onAccept={() => handleAccept(s)}
            onReject={() => handleReject(s)}
          />,
          entry.node,
          sid,
        );
      })}
    </>
  );
}
