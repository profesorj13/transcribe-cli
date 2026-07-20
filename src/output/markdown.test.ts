import { describe, expect, test, afterAll } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { rmSync } from "node:fs";
import { getOutputPath } from "./markdown.ts";

// Unique, non-existent base dir so findAvailableMdPath returns paths unchanged.
const base = join(tmpdir(), `md-test-${randomUUID()}`);

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("getOutputPath (local files)", () => {
  test("absolute path -> .md next to the audio (cli-B01/desktop-NUEVO-02)", () => {
    expect(getOutputPath(join(base, "voz.mp3"))).toBe(join(base, "voz.md"));
  });

  test("absolute path with spaces -> .md next to the audio", () => {
    expect(getOutputPath(join(base, "mi audio nandu.mp3"))).toBe(
      join(base, "mi audio nandu.md")
    );
  });

  test("nested absolute path is not truncated", () => {
    const deep = join(base, "a", "b", "c", "entrevista.wav");
    expect(getOutputPath(deep)).toBe(join(base, "a", "b", "c", "entrevista.md"));
  });

  test("file without extension appends .md", () => {
    expect(getOutputPath(join(base, "audio"))).toBe(join(base, "audio.md"));
  });
});

describe("getOutputPath (outputDir / remote)", () => {
  test("outputDir keeps the auto filename", () => {
    const dir = join(base, "out");
    expect(getOutputPath(join(base, "voz.mp3"), undefined, false, dir)).toBe(
      join(dir, "voz.md")
    );
  });

  test("remote (cwdFallback) writes in cwd", () => {
    expect(getOutputPath(join(base, "voz.mp3"), undefined, true)).toBe(
      join(process.cwd(), "voz.md")
    );
  });
});

describe("getOutputPath (--output, cli-B06)", () => {
  test("explicit --output never overwrites an existing file", async () => {
    const existing = join(base, "report.md");
    await Bun.write(existing, "x");
    // Should not return the existing path; it must increment to avoid data loss.
    expect(getOutputPath(join(base, "voz.mp3"), existing)).toBe(join(base, "report-2.md"));
  });

  test("explicit --output to a free path is respected as-is", () => {
    const free = join(base, "brand-new-name.md");
    expect(getOutputPath(join(base, "voz.mp3"), free)).toBe(free);
  });
});
