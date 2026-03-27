import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api";
import { basename } from "path";
import type { TranscriptionResult, TranscriptionSegment } from "./types.ts";
import type { AudioChunk } from "../audio/splitter.ts";

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

interface ElevenLabsResult extends TranscriptionResult {
  words: WordEntry[];
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
): Promise<ElevenLabsResult> {
  const { apiKey, filePath, language, timestamps, diarize, numSpeakers } = options;

  const client = new ElevenLabsClient({ apiKey, timeoutInSeconds: 600 });
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
    words,
    segments: needTimestamps ? wordsToSegments(words, diarize) : undefined,
    language: response.languageCode,
    duration,
  };
}

// --- Parallel chunk processing with speaker reconciliation ---

export interface ElevenLabsParallelOptions {
  apiKey: string;
  chunks: AudioChunk[];
  language?: string;
  timestamps?: boolean;
  diarize?: boolean;
  numSpeakers?: number;
  overlapSeconds: number;
  onProgress?: (completed: number, total: number) => void;
}

interface ChunkResult {
  chunkIndex: number;
  startTimeOffset: number;
  overlapSeconds: number;
  words: WordEntry[];
  text: string;
  language?: string;
}

/**
 * Computes Jaccard similarity between two arrays of word tokens.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Tokenizes text into lowercase words stripped of punctuation.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
}

/**
 * Reconciles speaker IDs across consecutive chunks using overlap regions.
 * Returns a map: chunkIndex -> (localSpeakerId -> globalSpeakerId)
 */
function reconcileSpeakers(
  results: ChunkResult[],
): Map<number, Map<string, string>> {
  const mappings = new Map<number, Map<string, string>>();

  // Chunk 0 is canonical — its speaker IDs are global
  const chunk0Speakers = new Set<string>();
  for (const w of results[0]!.words) {
    if (w.speakerId) chunk0Speakers.add(w.speakerId);
  }
  const identityMap = new Map<string, string>();
  for (const id of chunk0Speakers) identityMap.set(id, id);
  mappings.set(0, identityMap);

  // Track all global speaker IDs assigned so far
  const globalSpeakers = new Set(chunk0Speakers);
  let nextNewSpeakerIndex = globalSpeakers.size;

  for (let i = 1; i < results.length; i++) {
    const prev = results[i - 1]!;
    const curr = results[i]!;
    const prevMapping = mappings.get(i - 1)!;
    const currMapping = new Map<string, string>();

    // Extract words in the overlap region from previous chunk (end of chunk)
    const prevDuration = prev.words
      .filter((w) => w.type === "word" && w.end != null)
      .at(-1)?.end ?? 0;
    const overlapStartInPrev = prevDuration - curr.overlapSeconds;

    const prevOverlapWords = prev.words.filter(
      (w) => w.type === "word" && w.start != null && w.start >= overlapStartInPrev
    );

    // Extract words in the overlap region from current chunk (start of chunk)
    const currOverlapWords = curr.words.filter(
      (w) => w.type === "word" && w.start != null && w.start < curr.overlapSeconds
    );

    // Group text by speaker in each overlap region
    const prevSpeakerTexts = new Map<string, string[]>();
    for (const w of prevOverlapWords) {
      if (!w.speakerId) continue;
      const globalId = prevMapping.get(w.speakerId) ?? w.speakerId;
      if (!prevSpeakerTexts.has(globalId)) prevSpeakerTexts.set(globalId, []);
      prevSpeakerTexts.get(globalId)!.push(w.text);
    }

    const currSpeakerTexts = new Map<string, string[]>();
    for (const w of currOverlapWords) {
      if (!w.speakerId) continue;
      if (!currSpeakerTexts.has(w.speakerId)) currSpeakerTexts.set(w.speakerId, []);
      currSpeakerTexts.get(w.speakerId)!.push(w.text);
    }

    // Match current chunk speakers to global speakers via text similarity
    const matched = new Set<string>(); // global IDs already taken
    const scores: { currId: string; globalId: string; score: number }[] = [];

    for (const [currId, currTexts] of currSpeakerTexts) {
      const currTokens = tokenize(currTexts.join(" "));
      if (currTokens.length < 2) continue; // not enough signal

      for (const [globalId, prevTexts] of prevSpeakerTexts) {
        const prevTokens = tokenize(prevTexts.join(" "));
        if (prevTokens.length < 2) continue;
        scores.push({ currId, globalId, score: jaccardSimilarity(currTokens, prevTokens) });
      }
    }

    // Greedy assignment: highest score first
    scores.sort((a, b) => b.score - a.score);
    const assignedCurr = new Set<string>();

    for (const { currId, globalId, score } of scores) {
      if (assignedCurr.has(currId) || matched.has(globalId)) continue;
      if (score < 0.1) continue; // minimum threshold
      currMapping.set(currId, globalId);
      assignedCurr.add(currId);
      matched.add(globalId);
    }

    // Assign new global IDs for unmatched speakers in current chunk
    const allCurrSpeakers = new Set<string>();
    for (const w of curr.words) {
      if (w.speakerId) allCurrSpeakers.add(w.speakerId);
    }

    for (const currId of allCurrSpeakers) {
      if (!currMapping.has(currId)) {
        const newGlobalId = `speaker_${nextNewSpeakerIndex++}`;
        currMapping.set(currId, newGlobalId);
        globalSpeakers.add(newGlobalId);
      }
    }

    mappings.set(i, currMapping);
  }

  return mappings;
}

