/** Portable copy of the opaque publication policy. Root audit tests enforce Worker parity. */
export const CONTENT_CSP =
  "default-src 'none'; sandbox allow-scripts; script-src 'unsafe-inline' blob: data:; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; worker-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
