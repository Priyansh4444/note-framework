import { expect, test } from "bun:test";
import { formatParameterValue } from "./controls";

test("parameter display suppresses scene noise without changing its source number", () => {
  const offset = 0.0125 + 0.1 / 16;
  expect(formatParameterValue(offset, 0.0001)).toBe("0.0188");
  expect(offset).toBe(0.018750000000000003);
  expect(formatParameterValue(-0.00000001, 0.0001)).toBe("0");
});
test("readouts handle fractional, integer and scientific steps and extreme scales", () => {
  expect(formatParameterValue(0.125, 0.025)).toBe("0.125");
  expect(formatParameterValue(16, 1)).toBe("16");
  expect(formatParameterValue(-1, 1e-4)).toBe("-1");
  expect(formatParameterValue(0.000000125, 1e-9)).toBe("1.25e-7");
  expect(formatParameterValue(123456789, 1)).toBe("123457000");
});
