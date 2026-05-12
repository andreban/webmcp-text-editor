// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import App from "./App";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppProvider } from "./lib/store";
import { ThemeProvider } from "./lib/ThemeProvider";
import { WorkspacesProvider } from "./lib/WorkspacesContext";

vi.mock("@monaco-editor/react", () => ({
  Editor: () => <div data-testid="mock-monaco-editor">Mock Editor</div>,
}));

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

function renderApp() {
  return render(
    <ThemeProvider>
      <AppProvider>
        <WorkspacesProvider>
          <App />
        </WorkspacesProvider>
      </AppProvider>
    </ThemeProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
  });

  it("renders the editor inside the main shell once a workspace is active", () => {
    renderApp();
    expect(screen.getByTestId("mock-monaco-editor")).toBeInTheDocument();
    expect(screen.getByLabelText("Open settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Open skills")).toBeInTheDocument();
  });

  it("renders the bottom tool activity pane", () => {
    renderApp();
    expect(screen.getByText("Tool Activity")).toBeInTheDocument();
  });
});
