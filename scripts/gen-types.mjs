// Generate TypeScript types from the vendored OpenBook JSON Schema, so the
// types cannot drift from the standard. Output is committed; CI runs this with
// --check to fail when the generated file is stale.
//
//   node scripts/gen-types.mjs           write packages/core/src/types.generated.ts
//   node scripts/gen-types.mjs --check   do not write; exit 1 when it is stale
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(root, "schema");
const outFile = join(root, "packages", "core", "src", "types.generated.ts");
const version = readFileSync(join(root, "openbook-spec-version"), "utf8").trim();
const check = process.argv.includes("--check");

const pascal = (s) =>
  s
    .replace(/[-_.\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());

/** File stem -> exported type name. */
const NAME_OVERRIDES = { change: "ChangeEnvelope" };

function loadSchemas() {
  const map = new Map();
  for (const f of readdirSync(schemaDir).filter((n) => n.endsWith(".schema.json"))) {
    map.set(f, JSON.parse(readFileSync(join(schemaDir, f), "utf8")));
  }
  return map;
}

const schemas = loadSchemas();
const common = schemas.get("common.schema.json");
if (!common) throw new Error("common.schema.json is missing from schema/");
const defs = common.$defs ?? {};

const defType = (name) => pascal(name);

/** True when a def carries structure worth turning into a named type. */
function isStructural(s) {
  if (!s || typeof s !== "object") return false;
  if (s.$ref !== undefined || s.enum || s.const !== undefined) return true;
  if (s.type && s.type !== "object") return true;
  if (s.items) return true;
  if (s.properties && Object.keys(s.properties).length) return true;
  if (Array.isArray(s.oneOf) || Array.isArray(s.anyOf)) return (s.oneOf ?? s.anyOf).some(isStructural);
  if (Array.isArray(s.allOf)) return s.allOf.some(isStructural);
  if (s.type === "object") return Boolean(s.properties || s.patternProperties || s.additionalProperties);
  return false;
}

const refType = (ref) => {
  const m = String(ref).match(/#\/\$defs\/(.+)$/);
  if (!m) throw new Error(`unsupported $ref: ${ref}`);
  const def = defs[m[1]];
  if (def && !isStructural(def)) return "unknown";
  return defType(m[1]);
};

const isVacuous = (s) => {
  if (!s || typeof s !== "object") return true;
  if (s.if || s.then || s.not) return !s.properties;
  if (s.required && !s.properties && !s.type && !s.enum) return true;
  return (
    s.$ref === undefined &&
    s.const === undefined &&
    !s.enum &&
    !s.oneOf &&
    !s.anyOf &&
    !s.allOf &&
    s.type === undefined &&
    !s.properties &&
    !s.patternProperties &&
    !s.items
  );
};

const PRIMITIVE = {
  string: "string",
  number: "number",
  integer: "number",
  boolean: "boolean",
  null: "null",
  object: "Record<string, unknown>",
};

function objectType(schema) {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const lines = [];
  for (const [name, def] of Object.entries(props)) {
    const optional = required.has(name) ? "" : "?";
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
    lines.push(`${key}${optional}: ${tsType(def)};`);
  }
  if (!lines.length && schema.additionalProperties && typeof schema.additionalProperties === "object") {
    return `Record<string, ${tsType(schema.additionalProperties)}>`;
  }
  if (schema.patternProperties && Object.keys(schema.patternProperties).includes("^x_")) {
    lines.push(`[x: string]: unknown;`);
  }
  if (!lines.length) return "Record<string, unknown>";
  return `{ ${lines.join(" ")} }`;
}

function tsType(schema) {
  if (schema == null) return "unknown";
  if (typeof schema.$ref === "string") return refType(schema.$ref);
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (Array.isArray(schema.enum)) {
    const parts = schema.enum.map((v) => (v === null ? "null" : JSON.stringify(v)));
    return [...new Set(parts)].join(" | ");
  }
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    const list = schema.oneOf ?? schema.anyOf;
    const parts = list.map(tsType).filter((t) => t && t !== "unknown");
    return [...new Set(parts)].join(" | ") || "unknown";
  }
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map(tsType).filter((t) => t && t !== "unknown");
    if (parts.length) return [...new Set(parts)].join(" & ");
  }
  if (isVacuous(schema)) return "unknown";

  const t = schema.type;
  const types = Array.isArray(t) ? t : t ? [t] : [];
  const nonNull = types.filter((x) => x !== "null");
  const nullable = types.includes("null");

  let base;
  if (nonNull.includes("array") || schema.items) {
    base = `Array<${schema.items ? tsType(schema.items) : "unknown"}>`;
  } else if (nonNull.includes("object") || schema.properties || schema.patternProperties) {
    base = objectType(schema);
  } else if (!nonNull.length) {
    base = objectType(schema);
  } else {
    base = [...new Set(nonNull)].map((x) => PRIMITIVE[x] ?? "unknown").join(" | ");
  }
  return nullable ? `${base} | null` : base;
}

const header = `// GENERATED FILE - do not edit by hand.
// Generated by scripts/gen-types.mjs from schema/ (OpenBook ${version}).
// The schema files are CC BY 4.0; see the repository NOTICE.
/* eslint-disable */

/** The OpenBook spec version these types were generated from. */
export const OPENBOOK_SPEC_VERSION = ${JSON.stringify(version)};

`;

const chunks = [header];
chunks.push(`// ------------------------------------------------------------------ common\n\n`);
for (const [name, def] of Object.entries(defs)) {
  if (!isStructural(def)) continue;
  const body = tsType(def);
  if (body === "unknown") continue;
  chunks.push(`export type ${defType(name)} = ${body};\n`);
}

chunks.push(`\n// ---------------------------------------------------------------- documents\n\n`);
const documentFiles = [...schemas.keys()].filter((f) => f !== "common.schema.json").sort();
for (const file of documentFiles) {
  const schema = schemas.get(file);
  const stem = file.replace(/\.schema\.json$/, "");
  const name = NAME_OVERRIDES[stem] ?? pascal(stem);
  chunks.push(`export type ${name} = ${tsType(schema)};\n`);
}

const output = chunks.join("");
const existing = existsSync(outFile) ? readFileSync(outFile, "utf8") : null;

if (check) {
  if (existing !== output) {
    console.error("types.generated.ts is stale: run `npm run gen`");
    process.exit(1);
  }
  console.log("generated types are current");
} else {
  writeFileSync(outFile, output);
  console.log(`wrote ${outFile.replace(root + "/", "")}`);
}
