/**
 * File contents the customer picked, kept in memory only (never stored, see draft.ts). Shared so
 * the file list can retry an upload and the page picker can draw the real pages. Lost on reload:
 * screens must work without them.
 */
export const pickedFiles = new Map<string, File>();
