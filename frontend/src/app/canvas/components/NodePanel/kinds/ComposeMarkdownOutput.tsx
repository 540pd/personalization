"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NodeOutputProps } from "../nodeKinds";

const MAX_MARKDOWN_CHARS = 8 * 1024;
const remarkPlugins = [remarkGfm];

function ComposeMarkdownOutput({ value, onLinkClick }: NodeOutputProps) {
  if (value.length > MAX_MARKDOWN_CHARS) {
    return <div className="node-panel-text-output">{value}</div>;
  }

  const components: Components = {
    img: () => null,
    a: ({ children, href, ...props }) => (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-compose-link
        onClick={onLinkClick}
      >
        {children}
      </a>
    ),
  };

  return (
    <div
      className="node-panel-text-output node-panel-compose-markdown"
      onWheel={(event) => event.stopPropagation()}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {value}
      </ReactMarkdown>
    </div>
  );
}

export default memo(
  ComposeMarkdownOutput,
  (previous, next) => previous.value === next.value && previous.onLinkClick === next.onLinkClick
);
