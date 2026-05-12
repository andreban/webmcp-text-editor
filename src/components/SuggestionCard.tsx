// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { diffWords } from "diff";
import { ArrowRightToLine } from "lucide-react";
import { Button } from "./ui/button";
import type { Suggestion } from "@/lib/store";

function lineCount(text: string): number {
  if (text === "") return 0;
  return text.split("\n").length;
}

function lineRangeLabel(startLine: number, count: number): string {
  if (count <= 1) return `Line ${startLine}`;
  return `Lines ${startLine}–${startLine + count - 1}`;
}

export function SuggestionDiff({ suggestion }: { suggestion: Suggestion }) {
  const {
    originalText,
    replacementText,
    contextBefore,
    contextAfter,
    startLine,
    revealInEditor,
  } = suggestion;
  const beforeCount = lineCount(originalText);
  const afterCount = lineCount(replacementText);
  const contextBeforeCount = lineCount(contextBefore);
  const contextBeforeStart = startLine - contextBeforeCount;
  const contextAfterStart = startLine + beforeCount;

  const changes = diffWords(originalText, replacementText);
  const beforeParts = changes.filter((c) => !c.added);
  const afterParts = changes.filter((c) => !c.removed);

  const gutterWidth = "w-10";

  return (
    <div className="overflow-hidden rounded border font-mono text-xs">
      <div className="bg-muted/50 flex items-center justify-between gap-2 border-b px-2 py-1">
        <span className="text-muted-foreground">
          {beforeCount === 0 && afterCount > 0
            ? lineRangeLabel(startLine, afterCount)
            : lineRangeLabel(startLine, beforeCount)}
        </span>
        {revealInEditor && (
          <button
            type="button"
            onClick={revealInEditor}
            className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 rounded px-1.5 py-0.5"
            title="Scroll editor to this location"
          >
            <ArrowRightToLine className="size-3" />
            <span>Reveal</span>
          </button>
        )}
      </div>
      {contextBefore && (
        <div className="bg-muted/30 text-muted-foreground/70 flex break-all whitespace-pre-wrap">
          <span
            className={`${gutterWidth} text-muted-foreground/60 shrink-0 border-r px-2 py-1.5 text-right select-none`}
          >
            {Array.from(
              { length: contextBeforeCount },
              (_, i) => contextBeforeStart + i,
            ).join("\n")}
          </span>
          <span className="px-2 py-1.5">{contextBefore}</span>
        </div>
      )}
      <div className="flex bg-red-50 break-all whitespace-pre-wrap dark:bg-red-950/30">
        <span
          className={`${gutterWidth} shrink-0 border-r border-red-200 px-2 py-1.5 text-right text-red-400 select-none dark:border-red-900`}
        >
          {Array.from({ length: beforeCount }, (_, i) => startLine + i).join(
            "\n",
          )}
        </span>
        <span className="flex gap-2 px-2 py-1.5 text-red-800 dark:text-red-300">
          <span className="shrink-0 text-red-400 select-none">-</span>
          <span>
            {beforeParts.map((part, i) =>
              part.removed ? (
                <mark
                  key={i}
                  className="rounded-[2px] bg-red-200 px-[1px] text-red-900 dark:bg-red-800/70 dark:text-red-100"
                >
                  {part.value}
                </mark>
              ) : (
                <span key={i}>{part.value}</span>
              ),
            )}
          </span>
        </span>
      </div>
      <div className="flex bg-green-50 break-all whitespace-pre-wrap dark:bg-green-950/30">
        <span
          className={`${gutterWidth} shrink-0 border-r border-green-200 px-2 py-1.5 text-right text-green-500 select-none dark:border-green-900`}
        >
          {Array.from({ length: afterCount }, (_, i) => startLine + i).join(
            "\n",
          )}
        </span>
        <span className="flex gap-2 px-2 py-1.5 text-green-800 dark:text-green-300">
          <span className="shrink-0 text-green-500 select-none">+</span>
          <span>
            {afterParts.map((part, i) =>
              part.added ? (
                <mark
                  key={i}
                  className="rounded-[2px] bg-green-200 px-[1px] text-green-900 dark:bg-green-800/70 dark:text-green-100"
                >
                  {part.value}
                </mark>
              ) : (
                <span key={i}>{part.value}</span>
              ),
            )}
          </span>
        </span>
      </div>
      {contextAfter && (
        <div className="bg-muted/30 text-muted-foreground/70 flex break-all whitespace-pre-wrap">
          <span
            className={`${gutterWidth} text-muted-foreground/60 shrink-0 border-r px-2 py-1.5 text-right select-none`}
          >
            {Array.from(
              { length: lineCount(contextAfter) },
              (_, i) => contextAfterStart + i,
            ).join("\n")}
          </span>
          <span className="px-2 py-1.5">{contextAfter}</span>
        </div>
      )}
    </div>
  );
}

export function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: Suggestion;
  onAccept: () => void;
  onReject: () => void;
}) {
  // Monaco's view zone sits inside the editor's mouse-target layer; stop
  // mousedown from bubbling so Monaco doesn't steal focus or start a selection
  // when the user clicks Accept/Reject.
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      className="border border-border bg-background/95 rounded-md shadow-sm m-2 flex flex-col"
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={stop}
    >
      <div className="max-h-56 overflow-y-auto p-2">
        <SuggestionDiff suggestion={suggestion} />
      </div>
      <div className="flex gap-2 p-2 pt-0 shrink-0">
        <Button size="sm" className="flex-1" onClick={onAccept}>
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={onReject}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
