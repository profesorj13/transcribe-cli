const SUPPORTED_EXTENSIONS = [
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "wav",
  "webm",
  "ogg",
  "opus",
  "flac",
];

const YOUTUBE_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;

const INSTAGRAM_REGEX =
  /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|reels|tv)\/[\w-]+/;

const GDRIVE_PATTERNS = [
  /^https?:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+/,
  /^https?:\/\/drive\.google\.com\/open\?id=[a-zA-Z0-9_-]+/,
  /^https?:\/\/drive\.google\.com\/uc\?(?:.*&)?id=[a-zA-Z0-9_-]+/,
  /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+/,
];

export function isValidAudioFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? SUPPORTED_EXTENSIONS.includes(ext) : false;
}

export function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_REGEX.test(url);
}

export function isInstagramUrl(url: string): boolean {
  return INSTAGRAM_REGEX.test(url);
}

export function isGoogleDriveUrl(url: string): boolean {
  return GDRIVE_PATTERNS.some((regex) => regex.test(url));
}

export function isSupportedUrl(url: string): boolean {
  return isYouTubeUrl(url) || isInstagramUrl(url) || isGoogleDriveUrl(url);
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
