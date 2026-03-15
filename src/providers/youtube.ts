import { $ } from "bun";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { AudioSource, BaseProvider } from "./base.ts";

const YOUTUBE_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;

function parseSrt(srt: string): string {
  // Extract text lines from SRT blocks (skip index + timestamp)
  const rawLines = srt
    .split(/\n\n+/)
    .filter((block) => block.trim())
    .flatMap((block) => {
      const lines = block.trim().split("\n");
      return lines.slice(2).map((l) => l.trim());
    })
    .filter(Boolean);

  // YouTube auto-subs have overlapping lines — deduplicate
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of rawLines) {
    if (!seen.has(line)) {
      seen.add(line);
      unique.push(line);
    }
  }

  return unique.join(" ");
}

async function getSafeName(input: string): Promise<{ title: string; safeName: string }> {
  const title = (await $`yt-dlp --get-title ${input}`.text()).trim();
  const safeName = title
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return { title, safeName };
}

export class YouTubeProvider implements BaseProvider {
  name = "youtube";

  canHandle(input: string): boolean {
    return YOUTUBE_REGEX.test(input);
  }

  async getAudioSource(input: string, options?: { language?: string }): Promise<AudioSource> {
    try {
      await $`which yt-dlp`.quiet();
    } catch {
      throw new Error(
        "yt-dlp is required for YouTube downloads.\n" +
          "Install with: brew install yt-dlp"
      );
    }

    const tempDir = join(tmpdir(), `trans-yt-${randomUUID()}`);
    await $`mkdir -p ${tempDir}`;

    const { title, safeName } = await getSafeName(input);
    const subLang = options?.language || "en";

    // Try to get YouTube subtitles first (free & instant)
    const subtitles = await this.tryGetSubtitles(input, tempDir, safeName, subLang);

    if (subtitles) {
      console.log(`Got YouTube subtitles (${subLang}) for: ${title}\n`);
      return {
        filePath: join(tempDir, `${safeName}.srt`),
        originalInput: input,
        metadata: { title },
        subtitles: { text: subtitles, language: subLang },
        cleanup: async () => {
          await $`rm -rf ${tempDir}`.quiet();
        },
      };
    }

    // Fallback: download audio for Whisper
    console.log(`No subtitles available (${subLang}), downloading audio...`);
    console.log(`Downloading audio: ${title}`);

    const outputPath = join(tempDir, `${safeName}.mp3`);
    await $`yt-dlp -x --audio-format mp3 --audio-quality 0 -o ${outputPath} ${input}`.quiet();

    console.log(`Downloaded to: ${outputPath}\n`);

    return {
      filePath: outputPath,
      originalInput: input,
      metadata: { title },
      cleanup: async () => {
        await $`rm -rf ${tempDir}`.quiet();
      },
    };
  }

  private async tryGetSubtitles(
    input: string,
    tempDir: string,
    safeName: string,
    lang: string
  ): Promise<string | null> {
    try {
      const outputTemplate = join(tempDir, safeName);

      await $`yt-dlp --write-auto-sub --sub-lang ${lang} --skip-download --convert-subs srt -o ${outputTemplate} ${input}`
        .quiet();

      // yt-dlp saves as {name}.{lang}.srt
      const srtPath = `${outputTemplate}.${lang}.srt`;
      const file = Bun.file(srtPath);

      if (await file.exists()) {
        const raw = await file.text();
        return parseSrt(raw);
      }
    } catch {
      // Subtitles not available or download failed — will fallback to audio
    }

    return null;
  }
}
