import { describe, expect, test } from "bun:test";
import { GoogleDriveProvider } from "./gdrive.ts";
import { getProvider } from "./index.ts";

const provider = new GoogleDriveProvider();

describe("GoogleDriveProvider.canHandle (cli-B05)", () => {
  test("matches downloadable Drive file URLs", () => {
    expect(provider.canHandle("https://drive.google.com/file/d/ABC123/view")).toBe(true);
    expect(provider.canHandle("https://drive.google.com/open?id=ABC123")).toBe(true);
    expect(provider.canHandle("https://drive.google.com/uc?id=ABC123")).toBe(true);
    expect(provider.canHandle("https://drive.google.com/uc?export=download&id=ABC123")).toBe(
      true
    );
  });

  test("does NOT match Google Docs/Sheets/Slides (never audio)", () => {
    expect(provider.canHandle("https://docs.google.com/document/d/ABC123/edit")).toBe(false);
    expect(provider.canHandle("https://docs.google.com/spreadsheets/d/ABC123/edit")).toBe(
      false
    );
    expect(provider.canHandle("https://docs.google.com/presentation/d/ABC123/edit")).toBe(
      false
    );
  });

  test("a Google Doc URL is not routed to the Drive provider", () => {
    expect(() => getProvider("https://docs.google.com/document/d/ABC123/edit")).toThrow();
  });
});
