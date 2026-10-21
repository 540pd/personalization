"use client";

// Luma reference: TOOL-01 — Floating creation dock, fixed at bottom-centre.
// Pointer wired. Create, Links, Shapes and Color open submenus; opening one
// closes the others. Keys are in useDockHotkeys.

import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import { useToolStore, shapeKindOf, shapeTool, type Tool } from "@/store/tool.store";
import { useNodePanel } from "@/store/nodePanel.store";
import { useKonvaSelection } from "@/store/konvaSelection.store";
import { useConnectionStore } from "@/store/connection.store";
import { useUpload } from "@/store/upload.store";
import { uploadEvent } from "../../board/upload";
import { createNodeAtViewportCentre } from "../../board/createNode";
import { DEFAULT_SWATCH, pickColor } from "../../board/palette";
import SwatchGrid from "../SwatchGrid";
import { ColorDot, IconGenerate, IconLinks, IconPointer } from "./icons";
import {
  DOCK_ITEM_KIND, GENERATE_IDS, GENERATE_ITEMS, LINK_IDS, LINK_ITEMS, SHAPE_ITEMS, TOOLS_RIGHT, isWritten,
} from "./items";
import { DockButton, DockMenu, DockMenuItem, btnClass } from "./DockMenu";
import { useDockHotkeys } from "./useDockHotkeys";
import "./FloatingDock.scss";

type DockMenuId = "generate" | "links" | "shapes" | "color";

