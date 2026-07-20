import OpenAI, { toFile } from "openai";
import { basename } from "path";
import type { AudioChunk } from "../audio/splitter.ts";
import type { TranscriptionSegment, TranscriptionResult } from "./types.ts";

export type { TranscriptionSegment, TranscriptionResult };

function handleOpenAIError(error: unknown): never {
  if (error instanceof Error && "status" in error && (error as { status: number }).status === 401) {
    throw new Error(
      "La API key de OpenAI es inválida o expiró.\n" +
        "Verifica tu clave en: https://platform.openai.com/api-keys\n" +
        "Para configurar una nueva clave, ejecuta: trans config --set-key --provider whisper"
    );
  }
  throw error;
}

export interface TranscribeOptions {
  apiKey: string;
  filePath: string;
  language?: string;
  timestamps?: boolean;
}

export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResult> {
  const { apiKey, filePath, language, timestamps } = options;

  const openai = new OpenAI({ apiKey });
  const bunFile = Bun.file(filePath);
  const buffer = await bunFile.arrayBuffer();
  const file = await toFile(buffer, basename(filePath));

  try {
    if (timestamps) {
      // Use verbose_json to get segments with timestamps
      const response = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language,
        response_format: "verbose_json",
      });

      return {
        text: response.text,
        segments: response.segments?.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
        language: response.language,
        duration: response.duration,
      };
    }

    // Simple text response
    const response = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language,
      response_format: "text",
    });

    return {
      text: response,
    };
  } catch (error) {
    handleOpenAIError(error);
  }
}

// Whisper translations API returns the same shape as verbose_json transcription
// but the SDK types don't reflect it — we cast accordingly.
interface VerboseTranslation {
  text: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  language?: string;
  duration?: number;
}

export async function translateAudio(
  options: TranscribeOptions
): Promise<TranscriptionResult> {
  const { apiKey, filePath, timestamps } = options;

  const openai = new OpenAI({ apiKey });
  const bunFile = Bun.file(filePath);
  const buffer = await bunFile.arrayBuffer();
  const file = await toFile(buffer, basename(filePath));

  try {
    if (timestamps) {
      const response = (await openai.audio.translations.create({
        file,
        model: "whisper-1",
        response_format: "verbose_json",
      })) as unknown as VerboseTranslation;

      return {
        text: response.text,
        segments: response.segments?.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
        language: response.language,
        duration: response.duration,
      };
    }

    const response = (await openai.audio.translations.create({
      file,
      model: "whisper-1",
      response_format: "text",
    })) as unknown as string;

    return {
      text: response,
    };
  } catch (error) {
    handleOpenAIError(error);
  }
}

export interface ParallelTranscribeOptions {
  apiKey: string;
  chunks: AudioChunk[];
  language?: string;
  timestamps?: boolean;
  overlapSeconds?: number;
  onProgress?: (completed: number, total: number) => void;
}

export interface ChunkTranscription extends TranscriptionResult {
  chunkIndex: number;
  startTimeOffset: number;
}

// Combina resultados de chunks. Con overlapSeconds > 0 los chunks se solapan y
// cada segmento se asigna por su punto medio absoluto: el corte cae al medio del
// solape, donde ambos chunks escucharon el audio con contexto completo — así no
// se pierden ni duplican palabras en los límites. Requiere segments en todos los
// chunks; si faltan (o no hay solape), concatena como siempre.
export function mergeChunkResults(
  results: ChunkTranscription[],
  opts: { timestamps?: boolean; overlapSeconds?: number }
): TranscriptionResult {
  const { timestamps, overlapSeconds = 0 } = opts;
  const sorted = [...results].sort((a, b) => a.chunkIndex - b.chunkIndex);

  const canDedup =
    overlapSeconds > 0 &&
    sorted.length > 1 &&
    sorted.every((r) => r.segments && r.segments.length > 0);

  const keptPerChunk: TranscriptionSegment[][] = sorted.map((r, i) => {
    let segments = r.segments ?? [];
    if (canDedup) {
      const low = i === 0 ? -Infinity : sorted[i]!.startTimeOffset + overlapSeconds / 2;
      const high =
        i === sorted.length - 1
          ? Infinity
          : sorted[i + 1]!.startTimeOffset + overlapSeconds / 2;
      segments = segments.filter((seg) => {
        const mid = r.startTimeOffset + (seg.start + seg.end) / 2;
        return mid >= low && mid < high;
      });
    }
    return segments.map((seg) => ({
      start: seg.start + r.startTimeOffset,
      end: seg.end + r.startTimeOffset,
      text: seg.text,
    }));
  });

  const combinedText = canDedup
    ? keptPerChunk
        .map((segs) => segs.map((s) => s.text.trim()).join(" ").trim())
        .filter((t) => t.length > 0)
        .join("\n\n")
    : sorted.map((r) => r.text.trim()).join("\n\n");

  const totalDuration = sorted.reduce(
    (sum, r, i) =>
      sum + (r.duration ? r.duration - (i > 0 ? overlapSeconds : 0) : 0),
    0
  );

  return {
    text: combinedText,
    segments: timestamps ? keptPerChunk.flat() : undefined,
    language: sorted[0]?.language,
    duration: totalDuration,
  };
}

export async function transcribeChunksParallel(
  options: ParallelTranscribeOptions
): Promise<TranscriptionResult> {
  const { apiKey, chunks, language, timestamps, overlapSeconds = 0, onProgress } = options;

  let completed = 0;
  const total = chunks.length;

  // Transcribe all chunks in parallel. Con solape pedimos segments siempre:
  // mergeChunkResults los necesita para recortar en los límites.
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await transcribeAudio({
        apiKey,
        filePath: chunk.path,
        language,
        timestamps: timestamps || overlapSeconds > 0,
      });

      completed++;
      onProgress?.(completed, total);

      return {
        ...result,
        chunkIndex: chunk.index,
        startTimeOffset: chunk.startTime,
      };
    })
  );

  return mergeChunkResults(results, { timestamps, overlapSeconds });
}

export async function translateChunksParallel(
  options: ParallelTranscribeOptions
): Promise<TranscriptionResult> {
  const { apiKey, chunks, timestamps, overlapSeconds = 0, onProgress } = options;

  let completed = 0;
  const total = chunks.length;

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await translateAudio({
        apiKey,
        filePath: chunk.path,
        timestamps: timestamps || overlapSeconds > 0,
      });

      completed++;
      onProgress?.(completed, total);

      return {
        ...result,
        chunkIndex: chunk.index,
        startTimeOffset: chunk.startTime,
      };
    })
  );

  return mergeChunkResults(results, { timestamps, overlapSeconds });
}
