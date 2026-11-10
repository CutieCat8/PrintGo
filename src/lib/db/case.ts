/**
 * The database speaks snake_case, TypeScript speaks camelCase (docs/CONTRACTS.md section 1).
 * These two functions are the only place the names are converted.
 * They convert the top-level keys of a row; values are passed through untouched.
 */

const snakeToCamel = (key: string) =>
  key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const camelToSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function mapKeys(obj: Record<string, unknown>, rename: (key: string) => string) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [rename(key), value]));
}

export const fromDb = (row: Record<string, unknown>) => mapKeys(row, snakeToCamel);
export const toDb = (obj: Record<string, unknown>) => mapKeys(obj, camelToSnake);

/** Column name for a camelCase field, e.g. `priceSatang` -> `price_satang`. */
export const columnName = camelToSnake;
