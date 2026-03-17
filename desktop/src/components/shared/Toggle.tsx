interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: ToggleProps) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <div>
        <span className="text-[13px] text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        {description && (
          <span className="text-[11px] text-neutral-500 dark:text-neutral-500 ml-1.5">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative w-9 h-5 rounded-full transition-colors duration-200
          ${checked ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-600"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <span
          className={`
            absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white
            transition-transform duration-200 shadow-sm
            ${checked ? "translate-x-4" : "translate-x-0"}
          `}
        />
      </button>
    </label>
  );
}
