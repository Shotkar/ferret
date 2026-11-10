/**
 * Ferret's war dance: the sideways hop real ferrets do when they're happy, with the "dook dook" they make while they're at it.
 * Four ways in: the Konami code, tapping the paw logo seven times, scanning a QR code that says DOOK, and April 2
 * (National Ferret Day in the US), when the logo wears a party hat. WarDance.tsx draws it; nothing here talks to the
 * server, and none of it is translated on purpose (it's a secret, and Weblate would give it away).
 */

const EVENT = "ferret:dance";

/** Start the dance (WarDance.tsx listens). Safe to call while one is on: it's ignored. */
export function dance() {
  window.dispatchEvent(new Event(EVENT));
}

export function onDance(run: () => void) {
  window.addEventListener(EVENT, run);
  return () => window.removeEventListener(EVENT, run);
}

/** A scanned code that starts the dance instead of looking anything up. */
export function isDook(code: string) {
  return code.trim().toUpperCase() === "DOOK";
}

/** April 2 on this device, or `?ferretday` in development. */
export function isFerretDay(now = new Date()) {
  if (import.meta.env.DEV && /[?&]ferretday\b/.test(location.search)) return true;
  return now.getMonth() === 3 && now.getDate() === 2;
}

/** Seven taps on the logo, each within 700 ms of the last. The logo is a link home, so taps still do that too. */
let taps = 0;
let lastTap = 0;
export function tapLogo() {
  const now = Date.now();
  taps = now - lastTap < 700 ? taps + 1 : 1;
  lastTap = now;
  if (taps >= 7) {
    taps = 0;
    dance();
  }
}

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/** ↑ ↑ ↓ ↓ ← → ← → B A, anywhere but while typing in a field. */
export function listenForKonami() {
  let at = 0;
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest?.("input, textarea, select, [contenteditable='true']")) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    at = key === KONAMI[at] ? at + 1 : key === KONAMI[0] ? 1 : 0;
    if (at === KONAMI.length) {
      at = 0;
      dance();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

let audio: AudioContext | null = null;

/** "Dook dook dook": short clucks that drop in pitch, a little uneven like the real thing. Silent where audio isn't allowed. */
export function dookDook(count = 7) {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    void ctx.resume();
    let at = ctx.currentTime + 0.05;
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pitch = 520 + Math.random() * 120;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitch, at);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.55, at + 0.07);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.09);
      at += 0.11 + Math.random() * 0.07;
    }
  } catch {
    // no sound: the dance is enough
  }
  navigator.vibrate?.([40, 80, 40, 80, 40]);
}

/** For whoever opens the browser's console. */
export function greetConsole() {
  const ferret = [
    "    ,-.___,-.",
    "    \\_/_ _\\_/",
    "      )O_O(      dook dook!",
    "     { (_) }",
    "      `-^-'",
  ].join("\n");
  console.log(`%c${ferret}`, "color:#b5651d;font-family:monospace;font-weight:bold");
  console.log("Psst. This ferret dances for anyone who shows it a QR code that says DOOK.");
  console.log("Want to help build Ferret? https://github.com/ferret-project/ferret/blob/main/CONTRIBUTING.md");
}
