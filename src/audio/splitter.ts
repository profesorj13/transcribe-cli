import { $ } from "bun";
import { tmpdir } from "os";
import { join, basename } from "path";
import { randomUUID } from "crypto";

const CHUNK_DURATION_SECONDS = 5 * 60; // 5 minutes
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB Whisper API limit

export interface AudioChunk {
  path: string;
  startTime: number;
  index: number;
}

export interface SplitResult {
  chunks: AudioChunk[];
  totalDuration: number;
  cleanup: () => Promise<void>;
}

export async function getAudioDuration(filePath: string): Promise<number> {
  const result =
    await $`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${filePath}`.text();
  return parseFloat(result.trim());
}

export async function splitAudio(filePath: string): Promise<SplitResult> {
  const duration = await getAudioDuration(filePath);
  const tempDir = join(tmpdir(), `trans-${randomUUID()}`);
  await $`mkdir -p ${tempDir}`;

  const chunks: AudioChunk[] = [];
  const numChunks = Math.ceil(duration / CHUNK_DURATION_SECONDS);
  const baseName = basename(filePath, ".wav").replace(/\.[^/.]+$/, "");

  if (numChunks <= 1) {
    // No split needed, but compress if file exceeds API size limit
    const fileSize = Bun.file(filePath).size;
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      console.log(`File size (${(fileSize / 1024 / 1024).toFixed(1)}MB) exceeds 25MB limit, compressing...`);
      const compressedPath = join(tempDir, `${baseName}-compressed.mp3`);
      await $`ffmpeg -i ${filePath} -ac 1 -ar 16000 -y ${compressedPath}`.quiet();
      console.log(`Compressed to ${(Bun.file(compressedPath).size / 1024 / 1024).toFixed(1)}MB\n`);
      return {
        chunks: [{ path: compressedPath, startTime: 0, index: 0 }],
        totalDuration: duration,
        cleanup: async () => { await $`rm -rf ${tempDir}`.quiet(); },
      };
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
    const startTime = i * CHUNK_DURATION_SECONDS;
    const chunkPath = join(tempDir, `${baseName}-chunk-${i.toString().padStart(3, "0")}.mp3`);

    await $`ffmpeg -i ${filePath} -ss ${startTime} -t ${CHUNK_DURATION_SECONDS} -ar 16000 -ac 1 -y ${chunkPath}`.quiet();

    chunks.push({
      path: chunkPath,
      startTime,
      index: i,
    });
  }

  console.log(`Created ${chunks.length} chunks\n`);

  return {
    chunks,
    totalDuration: duration,
    cleanup: async () => {
      await $`rm -rf ${tempDir}`.quiet();
    },
  };
}
