import type { Contribution, MenuItem } from "./types";

export type OrderLine = {
  priceCents: number;
  quantity: number;
};

export type OrderTotals = {
  totalQuantity: number;
  totalCents: number;
  perPersonCents: number;
};

export type DishSummary = {
  menuItem: MenuItem;
  quantity: number;
  subtotalCents: number;
  contributors: Array<{ displayName: string; quantity: number }>;
};

export function calculateOrderTotals(lines: OrderLine[], shareCount: number): OrderTotals {
  if (!Number.isInteger(shareCount) || shareCount < 1) {
    throw new Error("Invalid share count");
  }

  const totals = lines.reduce(
    (result, line) => {
      if (!Number.isSafeInteger(line.priceCents) || !Number.isInteger(line.quantity) || line.quantity < 0) {
        throw new Error("Invalid order line");
      }
      result.totalQuantity += line.quantity;
      result.totalCents += line.priceCents * line.quantity;
      return result;
    },
    { totalQuantity: 0, totalCents: 0 },
  );

  return {
    ...totals,
    perPersonCents: totals.totalCents === 0 ? 0 : Math.ceil(totals.totalCents / shareCount),
  };
}

export function groupContributions(contributions: Contribution[]): Map<string, Contribution[]> {
  const groups = new Map<string, Contribution[]>();
  for (const contribution of contributions) {
    const group = groups.get(contribution.menuItemId) ?? [];
    group.push(contribution);
    groups.set(contribution.menuItemId, group);
  }
  return groups;
}

export function buildDishSummaries(menuItems: MenuItem[], contributions: Contribution[]): DishSummary[] {
  const grouped = groupContributions(contributions);
  return [...menuItems]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((menuItem) => {
      const dishContributions = grouped.get(menuItem.id) ?? [];
      const contributorQuantities = new Map<string, number>();
      for (const contribution of dishContributions) {
        if (contribution.quantity <= 0) continue;
        contributorQuantities.set(
          contribution.displayName,
          (contributorQuantities.get(contribution.displayName) ?? 0) + contribution.quantity,
        );
      }
      const contributors = [...contributorQuantities].map(([displayName, quantity]) => ({ displayName, quantity }));
      const quantity = contributors.reduce((sum, contributor) => sum + contributor.quantity, 0);
      return quantity === 0
        ? []
        : [{ menuItem, quantity, subtotalCents: menuItem.priceCents * quantity, contributors }];
    });
}
