export type View = "home" | "recording" | "transcribe" | "settings";

export type RecordingStatus =
  | "idle"
  | "recording"
  | "stopped"
  | "transcribing"
  | "done"
  | "error";

export type TranscriptionStatus =
  | "idle"
  | "transcribing"
  | "done"
  | "error";

export type TranscriptionProvider = "elevenlabs" | "whisper";

export interface TranscribeOptions {
  provider: TranscriptionProvider;
  language: string;
  timestamps: boolean;
  translate: boolean;
}

export interface TranscriptionProgress {
  completed: number;
  total: number;
}

export interface TranscriptionResult {
  outputPath: string;
  preview: string;
}

export interface AppConfig {
  apiKey?: string;
  elevenlabsApiKey?: string;
  defaultProvider?: TranscriptionProvider;
  defaultLanguage?: string;
  includeTimestamps?: boolean;
  outputDirectory?: string;
}

export interface DependencyStatus {
  name: string;
  installed: boolean;
  version?: string;
}

export interface RecentFile {
  path: string;
  name: string;
  date: string;
  size: number;
}
