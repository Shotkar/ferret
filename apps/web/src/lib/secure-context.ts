/**
 * Stand-ins for browser APIs that only exist on HTTPS (or localhost). Plenty of people open their Ferret at
 * http://192.168.x.x:8787, where `crypto.randomUUID` and `navigator.clipboard` are simply missing — so use these
 * instead of calling them directly.
 */

/** A random v4 UUID. `crypto.getRandomValues` works everywhere; `crypto.randomUUID` only over HTTPS. */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Copy text to the clipboard: the Clipboard API where there is one, else the old select-and-copy. Throws if both fail. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      return await navigator.clipboard.writeText(text);
    } catch {
      // refused (no permission, not focused): try the old way
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.className = "fixed -top-96 opacity-0";
  // Beside the button pressed (inside its dialog, if any), so taking focus doesn't close or scroll anything.
  (document.activeElement?.closest("[role=dialog]") ?? document.body).appendChild(area);
  area.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Couldn't copy");
  } finally {
    area.remove();
  }
}
