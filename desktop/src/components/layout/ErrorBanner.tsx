import { X } from "lucide-react";
import { useAppStore } from "../../stores/app";

export function ErrorBanner() {
  const error = useAppStore((s) => s.error);
  const clearError = useAppStore((s) => s.clearError);

  if (!error) return null;

  const isWarning = error.type === "warning";

  return (
    <div
      className={`
        mx-6 mt-2 px-3 py-2 rounded-lg flex items-center gap-2 text-[12px]
        ${
          isWarning
            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
            : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
        }
      `}
    >
      <span className="flex-1">{error.message}</span>
      {error.action && (
        <button
          onClick={error.action.onClick}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          {error.action.label}
        </button>
      )}
      <button
        onClick={clearError}
        className="p-0.5 hover:opacity-70 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}
