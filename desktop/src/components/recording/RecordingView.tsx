import { useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { X, Square, AlertCircle, ArrowLeft } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { useRecordingStore } from "../../stores/recording";
import { Button } from "../shared/Button";
import { S } from "../../lib/strings";
import { formatDuration } from "../../lib/validation";
import * as tauri from "../../lib/tauri";
import { RecordingDone } from "./RecordingDone";

export function RecordingView() {
  const navigate = useAppStore((s) => s.navigate);
  const {
    status,
    duration,
    audioLevel,
    errorMessage,
    setStatus,
    setDuration,
    setAudioLevel,
    setFilePath,
    setErrorMessage,
    reset,
  } = useRecordingStore();
  const startedRef = useRef(false);

  const startRecording = useCallback(async () => {
    try {
      setStatus("recording");
      await tauri.startRecording();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo iniciar la grabación";
      setErrorMessage(msg);
      setStatus("error");
    }
  }, [setStatus, setErrorMessage]);

  const stopRecording = useCallback(async () => {
    try {
      const result = await tauri.stopRecording();
      setFilePath(result.filePath);
      setDuration(result.duration);
      setStatus("stopped");
    } catch (err) {
      // Even on error, transition to stopped so user isn't stuck
      const msg =
        err instanceof Error ? err.message : "Error al detener la grabación";
      setErrorMessage(msg);
      setStatus("stopped");
    }
  }, [setFilePath, setDuration, setStatus, setErrorMessage]);

  const cancel = useCallback(async () => {
    try {
      await tauri.cancelRecording();
    } catch {
      // ignore
    }
    navigate("home");
    setTimeout(() => reset(), 250);
  }, [reset, navigate]);

  const goHome = useCallback(() => {
    navigate("home");
    setTimeout(() => reset(), 250);
  }, [reset, navigate]);

  // Reset ref on mount so recording works on re-entry
  useEffect(() => {
    startedRef.current = false;
  }, []);

  // Start recording on mount (once)
  useEffect(() => {
    if (status === "idle" && !startedRef.current) {
      startedRef.current = true;
      startRecording();
    }
  }, [status, startRecording]);

  // Listen for tick and level events
  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    tauri
      .onRecordingTick((s) => setDuration(s))
      .then((u) => unlisteners.push(u));
    tauri
      .onRecordingLevel((l) => setAudioLevel(l))
      .then((u) => unlisteners.push(u));

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [setDuration, setAudioLevel]);

  if (status === "stopped" || status === "transcribing" || status === "done") {
    return <RecordingDone />;
  }

  // Error state — show message + go back
  if (status === "error") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center justify-center gap-6 h-full"
      >
        <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
          <AlertCircle size={28} className="text-recording" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100">
            Error en la grabación
          </h2>
          <p className="text-[13px] text-neutral-500 max-w-[300px]">
            {errorMessage || "Ocurrió un error inesperado"}
          </p>
        </div>
        <Button variant="secondary" onClick={goHome}>
          <ArrowLeft size={14} />
          {S.backToHome}
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center gap-8 h-full"
    >
      {/* Cancel button */}
      <button
        onClick={cancel}
        className="absolute top-14 left-6 p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
      >
        <X size={16} className="text-neutral-500" />
      </button>

      {/* Pulsing mic */}
      <div className="relative flex items-center justify-center">
        {status === "recording" && (
          <div className="absolute w-24 h-24 rounded-full bg-recording/20 animate-pulse" />
        )}
        <div
          className={`
            w-16 h-16 rounded-full flex items-center justify-center
            ${status === "recording" ? "bg-recording/10" : "bg-neutral-100 dark:bg-neutral-800"}
          `}
        >
          <div
            className={`w-4 h-4 rounded-full ${status === "recording" ? "bg-recording" : "bg-neutral-400"}`}
          />
        </div>
      </div>

      {/* Timer */}
      <span className="text-[48px] font-light text-neutral-900 dark:text-neutral-100 tabular-nums tracking-tight">
        {formatDuration(duration)}
      </span>

      {/* Audio level meter */}
      <div className="flex items-end gap-[2px] h-6 w-48">
        {Array.from({ length: 24 }).map((_, i) => {
          const threshold = (i + 1) / 24;
          const active = audioLevel >= threshold;
          return (
            <div
              key={i}
              className={`
                flex-1 rounded-sm transition-all duration-75
                ${active ? "bg-recording" : "bg-neutral-200 dark:bg-neutral-700"}
              `}
              style={{
                height: active ? `${Math.max(4, audioLevel * 24)}px` : "4px",
              }}
            />
          );
        })}
      </div>

      {/* Stop button */}
      <Button
        variant="danger"
        onClick={stopRecording}
        disabled={status !== "recording"}
        className="px-8 py-3 text-[14px]"
      >
        <Square size={16} fill="currentColor" />
        {S.stopRecording}
      </Button>
    </motion.div>
  );
}
