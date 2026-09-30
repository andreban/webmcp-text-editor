// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from "@mast-ai/core";
import type { EditorContext } from "./editor/context";
import type { WorkspaceContext } from "./workspace/context";
import type { SkillsContext } from "./skills/context";
import { ListSkillsTool } from "./skills/list_skills";
import { ReadSkillTool } from "./skills/read_skill";
import { ReadSelectionTool } from "./editor/read_selection";
import { SearchDocumentTool } from "./editor/search_document";
import { GetEditorStateTool } from "./editor/get_editor_state";
import { RequestSwitchToEditorTool } from "./editor/request_switch_to_editor";
import { EditDocumentTool } from "./editor/edit_document";
import { RewriteDocumentTool } from "./editor/rewrite_document";
import { ListWorkspaceDocsTool } from "./workspace/list_workspace_docs";
import { ReadDocumentTool } from "./workspace/read_document";
import { CreateDocumentTool } from "./workspace/create_document";
import { RenameDocumentTool } from "./workspace/rename_document";
import { DeleteDocumentTool } from "./workspace/delete_document";
import { SwitchActiveDocumentTool } from "./workspace/switch_active_document";

/**
 * Builds the tools that work without an API key. Model-backed tools
 * (`query_workspace_doc`, `invoke_*`, `delegate_to_skill`) are registered
 * separately once a key is configured.
 */
export function createToolRegistry(
  editorCtx: EditorContext,
  workspaceCtx: WorkspaceContext,
  skillsCtx: SkillsContext,
): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new ListSkillsTool(skillsCtx));
  registry.register(new ReadSkillTool(skillsCtx));

  registry.register(
    new GetEditorStateTool(editorCtx, workspaceCtx.activeDocRef),
  );
  registry.register(new ReadSelectionTool(editorCtx));
  registry.register(new SearchDocumentTool(editorCtx));
  registry.register(new RequestSwitchToEditorTool(editorCtx));
  registry.register(new EditDocumentTool(editorCtx));
  registry.register(new RewriteDocumentTool(editorCtx));

  registry.register(new ListWorkspaceDocsTool(workspaceCtx));
  registry.register(new ReadDocumentTool(workspaceCtx));
  registry.register(new CreateDocumentTool(workspaceCtx));
  registry.register(new RenameDocumentTool(workspaceCtx));
  registry.register(new DeleteDocumentTool(workspaceCtx));
  registry.register(new SwitchActiveDocumentTool(workspaceCtx));

  return registry;
}
