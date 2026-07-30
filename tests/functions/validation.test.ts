import { HttpError } from "../../functions/_lib/http";
import { parseAdjustRequest } from "../../functions/_lib/validation";

const validInput = {
  operationId: "operation-123",
  orderDate: "2026-07-30",
  menuItemId: "dish-suan-cai-yu",
  deviceId: "device-123",
  displayName: "  张三  ",
  delta: 1,
};

describe("parseAdjustRequest", () => {
  it("accepts +1 and -1 and trims display names", () => {
    expect(parseAdjustRequest(validInput, "2026-07-30")).toMatchObject({ displayName: "张三", delta: 1 });
    expect(parseAdjustRequest({ ...validInput, delta: -1 }, "2026-07-30")).toMatchObject({ delta: -1 });
  });

  it("rejects unsupported deltas as a typed 400 error", () => {
    expectHttpError(() => parseAdjustRequest({ ...validInput, delta: 2 }, "2026-07-30"), 400);
  });

  it("rejects malformed identifiers as a typed 400 error", () => {
    expectHttpError(() => parseAdjustRequest({ ...validInput, deviceId: "bad id!" }, "2026-07-30"), 400);
  });

  it("rejects ordinary writes to a non-today date as a typed 403 error", () => {
    expectHttpError(() => parseAdjustRequest(validInput, "2026-07-31"), 403);
  });
});

function expectHttpError(run: () => unknown, status: number) {
  try {
    run();
    throw new Error("Expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(status);
  }
}
