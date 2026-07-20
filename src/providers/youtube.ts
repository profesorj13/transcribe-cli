import { $ } from "bun";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { readdir } from "node:fs/promises";
import type { AudioSource, BaseProvider } from "./base.ts";

const YOUTUBE_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;

export function parseSrt(srt: string): string {
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

/**
 * Extracts the language token from a subtitle filename produced by yt-dlp,
 * which names files `${safeName}.${lang}.srt` (e.g. "my-video.es-en.srt" -> "es-en").
 * Returns "" when the filename doesn't match the expected shape.
 */
export function subLangFromFilename(filename: string, safeName: string): string {
  const withoutExt = filename.replace(/\.srt$/i, "");
  const prefix = `${safeName}.`;
  return withoutExt.startsWith(prefix) ? withoutExt.slice(prefix.length) : "";
}

/**
 * Detects whether yt-dlp stderr/stdout indicates the video simply has no subtitles
 * (as opposed to a network / anti-bot / throttling failure that should be surfaced).
 */
export function isNoSubtitlesMessage(output: string): boolean {
  return /no subtitles|there are no subtitles|requested format is not available/i.test(output);
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
      console.log(`Got YouTube subtitles (${subtitles.language}) for: ${title}\n`);
      return {
        filePath: join(tempDir, `${safeName}.srt`),
        originalInput: input,
        metadata: { title },
        subtitles: { text: subtitles.text, language: subtitles.language },
        cleanup: async () => {
          await $`rm -rf ${tempDir}`.quiet();
        },
      };
    }

    // Fallback: download audio for the paid transcription provider
    console.log(`Sin subtítulos utilizables (${subLang}), se descargará el audio para transcribir...`);
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
  ): Promise<{ text: string; language: string } | null> {
    const outputTemplate = join(tempDir, safeName);

    // Request both manual and auto-generated subs, and accept regional/translated
    // variants of the requested language (e.g. "es-en", "en-US") via the `.*` pattern.
    const langPattern = `${lang}.*,${lang}`;
    const proc =
      await $`yt-dlp --write-sub --write-auto-sub --sub-lang ${langPattern} --skip-download --convert-subs srt -o ${outputTemplate} ${input}`
        .quiet()
        .nothrow();

    // Find any .srt files yt-dlp actually produced (named `${safeName}.${lang}.srt`).
    let produced: string[] = [];
    try {
      const entries = await readdir(tempDir);
      produced = entries.filter(
        (f) => f.startsWith(`${safeName}.`) && f.toLowerCase().endsWith(".srt")
      );
    } catch {
      produced = [];
    }

    if (produced.length === 0) {
      // Don't swallow the reason: distinguish "no subs exist" from a network/anti-bot failure
      // so an unexpected fallback to the paid provider is at least explained.
      const detail = (proc.stderr.toString() + proc.stdout.toString()).trim();
      const lastLine = detail.split("\n").filter(Boolean).at(-1) ?? "";
      if (proc.exitCode === 0 || isNoSubtitlesMessage(detail)) {
        console.warn(`No hay subtítulos disponibles (${lang}) para este video.`);
      } else {
        console.warn(
          `No se pudieron obtener los subtítulos (yt-dlp salió ${proc.exitCode})` +
            (lastLine ? `: ${lastLine}` : "") +
            ". Puede ser un problema de red o un bloqueo de YouTube."
        );
      }
      return null;
    }

    // Prefer a file whose language token matches the requested language; else take the first.
    const best =
      produced.find((f) => subLangFromFilename(f, safeName).startsWith(lang)) ?? produced[0]!;
    const detectedLang = subLangFromFilename(best, safeName) || lang;

    try {
      const raw = await Bun.file(join(tempDir, best)).text();
      const text = parseSrt(raw);
      if (!text.trim()) return null;
      return { text, language: detectedLang };
    } catch (e) {
      console.warn(
        `No se pudo leer el archivo de subtítulos: ${e instanceof Error ? e.message : String(e)}`
      );
      return null;
    }
  }
}
