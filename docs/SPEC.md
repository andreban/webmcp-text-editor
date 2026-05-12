# Technical Specification: WebMCP Text Editor

## Architecture

A single-page React application bundled with Vite. There is no in-page agent loop — the page exposes its capabilities as WebMCP tools and is driven by an external agent.

Three layers:

1. **Editor + workspace state.** Monaco editor and a `localStorage`-backed workspace store (documents, active workspace, skills). React contexts in `src/lib/store.tsx` and `src/lib/WorkspacesContext.tsx` are the source of truth.
2. **Tool registry.** `ToolRegistry` from `@mast-ai/core` holds every tool — editor tools, workspace tools, skills tools, optional sub-agent delegation tools, and built-in AI tools.
3. **WebMCP bridge.** `src/lib/WebMCPTools.ts` mirrors the registry into `navigator.modelContext`. Each `registerTool` call wraps the underlying `tool.call()` to record activity into a `ToolActivityLog` and forward sub-agent stream events as chatter.

Sub-agent delegation (`invoke_*`, `delegate_to_skill`) uses an internal Gemini-backed `AgentRunner` factory. These tools are only exposed via WebMCP — nothing in the page UI triggers them directly.

## Data flow

1. `MCPProvider` (`src/context/MCPProvider.tsx`) builds `EditorContext`, `WorkspaceContext`, and `SkillsContext` from React state and refs, instantiates a `ToolRegistry` (`createToolRegistry`), and runs `registerWebMCPTools` to mirror it into `navigator.modelContext`.
2. The external agent invokes a tool via WebMCP. The bridge:
   - Records a "tool-call" entry in `ToolActivityLog` with name, args, and `status: "pending"`.
   - Builds a `ToolContext` whose `onEvent` callback records sub-agent stream events as chatter (`text_delta`, `thinking`, `tool_call_*`).
   - Calls `tool.call(args, ctx)`.
   - On resolution, updates the entry with `status: "ok"` and the stringified result. On error, updates with `status: "error"` and the error message.
3. Mutating tools self-gate inside their `call()`:
   - `edit`, `write` → `applySuggestion` queues a `Suggestion` into the editor UI store and returns a Promise that resolves when the user clicks Accept/Reject in the inline Monaco view zone.
   - `create_document`, `rename_document`, `delete_document` → `requestApproval` queues an `ApprovalRequest` and returns a Promise the modal resolves.
   - `invoke_planner` → queues a `PlanConfirmationRequest` resolved by the same modal.
   - All of the above short-circuit to "approved" when `approveAll` is on.
4. The Tool Activity pane subscribes to `ToolActivityLog` and renders entries with expandable args / result / chatter rows.

## Technical stack

- **Frontend:** React 19, TypeScript, Vite.
- **Styling:** Tailwind CSS + `shadcn/ui` primitives on Radix UI.
- **Editor:** `@monaco-editor/react`.
- **Diff:** `diff` (word-level) for the inline diff view.
- **Agent runtime (sub-agents only):** `@mast-ai/core`, `@mast-ai/built-in-ai`, `@mast-ai/google-genai`, `@google/genai`.
- **Testing:** Vitest, React Testing Library.
- **Quality:** ESLint, Prettier.

There is no dependency on `@mast-ai/react-ui` — the UI is fully custom.

## License headers

All source files start with:

```typescript
// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
```

(HTML uses an `<!-- … -->` block with the same wording.)

## Directory structure

