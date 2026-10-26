import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const projectId = createHash("sha256").update(root.toLowerCase()).digest("hex").slice(0, 16);
async function running(port) {
  try { const response = await fetch(`http://127.0.0.1:${port}/api/editor/state`, { signal: AbortSignal.timeout(800) }); return response.ok && (await response.json()).projectId === projectId; } catch { return false; }
}
const port = Number(process.env.EDITOR_PORT || 4318);
const directory = path.join(root, ".local", "editor");
await mkdir(directory, { recursive: true });
if (!(await running(port))) {
  const log = path.join(directory, `server-${Date.now()}.log`);
  const descriptor = openSync(log, "a");
  const child = spawn(process.execPath, [path.join(root, "tools", "editor", "server.mjs")], { cwd: root, detached: true, windowsHide: true, stdio: ["ignore", descriptor, descriptor], env: { ...process.env, EDITOR_PORT: String(port) } });
  closeSync(descriptor);
  child.on("error", (error) => { console.error(error.message); });
  child.unref();
  await writeFile(path.join(directory, "server.json"), JSON.stringify({ pid: child.pid, port, log }, null, 2));
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) { if (await running(port)) { ready = true; break; } await new Promise((resolve) => setTimeout(resolve, 250)); }
  if (!ready) throw new Error(`Editor did not start. Check ${log}. Port ${port} may be occupied; set EDITOR_PORT to use another port.`);
}
const url = `http://127.0.0.1:${port}/editor/`;
console.log(`Tactical Round editor: ${url}`);
const command = process.platform === "win32" ? ["cmd.exe", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
const browser = spawn(command[0], command[1], { detached: true, windowsHide: true, stdio: "ignore" });
browser.on("error", () => console.log("Open the URL above in your browser."));
browser.unref();
