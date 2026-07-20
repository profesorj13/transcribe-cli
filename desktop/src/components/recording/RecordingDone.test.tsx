// Flujos e2e (nivel componente) de la pantalla post-grabación: ejercita los
// clicks reales del usuario con happy-dom y el IPC de Tauri mockeado. Cubre los
// dos bugs reportados: B1 (renombrar impacta el .md) y B2 (progreso / error /
// cancelar durante la transcripción).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecordingDone } from "./RecordingDone";
import { useRecordingStore } from "../../stores/recording";
import { sanitizeFileName } from "../../lib/validation";

interface Registry {
  reset(): void;
  on(cmd: string, handler: (args: Record<string, unknown>) => unknown): void;
  emit(event: string, payload: unknown): void;
  callsFor(cmd: string): Array<Record<string, unknown>>;
}
const tauri = (globalThis as unknown as { __tauri: Registry }).__tauri;

const ORIGINAL = "/Users/ivi/Desktop/recording-2026-07-20.wav";

// Simula el rename_recording de Rust: sanitiza, preserva carpeta y extensión.
function fakeRename({ oldPath, newName }: Record<string, unknown>): string {
  const dir = (oldPath as string).slice(0, (oldPath as string).lastIndexOf("/"));
  const ext = (oldPath as string).slice((oldPath as string).lastIndexOf("."));
  const clean = sanitizeFileName(newName as string);
  if (!clean) throw "El nombre no es válido";
  return `${dir}/${clean}${ext}`;
}

beforeEach(() => {
  tauri.reset();
  useRecordingStore.getState().reset();
  useRecordingStore.setState({ status: "stopped", filePath: ORIGINAL, duration: 12 });
  // Handlers por defecto; cada test los puede pisar.
  tauri.on("rename_recording", fakeRename);
  tauri.on("transcribe", () => undefined);
  tauri.on("cancel_transcription", () => undefined);
});

afterEach(() => cleanup());

function enterEditAndType(name: string) {
  // El nombre del archivo es un botón que abre el editor inline.
  fireEvent.click(screen.getByTitle("Renombrar archivo"));
  const input = screen.getByPlaceholderText("nombre-del-archivo") as HTMLInputElement;
  fireEvent.change(input, { target: { value: name } });
  return input;
}

describe("RecordingDone — B1 rename impacta el nombre del .md", () => {
  test("editar y confirmar con ✓, luego transcribir usa el path renombrado", async () => {
    render(<RecordingDone />);
    enterEditAndType("Entrevista Fulano");
    fireEvent.click(screen.getByLabelText("Confirmar"));

    await waitFor(() =>
      expect(useRecordingStore.getState().filePath).toBe(
        "/Users/ivi/Desktop/Entrevista-Fulano.wav",
      ),
    );

    fireEvent.click(screen.getByText("Transcribir ahora"));
    await waitFor(() => expect(tauri.callsFor("transcribe").length).toBe(1));
    expect(tauri.callsFor("transcribe")[0]!.input).toBe(
      "/Users/ivi/Desktop/Entrevista-Fulano.wav",
    );
  });

  test("REGRESIÓN: tipear y darle 'Transcribir ahora' SIN confirmar el ✓ igual aplica el nombre", async () => {
    render(<RecordingDone />);
    // Reproduce exactamente la captura del usuario: quedó en modo edición.
    enterEditAndType("Test 3");
    fireEvent.click(screen.getByText("Transcribir ahora"));

    await waitFor(() => expect(tauri.callsFor("transcribe").length).toBe(1));
    // Antes del fix el rename se descartaba y el input era el path viejo.
    expect(tauri.callsFor("rename_recording")[0]!.newName).toBe("Test 3");
    expect(tauri.callsFor("transcribe")[0]!.input).toBe(
      "/Users/ivi/Desktop/Test-3.wav",
    );
    expect(tauri.callsFor("transcribe")[0]!.input).not.toContain("recording-2026");
  });

  test("sin editar, transcribe usa el path original", async () => {
    render(<RecordingDone />);
    fireEvent.click(screen.getByText("Transcribir ahora"));
    await waitFor(() => expect(tauri.callsFor("transcribe").length).toBe(1));
    expect(tauri.callsFor("transcribe")[0]!.input).toBe(ORIGINAL);
    expect(tauri.callsFor("rename_recording").length).toBe(0);
  });

  test("nombre inválido (solo símbolos) no transcribe y muestra el error", async () => {
    render(<RecordingDone />);
    enterEditAndType("!!!");
    fireEvent.click(screen.getByText("Transcribir ahora"));

    await screen.findByText("El nombre no tiene caracteres válidos");
    expect(tauri.callsFor("transcribe").length).toBe(0);
    expect(tauri.callsFor("rename_recording").length).toBe(0);
  });

  test("si el rename falla (nombre ya existe), no transcribe y muestra el error de Rust", async () => {
    tauri.on("rename_recording", () => {
      throw "Ya existe un archivo con ese nombre: /Users/ivi/Desktop/Test-3.wav";
    });
    render(<RecordingDone />);
    enterEditAndType("Test 3");
    fireEvent.click(screen.getByText("Transcribir ahora"));

    await screen.findByText(/Ya existe un archivo con ese nombre/);
    expect(tauri.callsFor("transcribe").length).toBe(0);
  });
});

describe("RecordingDone — B2 progreso / error / cancelar", () => {
  test("muestra la vista de progreso con el avance de chunks", async () => {
    render(<RecordingDone />);
    fireEvent.click(screen.getByText("Transcribir ahora"));

    await screen.findByText("Transcribiendo...");
    act(() => tauri.emit("transcription:progress", { completed: 2, total: 5 }));
    await screen.findByText(/Chunk 2 de 5/);
  });

  test("un error de transcripción se muestra en pantalla (no queda mudo)", async () => {
    render(<RecordingDone />);
    fireEvent.click(screen.getByText("Transcribir ahora"));
    await screen.findByText("Transcribiendo...");

    act(() =>
      tauri.emit("transcription:error", { message: "La API key de OpenAI es inválida" }),
    );
    await screen.findByText("La API key de OpenAI es inválida");
    expect(useRecordingStore.getState().status).toBe("error");
  });

  test("al terminar, muestra el resultado con la ruta del .md", async () => {
    render(<RecordingDone />);
    fireEvent.click(screen.getByText("Transcribir ahora"));
    await screen.findByText("Transcribiendo...");

    act(() =>
      tauri.emit("transcription:done", {
        outputPath: "/Users/ivi/Desktop/recording-2026-07-20.md",
        preview: "Hola, esto es una prueba de transcripción con acentos áéí.",
        speakers: [],
      }),
    );
    await screen.findByText("Transcripción lista");
    expect(
      screen.getByText(/\/Users\/ivi\/Desktop\/recording-2026-07-20\.md/),
    ).toBeTruthy();
  });

  test("Cancelar mata el proceso hijo (invoca cancel_transcription) y sale del progreso", async () => {
    render(<RecordingDone />);
    fireEvent.click(screen.getByText("Transcribir ahora"));
    await screen.findByText("Transcribiendo...");

    fireEvent.click(screen.getByText("Cancelar"));
    await waitFor(() => expect(tauri.callsFor("cancel_transcription").length).toBe(1));
    expect(useRecordingStore.getState().status).toBe("stopped");
  });
});
