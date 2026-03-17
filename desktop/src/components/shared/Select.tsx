interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function Select({
  label,
  options,
  value,
  onChange,
  disabled,
}: SelectProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[13px] text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="
          px-3 py-1.5 rounded-md text-[13px]
          bg-white dark:bg-neutral-800
          border border-neutral-200 dark:border-neutral-700
          text-neutral-900 dark:text-neutral-100
          disabled:opacity-50
          cursor-pointer
          min-w-[140px]
        "
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
