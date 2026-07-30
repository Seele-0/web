import { loadIdentity, saveDisplayName, validateDisplayName } from "./identity";

describe("browser identity", () => {
  beforeEach(() => localStorage.clear());

  it("trims names and enforces one to thirty characters", () => {
    expect(validateDisplayName("  张三  ")).toBe("张三");
    expect(() => validateDisplayName("   ")).toThrow();
    expect(() => validateDisplayName("a".repeat(31))).toThrow();
  });

  it("generates a device id once and reloads saved identity", () => {
    const first = loadIdentity();
    const second = loadIdentity();
    expect(first.deviceId).toBeTruthy();
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.displayName).toBeNull();
  });

  it("updates the name without replacing the device id", () => {
    const before = loadIdentity();
    expect(saveDisplayName(" 张三 ")).toEqual({ deviceId: before.deviceId, displayName: "张三" });
    expect(saveDisplayName("李四").deviceId).toBe(before.deviceId);
  });
});
