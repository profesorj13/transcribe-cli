import { useState } from "react";
import { Send, X } from "lucide-react";
import { Button } from "../shared/Button";
import { S } from "../../lib/strings";

interface OddProcessFormProps {
  sending: boolean;
  onConfirm: (instruction: string) => void;
  onCancel: () => void;
}

export function OddProcessForm({ sending, onConfirm, onCancel }: OddProcessFormProps) {
  const [instruction, setInstruction] = useState("");

  return (
    <div className="w-full bg-white dark:bg-neutral-800/50 rounded-xl p-4 border border-neutral-200 dark:border-neutral-700/50 flex flex-col gap-3">
      <p className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400">
        {S.oddInstructionLabel}
      </p>
      <textarea
        className="w-full h-20 resize-none bg-neutral-50 dark:bg-neutral-700/50 border border-neutral-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-[12px] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 outline-none focus:border-primary select-text"
        placeholder={S.oddInstructionPlaceholder}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2 mt-1">
        {/* Se puede disparar vacío: el contexto es opcional. */}
        <Button
          variant="primary"
          fullWidth
          disabled={sending}
          onClick={() => onConfirm(instruction.trim())}
        >
          <Send size={14} />
          {sending ? S.oddSending : S.oddSend}
        </Button>
        <Button variant="ghost" disabled={sending} onClick={onCancel}>
          <X size={14} />
          {S.cancel}
        </Button>
      </div>
    </div>
  );
}
