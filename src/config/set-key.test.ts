import { describe, expect, test, afterAll } from "bun:test";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { rmSync } from "node:fs";

// Runs the real CLI with an isolated HOME so `config --set-key` can't touch the user's config.
const BIN = resolve(import.meta.dir, "../../bin/trans.ts");
const homes: string[] = [];

afterAll(() => {
  for (const h of homes) rmSync(h, { recursive: true, force: true });
});

async function runSetKey(providerArgs: string[], key: string) {
  const home = join(tmpdir(), `setkey-test-${randomUUID()}`);
  homes.push(home);

  const proc = Bun.spawn(["bun", "run", BIN, "config", "--set-key", ...providerArgs], {
    env: { ...process.env, HOME: home },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(key + "\n");
  await proc.stdin.end();
  await proc.exited;

  const cfgFile = Bun.file(join(home, ".config", "transcribe-cli", "config.json"));
  const config = (await cfgFile.exists()) ? await cfgFile.json() : {};
  return config as { apiKey?: string; elevenlabsApiKey?: string };
}

describe("config --set-key provider routing (cli-B11)", () => {
  test("--provider whisper saves the key under apiKey (not elevenlabsApiKey)", async () => {
    const config = await runSetKey(["--provider", "whisper"], "sk-whisper-test");
    expect(config.apiKey).toBe("sk-whisper-test");
    expect(config.elevenlabsApiKey).toBeUndefined();
  }, 30000);

  test("default provider (none) saves the key under elevenlabsApiKey", async () => {
    const config = await runSetKey([], "el-test-key");
    expect(config.elevenlabsApiKey).toBe("el-test-key");
    expect(config.apiKey).toBeUndefined();
  }, 30000);
});
