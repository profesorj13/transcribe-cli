import { basename, join } from "path";
import { existsSync } from "node:fs";
import type { TranscriptionResult } from "../transcription/whisper.ts";

export interface MarkdownOptions {
  filePath: string;
  result: TranscriptionResult;
  includeTimestamps?: boolean;
  chunksCount?: number;
  isTranslation?: boolean;
  title?: string;
  sourceUrl?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function generateMarkdown(options: MarkdownOptions): string {
  const { filePath, result, includeTimestamps, chunksCount, isTranslation, title, sourceUrl } = options;
  const fileName = basename(filePath);
  const date = new Date().toISOString().split("T")[0];

  const heading = isTranslation ? "Traducción" : "Transcripción";
  const displayName = title || fileName;

  let markdown = `# ${heading}: ${displayName}
`;

  if (sourceUrl) {
    markdown += `\n**Fuente:** ${sourceUrl}`;
  }

  markdown += `
**Archivo:** ${filePath}
**Fecha:** ${date}
**Modelo:** whisper-1`;

  if (result.language) {
    markdown += `\n**Idioma:** ${result.language}`;
  }

  if (result.duration) {
    markdown += `\n**Duración:** ${formatTime(result.duration)}`;
  }

  if (chunksCount) {
    markdown += `\n**Procesado en:** ${chunksCount} partes (paralelo)`;
  }

  markdown += `

---

${result.text}`;

  if (includeTimestamps && result.segments && result.segments.length > 0) {
    markdown += `

---

## Segmentos con timestamps

| Inicio | Fin | Texto |
|--------|-----|-------|
`;

    for (const segment of result.segments) {
      const text = segment.text.trim().replace(/\|/g, "\\|");
      markdown += `| ${formatTime(segment.start)} | ${formatTime(segment.end)} | ${text} |\n`;
    }
  }

  return markdown;
}

function findAvailableMdPath(filePath: string): string {
  if (!existsSync(filePath)) return filePath;

  const lastDot = filePath.lastIndexOf(".");
  const base = lastDot === -1 ? filePath : filePath.slice(0, lastDot);
  const ext = lastDot === -1 ? "" : filePath.slice(lastDot);

  let i = 2;
  while (true) {
    const candidate = `${base}-${i}${ext}`;
    if (!existsSync(candidate)) return candidate;
    i++;
  }
}

export function getOutputPath(inputPath: string, customOutput?: string, cwdFallback?: boolean): string {
  if (customOutput) {
    return customOutput;
  }

  let mdPath: string;

  if (cwdFallback) {
    // For remote sources (YouTube, URLs), save in cwd
    const name = basename(inputPath);
    const lastDot = name.lastIndexOf(".");
    const mdName = lastDot === -1 ? `${name}.md` : `${name.slice(0, lastDot)}.md`;
    mdPath = join(process.cwd(), mdName);
  } else {
    // Replace extension with .md (local files)
    const lastDot = inputPath.lastIndexOf(".");
    if (lastDot === -1) {
      mdPath = `${inputPath}.md`;
    } else {
      mdPath = `${inputPath.slice(0, lastDot)}.md`;
    }
  }

  return findAvailableMdPath(mdPath);
}