```text
src/
├── components/
│   ├── ApprovalModal.tsx          # Modal for workspace-mutation approvals + plan confirmation
│   ├── EditorPanel.tsx            # Monaco editor + preview tabs + tab-switch dialog
│   ├── InlineSuggestions.tsx      # Manages Monaco view zones for edit/write suggestions
│   ├── MarkdownContent.tsx        # Markdown renderer for the preview tab
│   ├── SettingsDialog.tsx         # API key / model / theme
│   ├── SkillsDialog.tsx           # Skill authoring UI
│   ├── SuggestionCard.tsx         # Diff card + Accept/Reject buttons
│   ├── ToolLogPane.tsx            # Bottom Tool Activity pane
│   ├── WorkspacePanel.tsx         # Document navigator (left drawer)
│   ├── WorkspacePicker.tsx        # Full-screen workspace switcher
│   └── ui/                        # shadcn primitives
├── context/
│   └── MCPProvider.tsx            # Top-level wiring; exposes useMCP()
├── lib/
│   ├── agents/
│   │   ├── AgentModel.ts
│   │   ├── index.ts
│   │   ├── roles/                 # planner/researcher/writer/reviewer/orchestrator/generic + factory
│   │   ├── tools/
│   │   │   ├── editor/            # read, read_selection, search, get_metadata,
│   │   │   │                      # get_current_mode, request_switch_to_editor, edit, write
│   │   │   ├── workspace/         # CRUD + read/query + request_approval helper
│   │   │   ├── skills/            # list_skills, read_skill
│   │   │   ├── delegation/        # invoke_*, delegate_to_skill
│   │   │   └── registries.ts      # createToolRegistry
│   │   └── types.ts
│   ├── skills.ts                  # Default skill set + localStorage persistence
│   ├── store.tsx                  # AgentConfig + EditorUI contexts
│   ├── SupportingDocsContext.tsx
│   ├── ThemeProvider.tsx
│   ├── toolActivityLog.ts         # Subscriber-based tool-call + chatter log
│   ├── WebMCPTools.ts             # ToolRegistry → navigator.modelContext bridge
│   ├── workspace.ts               # Workspace data types
│   └── WorkspacesContext.tsx      # Workspace CRUD + active document state
├── App.tsx                        # Layout (header, left drawer, editor, bottom pane)
├── main.tsx                       # React root + providers
└── index.css
```

## Data model

### Workspace

```ts
interface WorkspaceMeta {
  id: string; // crypto.randomUUID()
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkspaceDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

interface WorkspaceData {
  documents: WorkspaceDocument[];
  activeDocumentId: string | null;
}
```

`localStorage` layout:

| Key                   | Value                              |
| --------------------- | ---------------------------------- |
| `workspaces_index`    | `JSON.stringify(WorkspaceMeta[])`  |
| `workspace_{id}`      | `JSON.stringify(WorkspaceData)`    |
| `active_workspace_id` | ID of the currently open workspace |
| `gemini_api_key`      | Optional Gemini key (sub-agents)   |
| `gemini_model_name`   | Selected model id                  |
| `skills`              | `JSON.stringify(Skill[])`          |
| `theme`               | `"light"` or `"dark"`              |
| `logPanelHeight`      | Pixel height of the bottom pane    |

### Approval queues

```ts
interface Suggestion {
  id: string;
  originalText: string;
  replacementText: string;
  status: "pending" | "accepted" | "rejected";
  contextBefore: string;
  contextAfter: string;
  startLine: number;
  revealInEditor?: () => void;
  resolve: (value: "applied" | "rejected") => void;
}

interface ApprovalRequest {
  id: string;
  toolName: string;
  description: string;
  resolve: (accepted: boolean) => void;
}

interface PlanConfirmationRequest {
  plan: Plan;
  resolve: (accepted: boolean) => void;
}
```

Each is held in `EditorUIContext` (`src/lib/store.tsx`) as an array (`suggestions`, `pendingApprovals`) or single slot (`pendingPlanConfirmation`).

## Component breakdown

### `MCPProvider.tsx`

Top-level wiring component. Reads editor / workspace / skills state, builds the per-call refs (`editorRef`, `editorContentRef`, `activeTabRef`, `approveAllRef`, `docsRef`, `activeDocRef`, `skillsRef`), constructs the `EditorContext` / `WorkspaceContext` / `SkillsContext`, instantiates the `ToolRegistry`, asynchronously registers built-in AI tools and (when the Gemini API key is present) delegation tools, and runs `registerWebMCPTools`. Exposes `useMCP() → { registry, activityLog, factory }`.

### `WebMCPTools.ts`

`registerWebMCPTools(registry, log?)`:

- Subscribes to the registry's `tool-registered` / `tool-unregistered` events so asynchronously-registered tools (built-ins, delegation tools) join WebMCP automatically.
- For each tool, calls `navigator.modelContext.registerTool({ name, description, inputSchema, execute }, { signal })`. The `AbortSignal` is how WebMCP unregisters; cleanup aborts every controller.
- Wraps `execute`:
  - `log.startCall(name, args)` → returns `callId`.
  - Builds a `ToolContext` whose `onEvent` callback logs every non-`done` event as chatter linked to `callId`. This is what surfaces sub-agent activity (`text_delta`, `thinking`, `tool_call_*`) in the Tool Activity pane.
  - Awaits `tool.call(args, ctx)`. On success → `log.finishCall(callId, { ok: true, result })`. On throw → `log.finishCall(callId, { ok: false, error })` then rethrow.
