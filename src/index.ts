import { program } from "commander";
import { resolveApiKey, setApiKey } from "./config/api-key.ts";
import { getProvider } from "./providers/index.ts";
import * as whisper from "./transcription/whisper.ts";
import * as elevenlabs from "./transcription/elevenlabs.ts";
import type { TranscriptionProvider } from "./transcription/types.ts";
import { generateMarkdown, getOutputPath } from "./output/markdown.ts";
import { record, askYesNo, askNumber, askText } from "./recording/recorder.ts";
import { splitAudio, getAudioDuration } from "./audio/splitter.ts";

program
  .name("trans")
  .description("CLI tool for audio recording and transcription")
  .version("1.0.0");

interface TranscribeFileOptions {
  filePath: string;
  apiKey?: string;
  output?: string;
  outputDir?: string;
  language?: string;
  timestamps?: boolean;
  translate?: boolean;
  title?: string;
  sourceUrl?: string;
  provider: TranscriptionProvider;
  speakers?: boolean;
  numSpeakers?: number;
}

async function transcribeFile(options: TranscribeFileOptions): Promise<void> {
  const {
    filePath,
    output,
    outputDir,
    language,
    timestamps,
    translate,
    title,
    sourceUrl,
    provider,
    speakers,
    numSpeakers,
  } = options;

  const apiKey = await resolveApiKey(provider, options.apiKey);

  if (translate && provider === "elevenlabs") {
    console.error(
      "Translation is not supported with ElevenLabs. Use --provider whisper for translation."
    );
    process.exit(1);
  }

  if (speakers && provider === "whisper") {
    console.error(
      "Speaker diarization is not supported with Whisper. Use --provider elevenlabs for speaker identification."
    );
    process.exit(1);
  }

  const mode = translate ? "Translating" : "Transcribing";
  console.log(`${mode}: ${title || filePath}`);

  let result;
  let chunksCount: number | undefined;
  let cleanupFn: (() => Promise<void>) | undefined;

  if (provider === "elevenlabs") {
    const ELEVENLABS_CHUNK_THRESHOLD = 5 * 60; // 5 minutes
    const OVERLAP_SECONDS = 30;
    const duration = await getAudioDuration(filePath);

    if (duration > ELEVENLABS_CHUNK_THRESHOLD) {
      const splitResult = await splitAudio(filePath, {
        overlapSeconds: speakers ? OVERLAP_SECONDS : 0,
        compress: false, // ElevenLabs accepts large files, no 25MB limit
      });
      const { chunks, cleanup } = splitResult;
      cleanupFn = cleanup;
      chunksCount = chunks.length;

      console.log(`Processing ${chunks.length} chunks in parallel...`);
      result = await elevenlabs.transcribeChunksParallel({
        apiKey,
        chunks,
        language,
        timestamps,
        diarize: speakers,
        numSpeakers,
        overlapSeconds: speakers ? OVERLAP_SECONDS : 0,
        onProgress: (completed, total) => {
          console.log(`Transcribed chunk ${completed}/${total}`);
        },
      });
    } else {
      // Short file — single API call
      result = await elevenlabs.transcribeAudio({
        apiKey,
        filePath,
        language,
        timestamps,
        diarize: speakers,
        numSpeakers,
      });
    }
  } else {
    // Whisper: split if needed (25MB limit)
    const splitResult = await splitAudio(filePath);
    const { chunks, cleanup } = splitResult;
    cleanupFn = cleanup;

    const audioFn = translate ? whisper.translateAudio : whisper.transcribeAudio;
    const chunksFn = translate
      ? whisper.translateChunksParallel
      : whisper.transcribeChunksParallel;

    if (chunks.length > 1) {
      chunksCount = chunks.length;
      console.log(`Processing ${chunks.length} chunks in parallel...`);
      result = await chunksFn({
        apiKey,
        chunks,
        language,
        timestamps,
        onProgress: (completed, total) => {
          console.log(
            `${translate ? "Translated" : "Transcribed"} chunk ${completed}/${total}`
          );
        },
      });
    } else {
      result = await audioFn({
        apiKey,
        filePath: chunks[0]!.path,
        language,
        timestamps,
      });
    }
  }

  const model = provider === "elevenlabs" ? "scribe_v2" : "whisper-1";

  const markdown = generateMarkdown({
    filePath,
    result,
    includeTimestamps: timestamps,
    chunksCount,
    isTranslation: translate,
    title,
    sourceUrl,
    model,
    hasSpeakers: speakers,
  });

  const isRemote = !!sourceUrl;
  const outputPath = getOutputPath(filePath, output, isRemote, outputDir);
  await Bun.write(outputPath, markdown);
  console.log(
    `\n${translate ? "Translation" : "Transcription"} saved to: ${outputPath}`
  );

  // Post-processing: rename speakers
  if (speakers && result.segments) {
    const speakerIds = [...new Set(result.segments.map(s => s.speakerId).filter(Boolean))] as string[];

    if (speakerIds.length > 0 && process.stdin.isTTY) {
      console.log("");
      const shouldRename = await askYesNo("¿Renombrar hablantes?");

      if (shouldRename) {
        const mapping: Record<string, string> = {};
        for (const id of speakerIds) {
          const name = await askText(`  Nombre para ${id}`);
          if (name) mapping[id] = name;
        }

        if (Object.keys(mapping).length > 0) {
          let content = await Bun.file(outputPath).text();
          for (const [oldId, newName] of Object.entries(mapping)) {
            content = content.replaceAll(`**Hablante ${oldId}:**`, `**Hablante ${newName}:**`);
            content = content.replaceAll(`| ${oldId} |`, `| ${newName} |`);
          }
          await Bun.write(outputPath, content);
          console.log("Hablantes renombrados.");
        }
      }
    }
  }

  if (cleanupFn) await cleanupFn();
}

