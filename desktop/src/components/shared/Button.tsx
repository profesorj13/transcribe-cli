import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover active:bg-blue-800 disabled:bg-blue-300 dark:disabled:bg-blue-900",
  secondary:
    "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-750 active:bg-neutral-100",
  ghost:
    "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:bg-neutral-200",
  danger:
    "bg-recording text-white hover:bg-recording-hover active:bg-red-800",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        px-4 py-2 rounded-lg text-[13px] font-medium
        transition-colors duration-150 cursor-pointer
        disabled:cursor-not-allowed disabled:opacity-50
        ${fullWidth ? "w-full" : ""}
        ${variantClasses[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
