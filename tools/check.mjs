import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
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
if (failures.length) {
  console.error("FAIL missing local assets:", failures.join(", "));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${references.size} local asset references, compatible with /tactical-round/.`);
}
