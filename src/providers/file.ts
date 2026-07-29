import { resolve } from "path";
import type { AudioSource, BaseProvider } from "./base.ts";

const SUPPORTED_EXTENSIONS = [
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".wav",
  ".webm",
  ".ogg",
  ".oga",
  ".opus",
  ".flac",
];

export class FileProvider implements BaseProvider {
  name = "file";

  canHandle(input: string): boolean {
    // Handle local files - not URLs
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return false;
    }

    const ext = input.toLowerCase().slice(input.lastIndexOf("."));
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  async getAudioSource(input: string): Promise<AudioSource> {
    const filePath = resolve(input);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new Error(`File not found: ${filePath}`);
    }

    // A local file is never "remote": originalInput must equal filePath so callers
    // (isRemote = originalInput !== filePath) keep the .md next to the audio instead
    // of falling back to the current working directory.
    return {
      filePath,
      originalInput: filePath,
    };
  }
}
