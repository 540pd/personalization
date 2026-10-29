# Implementation Prompt: Playspace Settings — Canvas Menu Visibility

## Role and objective
You are a senior frontend engineer working on an existing **Playspace / Creative Studio** UI with a canvas. Extend the existing **Settings** menu located in the **bottom-left corner** to let users configure which options appear under **Add to canvas** and **Shapes**. Implement the feature within the current architecture and design system, without rebuilding the canvas or changing unrelated workflows.

## Before making changes
1. Inspect the existing Settings entry point, **Add to canvas** menu, **Shapes** menu, corresponding actions, menu configuration, and state-management conventions.
2. Reuse existing components, icons, styles, accessibility patterns, and theme support. Do not introduce a new UI library unless absolutely necessary.
3. Identify where the menus are rendered (toolbar, dropdown, context menu, command palette, etc.) and apply the same configuration consistently to all existing entry points that expose these items.
4. Preserve the existing creation behavior for every item when it is available; this task controls **availability in the menus**, not the implementation of the underlying creation tools.

## Required settings
Add two clearly labeled sections inside the existing bottom-left **Settings** menu. Use switch/toggle controls with labels. The settings represent user-configurable **show/hide** choices, *not* permanently disabled, unclickable menu commands.

### 1. Add to canvas

| Menu item | Initial setting | Editable in Settings? | Expected behavior |
|---|---|---|---|
| Video | OFF | Yes | Hidden from **Add to canvas** initially; appears and functions normally when switched ON. |
| Prompt | ON | Yes | Visible initially; hidden when switched OFF. |
| Compose | ON | Yes | Visible initially; hidden when switched OFF. |
| Image | Always ON | **No** | Always visible and usable in Playspace. Do not add an Image toggle or allow Settings to hide it. |

**Display order:** Preserve the current ordering of options if it already exists. Otherwise use **Image, Video, Prompt, Compose**, omitting any optional items set to OFF.

### 2. Shapes

| Shape | Initial setting | Editable in Settings? | Expected behavior |
|---|---|---|---|
| Rectangle | ON | Yes | Visible initially; hidden when switched OFF. |
| Arrow | ON | Yes | Visible initially; hidden when switched OFF. |
| Line | OFF | Yes | Hidden initially; appears when switched ON. |
| Ellipse | OFF | Yes | Hidden initially; appears when switched ON. |
| Triangle | OFF | Yes | Hidden initially; appears when switched ON. |
| Block Arrow | OFF | Yes | Hidden initially; appears when switched ON. |
| Diamond | ON | Yes | Visible initially; hidden when switched OFF. |

**Display order:** Rectangle, Arrow, Line, Ellipse, Triangle, Block Arrow, Diamond (unless the existing UI has an established order that should be preserved).

**Important interpretation:** “Disabled by default” means **toggle OFF on initial load** and **option hidden from the corresponding canvas menu**. It does **not** mean the toggle itself is greyed out or cannot be enabled. Every listed toggle except the implicit, permanently ON Image option must remain interactive.

## User experience and visual design
- The bottom-left Settings entry point should continue to work as it does today.
- Organize the content into the **Add to canvas** and **Shapes** sections with clear visual hierarchy, consistent padding and spacing, and a divider or equivalent separation.
- Show each setting as **label on the left, toggle on the right**; make the full accessible control target usable where appropriate.
- The checked/unchecked visual states must match the app's existing components, light/dark themes, hover/focus styles, and keyboard interaction.
- Keep the menu compact and usable at the app's supported viewport sizes. If needed, allow the settings panel to scroll rather than overflow the viewport.
- Changes should apply **immediately** to affected menus without reload, Save, or Apply buttons.
- Image should not appear as a configurable setting. It must remain available in **Add to canvas** regardless of other toggles.
- Do not add unrelated settings, redesign the left navigation, or rename existing menu commands as part of this change.

