import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { columnName } from "./case";
import { ENUMS } from "./enums";
import { TABLES } from "./types";

/**
 * Guards the three places that must agree: docs/CONTRACTS.md -> Zod schemas -> SQL migration.
 * (CONTRACTS -> Zod is checked by the reviewer; Zod -> SQL is checked here.)
 * The parser relies on the migration style: one column per line, one table constraint per line.
 */
const dir = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n");

const sqlEnums = new Map<string, string[]>(
  [...sql.matchAll(/create type public\.(\w+) as enum \(([^)]*)\);/g)].map((m) => [
    m[1],
    [...m[2].matchAll(/'([^']*)'/g)].map((v) => v[1]),
  ]),
);

const CONSTRAINT_START = /^(constraint|unique|primary|check|foreign)\b/i;
const sqlTables = new Map<string, string[]>(
  [...sql.matchAll(/create table public\.(\w+) \(\n([\s\S]*?)\n\);/g)].map((m) => [
    m[1],
    m[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--") && !CONSTRAINT_START.test(line))
      .map((line) => line.split(/\s+/)[0]),
  ]),
);

const sqlEnumName = (contractName: string) =>
  columnName(contractName[0].toLowerCase() + contractName.slice(1));

describe("migration matches the Zod types", () => {
  it.each(Object.entries(ENUMS))(
    "enum %s has the same values, in the same order",
    (name, values) => {
      expect(sqlEnums.get(sqlEnumName(name))).toEqual(values);
    },
  );

  it("has no enum that the Zod side does not know about", () => {
    expect([...sqlEnums.keys()].sort()).toEqual(Object.keys(ENUMS).map(sqlEnumName).sort());
  });

  it.each(Object.entries(TABLES))(
    "table %s has exactly the columns of its schema",
    (table, schema) => {
      const expected = Object.keys(schema.shape).map(columnName).sort();
      expect([...(sqlTables.get(table) ?? [])].sort()).toEqual(expected);
    },
  );

  it("has no table that the Zod side does not know about", () => {
    expect([...sqlTables.keys()].sort()).toEqual(Object.keys(TABLES).sort());
  });
});

describe("migration security posture (CLAUDE.md rule 4)", () => {
  it.each([...sqlTables.keys()])("table %s has row level security enabled", (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
  });

  it("creates no RLS policy: the server uses the service role and checks access in code", () => {
    expect(sql).not.toMatch(/create policy/i);
  });
});
