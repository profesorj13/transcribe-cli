import { Check, X } from "lucide-react";
import type { DependencyStatus } from "../../types";

interface DependencyCheckProps {
  dep: DependencyStatus;
}

export function DependencyCheck({ dep }: DependencyCheckProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px] text-neutral-700 dark:text-neutral-300 font-mono">
        {dep.name}
      </span>
      <div className="flex items-center gap-1.5">
        {dep.installed ? (
          <>
            <Check size={14} className="text-success" />
            <span className="text-[11px] text-neutral-500">
              v{dep.version}
            </span>
          </>
        ) : (
          <>
            <X size={14} className="text-error" />
            <span className="text-[11px] text-error">No instalado</span>
          </>
        )}
      </div>
    </div>
  );
}