- If `registerTool` throws (older WebMCP shape lacking `unregisterTool`), logs a warning and tears down without retrying.

### `toolActivityLog.ts`

`ToolActivityLog` is a small observable. Two entry shapes share a discriminator:

```ts
type ActivityEntry =
  | ({ kind: "tool-call" } & ToolCallEntry)
  | ({ kind: "chatter" } & SubAgentChatterEntry);
```

Caps at 500 entries (oldest dropped). `subscribe(listener)` replays the current snapshot on registration and on every change. `clear()` empties the log. The `ToolLogPane` is the only subscriber today.

### Editor tools (`src/lib/agents/tools/editor/`)

- `read`, `read_selection`, `search`, `get_metadata`, `get_current_mode` — pure reads.
- `request_switch_to_editor` — sets `pendingTabSwitchRequest`; `EditorPanel` shows a modal.
- `edit` — `requiresApproval: true`. Computes the change region, builds context-before / context-after lines, and calls `applySuggestion`. The Promise resolves once the user clicks Accept (which applies the Monaco edit and returns success) or Reject. Hard size guard rejects edits where `originalText` is longer than 3000 chars or > 80% of the document.
- `write` — `requiresApproval: true`. Same `applySuggestion` flow for a whole-document replacement.

`applySuggestion` (`src/lib/agents/tools/editor/apply_suggestion.ts`) is the shared helper. When `approveAllRef.current` is true it bypasses UI and applies immediately.

### Workspace tools (`src/lib/agents/tools/workspace/`)

- Read-only: `get_active_doc_info`, `list_workspace_docs`, `read_workspace_doc`, `query_workspace_doc`, `query_workspace` (latter two spin up short-lived `AgentRunner` instances via `factory`).
- `switch_active_document` — eagerly syncs Monaco to the new document content before resolving (see "React state sync" below).
- `create_document`, `rename_document`, `delete_document` — each calls `requestApproval(toolName, description, setPendingApprovals, approveAllRef)` before mutating. On reject they return `{ "error": "Rejected by user" }`.

`requestApproval` (`src/lib/agents/tools/workspace/request_approval.ts`) is the helper. When `approveAllRef.current` is true it resolves true immediately; otherwise it pushes an `ApprovalRequest` and waits for the modal to resolve it.

### Skills tools (`src/lib/agents/tools/skills/`)

- `list_skills` — returns `[{ id, name, description }, …]` from `skillsRef.current`. No instructions.
- `read_skill` — accepts `{ id }` or `{ name }` (case-insensitive); returns the full skill or `{ "error": "Skill not found" }`.

These are how the external agent discovers skills before calling `delegate_to_skill`.

### Delegation tools (`src/lib/agents/tools/delegation/`)

`invoke_agent`, `invoke_planner`, `invoke_researcher`, `invoke_writer`, `invoke_reviewer`, `delegate_to_skill`. Each constructs an `AgentConfig` and uses the injected `AgentRunnerFactory` to run a sub-agent stream. Stream events are forwarded through `ctx.onEvent` so the WebMCP bridge can record them as chatter. Registered only when a Gemini API key is configured.

### `InlineSuggestions.tsx`

Manages Monaco view zones for pending `Suggestion` entries:

- For each pending suggestion, creates a DOM node, sets `pointerEvents: auto`, `position: relative`, `zIndex: 10` so clicks aren't swallowed by Monaco's overlay layer, and adds a Monaco view zone with `heightInPx: 80` (initial).
- A `ResizeObserver` watches each node and, when content size changes, updates the descriptor's `heightInPx` and calls `accessor.layoutZone(zoneId)` so Monaco re-lays the zone. This is what keeps Accept / Reject buttons reachable even on tall diffs at the bottom of the document.
- Renders `SuggestionCard` into each view-zone node via `createPortal` so React owns the contents.
- On unmount or removed suggestion, removes the view zone and disconnects the observer.

### `SuggestionCard.tsx`

The portal payload. Shows the word-level diff inside a `max-h-56 overflow-y-auto` scroll container so very tall diffs stay bounded, with the Accept / Reject buttons in a separate `shrink-0` footer that's always visible. Stops `mousedown` / `mouseup` / `click` propagation at the card level so Monaco doesn't steal focus or start a text selection when the user clicks the buttons.

`SuggestionDiff` (same file) renders the word-level diff with `diffWords` from the `diff` package. Removed words get red strikethrough; added words get green; gutters show line numbers; the header has an optional **Reveal** button that calls `suggestion.revealInEditor()`.

