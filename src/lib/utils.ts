import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a number that may be written as a decimal ("0.25"), a fraction
 * ("1/4"), or a mixed number ("1 1/2"). Returns 0 for empty/invalid input.
 */
export function parseNumeric(input: string | number | null | undefined): number {
  if (input == null || input === "") return 0;
  if (typeof input === "number") return isFinite(input) ? input : 0;
  const s = String(input).trim().replace(",", ".");
  if (!s) return 0;
  // mixed number "1 1/2"
  const mixed = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = parseInt(mixed[1], 10);
    const num = parseInt(mixed[2], 10);
    const den = parseInt(mixed[3], 10);
    if (den === 0) return 0;
    return whole + (Math.sign(whole) || 1) * (num / den);
  }
  // simple fraction "1/4"
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    if (den === 0) return 0;
    return num / den;
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/**
 * onFocus handler that clears the leading "0" so that typing a new number
 * overwrites the placeholder zero instead of producing "07".
 */
export function selectAllOnFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  const el = e.currentTarget;
  // Delay so mobile keyboards don't fight the selection.
  requestAnimationFrame(() => {
    try {
      el.select();
    } catch {
      /* noop */
    }
  });
}
