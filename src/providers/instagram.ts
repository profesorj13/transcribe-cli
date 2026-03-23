import { $ } from "bun";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import type { AudioSource, BaseProvider } from "./base.ts";

const INSTAGRAM_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[\w-]+/;

export class InstagramProvider implements BaseProvider {
  name = "instagram";

  canHandle(input: string): boolean {
    return INSTAGRAM_REGEX.test(input);
  }

  async getAudioSource(input: string): Promise<AudioSource> {
    try {
      await $`which yt-dlp`.quiet();
    } catch {
      throw new Error(
        "yt-dlp is required for Instagram downloads.\n" +
          "Install with: brew install yt-dlp"
      );
    }

    const tempDir = join(tmpdir(), `trans-ig-${randomUUID()}`);
    await $`mkdir -p ${tempDir}`;

    const title = await this.getTitle(input);
    const safeName = title
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñü\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80);

    console.log(`Downloading Instagram audio: ${title}`);

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

  private async getTitle(input: string): Promise<string> {
    try {
      return (await $`yt-dlp --get-title ${input}`.text()).trim();
    } catch {
      // Fallback: extract shortcode from URL
      const match = input.match(/\/(p|reel|reels|tv)\/([\w-]+)/);
      return match?.[2] || "instagram-audio";
    }
  }
}
