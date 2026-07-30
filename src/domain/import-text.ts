import { parsePriceToCents } from "./money";

export type ImportParseError = {
  sourceLine: number;
  message: string;
  source: string;
};

export type ParsedMenuImportItem = {
  name: string;
  priceCents: number;
  sourceLine: number;
};

export type ParsedOrderImportItem = ParsedMenuImportItem & {
  quantity: number;
};

type ImportParseResult<T> = {
  items: T[];
  errors: ImportParseError[];
};

const MIN_PRICE_CENTS = 1;
const MAX_PRICE_CENTS = 10_000_000;
const QUANTITY_PATTERN = /^\d+$/;

function parsePrice(input: string): number | undefined {
  try {
    const priceCents = parsePriceToCents(input.replace(/￥/g, "¥"));
    if (priceCents < MIN_PRICE_CENTS || priceCents > MAX_PRICE_CENTS) {
      return undefined;
    }
    return priceCents;
  } catch {
    return undefined;
  }
}

export function parseMenuImportText(text: string): ImportParseResult<ParsedMenuImportItem> {
  const items: ParsedMenuImportItem[] = [];
  const errors: ImportParseError[] = [];
  const seenNames = new Set<string>();

  text.split(/\r?\n/).forEach((source, index) => {
    if (!source.trim()) return;

    const sourceLine = index + 1;
    const columns = source.split("--").map((column) => column.trim());
    if (columns.length !== 2) {
      errors.push({ sourceLine, message: "每行必须是：菜品名称 -- 价格", source });
      return;
    }

    const [name, priceText] = columns;
    if (!name) {
      errors.push({ sourceLine, message: "菜品名称不能为空", source });
      return;
    }
    if (seenNames.has(name)) {
      errors.push({ sourceLine, message: "菜品名称重复", source });
      return;
    }
    seenNames.add(name);

    const priceCents = parsePrice(priceText);
    if (priceCents === undefined) {
      errors.push({ sourceLine, message: "价格格式无效", source });
      return;
    }

    items.push({ name, priceCents, sourceLine });
  });

  return { items, errors };
}

export function parseOrderImportText(text: string): ImportParseResult<ParsedOrderImportItem> {
  const items: ParsedOrderImportItem[] = [];
  const errors: ImportParseError[] = [];
  const seenNames = new Set<string>();

  text.split(/\r?\n/).forEach((source, index) => {
    if (!source.trim()) return;

    const sourceLine = index + 1;
    const columns = source.split("--").map((column) => column.trim());
    if (columns.length !== 3) {
      errors.push({ sourceLine, message: "每行必须是：菜品名称 -- 价格 -- 数量", source });
      return;
    }

    const [name, priceText, quantityText] = columns;
    if (!name) {
      errors.push({ sourceLine, message: "菜品名称不能为空", source });
      return;
    }
    if (seenNames.has(name)) {
      errors.push({ sourceLine, message: "菜品名称重复", source });
      return;
    }
    seenNames.add(name);

    const priceCents = parsePrice(priceText);
    if (priceCents === undefined) {
      errors.push({ sourceLine, message: "价格格式无效", source });
      return;
    }

    const quantity = Number(quantityText);
    if (!QUANTITY_PATTERN.test(quantityText) || quantity < 1 || quantity > 999) {
      errors.push({ sourceLine, message: "数量必须是 1 到 999 的整数", source });
      return;
    }

    items.push({ name, priceCents, quantity, sourceLine });
  });

  return { items, errors };
}
