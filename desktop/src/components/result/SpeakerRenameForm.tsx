import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "../shared/Button";
import { S } from "../../lib/strings";

interface SpeakerRenameFormProps {
  speakers: string[];
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

export function SpeakerRenameForm({ speakers, onConfirm, onCancel }: SpeakerRenameFormProps) {
  const [names, setNames] = useState<Record<string, string>>({});

  const handleConfirm = () => {
    const filtered = Object.fromEntries(
      Object.entries(names).filter(([, v]) => v.trim() !== ""),
    );
    onConfirm(filtered);
  };

  return (
    <div className="w-full bg-white dark:bg-neutral-800/50 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700/50 flex flex-col gap-3">
      <p className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400">
        {S.editSpeakers}
      </p>
      {speakers.map((id) => (
        <div key={id} className="flex items-center gap-3">
          <span className="text-[12px] text-neutral-500 dark:text-neutral-400 min-w-[100px] shrink-0">
            {id}:
          </span>
          <input
            type="text"
            className="flex-1 bg-neutral-50 dark:bg-neutral-700/50 border border-neutral-200 dark:border-neutral-600 rounded-lg px-3 py-1.5 text-[12px] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none focus:border-primary"
            placeholder={S.speakerNamePlaceholder}
            value={names[id] || ""}
            onChange={(e) => setNames((prev) => ({ ...prev, [id]: e.target.value }))}
          />
        </div>
      ))}
      <div className="flex gap-2 mt-1">
        <Button variant="primary" fullWidth onClick={handleConfirm}>
          <Check size={14} />
          {S.confirm}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          <X size={14} />
          {S.cancel}
        </Button>
      </div>
    </div>
  );
}
