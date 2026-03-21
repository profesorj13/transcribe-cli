import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppConfig,
  DependencyStatus,
  RecentFile,
} from "../types";

// Config commands
export async function getConfig(): Promise<AppConfig> {
  return invoke("get_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_config", { config });
}

// Dependency check
export async function checkDependencies(): Promise<DependencyStatus[]> {
  return invoke("check_dependencies");
}

export async function chooseDirectory(): Promise<string | null> {
  return invoke("choose_directory");
}

// Recording commands
export async function startRecording(name?: string): Promise<void> {
  return invoke("start_recording", { name: name || null });
}

export async function stopRecording(): Promise<{
  filePath: string;
  duration: number;
}> {
  return invoke("stop_recording");
}

export async function cancelRecording(): Promise<void> {
  return invoke("cancel_recording");
}

// Transcription commands
export async function transcribe(args: {
  input: string;
  provider: string;
  language: string;
  timestamps: boolean;
  translate: boolean;
  speakers: boolean;
  numSpeakers: number;
}): Promise<void> {
  return invoke("transcribe", args);
}

// Speaker rename
export async function renameSpeakers(
  filePath: string,
  mapping: Record<string, string>,
): Promise<string> {
  return invoke("rename_speakers", { filePath, mapping });
}

// File commands
export async function openFileDialog(): Promise<string | null> {
  return invoke("open_file_dialog");
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  return invoke("get_recent_files");
}

export async function openFile(path: string): Promise<void> {
  return invoke("open_file", { path });
}

export async function copyToClipboard(text: string): Promise<void> {
  return invoke("copy_to_clipboard", { text });
}

// Event listeners
export function onRecordingTick(
  callback: (seconds: number) => void,
): Promise<UnlistenFn> {
  return listen<number>("recording:tick", (event) => callback(event.payload));
}

export function onRecordingLevel(
  callback: (level: number) => void,
): Promise<UnlistenFn> {
  return listen<number>("recording:level", (event) => callback(event.payload));
}

export function onTranscriptionProgress(
  callback: (progress: { completed: number; total: number }) => void,
): Promise<UnlistenFn> {
  return listen("transcription:progress", (event) =>
    callback(event.payload as { completed: number; total: number }),
  );
}

export function onTranscriptionDone(
  callback: (result: { outputPath: string; preview: string; speakers?: string[] }) => void,
): Promise<UnlistenFn> {
  return listen("transcription:done", (event) =>
    callback(event.payload as { outputPath: string; preview: string; speakers?: string[] }),
  );
}

export function onTranscriptionError(
  callback: (error: { message: string }) => void,
): Promise<UnlistenFn> {
  return listen("transcription:error", (event) =>
    callback(event.payload as { message: string }),
  );
}
