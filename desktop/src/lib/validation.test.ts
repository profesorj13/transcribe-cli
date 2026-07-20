import { describe, expect, test } from "bun:test";
import { sanitizeFileName } from "./validation";

describe("sanitizeFileName (mirrors Rust rename_recording — desktop-B14)", () => {
  test("spaces and punctuation become single dashes", () => {
    expect(sanitizeFileName("Mi Charla")).toBe("Mi-Charla");
    expect(sanitizeFileName("reunion: equipo!")).toBe("reunion-equipo");
  });

  test("consecutive separators collapse to one dash", () => {
    expect(sanitizeFileName("a   b")).toBe("a-b");
    expect(sanitizeFileName("a---b")).toBe("a-b");
  });

  test("leading and trailing dashes are trimmed", () => {
    expect(sanitizeFileName("  hola  ")).toBe("hola");
    expect(sanitizeFileName("--x--")).toBe("x");
  });

  test("keeps unicode letters/numbers, dashes and underscores", () => {
    expect(sanitizeFileName("ñoño_áéíóú-2026")).toBe("ñoño_áéíóú-2026");
  });

  test("a name that is only separators sanitizes to empty", () => {
    expect(sanitizeFileName("¿?!")).toBe("");
  });
});
