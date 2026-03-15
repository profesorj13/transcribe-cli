import OpenAI, { toFile } from "openai";
import { basename } from "path";
import type { AudioChunk } from "../audio/splitter.ts";
import type { TranscriptionSegment, TranscriptionResult } from "./types.ts";

export type { TranscriptionSegment, TranscriptionResult };

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
}

export interface ParallelTranscribeOptions {
  apiKey: string;
  chunks: AudioChunk[];
  language?: string;
  timestamps?: boolean;
  onProgress?: (completed: number, total: number) => void;
}

export async function transcribeChunksParallel(
  options: ParallelTranscribeOptions
): Promise<TranscriptionResult> {
  const { apiKey, chunks, language, timestamps, onProgress } = options;

  let completed = 0;
  const total = chunks.length;

  // Transcribe all chunks in parallel
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await transcribeAudio({
        apiKey,
        filePath: chunk.path,
        language,
        timestamps,
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

  // Sort by chunk index to maintain order
  results.sort((a, b) => a.chunkIndex - b.chunkIndex);

  // Combine results
  const combinedText = results.map((r) => r.text.trim()).join("\n\n");

  // Combine segments with adjusted timestamps
  let combinedSegments: TranscriptionSegment[] | undefined;
  if (timestamps) {
    combinedSegments = [];
    for (const result of results) {
      if (result.segments) {
        for (const seg of result.segments) {
          combinedSegments.push({
            start: seg.start + result.startTimeOffset,
            end: seg.end + result.startTimeOffset,
            text: seg.text,
          });
        }
      }
    }
  }

  // Get total duration from all chunks
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  return {
    text: combinedText,
    segments: combinedSegments,
    language: results[0]?.language,
    duration: totalDuration,
  };
}

export async function translateChunksParallel(
  options: ParallelTranscribeOptions
): Promise<TranscriptionResult> {
  const { apiKey, chunks, timestamps, onProgress } = options;

  let completed = 0;
  const total = chunks.length;

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const result = await translateAudio({
        apiKey,
        filePath: chunk.path,
        timestamps,
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

  results.sort((a, b) => a.chunkIndex - b.chunkIndex);

  const combinedText = results.map((r) => r.text.trim()).join("\n\n");

  let combinedSegments: TranscriptionSegment[] | undefined;
  if (timestamps) {
    combinedSegments = [];
    for (const result of results) {
      if (result.segments) {
        for (const seg of result.segments) {
          combinedSegments.push({
            start: seg.start + result.startTimeOffset,
            end: seg.end + result.startTimeOffset,
            text: seg.text,
          });
        }
      }
    }
  }

  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  return {
    text: combinedText,
    segments: combinedSegments,
    language: results[0]?.language,
    duration: totalDuration,
  };
}
