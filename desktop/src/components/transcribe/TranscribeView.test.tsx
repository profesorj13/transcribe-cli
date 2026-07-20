// Flujos (nivel componente) de la pantalla de transcripción de archivo/URL:
// drag & drop nativo (desktop-B07, los paths reales llegan por el webview, no por
// el DOM), pegado de URL válida/ inválida, el error visible en pantalla
// (desktop-B03), los args que viajan a `transcribe`, y el cancelar en progreso.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TranscribeView } from "./TranscribeView";
import { useTranscriptionStore } from "../../stores/transcription";
import { useAppStore } from "../../stores/app";

interface Registry {
  reset(): void;
  on(cmd: string, handler: (args: Record<string, unknown>) => unknown): void;
  emit(event: string, payload: unknown): void;
  callsFor(cmd: string): Array<Record<string, unknown>>;
}
const tauri = (globalThis as unknown as { __tauri: Registry }).__tauri;

const YT = "https://youtube.com/watch?v=abc123";

function transcribeButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Transcribir" }) as HTMLButtonElement;
}

// Dispara el evento de drag&drop del webview (así llegan los paths reales en v2).
function emitDrop(paths: string[]) {
  act(() => tauri.emit("webview:dragdrop", { type: "drop", paths }));
}

beforeEach(() => {
  tauri.reset();
  useTranscriptionStore.getState().reset();
  useAppStore.setState({ currentView: "transcribe" });
  tauri.on("get_config", () => ({}));
  tauri.on("transcribe", () => undefined);
  tauri.on("cancel_transcription", () => undefined);
});

afterEach(() => cleanup());

describe("TranscribeView — drag & drop nativo (B07)", () => {
  test("soltar un audio válido fija la fuente y muestra el nombre del archivo", async () => {
    render(<TranscribeView />);
    emitDrop(["/Users/ivi/Desktop/reunión.m4a"]);

    await screen.findByText("reunión.m4a");
    expect(useTranscriptionStore.getState().source).toEqual({
      type: "file",
      value: "/Users/ivi/Desktop/reunión.m4a",
      name: "reunión.m4a",
    });
    expect(transcribeButton().disabled).toBe(false);
  });

  test("soltar un archivo no soportado se ignora", async () => {
    render(<TranscribeView />);
    emitDrop(["/Users/ivi/Desktop/notas.txt"]);

    // Sigue mostrando el placeholder del dropzone y sin fuente.
    expect(screen.getByText("Arrastrá un archivo aquí")).toBeTruthy();
    expect(useTranscriptionStore.getState().source).toBeNull();
    expect(transcribeButton().disabled).toBe(true);
  });
});

describe("TranscribeView — pegado de URL", () => {
  test("una URL soportada habilita transcribir; una inválida lo deshabilita de nuevo", () => {
    render(<TranscribeView />);
    const input = screen.getByPlaceholderText(
      /youtube\.com\/watch/,
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: YT } });
    expect(useTranscriptionStore.getState().source).toEqual({
      type: "url",
      value: YT,
    });
    expect(transcribeButton().disabled).toBe(false);

    // Al romper la URL, la fuente url previa se limpia.
    fireEvent.change(input, { target: { value: "esto no es una url" } });
    expect(useTranscriptionStore.getState().source).toBeNull();
    expect(transcribeButton().disabled).toBe(true);
  });
});

describe("TranscribeView — transcribir y errores", () => {
  test("transcribir manda el path de la fuente y la carpeta de salida por defecto", async () => {
    useTranscriptionStore.setState({
      source: { type: "file", value: "/Users/ivi/Desktop/audio.mp3", name: "audio.mp3" },
    });
    render(<TranscribeView />);
    fireEvent.click(transcribeButton());

    await waitFor(() => expect(tauri.callsFor("transcribe").length).toBe(1));
    const call = tauri.callsFor("transcribe")[0]!;
    expect(call.input).toBe("/Users/ivi/Desktop/audio.mp3");
    expect(call.outputDir).toBe("~/Desktop");
  });

  test("un error al iniciar la transcripción se muestra en pantalla (B03), no queda mudo", async () => {
    useTranscriptionStore.setState({
      source: { type: "file", value: "/Users/ivi/Desktop/audio.mp3", name: "audio.mp3" },
    });
    tauri.on("transcribe", () => {
      throw "La API key de OpenAI es inválida";
    });
    render(<TranscribeView />);
    fireEvent.click(transcribeButton());

    await screen.findByText("La API key de OpenAI es inválida");
    expect(useTranscriptionStore.getState().status).toBe("error");
  });

  test("cancelar en progreso mata el proceso hijo y vuelve al inicio", async () => {
    useTranscriptionStore.setState({
      source: { type: "file", value: "/Users/ivi/Desktop/audio.mp3", name: "audio.mp3" },
    });
    render(<TranscribeView />);
    fireEvent.click(transcribeButton());

    await screen.findByText("Transcribiendo...");
    fireEvent.click(screen.getByText("Cancelar"));

    await waitFor(() =>
      expect(tauri.callsFor("cancel_transcription").length).toBe(1),
    );
    expect(useAppStore.getState().currentView).toBe("home");
  });
});
