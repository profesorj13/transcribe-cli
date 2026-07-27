import { tmpdir } from "os";
import { join, basename, extname } from "path";
import { randomUUID } from "crypto";
import { mkdir, rm } from "node:fs/promises";

// Bun's $ shell corrompe argumentos interpolados cuando el string tiene
// representación interna latin1 y contiene caracteres no-ASCII (ej.
// "Inclusión.wav"): el proceso hijo recibe un path mutilado. El bug existe
// al menos hasta bun 1.3.14, así que ffmpeg/ffprobe se ejecutan vía
// Bun.spawn con argv en array — sin shell, los paths llegan byte-exactos.
async function run(
  cmd: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = (() => {
    try {
      return Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    } catch {
      throw new Error(
        `No se pudo ejecutar ${cmd[0]}. Verificá que esté instalado (brew install ffmpeg).`,
      );
    }
  })();
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// Última(s) línea(s) útiles del stderr de ffmpeg para armar errores legibles.
function stderrTail(stderr: string): string {
  return stderr.trim().split("\n").slice(-2).join(" ").trim();
}

const CHUNK_DURATION_SECONDS = 5 * 60; // 5 minutes
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB Whisper API limit

export interface AudioChunk {
  path: string;
  startTime: number;
  index: number;
  overlapStart?: number; // seconds of overlap at the beginning of this chunk
}

export interface SplitResult {
  chunks: AudioChunk[];
  totalDuration: number;
  cleanup: () => Promise<void>;
}

export async function getAudioDuration(filePath: string): Promise<number> {
  const probe = await run([
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  if (probe.exitCode !== 0) {
    const stderr = probe.stderr.trim();
    throw new Error(
      `No se pudo leer el audio "${filePath}"${stderr ? `: ${stderr}` : ""}. ` +
        "El archivo puede estar corrupto o no ser un archivo de audio válido."
    );
  }

  const raw = probe.stdout.trim();
  const duration = parseFloat(raw);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      `No se pudo determinar la duración del audio "${filePath}" ` +
        `(ffprobe devolvió "${raw || "N/A"}"). El archivo puede estar corrupto o incompleto.`
    );
  }

  return duration;
}

export interface SplitOptions {
  overlapSeconds?: number;  // overlap between consecutive chunks (default 0)
  compress?: boolean;       // compress to mp3 16kHz mono (default true)
}

export async function splitAudio(
  filePath: string,
  options?: SplitOptions,
): Promise<SplitResult> {
  const { overlapSeconds = 0, compress = true } = options ?? {};
  const duration = await getAudioDuration(filePath);
  const tempDir = join(tmpdir(), `trans-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  const chunks: AudioChunk[] = [];
  const numChunks = Math.ceil(duration / CHUNK_DURATION_SECONDS);
  const baseName = basename(filePath, ".wav").replace(/\.[^/.]+$/, "");
  // When compressing we always re-encode to mp3. When copying the stream (-c copy),
  // keep the source container so the extension matches the real codec (e.g. aac in .m4a,
  // mp3 in .mp3) instead of mislabeling everything as .wav.
  const inputExt = extname(filePath).replace(/^\./, "").toLowerCase();
  const ext = compress ? "mp3" : inputExt || "mka";

  if (numChunks <= 1) {
    // No split needed, but compress if file exceeds API size limit
    if (compress) {
      const fileSize = Bun.file(filePath).size;
      if (fileSize > MAX_FILE_SIZE_BYTES) {
        console.log(`File size (${(fileSize / 1024 / 1024).toFixed(1)}MB) exceeds 25MB limit, compressing...`);
        const compressedPath = join(tempDir, `${baseName}-compressed.mp3`);
        const comp = await run([
          "ffmpeg", "-i", filePath, "-ac", "1", "-ar", "16000", "-y", compressedPath,
        ]);
        if (comp.exitCode !== 0) {
          throw new Error(
            `No se pudo comprimir el audio "${filePath}": ${stderrTail(comp.stderr)}`,
          );
        }
        console.log(`Compressed to ${(Bun.file(compressedPath).size / 1024 / 1024).toFixed(1)}MB\n`);
        return {
          chunks: [{ path: compressedPath, startTime: 0, index: 0 }],
          totalDuration: duration,
          cleanup: async () => { await rm(tempDir, { recursive: true, force: true }); },
        };
      }
    }
    return {
      chunks: [{ path: filePath, startTime: 0, index: 0 }],
      totalDuration: duration,
      cleanup: async () => {},
    };
  }

  console.log(
    `Audio duration: ${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s`
  );
  console.log(`Splitting into ${numChunks} chunks of 5 minutes each...`);

  // Split audio using ffmpeg
  for (let i = 0; i < numChunks; i++) {
    const overlap = i > 0 ? overlapSeconds : 0;
    const startTime = i * CHUNK_DURATION_SECONDS - overlap;
    const chunkDuration = CHUNK_DURATION_SECONDS + overlap;
    const chunkPath = join(tempDir, `${baseName}-chunk-${i.toString().padStart(3, "0")}.${ext}`);

    const chunkArgs = compress
      ? ["ffmpeg", "-i", filePath, "-ss", String(startTime), "-t", String(chunkDuration), "-ar", "16000", "-ac", "1", "-y", chunkPath]
      : ["ffmpeg", "-i", filePath, "-ss", String(startTime), "-t", String(chunkDuration), "-c", "copy", "-y", chunkPath];
    const cut = await run(chunkArgs);
    if (cut.exitCode !== 0) {
      throw new Error(
        `No se pudo cortar el fragmento ${i + 1}/${numChunks} de "${filePath}": ${stderrTail(cut.stderr)}`,
      );
    }

    chunks.push({
      path: chunkPath,
      startTime,
      index: i,
      overlapStart: overlap,
    });
  }

  console.log(`Created ${chunks.length} chunks\n`);

  return {
    chunks,
    totalDuration: duration,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
