import type { BaseProvider } from "./base.ts";
import { FileProvider } from "./file.ts";
import { GoogleDriveProvider } from "./gdrive.ts";
import { InstagramProvider } from "./instagram.ts";
import { YouTubeProvider } from "./youtube.ts";

const providers: BaseProvider[] = [
  new YouTubeProvider(),
  new InstagramProvider(),
  new GoogleDriveProvider(),
  new FileProvider(),
];

export function getProvider(input: string): BaseProvider {
  for (const provider of providers) {
    if (provider.canHandle(input)) {
      return provider;
    }
  }

  throw new Error(
    `No provider found for input: ${input}\n` +
      "Supported: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, opus, flac, YouTube URLs, Instagram URLs, Google Drive URLs"
  );
}

export { type AudioSource, type BaseProvider } from "./base.ts";
