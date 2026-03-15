# transcribe-cli

CLI tool for audio transcription using OpenAI's Whisper API. Supports recording from microphone, splitting large files into parallel chunks, and outputting formatted Markdown with optional timestamps.

## Requirements

- [Bun](https://bun.sh) runtime
- `ffmpeg` and `ffprobe` (audio processing)
- `sox` (optional, for microphone recording fallback)
- OpenAI API key

## Installation

```bash
bun install
```

To make the `trans` command available globally:

```bash
bun link
```

## Usage

```bash
# Transcribe an audio file
trans <file> [options]

# Record audio from microphone, then optionally transcribe
trans r [name]

# Save your OpenAI API key
trans config --set-key
```

### Options

| Flag | Description |
|------|-------------|
| `--output <path>` | Output file path |
| `--api-key <key>` | OpenAI API key (overrides env/config) |
| `--language <lang>` | Audio language hint |
| `--timestamps` | Include timestamps in output |

### API Key Resolution

The API key is resolved in this order:

1. `--api-key` CLI flag
2. `OPENAI_API_KEY` environment variable
3. `~/.config/transcribe-cli/config.json`

## Supported Formats

mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac

## How It Works

1. Resolve API key
2. Detect audio duration via `ffprobe`
3. If > 5 minutes, split into chunks with `ffmpeg`
4. Transcribe via OpenAI Whisper (parallel if chunked)
5. Generate Markdown output with metadata
6. Write `.md` file

## Architecture

```
bin/trans.ts              → CLI entry point
src/index.ts              → Commander commands and orchestration
src/providers/            → Extensible provider pattern (local files)
src/audio/splitter.ts     → ffprobe duration + ffmpeg chunking
src/transcription/        → OpenAI Whisper API integration
src/recording/recorder.ts → Mic recording with keypress detection
src/output/markdown.ts    → Markdown output generation
src/config/api-key.ts     → API key resolution chain
```
