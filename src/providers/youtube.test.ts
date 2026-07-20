import { describe, expect, test } from "bun:test";
import { parseSrt, subLangFromFilename, isNoSubtitlesMessage } from "./youtube.ts";

describe("parseSrt", () => {
  test("extracts text and deduplicates overlapping auto-sub lines", () => {
    const srt = [
      "1",
      "00:00:00,000 --> 00:00:02,000",
      "hola mundo",
      "",
      "2",
      "00:00:02,000 --> 00:00:04,000",
      "hola mundo",
      "esto es una prueba",
      "",
    ].join("\n");
    expect(parseSrt(srt)).toBe("hola mundo esto es una prueba");
  });
});

describe("subLangFromFilename (cli-B09)", () => {
  test("extracts plain language token", () => {
    expect(subLangFromFilename("my-video.en.srt", "my-video")).toBe("en");
  });

  test("extracts translated/regional variant token", () => {
    expect(subLangFromFilename("my-video.es-en.srt", "my-video")).toBe("es-en");
    expect(subLangFromFilename("my-video.en-US.srt", "my-video")).toBe("en-US");
  });

  test("returns empty string when filename doesn't match the safeName prefix", () => {
    expect(subLangFromFilename("other.en.srt", "my-video")).toBe("");
  });
});

describe("isNoSubtitlesMessage (cli-B12)", () => {
  test("recognizes 'no subtitles' output as a benign miss", () => {
    expect(
      isNoSubtitlesMessage("There are no subtitles for the requested languages")
    ).toBe(true);
  });

  test("does NOT treat a network/anti-bot error as 'no subtitles'", () => {
    expect(isNoSubtitlesMessage("ERROR: unable to download: HTTP Error 429: Too Many Requests")).toBe(
      false
    );
    expect(isNoSubtitlesMessage("ERROR: Sign in to confirm you're not a bot")).toBe(false);
  });
});
