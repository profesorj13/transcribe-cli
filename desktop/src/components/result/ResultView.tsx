import { useState } from "react";
import { motion } from "framer-motion";
import { Check, FileText, Copy, ArrowLeft } from "lucide-react";
import { Button } from "../shared/Button";
import { S } from "../../lib/strings";
import type { TranscriptionResult } from "../../types";
import * as tauri from "../../lib/tauri";

interface ResultViewProps {
  result: TranscriptionResult;
  onBack: () => void;
}

export function ResultView({ result, onBack }: ResultViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await tauri.copyToClipboard(result.preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center gap-6 h-full pt-8"
    >
      {/* Success checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center"
      >
        <Check size={28} className="text-success" strokeWidth={3} />
      </motion.div>

      <h2 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100">
        {S.transcriptionDone}
      </h2>

      {/* Preview */}
      <div className="w-full bg-white dark:bg-neutral-800/50 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700/50 max-h-48 overflow-y-auto">
        <p className="text-[12px] text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap select-text">
          {result.preview.slice(0, 500)}
          {result.preview.length > 500 && "..."}
        </p>
      </div>

      {/* Output path */}
      <p className="text-[11px] text-neutral-400 dark:text-neutral-600">
        {S.savedAt}: {result.outputPath}
      </p>

      {/* Actions */}
      <div className="flex gap-3 w-full">
        <Button
          variant="primary"
          fullWidth
          onClick={() => tauri.openFile(result.outputPath)}
        >
          <FileText size={14} />
          {S.openFile}
        </Button>
        <Button variant="secondary" fullWidth onClick={handleCopy}>
          {copied ? (
            <Check size={14} />
          ) : (
            <Copy size={14} />
          )}
          {copied ? S.copied : S.copyText}
        </Button>
      </div>

      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={14} />
        {S.backToHome}
      </Button>
    </motion.div>
  );
}
