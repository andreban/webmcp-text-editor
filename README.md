# WebMCP Text Editor

A browser-based Monaco editor that exposes itself to external AI agents through [WebMCP](https://github.com/webmachinelearning/webmcp). The page has no internal chat — agents drive it from outside via `document.modelContext`, and approvals, diffs, and tool activity are rendered in the main UI.

## What's here

- A Monaco editor with workspace/document management.
- A WebMCP bridge that registers ~20 tools on `document.modelContext` (editor read/edit/write, workspace document CRUD, search, skill discovery, sub-agent delegation).
- Inline diff widgets rendered as Monaco view zones for `edit`/`write` proposals — Accept/Reject inline at the change site.
- A modal approval prompt for document-mutating tools (`create_document`, `rename_document`, `delete_document`) and `invoke_planner`'s plan confirmation.
- A bottom **Tool Activity** pane that logs every WebMCP tool call (args, result, duration) and the streaming events from sub-agents (`invoke_planner`, `invoke_researcher`, `invoke_writer`, `invoke_reviewer`, `invoke_agent`, `delegate_to_skill`).

## Prerequisites

- Node.js 18+
- A browser that exposes `document.modelContext` (the WebMCP capability). A Gemini API key is only needed if you intend to use the sub-agent delegation tools.

## Getting started

```bash
npm install
npm run dev
```

Open the page; the editor and tool activity pane are immediately visible. Connect a WebMCP-enabled agent to drive the editor. To enable sub-agent tools, add a Gemini API key via the Settings dialog.

## Available commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check + build for production
npm run lint      # Run ESLint
npm run format    # Format with Prettier
npm run test      # Run Vitest tests
npm run preview   # Preview production build
```

## Architecture

**Data flow:**

1. `MCPProvider` (`src/context/MCPProvider.tsx`) builds editor / workspace / skills contexts, instantiates a `ToolRegistry`, registers all tools, and mirrors them into `document.modelContext`.
2. An external WebMCP agent calls a tool. The bridge in `src/lib/WebMCPTools.ts` wraps each call, records it in the `ToolActivityLog`, and forwards sub-agent events (`text_delta`, `thinking`, `tool_call_started`, etc.) into the same log as chatter.
3. Mutating tools self-gate: `edit`/`write` queue a `Suggestion` and wait for inline Accept/Reject; `create_document`/`rename_document`/`delete_document` queue an `ApprovalRequest` resolved by the modal; `invoke_planner` queues a `PlanConfirmationRequest`.
4. The `ToolLogPane` subscribes to `ToolActivityLog` and renders calls with expandable args/result/chatter.

**Key modules:**

| Module                                               | Purpose                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/context/MCPProvider.tsx`                        | Top-level wiring — builds the registry, runs the WebMCP bridge, exposes `registry`/`activityLog`/`factory` to children. |
| `src/lib/WebMCPTools.ts`                             | Bridges `ToolRegistry` → `document.modelContext`, logs every call, and forwards sub-agent events.                       |
| `src/lib/toolActivityLog.ts`                         | In-memory subscriber-based log of tool calls + sub-agent chatter, capped at 500 entries.                                |
| `src/lib/agents/tools/registries.ts`                 | Constructs the `ToolRegistry` with editor / workspace / skills tools.                                                   |
| `src/lib/agents/tools/skills/`                       | `list_skills` and `read_skill` — read-only skill discovery exposed via WebMCP.                                          |
| `src/lib/agents/tools/workspace/request_approval.ts` | Helper that queues an `ApprovalRequest` and awaits resolution (used by mutating workspace tools).                       |
| `src/components/InlineSuggestions.tsx`               | Inline Monaco view zones for pending `edit`/`write` suggestions with Accept/Reject buttons.                             |
| `src/components/ApprovalModal.tsx`                   | Modal for workspace mutation approvals and plan confirmations.                                                          |
| `src/components/ToolLogPane.tsx`                     | Bottom pane that renders the live `ToolActivityLog`.                                                                    |
| `src/components/EditorPanel.tsx`                     | Monaco editor + preview tabs + tab-switch confirmation dialog.                                                          |
| `src/components/WorkspacePanel.tsx`                  | Document browser for the active workspace.                                                                              |

## License

Apache 2.0 — see [LICENSE](LICENSE).
