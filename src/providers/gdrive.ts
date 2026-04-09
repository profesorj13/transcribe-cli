import { $ } from "bun";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { AudioSource, BaseProvider } from "./base.ts";

const GDRIVE_PATTERNS = [
  /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
  /^https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  /^https?:\/\/drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/,
  /^https?:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/,
];

function matchGDrive(input: string): RegExpMatchArray | null {
  for (const regex of GDRIVE_PATTERNS) {
    const match = input.match(regex);
    if (match) return match;
  }
  return null;
}

export class GoogleDriveProvider implements BaseProvider {
  name = "google-drive";

  canHandle(input: string): boolean {
    return matchGDrive(input) !== null;
  }

  async getAudioSource(input: string): Promise<AudioSource> {
    try {
      await $`which yt-dlp`.quiet();
    } catch {
      throw new Error(
        "yt-dlp is required for Google Drive downloads.\n" +
          "Install with: brew install yt-dlp"
      );
    }

    const tempDir = join(tmpdir(), `trans-gdrive-${randomUUID()}`);
    await $`mkdir -p ${tempDir}`;

    // Get filename/title from Google Drive
    const title = await this.getTitle(input);
    const safeName = title
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80);

    console.log(`Descargando audio: ${title}`);

    const outputPath = join(tempDir, `${safeName}.mp3`);
    await $`yt-dlp -x --audio-format mp3 --audio-quality 0 -o ${outputPath} ${input}`.quiet();

    console.log(`Descargado: ${outputPath}\n`);

    return {
      filePath: outputPath,
      originalInput: input,
      metadata: { title },
      cleanup: async () => {
        await $`rm -rf ${tempDir}`.quiet();
      },
    };
  }

  private async getTitle(input: string): Promise<string> {
    try {
      return (await $`yt-dlp --get-title ${input}`.text()).trim();
    } catch {
      // Fallback: extract file ID as name
      const match = matchGDrive(input);
      return match?.[1] || "gdrive-audio";
    }
  }
}
