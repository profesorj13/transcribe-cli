import { program } from "commander";
import { resolveApiKey, setApiKey } from "./config/api-key.ts";
import { getProvider } from "./providers/index.ts";
import {
  transcribeAudio,
  transcribeChunksParallel,
  translateAudio,
  translateChunksParallel,
} from "./transcription/whisper.ts";
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
}

async function transcribeFile(options: TranscribeFileOptions): Promise<void> {
  const { filePath, output, language, timestamps, translate, title, sourceUrl } = options;

  const apiKey = await resolveApiKey(options.apiKey);
  const mode = translate ? "Translating" : "Transcribing";

  console.log(`${mode}: ${title || filePath}`);

  // Split audio if needed
  const splitResult = await splitAudio(filePath);
  const { chunks, cleanup: cleanupChunks } = splitResult;

  let result;

  const audioFn = translate ? translateAudio : transcribeAudio;
  const chunksFn = translate ? translateChunksParallel : transcribeChunksParallel;

  if (chunks.length > 1) {
    console.log(`Processing ${chunks.length} chunks in parallel...`);
    result = await chunksFn({
      apiKey,
      chunks,
      language,
      timestamps,
      onProgress: (completed, total) => {
        console.log(`${translate ? "Translated" : "Transcribed"} chunk ${completed}/${total}`);
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

  // Generate markdown
  const markdown = generateMarkdown({
    filePath,
    result,
    includeTimestamps: timestamps,
    chunksCount: chunks.length > 1 ? chunks.length : undefined,
    isTranslation: translate,
    title,
    sourceUrl,
  });

  // Write output — save in cwd for remote sources (YouTube, URLs)
  const isRemote = !!sourceUrl;
  const outputPath = getOutputPath(filePath, output, isRemote);
  await Bun.write(outputPath, markdown);
  console.log(`\n${translate ? "Translation" : "Transcription"} saved to: ${outputPath}`);

  // Cleanup chunks
  await cleanupChunks();
}

// Main transcribe command
program
  .argument("[input]", "Audio file or YouTube URL to transcribe")
  .option("-o, --output <path>", "Output file path (default: input.md)")
  .option("--api-key <key>", "OpenAI API key")
  .option("--timestamps", "Include timestamps in output")
  .option("--language <lang>", "Audio language (ISO-639-1 code, e.g., en, es)")
  .option("-t, --translate", "Translate audio to English")
  .action(async (input: string | undefined, options) => {
    if (!input) {
      program.help();
      return;
    }

    try {
      const provider = getProvider(input);
      console.log(`Using provider: ${provider.name}`);

      // Pass language hint so YouTube provider can fetch subs in the right language
      const providerOpts = options.language ? { language: options.language } : undefined;
      const source = await provider.getAudioSource(input, providerOpts);

      const isRemote = source.originalInput !== source.filePath;

      // If provider returned subtitles directly (YouTube captions), skip Whisper
      if (source.subtitles) {
        const markdown = generateMarkdown({
          filePath: source.filePath,
          result: { text: source.subtitles.text, language: source.subtitles.language },
          isTranslation: options.translate,
          title: source.metadata?.title,
          sourceUrl: isRemote ? source.originalInput : undefined,
        });

        const outputPath = getOutputPath(source.filePath, options.output, isRemote);
        await Bun.write(outputPath, markdown);
        console.log(`Saved to: ${outputPath}`);

        if (source.cleanup) await source.cleanup();
        return;
      }

      // No subtitles — full Whisper transcription/translation
      await transcribeFile({
        filePath: source.filePath,
        apiKey: options.apiKey,
        output: options.output,
        language: options.language,
        timestamps: options.timestamps,
        translate: options.translate,
        title: source.metadata?.title,
        sourceUrl: isRemote ? source.originalInput : undefined,
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
  .option("--set-key", "Set OpenAI API key")
  .action(async (options) => {
    if (options.setKey) {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const apiKey = await new Promise<string>((resolve) => {
        rl.question("Enter your OpenAI API key: ", (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (!apiKey) {
        console.error("No API key provided");
        process.exit(1);
      }

      await setApiKey(apiKey);
    } else {
      program.commands
        .find((cmd) => cmd.name() === "config")
        ?.help();
    }
  });

export function run() {
  program.parse();
}
