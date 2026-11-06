import DefaultTheme from "vitepress/theme";
import { onContentUpdated } from "vitepress";
import type { Theme } from "vitepress";
import "./ferret.css";

/** api-pages.mjs writes requests for this address; a real Ferret's help shows its own instead. */
const PLACEHOLDER = "https://ferret.example.com";
const LANG_KEY = "ferret.api.lang";

/** On the API pages: this Ferret's address in every request (copy buttons copy what's shown). */
function ownAddress() {
  if (import.meta.env.DEV || !location.pathname.includes("/docs/api/")) return;
  const doc = document.querySelector(".vp-doc");
  if (!doc) return;
  const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue?.includes(PLACEHOLDER)) node.nodeValue = node.nodeValue.replaceAll(PLACEHOLDER, location.origin);
  }
}

/** Every curl / JavaScript / Python tab on the page follows the one picked, and the choice is remembered. */
function pickLanguage(label: string) {
  for (const tab of document.querySelectorAll<HTMLLabelElement>(".vp-code-group .tabs label")) {
    if (tab.textContent?.trim() !== label) continue;
    const input = document.getElementById(tab.htmlFor) as HTMLInputElement | null;
    if (input && !input.checked) input.click();
  }
}
function restoreLanguage() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LANG_KEY);
  } catch {
    // no storage: every group starts on its first tab
  }
  if (saved) pickLanguage(saved);
}

export default {
  extends: DefaultTheme,
  setup() {
    onContentUpdated(() => {
      ownAddress();
      restoreLanguage();
    });
  },
  enhanceApp() {
    if (typeof document === "undefined") return;
    document.addEventListener("click", (e) => {
      const tab = (e.target as Element | null)?.closest?.(".vp-code-group .tabs label");
      if (!(tab instanceof HTMLLabelElement) || !e.isTrusted) return;
      const label = tab.textContent?.trim() ?? "";
      try {
        localStorage.setItem(LANG_KEY, label);
      } catch {
        // remembered for this page only
      }
      requestAnimationFrame(() => pickLanguage(label));
    });
  },
} satisfies Theme;
