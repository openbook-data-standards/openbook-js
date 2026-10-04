// Keep the vendored schema/ and the spec stamp in step with the OpenBook
// specification. Mirrors openbook-translate's `update` command: no git writes.
//
// The source of truth is the specification's GitHub main, so a check is
// reproducible anywhere. Pass --local to compare against a sibling ../openbook
// checkout instead.
//
//   node scripts/sync-schema.mjs           copy from the spec's GitHub main
//   node scripts/sync-schema.mjs --local   copy from a sibling ../openbook checkout
//   node scripts/sync-schema.mjs --check   do not write; exit 1 when the vendored
//                                          files or the stamp have drifted
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(root, "schema");
const stampFile = join(root, "openbook-spec-version");
const LOCAL_SPEC = join(root, "..", "openbook");
const RAW = "https://raw.githubusercontent.com/openbook-data-standards/openbook/main";
const API = "https://api.github.com/repos/openbook-data-standards/openbook/contents/schema";

const args = new Set(process.argv.slice(2));
const check = args.has("--check");
const useLocal = () => args.has("--local") && existsSync(join(LOCAL_SPEC, "schema"));

const source = (rel) => {
  if (useLocal()) {
    const p = join(LOCAL_SPEC, rel);
    if (existsSync(p)) return Promise.resolve(readFileSync(p, "utf8"));
  }
  return fetch(`${RAW}/${rel}`).then((res) => {
    if (!res.ok) throw new Error(`fetch ${rel}: ${res.status} ${res.statusText}`);
    return res.text();
  });
};

async function sourceSchemaNames() {
  if (useLocal()) return readdirSync(join(LOCAL_SPEC, "schema")).filter((f) => f.endsWith(".schema.json"));
  try {
    const res = await fetch(API, { headers: { accept: "application/vnd.github+json" } });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) return list.map((e) => e.name).filter((n) => n.endsWith(".schema.json"));
    }
  } catch {
    /* fall through to the vendored list */
  }
  return readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json"));
}

/** The spec version, read from the spec README's Status line. */
function specVersionFrom(readme) {
  const m = readme.match(/Status:\*\*\s*`v?([0-9]+\.[0-9]+\.[0-9]+(?:-draft)?)`/);
  if (!m) throw new Error("could not read the spec version from README.md");
  return m[1];
}

async function main() {
  const version = specVersionFrom(await source("README.md"));
  const fileNames = await sourceSchemaNames();
  const vendored = readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json"));

  const drift = [];
  for (const name of fileNames) {
    const want = await source(`schema/${name}`);
    const dst = join(schemaDir, name);
    const have = existsSync(dst) ? readFileSync(dst, "utf8") : null;
    if (have !== want) drift.push(name);
    if (!check) {
      mkdirSync(schemaDir, { recursive: true });
      writeFileSync(dst, want);
    }
  }

  const haveStamp = existsSync(stampFile) ? readFileSync(stampFile, "utf8").trim() : null;
  const stampMoved = haveStamp !== version;
  if (!check) writeFileSync(stampFile, `${version}\n`);

  const stale = vendored.filter((f) => !fileNames.includes(f));

  if (check) {
    if (drift.length || stampMoved || stale.length) {
      if (drift.length) console.error(`schema drift: ${drift.join(", ")}`);
      if (stale.length) console.error(`schema files no longer in the spec: ${stale.join(", ")}`);
      if (stampMoved) console.error(`spec version moved: ${haveStamp} -> ${version}`);
      console.error("run `npm run sync` to refresh");
      process.exit(1);
    }
    console.log(`schema is in step with OpenBook ${version}`);
    return;
  }
  console.log(`synced ${fileNames.length} schema files and the stamp (${version})`);
}

await main();
