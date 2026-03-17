import { create } from "zustand";
import type { View } from "../types";

interface AppError {
  type: "warning" | "error";
  message: string;
  action?: { label: string; onClick: () => void };
}

interface AppState {
  currentView: View;
  error: AppError | null;
  navigate: (view: View) => void;
  setError: (error: AppError | null) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: "home",
  error: null,
  navigate: (view) => set({ currentView: view, error: null }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
