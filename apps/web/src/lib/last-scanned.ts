import type { ItemListing } from "@ferret/shared";

const WHAT = { label: "Label", barcode: "Barcode", pairing: "Pairing code" } as const;

/** "3 days ago", "2 months ago", "just now" — in the device's language. */
export function whenAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return "just now";
}

/** "Label last scanned 3 days ago by Sam" — or null if it never was. `short`: "Scanned 3 days ago". */
export function lastScannedText(s: ItemListing["lastScanned"], short = false) {
  if (!s) return null;
  if (short) return `Scanned ${whenAgo(s.at)}`;
  return `${WHAT[s.how]} last scanned ${whenAgo(s.at)}${s.by ? ` by ${s.by}` : ""}`;
}