export async function transcribeChunksParallel(
  options: ElevenLabsParallelOptions,
): Promise<TranscriptionResult> {
  const {
    apiKey, chunks, language, timestamps, diarize, numSpeakers,
    overlapSeconds, onProgress,
  } = options;

  const total = chunks.length;
  let completed = 0;

  // Transcribe all chunks in parallel
  const chunkResults = await Promise.all(
    chunks.map(async (chunk): Promise<ChunkResult> => {
      const res = await transcribeAudio({
        apiKey,
        filePath: chunk.path,
        language,
        timestamps: true, // always need word-level for merging
        diarize,
        numSpeakers,
      });

      completed++;
      onProgress?.(completed, total);

      return {
        chunkIndex: chunk.index,
        startTimeOffset: chunk.startTime,
        overlapSeconds: chunk.overlapStart ?? 0,
        words: res.words,
        text: res.text,
        language: res.language,
      };
    }),
  );

  // Sort by chunk index
  chunkResults.sort((a, b) => a.chunkIndex - b.chunkIndex);

  // Reconcile speaker IDs across chunks if diarization is enabled
  const speakerMappings = diarize && overlapSeconds > 0
    ? reconcileSpeakers(chunkResults)
    : undefined;

  // Merge words from all chunks, discarding overlap regions in chunks N>0
  const mergedWords: WordEntry[] = [];

  for (const chunk of chunkResults) {
    const isFirstChunk = chunk.chunkIndex === 0;
    const speakerMap = speakerMappings?.get(chunk.chunkIndex);

    for (const word of chunk.words) {
      // Skip overlap words in non-first chunks
      if (!isFirstChunk && word.start != null && word.start < chunk.overlapSeconds) {
        continue;
      }

      // Adjust timestamps to absolute time
      const adjustedWord: WordEntry = {
        ...word,
        start: word.start != null ? word.start + chunk.startTimeOffset : undefined,
        end: word.end != null ? word.end + chunk.startTimeOffset : undefined,
      };

      // Remap speaker ID
      if (diarize && speakerMap && adjustedWord.speakerId) {
        adjustedWord.speakerId = speakerMap.get(adjustedWord.speakerId) ?? adjustedWord.speakerId;
      }

      mergedWords.push(adjustedWord);
    }
  }

  // Build combined text (from non-overlap words)
  const combinedText = chunkResults
    .map((chunk, i) => {
      if (i === 0) return chunk.text;
      // Reconstruct text from non-overlap words
      const nonOverlapWords = chunk.words.filter(
        (w) => w.start == null || w.start >= chunk.overlapSeconds
      );
      return nonOverlapWords.map((w) => w.text).join("").trim();
    })
    .filter(Boolean)
    .join("\n\n");

  // Build segments
  const needTimestamps = timestamps || diarize;
  const segments = needTimestamps ? wordsToSegments(mergedWords, diarize) : undefined;

  // Compute total duration from last word
  const lastWord = mergedWords.filter((w) => w.type === "word" && w.end != null).at(-1);
  const duration = lastWord?.end;

  return {
    text: combinedText,
    segments,
    language: chunkResults[0]?.language,
    duration,
  };
}
