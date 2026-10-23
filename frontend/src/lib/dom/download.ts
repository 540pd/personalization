/** Downloads `text` as a file called `name`. Throws if the browser refuses; callers log and report it. */
export function downloadText(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  // After the click has handed the URL to the download, not before.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
