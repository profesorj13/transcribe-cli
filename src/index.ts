import { program } from "commander";
import { resolveApiKey, setApiKey } from "./config/api-key.ts";
import { getProvider } from "./providers/index.ts";
import * as whisper from "./transcription/whisper.ts";
import * as elevenlabs from "./transcription/elevenlabs.ts";
import type { TranscriptionProvider } from "./transcription/types.ts";
import { generateMarkdown, getOutputPath } from "./output/markdown.ts";
import { record, askYesNo } from "./recording/recorder.ts";
import { splitAudio } from "./audio/splitter.ts";

program
  .name("trans")
  .description("CLI tool for audio recording and transcription")
  .version("1.0.0");

interface TranscribeFileOptions {
  filePath: string;
  apiKey?: string;
  output?: string;
  language?: string;
  timestamps?: boolean;
  translate?: boolean;
  title?: string;
  sourceUrl?: string;
  provider: TranscriptionProvider;
}

async function transcribeFile(options: TranscribeFileOptions): Promise<void> {
  const {
    filePath,
    output,
    language,
    timestamps,
    translate,
    title,
    sourceUrl,
    provider,
  } = options;

  const apiKey = await resolveApiKey(provider, options.apiKey);

  if (translate && provider === "elevenlabs") {
    console.error(
      "Translation is not supported with ElevenLabs. Use --provider whisper for translation."
    );
    process.exit(1);
  }

  const mode = translate ? "Translating" : "Transcribing";
  console.log(`${mode}: ${title || filePath}`);

  let result;
  let chunksCount: number | undefined;
  let cleanupFn: (() => Promise<void>) | undefined;

  if (provider === "elevenlabs") {
    // ElevenLabs supports up to 3GB — no splitting needed
    result = await elevenlabs.transcribeAudio({
      apiKey,
      filePath,
      language,
      timestamps,
    });
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
  });

  const isRemote = !!sourceUrl;
  const outputPath = getOutputPath(filePath, output, isRemote);
  await Bun.write(outputPath, markdown);
  console.log(
    `\n${translate ? "Translation" : "Transcription"} saved to: ${outputPath}`
  );

  if (cleanupFn) await cleanupFn();
}

// Main transcribe command
program
  .argument("[input]", "Audio file or YouTube URL to transcribe")
  .option("-o, --output <path>", "Output file path (default: input.md)")
  .option("--api-key <key>", "API key (ElevenLabs or OpenAI depending on provider)")
  .option("--timestamps", "Include timestamps in output")
  .option("--language <lang>", "Audio language (ISO-639-1 code, e.g., en, es)")
  .option("-t, --translate", "Translate audio to English (whisper only)")
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
          isRemote
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
        language: options.language,
        timestamps: options.timestamps,
        translate: options.translate,
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
        console.log("");
        await transcribeFile({
          filePath,
          language: options.language,
          timestamps: options.timestamps,
          provider: options.provider as TranscriptionProvider,
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
