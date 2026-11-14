"use client";

// The top of a node's form (#561): what is being created and for which
// node, with the close button. Props only -- no store and no
// kind -- so it is rendered and tested alone, and any form can use it.
//
// `children` is a slot under the title for a control that belongs to the
// heading. The model picker sits there until it becomes a field (#562).

import type { ReactNode } from "react";
import { X } from "lucide-react";

export interface NodeFormHeaderProps {
  title: string;
  /** The node the form belongs to, as named on the board. */
  nodeName?: string;
  onClose: () => void;
  children?: ReactNode;
}

export default function NodeFormHeader({ title, nodeName, onClose, children }: NodeFormHeaderProps) {
  return (
    <header className="node-form-header">
      <div className="node-form-header-row">
        <div className="node-form-header-heading">
          <h2 className="node-form-header-title">{title}</h2>
          {nodeName && (
            // The same name, in the same accent, as on the open node (#559):
            // the link between the two does not rest on colour alone.
            <span className="node-form-header-name" title={nodeName}>
              {nodeName}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} className="node-form-header-close" aria-label="Close">
          <X size={15} />
        </button>
      </div>
      {children}
    </header>
  );
}
