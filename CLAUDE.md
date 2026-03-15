# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CLI tool for audio transcription using OpenAI's Whisper API. Supports recording from microphone, splitting large files into parallel chunks, and outputting formatted Markdown with optional timestamps.

## Commands

```bash
bun install                        # Install dependencies
bun run bin/trans.ts <file>        # Run CLI directly
bun run typecheck                  # Type check (tsc --noEmit)
bun test                           # Run tests
```

CLI usage: `trans <input> [--output path] [--api-key key] [--language lang] [--timestamps]`
- `trans r [name]` — record audio then optionally transcribe
- `trans config --set-key` — save API key to ~/.config/transcribe-cli/config.json

## Bun Runtime

Default to Bun instead of Node.js for everything:
- `bun <file>` not `node`/`ts-node`; `bun install` not `npm install`; `bun test` not `jest`/`vitest`
- `Bun.file()` over `node:fs` readFile/writeFile
- `Bun.$\`cmd\`` over `execa`
- Bun auto-loads `.env` — don't use `dotenv`
- Don't use `express`, `better-sqlite3`, `ws`, `pg`, `ioredis` — Bun has built-in equivalents

## Architecture

```
bin/trans.ts           → CLI entry point, calls src/index.ts run()
src/index.ts           → Commander command definitions and main orchestration
src/providers/         → Extensible provider pattern (currently: FileProvider for local audio)
src/audio/splitter.ts  → ffprobe duration detection + ffmpeg chunking (5-min chunks)
src/transcription/whisper.ts → OpenAI Whisper API: single file + parallel chunk transcription
src/recording/recorder.ts   → Mic recording via sox/ffmpeg with TTY keypress detection
src/output/markdown.ts      → Markdown output generation with metadata and timestamps
src/config/api-key.ts       → API key resolution: CLI flag → env var → config file
```

**Transcription flow:** resolve API key → check duration → split if >5min → transcribe (parallel if chunked) → generate markdown → write .md file.

**Provider pattern:** `src/providers/base.ts` defines the interface; `src/providers/index.ts` routes by source type. Currently only local files; designed for future YouTube/URL sources.

## Key Details

- System dependencies: `ffmpeg`, `ffprobe`, `sox` (recording fallback)
- API key resolution cascades: `--api-key` flag → `OPENAI_API_KEY` env → `~/.config/transcribe-cli/config.json`
- Supported audio formats: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac
- UI strings use Spanish localization (e.g., "Transcripción", "Duración")