### `ApprovalModal.tsx`

Single dialog component that renders the next pending workspace mutation approval (if any) or, failing that, the pending plan confirmation. Closing the dialog without choosing is treated as a reject. Workspace approvals show the tool name (mono-font) and a human-friendly description (`"Create document \"…\""`, `"Rename document \"X\" to \"Y\""`, `"Delete document \"…\""`). Plan confirmations show the plan's `goal` plus an ordered list of steps.

### `ToolLogPane.tsx`

Subscribes to `ToolActivityLog` via `useMCP().activityLog.subscribe(setEntries)`. Splits entries into tool calls + a `parentId → chatter[]` map. Renders each call as a collapsible row with name, args (truncated), status colour, and duration. Expanding a row reveals the full args, result/error, and chatter list. Auto-scrolls to the bottom unless the user has scrolled up. **Clear** button calls `activityLog.clear()`.

### `EditorPanel.tsx`

Wraps the Monaco editor in a Radix Tabs (`editor` / `preview`). Loads `activeDocument.content` into local state, debounces 500 ms writes back to `updateDocument`. Hosts `<InlineSuggestions editor={editorInstance} />` so view zones render inline. Shows a modal for `pendingTabSwitchRequest` (from `request_switch_to_editor`).

### `App.tsx`

Layout shell. Wraps everything in `MCPProvider`. When no workspace is active, renders `WorkspacePicker`. Otherwise:

- **Desktop:** left drawer (`WorkspacePanel`, collapsible), main area with `HeaderBar` (workspace name, Approve All, theme, skills, settings, switch-workspace) → `EditorPanel` → bottom Tool Activity pane (resizable, collapsible).
- **Mobile:** header bar, editor, fixed 160 px Tool Activity pane at the bottom.

In both modes `ApprovalModal`, `SettingsDialog`, and `SkillsDialog` mount at the top level.

### `SettingsDialog.tsx`

Gemini API key (password-masked, optional — only needed for delegation tools), model selector, theme toggle.

### `SkillsDialog.tsx`

CRUD UI for skills persisted in `localStorage`. Default skills (`Create Skill`, `Proofreader`, `Summarizer`, `Markdown Formatter`) are seeded on first run.

## React state synchronization for agent tools

### The problem

WebMCP tool calls resolve as async JavaScript outside React's render cycle. When a tool calls a React state setter (e.g. `setActiveDocumentId`), React schedules a re-render — it does **not** update state synchronously. The tool's Promise can resolve before React has committed the new state to the DOM. For document-switching, that means Monaco still holds the previous document's content when the agent immediately calls `read` or `edit`.

### The fix: eager Monaco sync

Any tool that changes the active document — `switch_active_document`, `create_document` — calls `editorInstance.setValue(newContent)` directly on the Monaco instance after mutating React state. This works because `@monaco-editor/react` guards its controlled `value` prop: when the React render eventually catches up, the prop equals the model value and is a no-op. The debounced `onChange` handler also targets the _current_ `activeDocument` after the render, so debounced saves go to the right document.

The `setEditorValueFn` field on `WorkspaceContext` is the typed entry point for this. Do not work around the race with `setTimeout` or `flushSync`.

## Security

- API keys live only in `localStorage`. There is no backend; no key leaves the browser except in calls to the Gemini API.
- Markdown rendering uses `react-markdown` with `rehype-sanitize` to prevent XSS from untrusted document content.
- All WebMCP tools that mutate state require explicit user approval unless **Approve All** is on; the user always has visibility via the Tool Activity pane.

## Implementation details

- **Vite:** uses `@monaco-editor/react`'s default worker bundling; no special config needed.
- **Testing:** Vitest + Testing Library. Tool-level tests live next to each tool (e.g. `src/lib/agents/tools/skills/skills.test.ts`). UI components have RTL tests where they own behaviour. `toolActivityLog.test.ts` covers the observable.
- **Linting:** ESLint with `react-hooks/refs` strict mode. The intentional `ref.current` reads in `InlineSuggestions.tsx` use a localised `eslint-disable-next-line` with a comment explaining why.
- **Styling:** Tailwind class-based dark mode (`darkMode: "class"`). `ThemeProvider` toggles a `dark` class on `<html>` and persists the choice. Monaco theme switches between `vs` and `vs-dark`.
- **Responsive:** below the `md` breakpoint (768 px) the editor takes the screen and the Tool Activity pane sits below it at a fixed 160 px. Dialogs fill the viewport.

## License

Apache-2.0
