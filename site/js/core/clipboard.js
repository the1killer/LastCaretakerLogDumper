/**
 * Copies text to the clipboard using the async Clipboard API with a textarea fallback.
 * @param {string} text - Text to copy.
 * @returns {Promise<void>}
 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "readonly");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

/**
 * Clears the current browser text selection if present.
 */
export function clearCopiedSelection() {
  const selection = window.getSelection();
  if (selection && typeof selection.removeAllRanges === "function") {
    selection.removeAllRanges();
  }
}
