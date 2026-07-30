import { buildDishSummaries, calculateOrderTotals, groupContributions } from "./order";
import type { Contribution, MenuItem } from "./types";

describe("order calculations", () => {
  it("calculates quantity, total, and equal split with integer arithmetic", () => {
    expect(calculateOrderTotals([{ priceCents: 6800, quantity: 2 }], 8)).toEqual({
      totalQuantity: 2,
      totalCents: 13600,
      perPersonCents: 1700,
    });
  });

  it("returns zero totals for an empty order", () => {
    expect(calculateOrderTotals([], 3)).toEqual({
      totalQuantity: 0,
      totalCents: 0,
      perPersonCents: 0,
    });
  });

  it("rejects share counts below one", () => {
    expect(() => calculateOrderTotals([], 0)).toThrow("share count");
  });

  it("groups contributions and builds per-dish summaries", () => {
    const menu: MenuItem[] = [
      { id: "fish", name: "酸菜鱼", priceCents: 6800, sortOrder: 1, active: true },
    ];
    const contributions: Contribution[] = [
      { menuItemId: "fish", deviceId: "a", displayName: "张三", quantity: 2 },
      { menuItemId: "fish", deviceId: "b", displayName: "李四", quantity: 1 },
    ];

    expect(groupContributions(contributions).get("fish")).toEqual(contributions);
    expect(buildDishSummaries(menu, contributions)).toEqual([
      {
        menuItem: menu[0],
        quantity: 3,
        subtotalCents: 20400,
        contributors: [
          { displayName: "张三", quantity: 2 },
          { displayName: "李四", quantity: 1 },
        ],
      },
    ]);
  });
});
