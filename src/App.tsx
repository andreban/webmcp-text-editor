// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { useState, useEffect, useRef } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelBottomClose,
  PanelBottomOpen,
  LayoutGrid,
  Sun,
  Moon,
  Wand2,
  Settings,
} from "lucide-react";
import { EditorPanel } from "@/components/EditorPanel";
import { WorkspacePanel } from "@/components/WorkspacePanel";
import { WorkspacePicker } from "@/components/WorkspacePicker";
import { ApprovalModal } from "@/components/ApprovalModal";
import { ToolLogPane } from "@/components/ToolLogPane";
import { SettingsDialog } from "@/components/SettingsDialog";
import { SkillsDialog } from "@/components/SkillsDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEditorUI } from "@/lib/store";
import { useTheme } from "@/lib/ThemeProvider";
import { useWorkspaces } from "@/lib/WorkspacesContext";
import { MCPProvider } from "@/context/MCPProvider";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function HeaderBar({
  workspaceName,
  onSwitchWorkspace,
  onOpenSkills,
  onOpenSettings,
}: {
  workspaceName: string | null;
  onSwitchWorkspace: () => void;
  onOpenSkills: () => void;
  onOpenSettings: () => void;
}) {
  const { approveAll, setApproveAll } = useEditorUI();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0">
      <span className="text-xs font-medium text-muted-foreground truncate flex-1">
        {workspaceName ?? "WebMCP Text Editor"}
      </span>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <Switch
            id="approve-all"
            checked={approveAll}
            onCheckedChange={setApproveAll}
          />
          <Label htmlFor="approve-all" className="text-xs">
            Approve All
          </Label>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onOpenSkills}
          aria-label="Open skills"
        >
          <Wand2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <Settings className="w-4 h-4" />
        </Button>
        {workspaceName && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onSwitchWorkspace}
          >
            <LayoutGrid className="w-3 h-3 mr-1" />
            Switch
          </Button>
        )}
      </div>
    </div>
  );
}

function DesktopLayout({
  onOpenSkills,
  onOpenSettings,
}: {
  onOpenSkills: () => void;
  onOpenSettings: () => void;
}) {
  const [docsOpen, setDocsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const [logHeight, setLogHeight] = useState(() => {
    const stored = localStorage.getItem("logPanelHeight");
    return stored ? parseInt(stored, 10) : 200;
  });
  const [isResizing, setIsResizing] = useState(false);
  const logHeightRef = useRef(logHeight);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const { index, activeWorkspaceId, closeWorkspace } = useWorkspaces();
  const activeMeta = index.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartYRef.current - e.clientY;
      const newHeight = Math.max(
        80,
        Math.min(window.innerHeight * 0.7, dragStartHeightRef.current + delta),
      );
      logHeightRef.current = newHeight;
      setLogHeight(newHeight);
    };
    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsResizing(false);
      localStorage.setItem("logPanelHeight", String(logHeightRef.current));
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsResizing(true);
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = logHeightRef.current;
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside
        className={`shrink-0 border-r border-border flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out ${
          docsOpen ? "w-[280px]" : "w-10"
        }`}
      >
        <div className="flex items-center border-b border-border h-10 shrink-0">
          <button
            onClick={() => setDocsOpen((v) => !v)}
            className="flex items-center justify-center w-10 h-10 hover:bg-muted/60 text-muted-foreground"
            aria-label={docsOpen ? "Collapse documents" : "Expand documents"}
          >
            {docsOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>
          {docsOpen && (
            <span className="text-xs font-medium text-muted-foreground ml-1 truncate">
              Documents
            </span>
          )}
        </div>
        {docsOpen && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <WorkspacePanel />
          </div>
        )}
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <HeaderBar
          workspaceName={activeMeta?.name ?? null}
          onSwitchWorkspace={closeWorkspace}
          onOpenSkills={onOpenSkills}
          onOpenSettings={onOpenSettings}
        />
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <EditorPanel />
          </div>
          <div
            className={`shrink-0 border-t border-border bg-background flex flex-col overflow-hidden relative${
              isResizing ? "" : " transition-[height] duration-300 ease-in-out"
            }`}
            style={{ height: logOpen ? logHeight : 32 }}
          >
            {logOpen && (
              <div
                onMouseDown={handleResizeMouseDown}
                className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/30 z-10"
              />
            )}
            <div className="flex items-center h-8 border-b border-border px-2 shrink-0 bg-muted/40">
              <button
                onClick={() => setLogOpen((v) => !v)}
                className="flex items-center justify-center h-8 w-8 hover:bg-muted/60 text-muted-foreground"
                aria-label={logOpen ? "Collapse log" : "Expand log"}
              >
                {logOpen ? (
                  <PanelBottomClose className="w-4 h-4" />
                ) : (
                  <PanelBottomOpen className="w-4 h-4" />
                )}
              </button>
              <span className="text-xs font-medium text-muted-foreground ml-1">
                Tool Activity
              </span>
            </div>
            {logOpen && (
              <div className="flex-1 min-h-0 overflow-hidden bg-muted/20">
                <ToolLogPane />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function MobileLayout({
  onOpenSkills,
  onOpenSettings,
}: {
  onOpenSkills: () => void;
  onOpenSettings: () => void;
}) {
  const { index, activeWorkspaceId, closeWorkspace } = useWorkspaces();
  const activeMeta = index.find((w) => w.id === activeWorkspaceId);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
      <HeaderBar
        workspaceName={activeMeta?.name ?? null}
        onSwitchWorkspace={closeWorkspace}
        onOpenSkills={onOpenSkills}
        onOpenSettings={onOpenSettings}
      />
      <div className="flex-1 min-h-0">
        <EditorPanel />
      </div>
      <div className="h-40 border-t border-border bg-muted/20 overflow-hidden">
        <ToolLogPane />
      </div>
    </div>
  );
}

function AppContent() {
  const { activeWorkspaceId } = useWorkspaces();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const isMobile = useIsMobile();

  if (!activeWorkspaceId) {
    return <WorkspacePicker />;
  }

  return (
    <>
      {isMobile ? (
        <MobileLayout
          onOpenSkills={() => setSkillsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <DesktopLayout
          onOpenSkills={() => setSkillsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <ApprovalModal />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <SkillsDialog open={skillsOpen} onOpenChange={setSkillsOpen} />
    </>
  );
}

export default function App() {
  return (
    <MCPProvider>
      <AppContent />
    </MCPProvider>
  );
}
