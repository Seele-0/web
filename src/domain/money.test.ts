import { formatCents, parsePriceToCents } from "./money";

describe("money", () => {
  it("parses currency text into integer cents", () => {
    expect(parsePriceToCents("¥68")).toBe(6800);
    expect(parsePriceToCents("32.50元")).toBe(3250);
  });

  it("formats integer cents as renminbi", () => {
    expect(formatCents(3575)).toBe("¥35.75");
  });

  it("rejects invalid prices", () => {
    for (const value of ["", "abc", "-1", "12.345"]) {
      expect(() => parsePriceToCents(value)).toThrow();
    }
  });
});
