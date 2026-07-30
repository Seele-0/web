import { parsePriceToCents } from "./money";

export type ParsedMenuItem = {
  name: string;
  priceCents: number;
  sourceLine: number;
};

export type MenuParseError = {
  sourceLine: number;
  message: string;
  source: string;
};

function tableColumns(line: string): string[] {
  const trimmed = line.trim();
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((part) => part.trim());
}

function isSeparator(columns: string[]): boolean {
  return columns.length >= 2 && columns.every((column) => /^:?-{3,}:?$/.test(column));
}

function isHeader(columns: string[]): boolean {
  return columns.length >= 2 && /菜品|名称/.test(columns[0]) && /价格|单价/.test(columns[1]);
}

export function parseMenuMarkdown(markdown: string): {
  items: ParsedMenuItem[];
  errors: MenuParseError[];
} {
  const items: ParsedMenuItem[] = [];
  const errors: MenuParseError[] = [];
  const seenNames = new Set<string>();

  markdown.split(/\r?\n/).forEach((source, index) => {
    const sourceLine = index + 1;
    const trimmed = source.trim();
    if (!trimmed || /^#{1,6}(?:\s|$)/.test(trimmed)) return;

    const isList = /^(?:[-+*]|\d+\.)\s*/.test(trimmed);
    const listContent = trimmed.replace(/^(?:[-+*]|\d+\.)\s*/, "");
    const columns = isList
      ? listContent.split("|").map((part) => part.trim())
      : tableColumns(listContent);
    if (isSeparator(columns) || isHeader(columns)) return;

    if (columns.length !== 2) {
      errors.push({ sourceLine, message: "每行必须包含菜品名称和价格", source });
      return;
    }

    const name = columns[0].trim();
    if (!name) {
      errors.push({ sourceLine, message: "菜品名称不能为空", source });
      return;
    }
    if (seenNames.has(name)) {
      errors.push({ sourceLine, message: "菜品名称重复", source });
      return;
    }

    try {
      const priceCents = parsePriceToCents(columns[1].replace(/￥/g, "¥"));
      seenNames.add(name);
      items.push({ name, priceCents, sourceLine });
    } catch {
      errors.push({ sourceLine, message: "价格格式无效", source });
    }
  });

  return { items, errors };
}
