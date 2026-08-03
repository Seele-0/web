export type SyncRevisions = {
  revision: number;
  configurationRevision: number;
};

type SyncRevisionRow = {
  revision: number;
  configuration_revision: number;
};

export async function getSyncRevisions(db: D1Database, orderDate: string): Promise<SyncRevisions> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(
           (SELECT revision FROM daily_orders WHERE order_date = ?),
           CASE WHEN EXISTS (SELECT 1 FROM automatic_order_locks WHERE order_date = ?) THEN 1 ELSE 0 END
         ) AS revision,
         COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'menu_revision'), 0) AS configuration_revision`,
    )
    .bind(orderDate, orderDate)
    .first<SyncRevisionRow>();

  return {
    revision: row?.revision ?? 0,
    configurationRevision: row?.configuration_revision ?? 0,
  };
}