export default function FloatingDock() {
  const { activeTool, setTool, lastShape } = useToolStore();
  // Actions only, by selector: the whole store changes on every node move,
  // and re-rendering the dock for each one was the largest single cost of a
  // Frame drag (#155). The viewport is read when a node is placed, for the
  // same reason -- it changes on every pan and zoom frame.
  const closeAllPanels = useNodePanel((s) => s.closeAllPanels);
  const color = useToolStore((s) => s.color);

  // One menu open at most: opening one closes whichever was.
  const [openMenu, setOpenMenu] = useState<DockMenuId | null>(null);
  const toggleMenu = (id: DockMenuId) => () => setOpenMenu((open) => (open === id ? null : id));
  const closeMenus = useCallback(() => setOpenMenu(null), []);

  const isGenerateActive = GENERATE_IDS.includes(activeTool);
  const isLinksActive = LINK_IDS.includes(activeTool);
  const isShapesActive = shapeKindOf(activeTool) !== null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading = useUpload((s) => s.isUploading);

  // Lit from the moment the dialog opens. Cleared by the last file landing
  // (upload.ts), by a cancelled dialog, or by a pick of nothing.
  const openFilePicker = useCallback(() => {
    useUpload.getState().setUploading(true);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);

    if (!files.length) {
      useUpload.getState().setUploading(false);
      return;
    }

    // No `at`: a picked file has no cursor position, so it goes to the centre.
    uploadEvent.emit({ files });

    e.target.value = "";
  };

  useDockHotkeys(closeMenus, openFilePicker);

  // Dismissing the file dialog fires no change event, so without this the
  // button stays lit forever. Attached directly: React has no synthetic
  // onCancel for a file input.
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const onCancel = () => useUpload.getState().setUploading(false);
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, []);

  const createFrom = (id: Tool) => {
    setTool(id);
    setOpenMenu(null);

    // Creating a node makes it the selection, so clear the
    // others. Without this an uploaded image stayed selected
    // alongside the new node, and because each selection
    // system has its own Delete handler, one keypress
    // destroyed both.
    useKonvaSelection.getState().clearSelection();
    useConnectionStore.getState().clearSelection();

    // Dock item -> node kind.
    const kind = DOCK_ITEM_KIND[id];
    if (kind && createNodeAtViewportCentre(kind)) setTool("pointer");
    else closeAllPanels();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="floating-dock-file-input"
        onChange={handleFileChange}
      />

      <div className="floating-dock-wrapper">
        <div className="floating-dock">
          <DockButton
            label="Select"
            shortcut="V"
            onClick={() => setTool("pointer")}
            pressed={activeTool === "pointer"}
            className={btnClass(activeTool === "pointer")}
          >
            <IconPointer />
          </DockButton>

          <div className="floating-dock-divider" />

          <DockMenu
            label="Create"
            icon={<IconGenerate />}
            open={openMenu === "generate"}
            active={isGenerateActive}
            onToggle={toggleMenu("generate")}
            onClose={closeMenus}
          >
            {GENERATE_ITEMS.map((item, i) => (
              <Fragment key={item.id}>
                {i > 0 && isWritten(item.id) !== isWritten(GENERATE_ITEMS[i - 1].id) && (
                  <div role="separator" className="floating-dock-submenu-divider" />
                )}
                <DockMenuItem
                  icon={item.icon}
                  label={item.label}
                  active={activeTool === item.id}
                  onClick={() => createFrom(item.id)}
                />
              </Fragment>
            ))}
          </DockMenu>

          <DockMenu
            label="Links"
            icon={<IconLinks />}
            open={openMenu === "links"}
            active={isLinksActive}
            onToggle={toggleMenu("links")}
            onClose={closeMenus}
          >
            {LINK_ITEMS.map((item) => (
              <DockMenuItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeTool === item.id}
                onClick={() => {
                  setTool(item.id);
                  setOpenMenu(null);
                  closeAllPanels();
                }}
              />
            ))}
          </DockMenu>

          {/* Right-side tools */}
          {TOOLS_RIGHT.map((tool) => {
            if (tool.id === "shapes") {
              return (
                <DockMenu
                  key={tool.id}
                  label={tool.label}
                  shortcut={tool.shortcut}
                  icon={tool.icon}
                  open={openMenu === "shapes"}
                  active={isShapesActive}
                  onToggle={toggleMenu("shapes")}
                  onClose={closeMenus}
                >
                  {SHAPE_ITEMS.map((item) => (
                    <DockMenuItem
                      key={item.kind}
                      icon={item.icon}
                      label={item.label}
                      shortcut={item.shortcut}
                      // The last shape used, which is also the armed one
                      // while a shape tool is armed: what S brings back.
                      active={item.kind === lastShape}
                      onClick={() => {
                        // Armed like Frame: lit until the draw finishes.
                        setTool(shapeTool(item.kind));
                        setOpenMenu(null);
                      }}
                    />
                  ))}
                </DockMenu>
              );
            }

            if (tool.id === "color") {
              return (
                <DockMenu
                  key={tool.id}
                  label={tool.label}
                  ariaLabel="Color"
                  icon={<ColorDot hex={color ?? DEFAULT_SWATCH.hex} />}
                  open={openMenu === "color"}
                  // Lit only while the card is open: a colour is a setting,
                  // not a tool, so there is nothing to stay armed.
                  state="expanded"
                  onToggle={toggleMenu("color")}
                  onClose={closeMenus}
                  menuClassName="floating-dock-submenu floating-dock-color-card"
                  fitContent={false}
                  role="group"
                  menuLabel="Colors"
                >
                  <SwatchGrid
                    classPrefix="floating-dock"
                    current={color}
                    onPick={(hex) => {
                      pickColor(hex);
                      setOpenMenu(null);
                    }}
                  />
                </DockMenu>
              );
            }

            const isUpload = tool.id === "media-upload";
            // Frame is armed, not immediate: it stays lit until the drag that
            // draws it finishes. Upload opens a dialog. The rest do nothing
            // yet and stay visibly disabled rather than lying.
            // Text is armed the same way: lit until the click that places it.
            const isFrame = tool.id === "frame" || tool.id === "text";
            const isLive = isUpload || isFrame;

            return (
              <DockButton
                key={tool.id}
                label={tool.label}
                shortcut={tool.shortcut}
                tabIndex={isLive ? 0 : -1}
                onClick={
                  isUpload ? openFilePicker
                  : isFrame ? () => setTool(tool.id as Tool)
                  : undefined
                }
                // Both are "pressed" states, but of different kinds: upload
                // is busy until its files land, frame is armed until drawn.
                pressed={
                  isUpload ? isUploading
                  : isFrame ? activeTool === tool.id
                  : undefined
                }
                className={
                  isUpload ? btnClass(isUploading)
                  : isFrame ? btnClass(activeTool === tool.id)
                  : "floating-dock-button-disabled"
                }
              >
                {tool.icon}
              </DockButton>
            );
          })}
        </div>
      </div>
    </>
  );
}
