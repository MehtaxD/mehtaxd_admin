export type PriceDraft = string;

type ParsedPrice =
  | { ok: true; value: number | undefined }
  | { ok: false };

const PRICE_DRAFT_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export function formatPriceDraft(
  value: string | number | null | undefined,
): PriceDraft {
  return value === null || value === undefined ? "" : String(value);
}

export function parsePriceDraft(
  draft: PriceDraft,
  optional = false,
): ParsedPrice {
  if (draft === "") {
    return optional ? { ok: true, value: undefined } : { ok: false };
  }
  if (!PRICE_DRAFT_PATTERN.test(draft)) return { ok: false };

  const [whole, fraction = ""] = draft.split(".");
  const minorUnits =
    Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minorUnits)) return { ok: false };

  return { ok: true, value: minorUnits / 100 };
}

export function displayPriceDraft(draft: PriceDraft) {
  const parsed = parsePriceDraft(draft);
  return parsed.ok && parsed.value !== undefined
    ? parsed.value.toFixed(2)
    : null;
}
