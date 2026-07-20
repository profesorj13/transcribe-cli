// Flujos (nivel componente) de la lista de recientes: el estado vacío, y que al
// tocar un archivo se abra el .md correspondiente.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecentList } from "./RecentList";
import { useAppStore } from "../../stores/app";
import type { RecentFile } from "../../types";

interface Registry {
  reset(): void;
  on(cmd: string, handler: (args: Record<string, unknown>) => unknown): void;
  callsFor(cmd: string): Array<Record<string, unknown>>;
}
const tauri = (globalThis as unknown as { __tauri: Registry }).__tauri;

const FILES: RecentFile[] = [
  {
    path: "/Users/ivi/Desktop/entrevista.md",
    name: "entrevista.md",
    date: "2020-01-01T00:00:00.000Z",
    size: 1024,
  },
];

beforeEach(() => {
  tauri.reset();
  // RecentList solo refresca cuando la vista actual es "home".
  useAppStore.setState({ currentView: "home" });
  tauri.on("open_file", () => undefined);
});

afterEach(() => cleanup());

test("sin transcripciones muestra el estado vacío", async () => {
  tauri.on("get_recent_files", () => []);
  render(<RecentList />);
  await screen.findByText("Sin transcripciones recientes");
});

test("lista los recientes y al tocar uno abre su .md", async () => {
  tauri.on("get_recent_files", () => FILES);
  render(<RecentList />);

  await screen.findByText("entrevista.md");
  fireEvent.click(screen.getByText("entrevista.md"));

  await waitFor(() => expect(tauri.callsFor("open_file").length).toBe(1));
  expect(tauri.callsFor("open_file")[0]!.path).toBe(
    "/Users/ivi/Desktop/entrevista.md",
  );
});
