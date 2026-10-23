import { describe, expect, it } from "vitest";
import { canSaveForm, isDirty, savePlan } from "../itemForm";
import type { Listed } from "../fields";

const item = (id: string, name: string): Listed => ({ id, name, description: "Does a thing", tags: ["copy"] });
const form = { name: "brand-voice", description: "Does a thing", tags: ["copy"], fileChanged: false };

describe("isDirty", () => {
  const saved = item("a", "brand-voice");

  it("is never dirty while uploading", () => {
    expect(isDirty(undefined, { ...form, name: "other", fileChanged: true })).toBe(false);
  });

  it("is clean when the fields match the saved item", () => {
    expect(isDirty(saved, form)).toBe(false);
    // Compared as a handle and trimmed, as a save would store them.
    expect(isDirty(saved, { ...form, name: "Brand Voice", description: " Does a thing " })).toBe(false);
  });

  it("is dirty for a new file, name, description or tags", () => {
    expect(isDirty(saved, { ...form, fileChanged: true })).toBe(true);
    expect(isDirty(saved, { ...form, name: "brand-tone" })).toBe(true);
    expect(isDirty(saved, { ...form, description: "Another thing" })).toBe(true);
    expect(isDirty(saved, { ...form, tags: ["copy", "tone"] })).toBe(true);
  });
});

describe("canSaveForm", () => {
  const ok = { hasFile: true, errors: { name: null, description: null }, editing: false, dirty: false };

  it("needs a file and valid fields", () => {
    expect(canSaveForm(ok)).toBe(true);
    expect(canSaveForm({ ...ok, hasFile: false })).toBe(false);
    expect(canSaveForm({ ...ok, errors: { name: "Enter a name", description: null } })).toBe(false);
    expect(canSaveForm({ ...ok, errors: { name: null, description: "Enter a description" } })).toBe(false);
  });

  it("needs a change while editing", () => {
    expect(canSaveForm({ ...ok, editing: true })).toBe(false);
    expect(canSaveForm({ ...ok, editing: true, dirty: true })).toBe(true);
  });
});

describe("savePlan", () => {
  const items = [item("a", "brand-voice"), item("b", "brand-voice-2")];

  it("adds under the typed name, as a handle", () => {
    expect(savePlan({ mode: "new", name: "Copy Writer", items })).toEqual({ name: "copy-writer", how: "added" });
  });

  it("keeps both under the first free name", () => {
    expect(savePlan({ mode: "keep", name: "brand-voice", duplicate: items[0], items })).toEqual({
      name: "brand-voice-3",
      how: "added",
    });
  });

  it("replaces the duplicate under its own name", () => {
    expect(savePlan({ mode: "replace", name: "Brand Voice", duplicate: items[0], items })).toEqual({
      name: "brand-voice",
      how: "replaced",
      base: items[0],
    });
  });

  it("saves an edit over the item being edited, whatever the mode", () => {
    expect(savePlan({ mode: "new", name: "Brand Tone", editing: items[1], items })).toEqual({
      name: "brand-tone",
      how: "saved",
      base: items[1],
    });
  });

  it("adds when asked to replace with no duplicate", () => {
    expect(savePlan({ mode: "replace", name: "x", items }).how).toBe("added");
  });
});
