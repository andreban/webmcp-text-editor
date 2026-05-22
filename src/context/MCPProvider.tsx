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
import { createToolRegistry } from "@/lib/agents/tools/registries";
import { registerDelegationTools } from "@/lib/agents/tools/delegation";
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
      factory: factory ?? new DefaultAgentRunnerFactory("", ""),
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
      factory,
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

  useEffect(() => {
    const effFactory = workspaceCtx.factory;
    registry.register(new DelegateToSkillTool(effFactory, registry.readOnly()));
    registerDelegationTools(
      registry,
      effFactory,
      registry.readOnly(),
      workspaceCtx.docsRef,
      setPendingPlanConfirmation,
    );
    return () => {
      registry.unregister("delegate_to_skill");
      registry.unregister("invoke_agent");
      registry.unregister("invoke_planner");
      registry.unregister("invoke_researcher");
      registry.unregister("invoke_writer");
      registry.unregister("invoke_reviewer");
    };
  }, [registry, workspaceCtx, setPendingPlanConfirmation]);

  const value = useMemo<MCPContextValue>(
    () => ({ registry, activityLog, factory }),
    [registry, activityLog, factory],
  );

  return <MCPContext.Provider value={value}>{children}</MCPContext.Provider>;
}
