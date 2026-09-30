// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToolRegistry } from "@mast-ai/core";
import { addAllBuiltInAITools } from "@mast-ai/built-in-ai";
import { DefaultAgentRunnerFactory } from "@/lib/agents";
import type { AgentRunnerFactory } from "@/lib/agents";
import type { EditorContext } from "@/lib/agents/tools/editor/context";
import type { WorkspaceContext } from "@/lib/agents/tools/workspace/context";
import type { SkillsContext } from "@/lib/agents/tools/skills/context";
import { DelegateToSkillTool } from "@/lib/agents/tools/delegation/delegate_to_skill";
import { QueryWorkspaceDocTool } from "@/lib/agents/tools/workspace/query_workspace_doc";
import { createToolRegistry } from "@/lib/agents/tools/registries";
import {
  DELEGATION_TOOL_NAMES,
  registerDelegationTools,
} from "@/lib/agents/tools/delegation";
import { registerWebMCPTools } from "@/lib/WebMCPTools";
import { ToolActivityLog } from "@/lib/toolActivityLog";
import { useAgentConfig, useEditorUI } from "@/lib/store";
import { useWorkspaces } from "@/lib/WorkspacesContext";

interface MCPContextValue {
  registry: ToolRegistry;
  activityLog: ToolActivityLog;
  factory: AgentRunnerFactory | null;
}

const MCPContext = createContext<MCPContextValue | undefined>(undefined);

export function useMCP(): MCPContextValue {
  const ctx = useContext(MCPContext);
  if (!ctx) throw new Error("useMCP must be used within an MCPProvider");
  return ctx;
}

export function MCPProvider({ children }: { children: ReactNode }) {
  const { apiKey, modelName, skills, setTotalTokens } = useAgentConfig();
  const {
    setSuggestions,
    setPendingApprovals,
    approveAll,
    activeTab,
    editorContent,
    editorInstance,
    setPendingTabSwitchRequest,
    setPendingPlanConfirmation,
  } = useEditorUI();
  const {
    activeWorkspace,
    activeDocument,
    createDocumentWithTitle,
    updateDocument,
    deleteDocument,
    setActiveDocumentId,
  } = useWorkspaces();

  const [activityLog] = useState(() => new ToolActivityLog());

  const docsRef = useRef(activeWorkspace?.documents ?? []);
  useEffect(() => {
    docsRef.current = activeWorkspace?.documents ?? [];
  }, [activeWorkspace]);

  const activeDocRef = useRef<{ id: string; title: string } | null>(
    activeDocument
      ? { id: activeDocument.id, title: activeDocument.title }
      : null,
  );
  useEffect(() => {
    activeDocRef.current = activeDocument
      ? { id: activeDocument.id, title: activeDocument.title }
      : null;
  }, [activeDocument]);

  const editorInstanceRef = useRef(editorInstance);
  useEffect(() => {
    editorInstanceRef.current = editorInstance;
  }, [editorInstance]);

  const editorContentRef = useRef(editorContent);
  useEffect(() => {
    editorContentRef.current = editorContent;
  }, [editorContent]);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const approveAllRef = useRef(approveAll);
  useEffect(() => {
    approveAllRef.current = approveAll;
  }, [approveAll]);

  const skillsRef = useRef(skills);
  useEffect(() => {
    skillsRef.current = skills;
  }, [skills]);

  const skillsCtx = useMemo<SkillsContext>(() => ({ skillsRef }), []);

  const requestTabSwitch = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        setPendingTabSwitchRequest({ resolve });
      }),
    [setPendingTabSwitchRequest],
  );

  const editorCtx = useMemo<EditorContext>(
    () => ({
      editorRef: editorInstanceRef,
      editorContentRef,
      activeTabRef,
      requestTabSwitch,
      setSuggestions,
      approveAllRef,
    }),
    [setSuggestions, requestTabSwitch],
  );

  const usageCallback = useCallback(
    (usage: { totalTokenCount?: number }) =>
      setTotalTokens((prev) => prev + (usage.totalTokenCount || 0)),
    [setTotalTokens],
  );

  const factory = useMemo(
    () =>
      apiKey
        ? new DefaultAgentRunnerFactory(apiKey, modelName, usageCallback)
        : null,
    [apiKey, modelName, usageCallback],
  );

  const workspaceCtx = useMemo<WorkspaceContext>(
    () => ({
      docsRef,
      activeDocRef,
      createDocumentFn: (title) => createDocumentWithTitle(title),
      renameDocumentFn: (id, title) => updateDocument(id, { title }),
      deleteDocumentFn: (id) => deleteDocument(id),
      setActiveDocumentIdFn: (id) => setActiveDocumentId(id),
      saveDocContentFn: (id, content) => updateDocument(id, { content }),
      editorRef: editorInstanceRef,
      editorContentRef,
      setPendingApprovals,
      approveAllRef,
    }),
    [
      createDocumentWithTitle,
      updateDocument,
      deleteDocument,
      setActiveDocumentId,
      setPendingApprovals,
    ],
  );

  const registry = useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => createToolRegistry(editorCtx, workspaceCtx, skillsCtx),
    [editorCtx, workspaceCtx, skillsCtx],
  );

  useEffect(() => {
    addAllBuiltInAITools(registry).catch(() => {});
  }, [registry]);

  useEffect(
    () => registerWebMCPTools(registry, activityLog),
    [registry, activityLog],
  );

  // Model-backed tools only exist while an API key is configured, so agents
  // never see tools that would fail on every call.
  useEffect(() => {
    if (!factory) return;
    registry.register(new QueryWorkspaceDocTool(workspaceCtx, factory));
    registry.register(
      new DelegateToSkillTool(factory, registry.readOnly(), skillsCtx),
    );
    registerDelegationTools(
      registry,
      factory,
      registry.readOnly(),
      workspaceCtx,
      setPendingPlanConfirmation,
    );
    return () => {
      registry.unregister("query_workspace_doc");
      registry.unregister("delegate_to_skill");
      for (const name of DELEGATION_TOOL_NAMES) registry.unregister(name);
    };
  }, [registry, factory, workspaceCtx, skillsCtx, setPendingPlanConfirmation]);

  const value = useMemo<MCPContextValue>(
    () => ({ registry, activityLog, factory }),
    [registry, activityLog, factory],
  );

  return <MCPContext.Provider value={value}>{children}</MCPContext.Provider>;
}
