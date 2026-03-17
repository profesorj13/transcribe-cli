import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "../shared/Button";
import { S } from "../../lib/strings";

interface ApiKeyFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function ApiKeyField({
  label,
  value,
  onChange,
  onSave,
}: ApiKeyFieldProps) {
  const [editing, setEditing] = useState(false);
  const [visible, setVisible] = useState(false);

  const hasKey = !!value && value.length > 0;

  const maskKey = (key: string) => {
    if (key.length <= 6) return "****";
    return key.slice(0, 3) + "****" + key.slice(-3);
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[13px] text-neutral-600 dark:text-neutral-400">
            {label}
          </span>
          <span className="ml-2 text-[12px] text-neutral-400 dark:text-neutral-600">
            {hasKey ? maskKey(value!) : S.notConfigured}
          </span>
        </div>
        <Button
          variant="ghost"
          onClick={() => setEditing(true)}
          className="text-[12px] px-2 py-1"
        >
          {hasKey ? S.change : S.add}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-[13px] text-neutral-600 dark:text-neutral-400">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type={visible ? "text" : "password"}
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="sk-..."
            className="
              w-full px-3 py-1.5 pr-8 rounded-md text-[13px]
              bg-white dark:bg-neutral-800
              border border-neutral-200 dark:border-neutral-700
              text-neutral-900 dark:text-neutral-100
              placeholder:text-neutral-400
              focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary
            "
          />
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            onSave();
            setEditing(false);
          }}
          className="text-[12px] px-3 py-1"
        >
          {S.save}
        </Button>
      </div>
    </div>
  );
}
