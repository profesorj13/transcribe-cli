import type { BaseProvider } from "./base.ts";
import { FileProvider } from "./file.ts";
import { YouTubeProvider } from "./youtube.ts";

const providers: BaseProvider[] = [
  new YouTubeProvider(),
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
      "Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac"
  );
}

export { type AudioSource, type BaseProvider } from "./base.ts";
