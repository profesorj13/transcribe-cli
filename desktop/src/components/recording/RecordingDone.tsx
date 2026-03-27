import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FolderOpen } from "lucide-react";
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
    reset,
  } = useRecordingStore();

  const { errorMessage, setErrorMessage } = useRecordingStore();
  const [outputDir, setOutputDir] = useState<string>("~/Desktop");

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
        <p className="text-[13px] text-neutral-500 mt-1">
          {filePath ? `${fileName} — ${formatDuration(duration)}` : "El archivo no se guardó correctamente"}
        </p>
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
