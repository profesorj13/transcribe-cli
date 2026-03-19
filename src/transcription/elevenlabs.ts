import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api";
import { basename } from "path";
import type { TranscriptionResult, TranscriptionSegment } from "./types.ts";

export interface ElevenLabsTranscribeOptions {
  apiKey: string;
  filePath: string;
  language?: string;
  timestamps?: boolean;
  diarize?: boolean;
  numSpeakers?: number;
}

interface WordEntry {
  text: string;
  start?: number;
  end?: number;
  type: string;
  speakerId?: string;
}

/**
 * Groups word-level timestamps into sentence-like segments.
 * Splits on sentence-ending punctuation, every ~20 words,
 * or on speaker change when diarize is enabled.
 */
function wordsToSegments(words: WordEntry[], diarize?: boolean): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  let buffer: WordEntry[] = [];
  let wordCount = 0;
  let currentSpeaker: string | undefined;

  const flushBuffer = () => {
    const actualWords = buffer.filter(
      (w) => w.type === "word" && w.start != null && w.end != null
    );
    if (actualWords.length > 0) {
      segments.push({
        start: actualWords[0]!.start!,
        end: actualWords.at(-1)!.end!,
        text: buffer.map((w) => w.text).join("").trim(),
        speakerId: diarize ? currentSpeaker : undefined,
      });
    }
    buffer = [];
    wordCount = 0;
  };

  for (const word of words) {
    // Split on speaker change
    if (diarize && word.type === "word" && word.speakerId !== currentSpeaker && buffer.length > 0) {
      flushBuffer();
    }

    buffer.push(word);
    if (word.type === "word") {
      wordCount++;
      if (diarize && word.speakerId) {
        currentSpeaker = word.speakerId;
      }
    }

    const endsWithPunctuation =
      word.type === "word" && /[.!?]$/.test(word.text.trim());

    if (endsWithPunctuation || wordCount >= 20) {
      flushBuffer();
    }
  }

  // Remaining words
  if (buffer.length > 0) {
    flushBuffer();
  }

  return segments;
}

export async function transcribeAudio(
  options: ElevenLabsTranscribeOptions
): Promise<TranscriptionResult> {
  const { apiKey, filePath, language, timestamps, diarize, numSpeakers } = options;

  const client = new ElevenLabsClient({ apiKey });
  const bunFile = Bun.file(filePath);
  const buffer = await bunFile.arrayBuffer();
  const file = new File([buffer], basename(filePath));

  // Diarization requires word-level timestamps
  const needTimestamps = timestamps || diarize;

  let response: SpeechToTextChunkResponseModel;
  try {
    response = (await client.speechToText.convert({
      modelId: "scribe_v2",
      file,
      languageCode: language,
      timestampsGranularity: needTimestamps ? "word" : "none",
      tagAudioEvents: false,
      diarize: diarize || undefined,
      ...(diarize && numSpeakers && numSpeakers > 0 ? { numSpeakers } : {}),
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
    segments: needTimestamps ? wordsToSegments(words, diarize) : undefined,
    language: response.languageCode,
    duration,
  };
}
