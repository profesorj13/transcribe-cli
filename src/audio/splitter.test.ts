import { describe, expect, test, afterAll } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { getAudioDuration } from "./splitter.ts";

const dir = join(tmpdir(), `splitter-test-${randomUUID()}`);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("getAudioDuration (cli-B03/cli-B04)", () => {
  test("corrupt / non-audio content throws a clear Spanish error, not 'exit code 1'", async () => {
    const fake = join(dir, "fake.mp3");
    await Bun.write(fake, "no soy audio");

    let message = "";
    try {
      await getAudioDuration(fake);
      throw new Error("expected getAudioDuration to throw");
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }

    expect(message).not.toMatch(/exit code/i);
    expect(message).toMatch(/audio/i);
    expect(message).toContain(fake);
  });

  test("missing file throws a clear error", async () => {
    const missing = join(dir, "does-not-exist.mp3");
    await expect(getAudioDuration(missing)).rejects.toThrow(/audio/i);
  });
});

const accentDir = `/tmp/splitter-accents-${randomUUID()}`;

afterAll(() => {
  rmSync(accentDir, { recursive: true, force: true });
});

describe("paths con acentos (bug del shell $ de bun)", () => {
  // El bug: el shell `$` de Bun corrompe los argumentos interpolados que traen
  // caracteres no-ASCII. ffprobe recibía "/…/pedagog/…/pedagogía.wav" y salía con
  // exit code 234, que la app mostraba como "Failed with exit code 234" al
  // transcribir cualquier grabación con tilde en el nombre. Vivo hasta bun 1.3.14.
  //
  // No se puede testear end-to-end: que la corrupción se dispare depende del path
  // exacto de forma errática (con "/tmp/pedagogía.wav" falla, con
  // "/tmp/<uuid>/pedagogía.wav" no), así que un test así pasaría incluso con el
  // código roto. El guard-rail de abajo sí es determinista.
  test("splitter no invoca ffmpeg/ffprobe a través del shell de bun", async () => {
    const source = await Bun.file(new URL("./splitter.ts", import.meta.url)).text();
    const shellCalls = source.match(/\$`[^`]*(ffmpeg|ffprobe)[^`]*`/g) ?? [];

    expect(shellCalls).toEqual([]);
  });

  test("getAudioDuration lee un archivo con tilde en el nombre", async () => {
    await mkdir(accentDir, { recursive: true });
    const acentuado = join(accentDir, "pedagogía.wav");

    const gen = Bun.spawn(
      ["ffmpeg", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-y", acentuado],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(await gen.exited).toBe(0);

    expect(await getAudioDuration(acentuado)).toBeCloseTo(2, 0);
  });
});
