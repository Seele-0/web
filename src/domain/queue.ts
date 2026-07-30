export const QUEUE_KEY = "ordering.pendingOperations";
export type PendingOperation = {
  operationId: string;
  createdAt: string;
  type: "adjust" | "share-count";
  body: Record<string, unknown>;
  retryCount: number;
  lastError: string | null;
};

export function createPendingOperation(type: PendingOperation["type"], body: Record<string, unknown>): PendingOperation {
  return { operationId: crypto.randomUUID(), createdAt: new Date().toISOString(), type, body, retryCount: 0, lastError: null };
}
export function loadQueue(storage: Storage = localStorage): PendingOperation[] {
  try {
    const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
export function saveQueue(queue: PendingOperation[], storage: Storage = localStorage): void { storage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
export function enqueueOperation(operation: PendingOperation, storage: Storage = localStorage): PendingOperation[] {
  const queue = loadQueue(storage);
  if (!queue.some((item) => item.operationId === operation.operationId)) queue.push(operation);
  saveQueue(queue, storage);
  return queue;
}
export function removeOperation(operationId: string, storage: Storage = localStorage): PendingOperation[] {
  const queue = loadQueue(storage).filter((item) => item.operationId !== operationId);
  saveQueue(queue, storage);
  return queue;
}
export function updateOperationFailure(operationId: string, message: string, storage: Storage = localStorage): void {
  saveQueue(loadQueue(storage).map((item) => item.operationId === operationId ? { ...item, retryCount: item.retryCount + 1, lastError: message } : item), storage);
}
