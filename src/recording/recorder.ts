import { spawn } from "bun";
import { resolve } from "path";
import { existsSync } from "node:fs";

export interface RecordOptions {
  name?: string;
}

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", cmd], { stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s-]/gi, "")
    .replace(/\s+/g, "-")
    .substring(0, 100);
}

function findAvailablePath(dir: string, baseName: string, timestamp: string, ext: string): string {
  const first = resolve(dir, `${baseName}-${timestamp}${ext}`);
  if (!existsSync(first)) return first;

  let i = 2;
  while (true) {
    const candidate = resolve(dir, `${baseName}-${timestamp}-${i}${ext}`);
    if (!existsSync(candidate)) return candidate;
    i++;
  }
}

export async function record(options: RecordOptions = {}): Promise<string> {
  const timestamp = new Date().toISOString().slice(0, 10);
  const baseName = options.name ? sanitizeFilename(options.name) : "recording";
  const outputPath = findAvailablePath(process.cwd(), baseName, timestamp, ".wav");
  const filename = outputPath.split("/").pop()!;

  const hasSox = await checkCommand("sox");
  const hasFFmpeg = await checkCommand("ffmpeg");

  if (!hasSox && !hasFFmpeg) {
    throw new Error(
      "No recording tool found. Install sox or ffmpeg:\n" +
        "  brew install sox\n" +
        "  brew install ffmpeg"
    );
  }

  console.log(`\nRecording: ${filename}`);
  console.log("Press ENTER to stop recording...\n");

  // Start recording process
  let proc: ReturnType<typeof spawn>;

  if (hasSox) {
    proc = spawn(["sox", "-d", outputPath], {
      stdout: "ignore",
      stderr: "ignore",
    });
  } else {
    proc = spawn(
      ["ffmpeg", "-f", "avfoundation", "-i", ":1", "-y", outputPath],
      {
        stdout: "ignore",
        stderr: "ignore",
      }
    );
  }

  // Wait for ENTER key
  await waitForEnter();

  // Stop recording
  proc.kill("SIGINT");
  await proc.exited;

  console.log(`\nRecording saved: ${outputPath}`);
  return outputPath;
}

async function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    // Enable raw mode to capture single keypress
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onData = (data: Buffer) => {
      const key = data.toString();
      // Enter key (carriage return or newline)
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve();
      }
      // Also allow 'q' or Escape as alternatives
      if (key === "q" || key === "\x1b") {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    process.stdin.on("data", onData);
  });
}

export async function askYesNo(question: string): Promise<boolean> {
  process.stdout.write(`${question} (y/n): `);

  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase();
      if (key === "y" || key === "s") {
        cleanup();
        console.log("yes");
        resolve(true);
      } else if (key === "n" || key === "\r" || key === "\n") {
        cleanup();
        console.log("no");
        resolve(false);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    };

    process.stdin.on("data", onData);
  });
}
