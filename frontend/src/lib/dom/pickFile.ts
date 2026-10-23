/**
 * Opens the browser's file picker for `accept` and calls `onPicked` with the
 * file chosen, if any. Call it within the click that asked for it, which the
 * picker needs.
 *
 * A fresh input per pick, never one kept in the page: a second
 * input[type=file] beside the dock's upload makes any lookup of "the file
 * input" ambiguous -- the e2e upload helper's among them -- and a new one
 * also fires change for the same file picked twice.
 */
export function pickFile(accept: string, onPicked: (file: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.addEventListener("change", () => {
    const picked = input.files?.[0];
    if (picked) onPicked(picked);
  });
  input.click();
}
