import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "../shared/Button";
import { S } from "../../lib/strings";
import type { TranscriptionProgress } from "../../types";

interface ProgressViewProps {
  progress: TranscriptionProgress | null;
  onCancel: () => void;
}

export function ProgressView({ progress, onCancel }: ProgressViewProps) {
  const hasChunks = progress && progress.total > 1;
  const percentage = progress
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-center gap-6 h-full"
    >
      <Loader2 size={32} className="text-primary animate-spin" />

      <h2 className="text-[16px] font-semibold text-neutral-900 dark:text-neutral-100">
        {S.transcribing}
      </h2>

      {/* Progress bar */}
      <div className="w-full max-w-xs">
        <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
          {hasChunks ? (
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.3 }}
            />
          ) : (
            <div className="h-full bg-primary rounded-full w-1/3 animate-pulse" />
          )}
        </div>
        {hasChunks && (
          <p className="text-[12px] text-neutral-500 text-center mt-2">
            {S.chunkProgress(progress!.completed, progress!.total)} — {percentage}%
          </p>
        )}
      </div>

      <Button variant="ghost" onClick={onCancel}>
        {S.cancel}
      </Button>
    </motion.div>
  );
}
