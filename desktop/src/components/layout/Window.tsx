import type { ReactNode } from "react";

interface WindowProps {
  children: ReactNode;
}

export function Window({ children }: WindowProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Drag region for native titlebar overlay */}
      <div
        data-tauri-drag-region
        className="h-12 flex-shrink-0 flex items-end justify-center pb-1"
      >
        <span
          data-tauri-drag-region
          className="text-[11px] font-medium text-neutral-400 dark:text-neutral-600 tracking-wider uppercase"
        >
          transcribe
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
    </div>
  );
}
