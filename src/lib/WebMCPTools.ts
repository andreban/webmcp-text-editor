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
              if (callId) log?.finishCall(callId, { ok: true, result });
              return result;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              if (callId)
                log?.finishCall(callId, { ok: false, error: message });
              throw err;
            }
          },
        },
        { signal: ac.signal },
      );
      controllers.set(def.name, ac);
      return true;
    } catch (err) {
      console.warn("WebMCP tool registration failed:", err);
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
