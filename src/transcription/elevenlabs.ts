import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api";
import { basename } from "path";
import type { TranscriptionResult, TranscriptionSegment } from "./types.ts";

export interface ElevenLabsTranscribeOptions {
  apiKey: string;
  filePath: string;
  language?: string;
  timestamps?: boolean;
}

interface WordEntry {
  text: string;
  start?: number;
  end?: number;
  type: string;
}

/**
 * Groups word-level timestamps into sentence-like segments.
 * Splits on sentence-ending punctuation or every ~20 words.
 */
function wordsToSegments(words: WordEntry[]): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  let buffer: WordEntry[] = [];
  let wordCount = 0;

  for (const word of words) {
    buffer.push(word);
    if (word.type === "word") wordCount++;

    const endsWithPunctuation =
      word.type === "word" && /[.!?]$/.test(word.text.trim());

    if (endsWithPunctuation || wordCount >= 20) {
      const actualWords = buffer.filter(
        (w) => w.type === "word" && w.start != null && w.end != null
      );
      if (actualWords.length > 0) {
        segments.push({
          start: actualWords[0]!.start!,
          end: actualWords.at(-1)!.end!,
          text: buffer.map((w) => w.text).join("").trim(),
        });
      }
      buffer = [];
      wordCount = 0;
    }
  }

  // Remaining words
  if (buffer.length > 0) {
    const actualWords = buffer.filter(
      (w) => w.type === "word" && w.start != null && w.end != null
    );
    if (actualWords.length > 0) {
      segments.push({
        start: actualWords[0]!.start!,
        end: actualWords.at(-1)!.end!,
        text: buffer.map((w) => w.text).join("").trim(),
      });
    }
  }

  return segments;
}

export async function transcribeAudio(
  options: ElevenLabsTranscribeOptions
): Promise<TranscriptionResult> {
  const { apiKey, filePath, language, timestamps } = options;

  const client = new ElevenLabsClient({ apiKey });
  const bunFile = Bun.file(filePath);
  const buffer = await bunFile.arrayBuffer();
  const file = new File([buffer], basename(filePath));

  let response: SpeechToTextChunkResponseModel;
  try {
    response = (await client.speechToText.convert({
      modelId: "scribe_v2",
      file,
      languageCode: language,
      timestampsGranularity: timestamps ? "word" : "none",
      tagAudioEvents: false,
    })) as SpeechToTextChunkResponseModel;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("401") ||
        error.message.includes("Unauthorized") ||
        error.message.includes("invalid_api_key") ||
        error.message.includes("authentication"))
    ) {
      throw new Error(
        "La API key de ElevenLabs es inválida o expiró.\n" +
          "Verifica tu clave en: https://elevenlabs.io/app/settings/api-keys\n" +
          "Para configurar una nueva clave, ejecuta: trans config --set-key --provider elevenlabs"
      );
    }
    throw error;
  }

  const words = (response.words ?? []) as WordEntry[];
  const lastWord = words.filter((w) => w.type === "word" && w.end != null).at(-1);
  const duration = lastWord?.end;

  return {
    text: response.text,
    segments: timestamps ? wordsToSegments(words) : undefined,
    language: response.languageCode,
    duration,
  };
}
