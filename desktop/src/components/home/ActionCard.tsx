import type { ReactNode } from "react";

interface ActionCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

export function ActionCard({
  icon,
  title,
  description,
  onClick,
}: ActionCardProps) {
  return (
    <button
      onClick={onClick}
      className="
        flex-1 flex flex-col items-center justify-center gap-3
        p-6 rounded-xl
        bg-white dark:bg-neutral-800/50
        border border-neutral-200 dark:border-neutral-700/50
        hover:border-primary/30 dark:hover:border-primary/30
        hover:bg-blue-50/50 dark:hover:bg-blue-950/10
        active:scale-[0.98]
        transition-all duration-150
        cursor-pointer
        group
      "
    >
      <div className="text-neutral-400 dark:text-neutral-500 group-hover:text-primary transition-colors duration-150">
        {icon}
      </div>
      <div className="text-center">
        <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-500 mt-0.5">
          {description}
        </p>
      </div>
    </button>
  );
}
