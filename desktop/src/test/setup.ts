// Test setup preloaded by bun (see ../../bunfig.toml). Registers a DOM so React
// components can render, and mocks the Tauri IPC layer (@tauri-apps/api) with a
// controllable registry so component tests can exercise real user flows without
// a running Tauri backend.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mock } from "bun:test";

GlobalRegistrator.register();

// framer-motion / some components touch matchMedia; happy-dom doesn't ship it.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

type InvokeHandler = (args: Record<string, unknown>) => unknown;
type Listener = (payload: unknown) => void;

interface TauriRegistry {
  handlers: Record<string, InvokeHandler>;
  calls: Array<{ cmd: string; args: Record<string, unknown> }>;
  listeners: Record<string, Listener[]>;
  reset(): void;
  on(cmd: string, handler: InvokeHandler): void;
  emit(event: string, payload: unknown): void;
  callsFor(cmd: string): Array<Record<string, unknown>>;
}

const registry: TauriRegistry = {
  handlers: {},
  calls: [],
  listeners: {},
  reset() {
    this.handlers = {};
    this.calls = [];
    this.listeners = {};
  },
  on(cmd, handler) {
    this.handlers[cmd] = handler;
  },
  emit(event, payload) {
    (this.listeners[event] ?? []).forEach((cb) => cb(payload));
  },
  callsFor(cmd) {
    return this.calls.filter((c) => c.cmd === cmd).map((c) => c.args);
  },
};

// Exposed for tests via `globalThis.__tauri`.
(globalThis as unknown as { __tauri: TauriRegistry }).__tauri = registry;

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
    registry.calls.push({ cmd, args });
    const handler = registry.handlers[cmd];
    if (!handler) {
      throw new Error(`[test] invoke("${cmd}") sin handler mockeado`);
    }
    return handler(args);
  },
}));

mock.module("@tauri-apps/api/event", () => ({
  listen: async (event: string, cb: (e: { payload: unknown }) => void) => {
    const wrapped: Listener = (payload) => cb({ payload });
    (registry.listeners[event] ??= []).push(wrapped);
    return () => {
      registry.listeners[event] = (registry.listeners[event] ?? []).filter(
        (f) => f !== wrapped,
      );
    };
  },
}));

mock.module("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async () => () => {},
  }),
}));
