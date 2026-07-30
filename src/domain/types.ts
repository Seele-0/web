export type MenuItem = {
  id: string;
  name: string;
  priceCents: number;
  sortOrder: number;
  active: boolean;
};

export type Contribution = {
  menuItemId: string;
  deviceId: string;
  displayName: string;
  quantity: number;
};
