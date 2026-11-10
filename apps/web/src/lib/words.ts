/**
 * Words for the values Ferret stores in English (an item's condition…): the stored value stays as it is, and
 * these are what people read, in their language.
 */
import { i18n, type MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import type { AiFillKind, ImportField, intervalUnits, itemConditions, PlanFeature, usageUnits } from "@ferret/shared/utils";

type Condition = (typeof itemConditions)[number];

const CONDITION: Record<Condition, MessageDescriptor> = {
  new: msg`New`,
  excellent: msg`Excellent`,
  good: msg`Good`,
  fair: msg`Fair`,
  poor: msg`Poor`,
};
const IN_CONDITION: Record<Condition, MessageDescriptor> = {
  new: msg`New condition`,
  excellent: msg`Excellent condition`,
  good: msg`Good condition`,
  fair: msg`Fair condition`,
  poor: msg`Poor condition`,
};

const word = <K extends string>(table: Record<K, MessageDescriptor>, value: string) => (value in table ? i18n._(table[value as K]) : value);

/** "Good" */
export const conditionWord = (c: string) => word(CONDITION, c);
/** "Good condition" */
export const conditionPhrase = (c: string) => word(IN_CONDITION, c);

type IntervalUnit = (typeof intervalUnits)[number];
type UsageUnit = (typeof usageUnits)[number];

/** "every 3 months", "every week"; "once" without a repeat. */
export function everyText(count: number | null | undefined, unit: IntervalUnit | null | undefined) {
  if (!count || !unit) return i18n._(msg`once`);
  switch (unit) {
    case "day":
      return plural(count, { one: "every day", other: "every # days" });
    case "week":
      return plural(count, { one: "every week", other: "every # weeks" });
    case "month":
      return plural(count, { one: "every month", other: "every # months" });
    case "year":
      return plural(count, { one: "every year", other: "every # years" });
  }
}

/** "a month", "3 months" — a schedule's time after "or". */
export function spanText(count: number, unit: IntervalUnit) {
  switch (unit) {
    case "day":
      return plural(count, { one: "a day", other: "# days" });
    case "week":
      return plural(count, { one: "a week", other: "# weeks" });
    case "month":
      return plural(count, { one: "a month", other: "# months" });
    case "year":
      return plural(count, { one: "a year", other: "# years" });
  }
}

/** "5,000 miles", "1 hour" — a counter's reading (shared's describeUsage, in the reader's language). */
export function usageText(amount: number, unit: UsageUnit) {
  const n = Math.round(amount * 10) / 10;
  switch (unit) {
    case "miles":
      return plural(n, { one: "# mile", other: "# miles" });
    case "km":
      return plural(n, { one: "# km", other: "# km" });
    case "hours":
      return plural(n, { one: "# hour", other: "# hours" });
    case "cycles":
      return plural(n, { one: "# cycle", other: "# cycles" });
  }
}

// Shared's English tables (@ferret/shared/utils — the server and MCP use them as they are), in the reader's language.

const IMPORT_FIELD: Record<ImportField, MessageDescriptor> = {
  name: msg`Name`,
  description: msg`Description`,
  brand: msg`Brand / maker`,
  model: msg`Model`,
  serialNumber: msg`Serial number`,
  barcode: msg`Barcode`,
  quantity: msg`Quantity`,
  condition: msg`Condition`,
  purchaseDate: msg`Purchase date`,
  returnBy: msg`Return by`,
  purchasePrice: msg`Price paid (each)`,
  purchaseTotal: msg`Price paid (total)`,
  value: msg`Value (each)`,
  place: msg`Where it is`,
  category: msg`Category`,
  tags: msg`Tags`,
  notes: msg`Notes`,
  warrantyEnds: msg`Warranty until`,
  soldOn: msg`Sold on`,
  soldPrice: msg`Sold for`,
  link: msg`Web link`,
  asin: msg`Amazon product (ASIN)`,
};
/** A spreadsheet column's meaning: "Price paid (each)" (IMPORT_FIELDS). */
export const importFieldWord = (field: ImportField) => i18n._(IMPORT_FIELD[field]);

const PLAN_FEATURE: Record<PlanFeature, MessageDescriptor> = {
  apiKeys: msg`API keys (scripts and Claude)`,
  shareLinks: msg`Share links`,
  calendarFeeds: msg`Calendar feeds`,
};
/** PLAN_FEATURE_NAMES */
export const planFeatureWord = (feature: PlanFeature) => i18n._(PLAN_FEATURE[feature]);

const AI_FILL_KIND: Record<AiFillKind, { label: MessageDescriptor; hint: MessageDescriptor }> = {
  details: { label: msg`Details from photos and receipts`, hint: msg`Brand, model, serial number, barcode, purchase date and price paid — only empty fields` },
  returnBy: { label: msg`Return-by dates`, hint: msg`The last day to return it, from a receipt` },
  warranty: { label: msg`Warranties`, hint: msg`From a receipt or warranty card, when the purchase date is known` },
};
/** AI_FILL_KIND_NAMES */
export const aiFillKindWords = (kind: AiFillKind) => ({ label: i18n._(AI_FILL_KIND[kind].label), hint: i18n._(AI_FILL_KIND[kind].hint) });
