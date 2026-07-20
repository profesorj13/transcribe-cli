import { describe, expect, test } from "bun:test";
import { mergeChunkResults, type ChunkTranscription } from "./whisper.ts";

// Escenario: chunks de 300s con solape de 30s. El chunk 1 arranca en t=270 y
// re-escucha los últimos 30s del chunk 0; el corte de asignación cae en t=285.
const OVERLAP = 30;

function chunk(
  chunkIndex: number,
  startTimeOffset: number,
  segments: Array<{ start: number; end: number; text: string }>,
  duration: number
): ChunkTranscription {
  return {
    text: segments.map((s) => s.text).join(" "),
    segments,
    language: "es",
    duration,
    chunkIndex,
    startTimeOffset,
  };
}

describe("mergeChunkResults", () => {
  test("con solape: asigna cada segmento por punto medio, sin perder ni duplicar", () => {
    const results = [
      chunk(
        0,
        0,
        [
          { start: 0, end: 10, text: "hola" },
          { start: 278, end: 284, text: "frase-límite" }, // mid abs 281 < 285 → chunk 0
        ],
        300
      ),
      chunk(
        1,
        270,
        [
          { start: 8, end: 14, text: "frase-límite" }, // mid abs 281 < 285 → descartado (dup)
          { start: 20, end: 30, text: "sigue" }, // mid abs 295 ≥ 285 → chunk 1
        ],
        330
      ),
    ];

    const merged = mergeChunkResults(results, {
      timestamps: true,
      overlapSeconds: OVERLAP,
    });

    expect(merged.text).toBe("hola frase-límite\n\nsigue");
    expect(merged.segments).toEqual([
      { start: 0, end: 10, text: "hola" },
      { start: 278, end: 284, text: "frase-límite" },
      { start: 290, end: 300, text: "sigue" },
    ]);
    // el solape se cuenta una sola vez
    expect(merged.duration).toBe(300 + 330 - OVERLAP);
    expect(merged.language).toBe("es");
  });

  test("ordena por chunkIndex aunque lleguen desordenados", () => {
    const results = [
      chunk(1, 270, [{ start: 20, end: 30, text: "segundo" }], 330),
      chunk(0, 0, [{ start: 0, end: 10, text: "primero" }], 300),
    ];

    const merged = mergeChunkResults(results, { overlapSeconds: OVERLAP });
    expect(merged.text).toBe("primero\n\nsegundo");
  });

  test("sin timestamps pedidos no expone segments pero sí deduplica el texto", () => {
    const results = [
      chunk(0, 0, [{ start: 280, end: 284, text: "dup" }], 300),
      chunk(
        1,
        270,
        [
          { start: 10, end: 14, text: "dup" },
          { start: 25, end: 29, text: "único" },
        ],
        330
      ),
    ];

    const merged = mergeChunkResults(results, { overlapSeconds: OVERLAP });
    expect(merged.segments).toBeUndefined();
    expect(merged.text).toBe("dup\n\núnico");
  });

  test("sin solape conserva el comportamiento histórico (join de textos)", () => {
    const results = [
      chunk(0, 0, [{ start: 0, end: 10, text: "a" }], 300),
      chunk(1, 300, [{ start: 5, end: 15, text: "b" }], 300),
    ];

    const merged = mergeChunkResults(results, { timestamps: true });
    expect(merged.text).toBe("a\n\nb");
    expect(merged.segments).toEqual([
      { start: 0, end: 10, text: "a" },
      { start: 305, end: 315, text: "b" },
    ]);
    expect(merged.duration).toBe(600);
  });

  test("si un chunk viene sin segments, no intenta deduplicar", () => {
    const results: ChunkTranscription[] = [
      chunk(0, 0, [{ start: 0, end: 10, text: "a" }], 300),
      {
        text: "b",
        chunkIndex: 1,
        startTimeOffset: 270,
      },
    ];

    const merged = mergeChunkResults(results, { overlapSeconds: OVERLAP });
    expect(merged.text).toBe("a\n\nb");
  });
});
