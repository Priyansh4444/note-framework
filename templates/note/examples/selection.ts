export const SLOTS = 16;
export const FILLED = 9;
export const TARGET = 6; // Seventh item: zero-based indexing.

export const letters = Array.from({ length: FILLED }, (_, i) => String.fromCharCode(65 + i));
export const selected = letters[TARGET]; // G
