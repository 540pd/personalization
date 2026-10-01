import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tooltip?: string;
  children: ReactNode;
}

export default function IconButton({
  active = false,
  tooltip,
  className = "",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      title={tooltip}
      {...props}
      className={[
        "w-9 h-9 flex items-center justify-center rounded-full text-sm transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        active
          ? "bg-white text-neutral-900"
          : "text-neutral-300 hover:bg-neutral-700 hover:text-white",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
