// Copyright 2026 Andre Cipriani Bandarra
// SPDX-License-Identifier: Apache-2.0
import "@testing-library/jest-dom";
import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
import React from "react";

// Mock Monaco Editor for JSDOM
vi.mock("monaco-editor", () => ({
  editor: {
    create: vi.fn(),
    IStandaloneCodeEditor: vi.fn(),
    IModelDeltaDecoration: vi.fn(),
    createDecorationsCollection: vi.fn(() => ({
      clear: vi.fn(),
      set: vi.fn(),
    })),
  },
}));

// Mock @monaco-editor/react to prevent it from loading the real Monaco
vi.mock("@monaco-editor/react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Editor: ({ onChange, value }: any) => {
    return React.createElement("textarea", {
      "data-testid": "mock-monaco-editor",
      value: value,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange: (e: any) => onChange?.(e.target.value),
    });
  },
}));

// Mock robust localStorage
class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }

  getItem(key: string) {
    return this.store[key] !== undefined ? this.store[key] : null;
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }

  removeItem(key: string) {
    delete this.store[key];
  }

  get length() {
    return Object.keys(this.store).length;
  }

  key(index: number) {
    return Object.keys(this.store)[index] || null;
  }
}

const localStorageMock = new LocalStorageMock();
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});
Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});
