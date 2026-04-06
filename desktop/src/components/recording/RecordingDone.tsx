import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, FolderOpen, Pencil, X } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { useRecordingStore } from "../../stores/recording";
import { Button } from "../shared/Button";
import { Select } from "../shared/Select";
import { Toggle } from "../shared/Toggle";
import { S } from "../../lib/strings";
import { formatDuration } from "../../lib/validation";
import { ResultView } from "../result/ResultView";
import * as tauri from "../../lib/tauri";

export function RecordingDone() {
  const navigate = useAppStore((s) => s.navigate);
  const {
    status,
    filePath,
    duration,
    options,
    result,
    setOptions,
    setStatus,
    setResult,
    setFilePath,
    reset,
  } = useRecordingStore();

  const { errorMessage, setErrorMessage } = useRecordingStore();
  const [outputDir, setOutputDir] = useState<string>("~/Desktop");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tauri.getConfig().then((cfg) => {
      if (cfg.outputDirectory) setOutputDir(cfg.outputDirectory);
    }).catch(() => {});
  }, []);

  const handleTranscribe = async () => {
    if (!filePath) {
      setErrorMessage("No se encontró el archivo de grabación. Intentá grabar de nuevo.");
      return;
    }
    setStatus("transcribing");
    setErrorMessage(null);

    let unlistenDone: (() => void) | undefined;
    let unlistenErr: (() => void) | undefined;

    try {
      unlistenDone = await tauri.onTranscriptionDone((res) => {
        setResult(res);
        setStatus("done");
        unlistenDone?.();
        unlistenErr?.();
      });
      unlistenErr = await tauri.onTranscriptionError((err) => {
        setErrorMessage(err.message || "Error en la transcripción");
        setStatus("error");
        unlistenDone?.();
        unlistenErr?.();
      });

      await tauri.transcribe({
        input: filePath,
        provider: options.provider,
        language: options.language,
        timestamps: options.timestamps,
        translate: options.translate,
        speakers: options.speakers,
        numSpeakers: options.numSpeakers,
        outputDir,
      });
    } catch (err) {
      const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "Error al iniciar la transcripción";
      setErrorMessage(msg);
      setStatus("error");
      unlistenDone?.();
      unlistenErr?.();
    }
  };

  const goHome = () => {
    navigate("home");
    // Reset AFTER exit animation completes (150ms) to avoid
    // content changes during AnimatePresence exit that cause blank screen
    setTimeout(() => reset(), 250);
  };

  if (status === "done" && result) {
    return <ResultView result={result} onBack={goHome} />;
  }

  const fileName = filePath?.split("/").pop() || "recording.wav";
  const fileBaseName = fileName.replace(/\.[^.]+$/, "");
  const fileExt = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";

  const startEditingName = () => {
    if (!filePath || status === "transcribing") return;
    setNameDraft(fileBaseName);
    setRenameError(null);
    setIsEditingName(true);
    // Focus on next tick after input mounts
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
    setRenameError(null);
    setNameDraft("");
  };

  const confirmEditingName = async () => {
    if (!filePath) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === fileBaseName) {
      cancelEditingName();
      return;
    }
    try {
      const newPath = await tauri.renameRecording(filePath, trimmed);
      setFilePath(newPath);
      setIsEditingName(false);
      setRenameError(null);
      setNameDraft("");
    } catch (err) {
      const msg =
        typeof err === "string"
          ? err
          : err instanceof Error
          ? err.message
          : S.renameError;
      setRenameError(msg);
    }
  };

  const providerOptions = [
    { value: "elevenlabs", label: "ElevenLabs" },
    { value: "whisper", label: "Whisper (OpenAI)" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-6 h-full pt-4"
    >
      {/* Recording info */}
      <div className="text-center">
        <h2 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100">
          {filePath ? S.recordingSaved : "Error en la grabación"}
        </h2>
        {filePath ? (
          isEditingName ? (
            <div className="mt-2 flex flex-col items-center gap-1">
              <div className="flex items-center justify-center gap-1.5">
                <div className="flex items-center rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={nameDraft}
                    onChange={(e) => {
                      setNameDraft(e.target.value);
                      if (renameError) setRenameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmEditingName();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditingName();
                      }
                    }}
                    className="px-2 py-1 text-[13px] bg-transparent text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none w-48"
                    placeholder="nombre-del-archivo"
                  />
                  <span className="pr-2 text-[12px] text-neutral-400 select-none">
                    {fileExt}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={confirmEditingName}
                  className="p-1 rounded-md text-success hover:bg-success/10 transition-colors"
                  aria-label="Confirmar"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={cancelEditingName}
                  className="p-1 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600 transition-colors"
                  aria-label="Cancelar"
                >
                  <X size={14} />
                </button>
              </div>
              {renameError && (
                <p className="text-[11px] text-red-500">{renameError}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditingName}
              disabled={status === "transcribing"}
              className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors group disabled:cursor-not-allowed disabled:hover:text-neutral-500"
              title={S.renameFile}
            >
              <span className="underline decoration-dotted underline-offset-2">
                {fileName}
              </span>
              <Pencil
                size={11}
                className="text-neutral-400 opacity-60 group-hover:opacity-100 transition-opacity"
              />
              <span className="text-neutral-400">— {formatDuration(duration)}</span>
            </button>
          )
        ) : (
          <p className="text-[13px] text-neutral-500 mt-1">
            El archivo no se guardó correctamente
          </p>
        )}
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
          <p className="text-[12px] text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      {/* Options */}
      <div className="space-y-3 bg-white dark:bg-neutral-800/50 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700/50">
        <Select
          label={S.provider}
          options={providerOptions}
          value={options.provider}
          onChange={(v) => setOptions({ provider: v as "elevenlabs" | "whisper" })}
        />
        <Select
          label={S.language}
          options={S.languages}
          value={options.language}
          onChange={(v) => setOptions({ language: v })}
        />
        <Toggle
          label={S.timestamps}
          checked={options.timestamps}
          onChange={(v) => setOptions({ timestamps: v })}
        />
        {options.provider === "elevenlabs" && (
          <>
            <Toggle
              label={S.speakers}
              description={S.speakersDesc}
              checked={options.speakers}
              onChange={(v) => setOptions({ speakers: v })}
            />
            {options.speakers && (
              <Select
                label={S.numSpeakers}
                options={[
                  { value: "0", label: S.numSpeakersAuto },
                  ...Array.from({ length: 9 }, (_, i) => ({
                    value: String(i + 2),
                    label: String(i + 2),
                  })),
                ]}
                value={String(options.numSpeakers)}
                onChange={(v) => setOptions({ numSpeakers: parseInt(v) })}
              />
            )}
          </>
        )}
      </div>

      {/* Output folder */}
      <button
        onClick={async () => {
          const dir = await tauri.chooseDirectory();
          if (dir) {
            setOutputDir(dir);
            const cfg = await tauri.getConfig();
            await tauri.saveConfig({ ...cfg, outputDirectory: dir });
          }
        }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/30 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
      >
        <FolderOpen size={14} className="text-neutral-400 flex-shrink-0" />
        <span className="text-[12px] text-neutral-500 truncate flex-1 text-left">
          {outputDir}
        </span>
        <span className="text-[11px] text-blue-500 flex-shrink-0">{S.change}</span>
      </button>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="primary"
          fullWidth
          onClick={handleTranscribe}
          disabled={status === "transcribing"}
        >
          {status === "transcribing" ? S.transcribing : S.transcribeNow}
        </Button>
        <Button
          variant="secondary"
          onClick={goHome}
          disabled={status === "transcribing"}
        >
          {S.discard}
        </Button>
      </div>
    </motion.div>
  );
}
