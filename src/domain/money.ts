const PRICE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function parsePriceToCents(input: string): number {
  const normalized = input.trim().replace(/[¥￥]/g, "").replace(/元$/u, "").trim();
  if (!PRICE_PATTERN.test(normalized)) {
    throw new Error("Invalid price");
  }

  const [yuan, fraction = ""] = normalized.split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Invalid price");
  }
  return cents;
}

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Cents must be an integer");
  }
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}¥${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
