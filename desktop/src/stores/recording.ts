import { create } from "zustand";
import type {
  RecordingStatus,
  TranscribeOptions,
  TranscriptionResult,
} from "../types";

interface RecordingState {
  status: RecordingStatus;
  filePath: string | null;
  duration: number;
  audioLevel: number;
  result: TranscriptionResult | null;
  options: TranscribeOptions;
  errorMessage: string | null;
  setStatus: (status: RecordingStatus) => void;
  setFilePath: (path: string) => void;
  setDuration: (duration: number) => void;
  setAudioLevel: (level: number) => void;
  setResult: (result: TranscriptionResult) => void;
  setOptions: (options: Partial<TranscribeOptions>) => void;
  setErrorMessage: (msg: string | null) => void;
  reset: () => void;
}

const defaultOptions: TranscribeOptions = {
  provider: "elevenlabs",
  language: "es",
  timestamps: false,
  translate: false,
  speakers: false,
  numSpeakers: 0,
};

export const useRecordingStore = create<RecordingState>((set) => ({
  status: "idle",
  filePath: null,
  duration: 0,
  audioLevel: 0,
  result: null,
  options: { ...defaultOptions },
  errorMessage: null,
  setStatus: (status) => set({ status }),
  setFilePath: (filePath) => set({ filePath }),
  setDuration: (duration) => set({ duration }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setResult: (result) => set({ result }),
  setOptions: (opts) =>
    set((state) => ({ options: { ...state.options, ...opts } })),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  reset: () =>
    set({
      status: "idle",
      filePath: null,
      duration: 0,
      audioLevel: 0,
      result: null,
      options: { ...defaultOptions },
      errorMessage: null,
    }),
}));
