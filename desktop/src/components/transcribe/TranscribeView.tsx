import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Link, Upload } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { useTranscriptionStore } from "../../stores/transcription";
import { Button } from "../shared/Button";
import { Select } from "../shared/Select";
import { Toggle } from "../shared/Toggle";
import { ProgressView } from "../progress/ProgressView";
import { ResultView } from "../result/ResultView";
import { S } from "../../lib/strings";
import { isValidAudioFile, isSupportedUrl } from "../../lib/validation";
import * as tauri from "../../lib/tauri";

export function TranscribeView() {
  const navigate = useAppStore((s) => s.navigate);
  const {
    status,
    source,
    progress,
    result,
    options,
    setSource,
    setStatus,
    setProgress,
    setResult,
    setOptions,
    reset,
  } = useTranscriptionStore();

  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const urlValid = urlInput.length > 0 && isSupportedUrl(urlInput);
  const hasSource = source !== null;

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && isValidAudioFile(file.name)) {
        // In Tauri, we get the path from the file
        const path = (file as unknown as { path?: string }).path || file.name;
        setSource({ type: "file", value: path, name: file.name });
      }
    },
    [setSource],
  );

  const handleFileSelect = async () => {
    const path = await tauri.openFileDialog();
    if (path) {
      const name = path.split("/").pop() || path;
      setSource({ type: "file", value: path, name });
    }
  };

  const handleUrlSubmit = () => {
    if (urlValid) {
      setSource({ type: "url", value: urlInput });
    }
  };

  const handleTranscribe = async () => {
    if (!source) return;
    setStatus("transcribing");

    try {
      const unProgress = await tauri.onTranscriptionProgress((p) => setProgress(p));
      const unDone = await tauri.onTranscriptionDone((res) => {
        setResult(res);
        setStatus("done");
        unProgress();
        unDone();
      });
      const unErr = await tauri.onTranscriptionError((err) => {
        setStatus("error");
        unProgress();
        unErr();
        console.error(err.message);
      });

      await tauri.transcribe({
        input: source.value,
        provider: options.provider,
        language: options.language,
        timestamps: options.timestamps,
        translate: options.translate,
      });
    } catch {
      setStatus("error");
    }
  };

  const handleBack = () => {
    reset();
    navigate("home");
  };

  // Show result
  if (status === "done" && result) {
    return <ResultView result={result} onBack={handleBack} />;
  }

  // Show progress
  if (status === "transcribing") {
    return <ProgressView progress={progress} onCancel={handleBack} />;
  }

  const providerOptions = [
    { value: "elevenlabs", label: "ElevenLabs" },
    { value: "whisper", label: "Whisper (OpenAI)" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-5 h-full"
    >
      {/* Back button */}
      <button
        onClick={handleBack}
        className="flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors cursor-pointer self-start"
      >
        <ArrowLeft size={14} />
        {S.back}
      </button>

      <h2 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100">
        {S.transcribe}
      </h2>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
        onClick={handleFileSelect}
        className={`
          flex flex-col items-center justify-center gap-2 py-8 rounded-xl
          border-2 border-dashed cursor-pointer transition-all duration-150
          ${
            dragOver
              ? "border-primary bg-blue-50/50 dark:bg-blue-950/20"
              : source?.type === "file"
                ? "border-success/50 bg-green-50/30 dark:bg-green-950/10"
                : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
          }
        `}
      >
        <Upload
          size={24}
          className={`${source?.type === "file" ? "text-success" : "text-neutral-400"}`}
        />
        {source?.type === "file" ? (
          <span className="text-[13px] text-success font-medium">
            {source.name || source.value.split("/").pop()}
          </span>
        ) : (
          <>
            <span className="text-[13px] text-neutral-600 dark:text-neutral-400">
              {S.dropzone}
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-600">
              {S.dropzoneClick}
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-600">
              {S.dropzoneFormats}
            </span>
          </>
        )}
      </div>

      {/* URL input */}
      <div className="space-y-2">
        <p className="text-[11px] text-neutral-400 dark:text-neutral-600 text-center">
          {S.orPasteLink}
        </p>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                if (isSupportedUrl(e.target.value)) {
                  setSource({ type: "url", value: e.target.value });
                } else if (source?.type === "url") {
                  setSource(null);
                }
              }}
              onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
              placeholder={S.urlPlaceholder}
              className="
                w-full pl-9 pr-3 py-2 rounded-lg text-[13px]
                bg-white dark:bg-neutral-800
                border border-neutral-200 dark:border-neutral-700
                text-neutral-900 dark:text-neutral-100
                placeholder:text-neutral-400
                focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
              "
            />
          </div>
        </div>
        <p className="text-[11px] text-neutral-400 dark:text-neutral-600">
          {S.supportedSources}
        </p>
      </div>

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
        {options.provider === "whisper" && (
          <Toggle
            label={S.translateToEnglish}
            description={S.whisperOnly}
            checked={options.translate}
            onChange={(v) => setOptions({ translate: v })}
          />
        )}
      </div>

      {/* Transcribe button */}
      <Button
        variant="primary"
        fullWidth
        disabled={!hasSource}
        onClick={handleTranscribe}
      >
        {S.transcribe}
      </Button>
    </motion.div>
  );
}
