"use client";

// Where an uploaded image's save to the user's assets stands (#323): a pill
// inside the node's bottom-left corner while it uploads, and with Retry if
// it failed. Nothing once it is stored -- or in local dev, where the board
// keeps its own copy and the badge only flashes.

import { useKonvaNodes } from "@/store/konvaNodes.store";
import { useNodeUploads } from "@/store/nodeUploads.store";
import { useViewport } from "@/store/viewport.store";
import { retryNodeUpload } from "../board/uploadAsset";
import { Z_INDEX } from "@/constants/canvas.constants";
import "./UploadBadges.scss";

// Inset from the node's corner, in screen px: the badge sits on the image.
const INSET = 8;
// A node narrower than this on screen has no room for a badge.
const MIN_NODE_W = 120;

export default function UploadBadges() {
  const uploads = useNodeUploads((s) => s.uploads);
  const nodes = useKonvaNodes((s) => s.nodes);
  const { x: stageX, y: stageY, scale } = useViewport();

  return (
    <>
      {Object.entries(uploads).map(([id, upload]) => {
        const n = nodes[id];
        if (!n || n.canvasW * scale < MIN_NODE_W) return null;
        const left = stageX + n.canvasX * scale + INSET;
        const bottom = stageY + (n.canvasY + n.canvasH) * scale - INSET;
        return (
          <div
            key={id}
            className="upload-badge"
            data-state={upload.state}
            role={upload.state === "failed" ? "alert" : "status"}
            // Positioned by transform, as the labels are: they all move on
            // every pan and zoom frame.
            style={{ transform: `translate3d(${left}px, ${bottom}px, 0) translateY(-100%)`, zIndex: Z_INDEX.labels }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {upload.state === "uploading" ? (
              <span>Saving…</span>
            ) : (
              <>
                <span>{upload.message}</span>
                <button type="button" className="upload-badge-retry" onClick={() => retryNodeUpload(id)}>
                  Retry
                </button>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
