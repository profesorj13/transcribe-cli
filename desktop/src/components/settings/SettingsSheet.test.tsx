// Flujos (nivel componente) de la configuración: las claves API se muestran
// enmascaradas (nunca en claro), agregar una clave la persiste vía save_config, y
// las preferencias (toggle / select) se guardan al cambiarlas.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsSheet } from "./SettingsSheet";
import { useAppStore } from "../../stores/app";
import type { AppConfig } from "../../types";

interface Registry {
  reset(): void;
  on(cmd: string, handler: (args: Record<string, unknown>) => unknown): void;
  callsFor(cmd: string): Array<Record<string, unknown>>;
}
const tauri = (globalThis as unknown as { __tauri: Registry }).__tauri;

function mountWith(config: AppConfig) {
  tauri.on("get_config", () => config);
  render(<SettingsSheet />);
  return screen.findByText("Configuración");
}

function lastSavedConfig(): AppConfig {
  const calls = tauri.callsFor("save_config");
  return calls[calls.length - 1]!.config as AppConfig;
}

beforeEach(() => {
  tauri.reset();
  useAppStore.setState({ currentView: "settings" });
  tauri.on("check_dependencies", () => []);
  tauri.on("save_config", () => undefined);
});

afterEach(() => cleanup());

describe("SettingsSheet — claves API", () => {
  test("una clave guardada se muestra enmascarada, nunca en claro", async () => {
    await mountWith({ apiKey: "sk-abcdefghij" });

    expect(screen.getByText("sk-****hij")).toBeTruthy();
    expect(screen.queryByText("sk-abcdefghij")).toBeNull();
    // Sin clave de ElevenLabs → aparece como no configurada.
    expect(screen.getByText("No configurada")).toBeTruthy();
  });

  test("agregar una clave la persiste con save_config", async () => {
    await mountWith({});

    // Ambas claves vacías muestran "Agregar"; la primera es ElevenLabs.
    fireEvent.click(screen.getAllByText("Agregar")[0]!);
    const input = screen.getByPlaceholderText("sk-...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-elevenlabs-nueva" } });
    fireEvent.click(screen.getByText("Guardar"));

    await waitFor(() => expect(tauri.callsFor("save_config").length).toBeGreaterThan(0));
    expect(lastSavedConfig().elevenlabsApiKey).toBe("sk-elevenlabs-nueva");
  });
});

describe("SettingsSheet — preferencias", () => {
  test("activar 'siempre incluir timestamps' se guarda", async () => {
    await mountWith({});
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(tauri.callsFor("save_config").length).toBeGreaterThan(0));
    expect(lastSavedConfig().includeTimestamps).toBe(true);
  });

  test("cambiar el idioma por defecto se guarda", async () => {
    await mountWith({});
    // El select de idioma arranca en "Español" (es por defecto).
    fireEvent.change(screen.getByDisplayValue("Español"), {
      target: { value: "en" },
    });

    await waitFor(() => expect(tauri.callsFor("save_config").length).toBeGreaterThan(0));
    expect(lastSavedConfig().defaultLanguage).toBe("en");
  });
});
