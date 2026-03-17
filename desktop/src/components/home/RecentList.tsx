import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { S } from "../../lib/strings";
import { formatRelativeDate } from "../../lib/validation";
import type { RecentFile } from "../../types";
import * as tauri from "../../lib/tauri";

export function RecentList() {
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const currentView = useAppStore((s) => s.currentView);

  const refresh = useCallback(() => {
    tauri
      .getRecentFiles()
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  // Refresh on mount and every time we navigate back to home
  useEffect(() => {
    if (currentView === "home") refresh();
  }, [currentView, refresh]);

  if (loading) return null;

  if (files.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-[12px] text-neutral-400 dark:text-neutral-600">
          {S.noRecent}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-[11px] font-medium text-neutral-400 dark:text-neutral-600 uppercase tracking-wider mb-2">
        {S.recent}
      </h4>
      <div className="space-y-0.5">
        {files.map((file) => (
          <button
            key={file.path}
            onClick={() => tauri.openFile(file.path)}
            className="
              w-full flex items-center gap-2 px-2 py-1.5 rounded-md
              hover:bg-neutral-100 dark:hover:bg-neutral-800
              transition-colors duration-100
              cursor-pointer text-left
            "
          >
            <FileText
              size={14}
              className="text-neutral-400 dark:text-neutral-600 flex-shrink-0"
            />
            <span className="flex-1 text-[12px] text-neutral-700 dark:text-neutral-300 truncate">
              {file.name}
            </span>
            <span className="text-[11px] text-neutral-400 dark:text-neutral-600 flex-shrink-0">
              {formatRelativeDate(file.date)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
