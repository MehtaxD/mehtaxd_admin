export function refundMinor(draft: string): number | null {
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(draft)) return null;
  const [whole, fraction = ""] = draft.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
