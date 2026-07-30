import { createPendingOperation, enqueueOperation, loadQueue, removeOperation } from "./queue";

describe("pending operation queue", () => {
  beforeEach(() => localStorage.clear());

  it("persists operations in creation order with unique ids", () => {
    const first = createPendingOperation("adjust", { delta: 1 });
    const second = createPendingOperation("adjust", { delta: -1 });
    expect(first.operationId).not.toBe(second.operationId);
    enqueueOperation(first);
    enqueueOperation(second);
    expect(loadQueue().map((item) => item.operationId)).toEqual([first.operationId, second.operationId]);
  });

  it("deduplicates operation ids and removes completed writes", () => {
    const operation = createPendingOperation("adjust", { delta: 1 });
    enqueueOperation(operation);
    enqueueOperation(operation);
    expect(loadQueue()).toHaveLength(1);
    removeOperation(operation.operationId);
    expect(loadQueue()).toEqual([]);
  });
});
