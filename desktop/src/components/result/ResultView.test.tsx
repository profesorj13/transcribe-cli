// Flujos (nivel componente) de la pantalla de resultado: copiar el .md completo
// (desktop-B09, no el preview truncado), editar hablantes (renombra vía Rust y
// refleja el nuevo preview), abrir archivo y volver.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResultView } from "./ResultView";
import type { TranscriptionResult } from "../../types";

interface Registry {
  reset(): void;
  on(cmd: string, handler: (args: Record<string, unknown>) => unknown): void;
  callsFor(cmd: string): Array<Record<string, unknown>>;
}
const tauri = (globalThis as unknown as { __tauri: Registry }).__tauri;

const OUTPUT = "/Users/ivi/Desktop/recording-2026-07-20.md";
const PREVIEW = "Hola, esto es una prueba con acentos áéíóú.";

function makeResult(overrides: Partial<TranscriptionResult> = {}): TranscriptionResult {
  return { outputPath: OUTPUT, preview: PREVIEW, speakers: [], ...overrides };
}

let backCalls = 0;
const onBack = () => {
  backCalls += 1;
};

beforeEach(() => {
  tauri.reset();
  backCalls = 0;
  tauri.on("copy_file_to_clipboard", () => undefined);
  tauri.on("copy_to_clipboard", () => undefined);
  tauri.on("open_file", () => undefined);
  tauri.on("rename_speakers", () => "PREVIEW ACTUALIZADO: Juan dijo algo.");
});

afterEach(() => cleanup());

describe("ResultView — copiar el .md completo (B09)", () => {
  test("copia el archivo completo (no el preview) y muestra 'Copiado'", async () => {
    render(<ResultView result={makeResult()} onBack={onBack} />);
    fireEvent.click(screen.getByText("Copiar texto"));

    await waitFor(() =>
      expect(tauri.callsFor("copy_file_to_clipboard").length).toBe(1),
    );
    expect(tauri.callsFor("copy_file_to_clipboard")[0]!.path).toBe(OUTPUT);
    // No cae al fallback del preview truncado si el archivo se pudo leer.
    expect(tauri.callsFor("copy_to_clipboard").length).toBe(0);
    await screen.findByText("Copiado");
  });

  test("si no puede leer el archivo, cae al fallback del preview", async () => {
    tauri.on("copy_file_to_clipboard", () => {
      throw "no se pudo leer el archivo";
    });
    render(<ResultView result={makeResult()} onBack={onBack} />);
    fireEvent.click(screen.getByText("Copiar texto"));

    await waitFor(() => expect(tauri.callsFor("copy_to_clipboard").length).toBe(1));
    expect(tauri.callsFor("copy_to_clipboard")[0]!.text).toBe(PREVIEW);
    await screen.findByText("Copiado");
  });
});

describe("ResultView — editar hablantes", () => {
  test("solo aparece el botón si hay hablantes detectados", () => {
    const { rerender } = render(
      <ResultView result={makeResult({ speakers: [] })} onBack={onBack} />,
    );
    expect(screen.queryByText("Editar hablantes")).toBeNull();

    rerender(
      <ResultView
        result={makeResult({ speakers: ["speaker_0", "speaker_1"] })}
        onBack={onBack}
      />,
    );
    expect(screen.getByText("Editar hablantes")).toBeTruthy();
  });

  test("renombra hablantes: manda solo los nombres no vacíos y refleja el nuevo preview", async () => {
    render(
      <ResultView
        result={makeResult({ speakers: ["speaker_0", "speaker_1"] })}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByText("Editar hablantes"));

    const inputs = screen.getAllByPlaceholderText("Nombre real") as HTMLInputElement[];
    expect(inputs.length).toBe(2);
    fireEvent.change(inputs[0]!, { target: { value: "Juan" } });
    // El segundo queda vacío a propósito: no debe viajar en el mapping.
    fireEvent.click(screen.getByText("Confirmar"));

    await waitFor(() => expect(tauri.callsFor("rename_speakers").length).toBe(1));
    const call = tauri.callsFor("rename_speakers")[0]!;
    expect(call.filePath).toBe(OUTPUT);
    expect(call.mapping).toEqual({ speaker_0: "Juan" });

    // Tras renombrar: título cambia, preview se actualiza, el botón desaparece.
    await screen.findByText("Hablantes renombrados");
    expect(screen.getByText(/PREVIEW ACTUALIZADO/)).toBeTruthy();
    expect(screen.queryByText("Editar hablantes")).toBeNull();
  });

  test("confirmar sin escribir nada no llama a Rust y cierra el formulario", async () => {
    render(
      <ResultView
        result={makeResult({ speakers: ["speaker_0"] })}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByText("Editar hablantes"));
    fireEvent.click(screen.getByText("Confirmar"));

    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Nombre real")).toBeNull(),
    );
    expect(tauri.callsFor("rename_speakers").length).toBe(0);
    // Sigue sin renombrar: el botón vuelve a estar disponible.
    expect(screen.getByText("Editar hablantes")).toBeTruthy();
  });
});

describe("ResultView — abrir y volver", () => {
  test("'Abrir archivo' abre el .md generado", async () => {
    render(<ResultView result={makeResult()} onBack={onBack} />);
    fireEvent.click(screen.getByText("Abrir archivo"));
    await waitFor(() => expect(tauri.callsFor("open_file").length).toBe(1));
    expect(tauri.callsFor("open_file")[0]!.path).toBe(OUTPUT);
  });

  test("'Volver al inicio' dispara onBack", () => {
    render(<ResultView result={makeResult()} onBack={onBack} />);
    fireEvent.click(screen.getByText("Volver al inicio"));
    expect(backCalls).toBe(1);
  });
});
