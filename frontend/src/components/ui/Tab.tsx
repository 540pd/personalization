import type { ButtonHTMLAttributes } from "react";

interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export default function Tab({ active = false, className = "", children, ...props }: TabProps) {
  return (
    <button
      {...props}
      className={[
        "px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "text-white border-b-2 border-white"
          : "text-neutral-400 hover:text-neutral-200",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
