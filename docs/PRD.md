# Product Requirements Document: WebMCP Text Editor

## Goal

Provide a browser-based Monaco text editor that is fully driveable by **external** AI agents through the WebMCP API (`document.modelContext`). The page itself has no chat input — the agent lives in a parent context (browser extension, claude.ai tab, etc.) and operates the editor, workspace documents, and skills purely through tool calls. Approvals, edit diffs, and tool-call activity are surfaced in the main UI so the user stays in control of what the agent does.

This project is forked from [agent-text-editor](https://github.com/andreban/agent-text-editor), which embeds an in-page Gemini agent. The fork keeps the editor and workspace functionality, drops the in-page chat, and exposes everything via WebMCP. A Gemini API key is still optional for sub-agent delegation tools (`invoke_planner`, `invoke_writer`, `delegate_to_skill`, …), which run internally but are only invokable by the external agent through WebMCP.

## Key features

- **Monaco editor** with light/dark theme and a togglable Markdown preview tab. Bound to the active document of the active workspace.
- **Workspaces** stored in `localStorage`. Users create, rename, delete, and switch between workspaces via a workspace picker; each workspace holds its own document list.
- **Document navigator** in the left drawer for the active workspace — create, rename, delete, and switch documents.
- **WebMCP bridge** — every tool is mirrored into `document.modelContext` so a connected external agent can read and modify the editor and workspace. The bridge is the only agent surface.
- **Editor tools** (read scope unless marked):
  - `read`, `read_selection`, `search`, `get_metadata`, `get_current_mode`, `request_switch_to_editor`.
  - `edit` (targeted change, requires approval), `write` (full document replacement, requires approval).
- **Workspace tools**:
  - `get_active_doc_info`, `list_workspace_docs`, `read_workspace_doc`, `query_workspace_doc`, `query_workspace` (read-only; the last two delegate to a sub-agent).
  - `create_document`, `rename_document`, `delete_document` (require approval).
  - `switch_active_document`.
- **Skill tools** (read-only discovery for the external agent):
  - `list_skills` — returns `{ id, name, description }` for every skill.
  - `read_skill` — returns the full skill definition (`id`, `name`, `description`, `instructions`, optional `model`) by id or by name.
- **Sub-agent delegation tools** — `invoke_planner`, `invoke_researcher`, `invoke_writer`, `invoke_reviewer`, `invoke_agent`, `delegate_to_skill`. These run Gemini-backed sub-agents internally and are exposed via WebMCP for the external agent to call. They require a Gemini API key set via the Settings dialog; if no key is present they simply don't register.
- **Inline approval for `edit`/`write`** — pending suggestions render as Monaco view zones with a word-level diff (red strikethrough for removed text, green for added) and Accept / Reject buttons docked inside the card. The view zone height tracks the rendered content via `ResizeObserver`.
- **Modal approval for workspace mutations** — `create_document`, `rename_document`, `delete_document`, and `invoke_planner` plan confirmations open a Radix dialog with the proposed change and Approve / Reject buttons.
- **Approve All mode** — header bar toggle that short-circuits every approval prompt.
- **Tool Activity bottom pane** — collapsible panel that subscribes to a live `ToolActivityLog`. Each WebMCP call is recorded with name, args, result/error, and duration; sub-agent stream events (`text_delta`, `thinking`, `tool_call_started`, `tool_call_completed`) are recorded as chatter linked to the parent call. The pane auto-scrolls when at the bottom and supports a one-click Clear.
- **Skills editor** — `SkillsDialog` lets users create, edit, and delete custom skill definitions. Skills are persisted in `localStorage` and exposed read-only over WebMCP via `list_skills` / `read_skill`. The external agent typically calls `list_skills` to discover what is available and then `delegate_to_skill` to run one.
- **Settings dialog** — Gemini API key (optional, only used by sub-agent tools), model selector, theme.
- **Dark mode** — toggle in the header, persisted in `localStorage`. Monaco and all UI components switch.
- **Mobile layout** — stacked: editor takes most of the screen, tool activity pane at the bottom, dialogs cover full screen when open.

## User persona

- **Power users of an external WebMCP agent** (e.g., a browser-extension agent or claude.ai with WebMCP support) who want a structured editor surface their agent can drive deterministically.
- **WebMCP tool authors** building demonstrations or testing how external agents interact with rich in-page tools.

## Out of scope

- In-page chat or agent loop. The page never originates an LLM request based on user text input — it only responds to WebMCP calls.
- Server-side persistence. All state lives in the browser.
- Document collaboration / multi-user editing.

## Success metrics

- **Tool coverage:** every editor and workspace operation the agent needs is reachable via WebMCP without a fallback to direct DOM manipulation.
- **Approval transparency:** the user can always see _what_ the agent is asking to do and can reject every mutating call.
- **Observability:** every tool call (and every sub-agent event from delegation tools) is visible in the activity pane in real time.

## License

Apache-2.0
