/** Readout formatting only: native input values and domain parameters never pass through it. */
export function formatParameterValue(value: number, step: number): string {
  const [mantissa, exponent = "0"] = step.toString().toLowerCase().split("e");
  const places = Math.max(0, (mantissa.split(".")[1]?.length ?? 0) - Number(exponent));
  if (places > 6 || Math.abs(value) >= 1e7) return Number(value.toPrecision(6)).toString();
  return Number(value.toFixed(places)).toString();
}
