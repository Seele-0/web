import { parseMenuImportText, parseOrderImportText } from "./import-text";

describe("parseMenuImportText", () => {
  it("parses menu rows, ignores blank rows, and preserves source line numbers", () => {
    expect(parseMenuImportText("黄瓜火腿 -- 12\n\n 麻婆豆腐 -- 12.50 ")).toEqual({
      items: [
        { name: "黄瓜火腿", priceCents: 1200, sourceLine: 1 },
        { name: "麻婆豆腐", priceCents: 1250, sourceLine: 3 },
      ],
      errors: [],
    });
  });

  it("reports exact source lines and messages for invalid menu rows", () => {
    const result = parseMenuImportText([
      "酸菜鱼 -- 68 -- 2",
      "酸菜鱼 -- 68",
      "酸菜鱼 -- 72",
      " -- 12",
      "坏价格 -- 12.345",
      "零元菜 -- 0",
    ].join("\n"));

    expect(result.items).toEqual([
      { name: "酸菜鱼", priceCents: 6800, sourceLine: 2 },
    ]);
    expect(result.errors).toEqual([
      {
        sourceLine: 1,
        message: "每行必须是：菜品名称 -- 价格",
        source: "酸菜鱼 -- 68 -- 2",
      },
      { sourceLine: 3, message: "菜品名称重复", source: "酸菜鱼 -- 72" },
      { sourceLine: 4, message: "菜品名称不能为空", source: " -- 12" },
      { sourceLine: 5, message: "价格格式无效", source: "坏价格 -- 12.345" },
      { sourceLine: 6, message: "价格格式无效", source: "零元菜 -- 0" },
    ]);
  });

  it("accepts currency symbols and inclusive price boundaries", () => {
    expect(parseMenuImportText("一分钱菜 -- ￥0.01\n最高价菜 -- ¥100000.00")).toEqual({
      items: [
        { name: "一分钱菜", priceCents: 1, sourceLine: 1 },
        { name: "最高价菜", priceCents: 10_000_000, sourceLine: 2 },
      ],
      errors: [],
    });
  });

  it("rejects prices above the maximum boundary", () => {
    expect(parseMenuImportText("超价菜 -- 100000.01")).toEqual({
      items: [],
      errors: [
        { sourceLine: 1, message: "价格格式无效", source: "超价菜 -- 100000.01" },
      ],
    });
  });
});

describe("parseOrderImportText", () => {
  it("parses ordered dishes with integer quantities", () => {
    expect(parseOrderImportText("黄瓜火腿 -- 12 -- 3\n麻婆豆腐--12--2")).toEqual({
      items: [
        { name: "黄瓜火腿", priceCents: 1200, quantity: 3, sourceLine: 1 },
        { name: "麻婆豆腐", priceCents: 1200, quantity: 2, sourceLine: 2 },
      ],
      errors: [],
    });
  });

  it.each(["0", "1.5", "1000", "数量"])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(parseOrderImportText(`黄瓜火腿 -- 12 -- ${quantity}`)).toEqual({
        items: [],
        errors: [
          {
            sourceLine: 1,
            message: "数量必须是 1 到 999 的整数",
            source: `黄瓜火腿 -- 12 -- ${quantity}`,
          },
        ],
      });
    },
  );

  it("reports order column, empty-name, duplicate-name, and price errors", () => {
    const result = parseOrderImportText([
      "少一列 -- 12",
      "麻婆豆腐 -- 12 -- 2",
      "麻婆豆腐 -- 15 -- 3",
      " -- 12 -- 1",
      "坏价格 -- 100000.01 -- 1",
    ].join("\n"));

    expect(result.items).toEqual([
      { name: "麻婆豆腐", priceCents: 1200, quantity: 2, sourceLine: 2 },
    ]);
    expect(result.errors).toEqual([
      {
        sourceLine: 1,
        message: "每行必须是：菜品名称 -- 价格 -- 数量",
        source: "少一列 -- 12",
      },
      { sourceLine: 3, message: "菜品名称重复", source: "麻婆豆腐 -- 15 -- 3" },
      { sourceLine: 4, message: "菜品名称不能为空", source: " -- 12 -- 1" },
      { sourceLine: 5, message: "价格格式无效", source: "坏价格 -- 100000.01 -- 1" },
    ]);
  });
});
