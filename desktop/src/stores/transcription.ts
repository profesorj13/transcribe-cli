import { create } from "zustand";
import type {
  TranscriptionStatus,
  TranscribeOptions,
  TranscriptionProgress,
  TranscriptionResult,
} from "../types";

interface TranscriptionSource {
  type: "file" | "url";
  value: string;
  name?: string;
}

interface TranscriptionState {
  status: TranscriptionStatus;
  source: TranscriptionSource | null;
  progress: TranscriptionProgress | null;
  result: TranscriptionResult | null;
  options: TranscribeOptions;
  errorMessage: string | null;
  setStatus: (status: TranscriptionStatus) => void;
  setSource: (source: TranscriptionSource | null) => void;
  setProgress: (progress: TranscriptionProgress | null) => void;
  setResult: (result: TranscriptionResult) => void;
  setOptions: (options: Partial<TranscribeOptions>) => void;
  setErrorMessage: (msg: string | null) => void;
  reset: () => void;
}

const defaultOptions: TranscribeOptions = {
  provider: "elevenlabs",
  language: "auto",
  timestamps: false,
  translate: false,
  speakers: false,
  numSpeakers: 0,
};

export const useTranscriptionStore = create<TranscriptionState>((set) => ({
  status: "idle",
  source: null,
  progress: null,
  result: null,
  options: { ...defaultOptions },
  errorMessage: null,
  setStatus: (status) => set({ status }),
  setSource: (source) => set({ source }),
  setProgress: (progress) => set({ progress }),
  setResult: (result) => set({ result }),
  setOptions: (opts) =>
    set((state) => ({ options: { ...state.options, ...opts } })),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  reset: () =>
    set({
      status: "idle",
      source: null,
      progress: null,
      result: null,
      options: { ...defaultOptions },
      errorMessage: null,
    }),
}));
