const SUPPORTED_EXTENSIONS = [
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
  "ogg",
  "flac",
];

const YOUTUBE_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;

export function isValidAudioFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? SUPPORTED_EXTENSIONS.includes(ext) : false;
}

export function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url);
}

export function isSupportedUrl(url: string): boolean {
  return isYouTubeUrl(url);
}

export function getSupportedExtensions(): string[] {
  return SUPPORTED_EXTENSIONS;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "ahora";
  if (diffMins < 60) return `hace ${diffMins}m`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays}d`;
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}
