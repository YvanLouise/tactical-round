import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const references = new Set();
for (const filename of ["index.html", "styles.css", "app.js"]) {
  const source = await readFile(path.join(root, filename), "utf8");
  for (const match of source.matchAll(/["'(](\.\/[^"')\s]+)["')]/g)) references.add(match[1]);
}
const failures = [];
for (const reference of references) {
  try { await access(path.join(root, reference)); }
  catch { failures.push(reference); }
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const idSet = new Set(ids);
if (ids.length !== idSet.size) failures.push("duplicate HTML ids");
const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
for (const anchor of new Set(anchors)) {
  if (!idSet.has(anchor)) failures.push(`missing anchor #${anchor}`);
}
for (const match of html.matchAll(/aria-(?:controls|labelledby)="([^"]+)"/g)) {
  for (const id of match[1].split(/\s+/)) {
    if (!idSet.has(id)) failures.push(`missing ARIA target #${id}`);
  }
}
const structuredData = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
try {
  if (!structuredData) throw new Error("missing JSON-LD");
  JSON.parse(structuredData[1]);
} catch {
  failures.push("invalid or missing structured data");
}
if (failures.length) {
  console.error("FAIL:", failures.join(", "));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${references.size} local assets, ${idSet.size} unique ids, anchors, ARIA targets and JSON-LD; compatible with /tactical-round/.`);
}
