import type { ItemListing } from "@ferret/shared";
import { t, ph, msg } from "@lingui/core/macro";

const WHAT = { label: msg`Label`, barcode: msg`Barcode`, pairing: msg`Pairing code` } as const;

/** "3 days ago", "2 months ago", "just now" — in the device's language. */
export function whenAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return t`just now`;
}

/** "Label last scanned 3 days ago by Sam" — or null if it never was. `short`: "Scanned 3 days ago". */
export function lastScannedText(s: ItemListing["lastScanned"], short = false) {
  if (!s) return null;
  if (short) return t`Scanned ${ph({ when: whenAgo(s.at) })}`;
  const what = t(WHAT[s.how]);
  return s.by ? t`${ph({ what })} last scanned ${ph({ when: whenAgo(s.at) })} by ${ph({ person: s.by })}` : t`${ph({ what })} last scanned ${ph({ when: whenAgo(s.at) })}`;
}
