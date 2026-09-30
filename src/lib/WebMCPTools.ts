// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import type {
  AgentEvent,
  Tool,
  ToolContext,
  ToolDefinition,
  ToolRegistry,
} from "@mast-ai/core";
import type { ToolActivityLog } from "./toolActivityLog";
import {
  toolAnnotations,
  type ToolAnnotations,
} from "./agents/tools/annotations";
import { toolError, toolErrorMessage } from "./agents/tools/errors";

function describeEvent(event: AgentEvent): string {
  switch (event.type) {
    case "tool_call_started": {
      const args = (() => {
        try {
          return JSON.stringify(event.args);
        } catch {
          return String(event.args);
        }
      })();
      return `${event.name}(${args})`;
    }
    case "tool_call_completed":
      return `${event.name} ${event.error ? "error" : "ok"}`;
    case "text_delta":
      return event.delta;
    case "thinking":
      return `(thinking) ${event.delta}`;
    default:
      return "";
  }
}

interface WebMCPClient {
  reportProgress?: (message: string) => void;
}

interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: ToolAnnotations;
  execute: (
    args: Record<string, unknown>,
    client?: WebMCPClient,
  ) => string | Promise<string>;
}

interface ModelContext {
  registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }): void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

type ListenableRegistry = Pick<ToolRegistry, "getTools" | "getTool"> &
  Pick<ToolRegistry, "addEventListener" | "removeEventListener">;

export function registerWebMCPTools(
  registry: ListenableRegistry,
  log?: ToolActivityLog,
): () => void {
  if (!document.modelContext) {
    console.warn("WebMCP not detected in this browser.");
    return () => {};
  }

  const mc = document.modelContext;
  const controllers = new Map<string, AbortController>();
  let teardown = false;
  let anyRegistered = false;

  const registerOne = (def: ToolDefinition): boolean => {
    if (teardown) return true;
    if (controllers.has(def.name)) return true;
    const tool = registry.getTool(def.name);
    if (!tool) return true;
    const ac = new AbortController();
    try {
      mc.registerTool(
        {
          name: def.name,
          description: def.description,
          inputSchema: def.parameters,
          annotations: toolAnnotations(def),
          execute: async (args, client) => {
            const callId = log?.startCall(def.name, args);
            const ctx: ToolContext = {
              onEvent: (event: AgentEvent) => {
                if (event.type === "done") return;
                const description = describeEvent(event);
                if (description && log && callId) {
                  log.chatter(callId, event.type, description);
                }
                if (client?.reportProgress) {
                  client.reportProgress(JSON.stringify(event));
                }
              },
            };
            try {
              const result = (await tool.call(args as never, ctx)) as string;
              const error = toolErrorMessage(result);
              if (callId) {
                log?.finishCall(
                  callId,
                  error === null ? { ok: true, result } : { ok: false, error },
                );
              }
              return result;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              if (callId)
                log?.finishCall(callId, { ok: false, error: message });
              // A rejection reaches the agent as a bare UnknownError, so the
              // failure is resolved as a structured payload instead.
              return toolError(message, "TOOL_FAILED");
            }
          },
        },
        { signal: ac.signal },
      );
      controllers.set(def.name, ac);
      anyRegistered = true;
      return true;
    } catch (err) {
      console.warn("WebMCP tool registration failed:", err);
      if (anyRegistered) {
        // One bad tool (e.g. a name clash) should not remove the others.
        return true;
      }
      // The very first registration failing means an incompatible API.
      cleanup();
      return false;
    }
  };

  const onRegistered = ({ tool }: { tool: Tool }) => {
    registerOne(tool.definition());
  };

  const onUnregistered = ({ name }: { name: string }) => {
    const ac = controllers.get(name);
    if (ac) {
      ac.abort();
      controllers.delete(name);
    }
  };

  const cleanup = () => {
    if (teardown) return;
    teardown = true;
    registry.removeEventListener("tool-registered", onRegistered);
    registry.removeEventListener("tool-unregistered", onUnregistered);
    for (const ac of controllers.values()) ac.abort();
    controllers.clear();
  };

  registry.addEventListener("tool-registered", onRegistered);
  registry.addEventListener("tool-unregistered", onUnregistered);

  for (const def of registry.getTools()) {
    if (!registerOne(def)) break;
  }

  return cleanup;
}
