import { describe, expect, test, afterAll } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { rmSync } from "node:fs";
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
