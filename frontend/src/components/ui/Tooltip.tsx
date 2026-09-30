import type { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

// TODO: implement a proper tooltip with positioning and delay.
// For now wraps children with a native title attribute.
export default function Tooltip({ content, children }: TooltipProps) {
  return (
    <div title={content} className="relative inline-flex">
      {children}
    </div>
  );
}
