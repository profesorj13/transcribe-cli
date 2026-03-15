export interface SubtitleData {
  text: string;
  language: string;
}

export interface AudioSource {
  filePath: string;
  originalInput: string;
  metadata?: { title?: string };
  subtitles?: SubtitleData;
  cleanup?: () => Promise<void>;
}

export interface ProviderOptions {
  language?: string;
}

export interface BaseProvider {
  name: string;
  canHandle(input: string): boolean;
  getAudioSource(input: string, options?: ProviderOptions): Promise<AudioSource>;
}
