import { describe, test, expect } from "bun:test";
import { FileProvider } from "./file.ts";

const provider = new FileProvider();

describe("FileProvider.canHandle", () => {
  const supported = [
    "audio.mp3",
    "audio.mp4",
    "audio.mpeg",
    "audio.mpga",
    "audio.m4a",
    "audio.wav",
    "audio.webm",
    "audio.ogg",
    "audio.oga",
    "audio.opus",
    "audio.flac",
    "/path/to/recording.opus",
    "my file.OPUS",
    "nota de voz.oga",
  ];

  for (const file of supported) {
    test(`accepts ${file}`, () => {
      expect(provider.canHandle(file)).toBe(true);
    });
  }

  const unsupported = [
    "audio.aac",
    "audio.wma",
    "audio.txt",
    "https://example.com/audio.mp3",
    "noextension",
  ];

  for (const file of unsupported) {
    test(`rejects ${file}`, () => {
      expect(provider.canHandle(file)).toBe(false);
    });
  }
});
