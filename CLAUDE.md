# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A React SPA that exposes a Monaco-based text editor and a workspace document store to external AI agents via [WebMCP](https://github.com/webmachinelearning/webmcp). The page has no internal chat panel — agents drive it from outside through `document.modelContext.registerTool`. Approvals, edit diffs, and tool-call activity are rendered in the main UI.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check + build for production
npm run lint      # Run ESLint
npm run format    # Format with Prettier
npm run test      # Run Vitest tests
npm run preview   # Preview production build
```

## Architecture

**Top-level wiring:** `src/App.tsx` mounts a desktop/mobile layout containing `WorkspacePanel`, `EditorPanel`, `ToolLogPane`, `ApprovalModal`, and the Settings / Skills dialogs. The whole tree is wrapped in `MCPProvider` (`src/context/MCPProvider.tsx`), which builds the `ToolRegistry`, registers all tools, and mirrors them into `document.modelContext` through `src/lib/WebMCPTools.ts`.

**Data flow:**

1. `MCPProvider` constructs `EditorContext`, `WorkspaceContext`, and `SkillsContext` from React state/refs in `src/lib/store.tsx` and `src/lib/WorkspacesContext.tsx`.
2. `createToolRegistry` (`src/lib/agents/tools/registries.ts`) registers every tool (editor, workspace, skills) on a `ToolRegistry`. Delegation tools (`invoke_*`, `delegate_to_skill`) and built-in AI tools register asynchronously when an API key is available.
3. `registerWebMCPTools` mirrors the registry into `document.modelContext`. Each external call is recorded in a `ToolActivityLog` (`src/lib/toolActivityLog.ts`) and its sub-agent events (`text_delta`, `thinking`, `tool_call_*`) are forwarded as chatter.
4. Mutating tools self-gate inside their `call()` methods:
   - `edit` / `write` → `applySuggestion` queues a `Suggestion` and waits for inline Accept/Reject via Monaco view zones (`src/components/InlineSuggestions.tsx`).
   - `create_document` / `rename_document` / `delete_document` → `requestApproval` queues an `ApprovalRequest` resolved by the modal in `src/components/ApprovalModal.tsx`.
   - `invoke_planner` → queues a `PlanConfirmationRequest` resolved by the same modal.
   - The "Approve All" toggle in the header bar short-circuits every prompt.
5. `ToolLogPane` (`src/components/ToolLogPane.tsx`) subscribes to `ToolActivityLog` and renders calls in a bottom pane with expandable args / result / chatter.

**Key modules:**

- `src/context/MCPProvider.tsx` — top-level wiring; exposes `useMCP() → { registry, activityLog, factory }`.
- `src/lib/WebMCPTools.ts` — `ToolRegistry` ↔ `document.modelContext` bridge; wraps each tool call to log activity and route sub-agent events to chatter.
- `src/lib/toolActivityLog.ts` — observable log of tool calls + chatter, capped at 500 entries.
- `src/lib/agents/tools/registries.ts` — builds the `ToolRegistry` from editor / workspace / skills contexts.
- `src/lib/agents/tools/skills/` — `list_skills` and `read_skill` tools (read-only skill discovery for the external agent).
- `src/lib/agents/tools/workspace/request_approval.ts` — promise-based helper that queues an `ApprovalRequest` and waits for the modal to resolve it.
- `src/lib/agents/tools/editor/apply_suggestion.ts` — analogous helper for inline `edit`/`write` suggestions.
- `src/components/InlineSuggestions.tsx` — manages Monaco view zones via React portals so `SuggestionCard` renders inline at the change location.
- `src/components/ApprovalModal.tsx` — single modal that renders the next pending workspace-mutation approval or pending plan confirmation.
- `src/components/ToolLogPane.tsx` — bottom pane that subscribes to `ToolActivityLog`.

**Sub-agent infrastructure (Gemini-backed, optional):**

- `src/lib/agents/roles/factory.ts` and `src/lib/agents/roles/*` — `AgentRunnerFactory` builds Gemini-backed agents for the `invoke_*` and `delegate_to_skill` tools. These are only exposed via WebMCP; nothing in the page UI invokes them directly. They require a Gemini API key (set via the Settings dialog).

**MAST dependency:** `@mast-ai/core`, `@mast-ai/built-in-ai`, and `@mast-ai/google-genai` are installed from the npm registry. There is no `@mast-ai/react-ui` dependency — the UI is fully custom.

## Git conventions

- Do not add `Co-Authored-By` trailers to commit messages.
- All source files must carry the Apache-2.0 license header.
- All new logic requires Vitest test coverage.
- Always run `npm run lint`, `npm run format`, `npm run build`, and `npm run test` before committing and fix any failures.
- Always use `Edit` to modify existing files — never rewrite them wholesale with `Write`. Small diffs make reviews easier.
- Always ask the user to manually test before committing. Never commit or open a pull request until the user has confirmed the test passed.