// Main transcribe command
program
  .argument("[input]", "Audio file or YouTube URL to transcribe")
  .option("-o, --output <path>", "Output file path (default: input.md)")
  .option("--output-dir <dir>", "Output directory (keeps auto-generated filename)")
  .option("--api-key <key>", "API key (ElevenLabs or OpenAI depending on provider)")
  .option("--timestamps", "Include timestamps in output")
  .option("--language <lang>", "Audio language (ISO-639-1 code, e.g., en, es)")
  .option("-t, --translate", "Translate audio to English (whisper only)")
  .option("--speakers", "Identify speakers (elevenlabs only)")
  .option("--num-speakers <n>", "Expected number of speakers (improves accuracy)", parseInt)
  .option(
    "-p, --provider <name>",
    "Transcription provider: elevenlabs or whisper",
    "elevenlabs"
  )
  .action(async (input: string | undefined, options) => {
    if (!input) {
      program.help();
      return;
    }

    const provider = options.provider as TranscriptionProvider;

    try {
      const providerSource = getProvider(input);
      console.log(`Using provider: ${providerSource.name}`);

      const providerOpts = options.language
        ? { language: options.language }
        : undefined;
      const source = await providerSource.getAudioSource(input, providerOpts);

      const isRemote = source.originalInput !== source.filePath;

      // If provider returned subtitles directly (YouTube captions), skip transcription
      if (source.subtitles) {
        const markdown = generateMarkdown({
          filePath: source.filePath,
          result: {
            text: source.subtitles.text,
            language: source.subtitles.language,
          },
          isTranslation: options.translate,
          title: source.metadata?.title,
          sourceUrl: isRemote ? source.originalInput : undefined,
        });

        const outputPath = getOutputPath(
          source.filePath,
          options.output,
          isRemote,
          options.outputDir
        );
        await Bun.write(outputPath, markdown);
        console.log(`Saved to: ${outputPath}`);

        if (source.cleanup) await source.cleanup();
        return;
      }

      await transcribeFile({
        filePath: source.filePath,
        apiKey: options.apiKey,
        output: options.output,
        outputDir: options.outputDir,
        language: options.language,
        timestamps: options.timestamps,
        translate: options.translate,
        speakers: options.speakers,
        numSpeakers: options.numSpeakers,
        title: source.metadata?.title,
        sourceUrl: isRemote ? source.originalInput : undefined,
        provider,
      });

      if (source.cleanup) {
        await source.cleanup();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error("An unexpected error occurred");
      }
      process.exit(1);
    }
  });

// Record command
program
  .command("r [name]")
  .description("Record audio from microphone")
  .option("--timestamps", "Include timestamps in transcription")
  .option("--language <lang>", "Audio language (ISO-639-1 code, e.g., en, es)")
  .option("--speakers", "Identify speakers (elevenlabs only)")
  .option("--num-speakers <n>", "Expected number of speakers (improves accuracy)", parseInt)
  .option(
    "-p, --provider <name>",
    "Transcription provider: elevenlabs or whisper",
    "elevenlabs"
  )
  .action(async (name: string | undefined, options) => {
    try {
      const filePath = await record({ name });

      console.log("");
      const shouldTranscribe = await askYesNo("Transcribir ahora?");

      if (shouldTranscribe) {
        let speakers = options.speakers || false;
        let numSpeakers = options.numSpeakers;
        const provider = options.provider as TranscriptionProvider;

        // Interactive speaker diarization prompt (only for elevenlabs, only if not already set via flags)
        if (provider === "elevenlabs" && !options.speakers) {
          console.log("");
          speakers = await askYesNo("Detectar hablantes?");
          if (speakers) {
            numSpeakers = await askNumber("Cuántos hablantes? (0 = auto-detectar)", 0);
          }
        }

        console.log("");
        await transcribeFile({
          filePath,
          language: options.language,
          timestamps: options.timestamps,
          speakers,
          numSpeakers,
          provider,
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error("An unexpected error occurred");
      }
      process.exit(1);
    }
  });

// Config subcommand
program
  .command("config")
  .description("Configure trans")
  .option("--set-key", "Set API key for the selected provider")
  .option(
    "-p, --provider <name>",
    "Provider to configure: elevenlabs or whisper",
    "elevenlabs"
  )
  .action(async (options) => {
    if (options.setKey) {
      const provider = options.provider as TranscriptionProvider;
      const providerLabel =
        provider === "elevenlabs" ? "ElevenLabs" : "OpenAI";

      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const apiKey = await new Promise<string>((resolve) => {
        rl.question(`Enter your ${providerLabel} API key: `, (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (!apiKey) {
        console.error("No API key provided");
        process.exit(1);
      }

      await setApiKey(provider, apiKey);
    } else {
      program.commands
        .find((cmd) => cmd.name() === "config")
        ?.help();
    }
  });

export function run() {
  program.parse();
}
