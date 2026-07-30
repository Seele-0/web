import { parseMenuMarkdown } from "./menu-markdown";

describe("parseMenuMarkdown", () => {
  it("parses list input and preserves source lines", () => {
    expect(parseMenuMarkdown("- 酸菜鱼 | ¥68\n- 干锅花菜 | 32.50")).toEqual({
      items: [
        { name: "酸菜鱼", priceCents: 6800, sourceLine: 1 },
        { name: "干锅花菜", priceCents: 3250, sourceLine: 2 },
      ],
      errors: [],
    });
  });

  it("parses a two-column markdown table and skips headers and separators", () => {
    const result = parseMenuMarkdown("| 菜品 | 价格 |\n| --- | ---: |\n| 酸菜鱼 | ￥68元 |\n| 米饭 | 2 |");
    expect(result.items).toEqual([
      { name: "酸菜鱼", priceCents: 6800, sourceLine: 3 },
      { name: "米饭", priceCents: 200, sourceLine: 4 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("ignores blank lines and markdown headings", () => {
    expect(parseMenuMarkdown("# 今日菜单\n\n## 热菜").items).toEqual([]);
  });

  it("collects duplicate, empty-name, and invalid-price errors", () => {
    const result = parseMenuMarkdown([
      "- 酸菜鱼 | 68",
      "- 酸菜鱼 | 72",
      "- | 12",
      "- 负数菜 | -1",
      "- 精度菜 | 12.345",
    ].join("\n"));

    expect(result.items).toEqual([{ name: "酸菜鱼", priceCents: 6800, sourceLine: 1 }]);
    expect(result.errors.map((error) => [error.sourceLine, error.message])).toEqual([
      [2, "菜品名称重复"],
      [3, "菜品名称不能为空"],
      [4, "价格格式无效"],
      [5, "价格格式无效"],
    ]);
  });
});
