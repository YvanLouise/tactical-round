import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, writeFile, rename, mkdir, stat, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { GROUPS, scan, render, revision, LIVE_URL, REPOSITORY } from "./model.mjs";
import { assetPath, listAssets, uploadAsset } from "./assets.mjs";
import { deploy, deploymentPreflight } from "./deploy.mjs";

const uiRoot = fileURLToPath(new URL("./ui/", import.meta.url));
const defaultRoot = fileURLToPath(new URL("../../", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".ttf": "font/ttf", ".md": "text/plain; charset=utf-8" };
export function markdownPreview(source) {
  return sanitizeHtml(marked.parse(source, { gfm: true }), { allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"], allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt", "title"], code: ["class"] }, allowedSchemes: ["http", "https", "mailto"], allowProtocolRelative: false });
}
async function body(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("文件过大：图片上限 12 MB，文案请求上限 2 MB。"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function atomicWrite(filename, content) {
  const temporary = `${filename}.editor-${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  try { await rename(temporary, filename); }
  finally { await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
}
export async function readState(root) {
  const [html, readme] = await Promise.all([readFile(path.join(root, "index.html"), "utf8"), readFile(path.join(root, "README.md"), "utf8")]);
  return { html, readme, revision: revision(html, readme), fields: scan(html) };
}
export async function saveContent(root, payload) {
  const state = await readState(root);
  if (payload.revision !== state.revision) throw fail("网站文件已被其他任务修改。草稿已保留，请重新载入后再保存。", 409);
  if (!payload.values || typeof payload.values !== "object" || Array.isArray(payload.values) || typeof payload.readme !== "string" || payload.readme.length > 500000) throw fail("保存内容无效。");
  const known = new Set(state.fields.map((field) => field.id));
  if (Object.keys(payload.values).some((key) => !known.has(key))) throw fail("页面结构已变化，请重新载入。", 409);
  for (const field of state.fields.filter((item) => item.kind === "image")) await assetPath(root, payload.values[field.id] ?? field.value);
  const html = render(state.html, state.fields, payload.values);
  const readme = payload.readme.replace(/^\uFEFF/, "");
  if (html === state.html && readme === state.readme) return { ...state, backup: null };
  const backupId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8);
  const backup = path.join(root, ".local", "editor", "backups", backupId);
  await mkdir(backup, { recursive: true });
  await writeFile(path.join(backup, "index.html"), state.html, "utf8");
  await writeFile(path.join(backup, "README.md"), state.readme, "utf8");
  const latest = await readState(root);
  if (latest.revision !== state.revision) throw fail("文件在保存前发生变化。草稿和备份已保留，请重新载入。", 409);
  const written = [];
  try {
    for (const [name, previous, next] of [["index.html", state.html, html], ["README.md", state.readme, readme]]) {
      if (previous === next) continue;
      if (await readFile(path.join(root, name), "utf8") !== previous) throw fail("文件在保存期间发生变化，请重新载入。", 409);
      await atomicWrite(path.join(root, name), next);
      written.push({ name, previous, next });
    }
  } catch (error) {
    for (const item of written) {
      if (await readFile(path.join(root, item.name), "utf8") === item.next) await atomicWrite(path.join(root, item.name), item.previous);
    }
    throw error;
  }
  return { ...(await readState(root)), backup: `.local/editor/backups/${backupId}` };
}
async function serveStatic(request, response, filename) {
  const info = await stat(filename);
  if (!info.isFile()) throw fail("文件不存在。", 404);
  let start = 0;
  let end = info.size - 1;
  const headers = { "Content-Type": mime[path.extname(filename).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff" };
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    start = Number(range[1]);
    end = range[2] ? Math.min(Number(range[2]), end) : end;
    if (start > end || start >= info.size) { response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end(); return; }
    headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  }
  headers["Content-Length"] = end - start + 1;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === "HEAD") response.end();
  else createReadStream(filename, { start, end }).on("error", () => response.destroy()).pipe(response);
}
export function createEditorServer({ root = defaultRoot, port = Number(process.env.EDITOR_PORT || 4318), deployRunner = deploy, preflight = deploymentPreflight } = {}) {
  root = path.resolve(root);
  const token = randomBytes(32).toString("hex");
  const jobs = new Map();
  let busy = false;
  const publicState = (state) => ({ revision: state.revision, readme: state.readme, fields: state.fields.map(({ start, end, ...field }) => field), groups: GROUPS, token, siteUrl: LIVE_URL, repository: REPOSITORY, backup: state.backup || null, projectId: createHash("sha256").update(root.toLowerCase()).digest("hex").slice(0, 16), activeJobId: [...jobs.values()].find((job) => !["success", "error"].includes(job.step))?.id || null });
  const json = (response, data, status = 200) => response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }).end(JSON.stringify(data));
  const server = http.createServer(async (request, response) => {
    try {
      const actualPort = server.address()?.port || port;
      const hosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
      if (!hosts.has(request.headers.host)) throw fail("仅允许本机访问编辑站。", 403);
      const origin = `http://${request.headers.host}`;
      const url = new URL(request.url, origin);
      const pathname = decodeURIComponent(url.pathname);
      if (request.headers.origin && request.headers.origin !== origin) throw fail("请求来源无效。", 403);
      if (request.method === "POST") {
        if (request.headers["x-editor-token"] !== token) throw fail("编辑会话已失效，请刷新页面。", 403);
        if (busy && !pathname.endsWith("/markdown")) throw fail("正在保存或部署，请稍后重试。", 423);
      }
      if (pathname === "/api/editor/state" && request.method === "GET") return json(response, publicState(await readState(root)));
      if (pathname === "/api/editor/assets" && request.method === "GET") return json(response, await listAssets(root));
      if (pathname.startsWith("/api/editor/jobs/") && request.method === "GET") {
        const job = jobs.get(pathname.split("/").at(-1));
        if (!job) throw fail("部署任务不存在。", 404);
        return json(response, job);
      }
      if (pathname === "/api/editor/upload" && request.method === "POST") return json(response, await uploadAsset(root, await body(request, 12 * 1024 * 1024)));
      if (pathname.startsWith("/api/editor/") && request.method === "POST") {
        let payload;
        try { payload = JSON.parse((await body(request, 2 * 1024 * 1024)).toString("utf8")); } catch (error) { if (error.status) throw error; throw fail("请求内容不是有效的 JSON。"); }
        if (pathname === "/api/editor/markdown") {
          if (typeof payload.markdown !== "string" || payload.markdown.length > 500000) throw fail("README 内容过长或格式无效。");
          return json(response, { html: markdownPreview(payload.markdown) });
        }
        if (pathname === "/api/editor/save") {
          busy = true;
          try { return json(response, publicState(await saveContent(root, payload))); } finally { busy = false; }
        }
        if (pathname === "/api/editor/deploy") {
          busy = true;
          const id = randomUUID();
          const job = { id, step: "saving", message: "正在保存网站与 README…", updatedAt: Date.now() };
          jobs.set(id, job);
          while (jobs.size > 20) jobs.delete(jobs.keys().next().value);
          (async () => {
            try {
              await preflight(root);
              const saved = await saveContent(root, payload);
              job.saved = publicState(saved);
              const images = saved.fields.filter((field) => field.kind === "image" && field.value.startsWith("./assets/uploads/")).map((field) => field.value.slice(2));
              const readmeImages = [...saved.readme.matchAll(/(?:\.\/)?(assets\/uploads\/[a-f0-9]+\.(?:png|jpg|webp|gif))/g)].map((match) => match[1]);
              const files = [...new Set(["index.html", "README.md", ...images, ...readmeImages])];
              await deployRunner(root, files, (step, message, extra = {}) => Object.assign(job, { step, message, updatedAt: Date.now(), ...extra }));
            } catch (error) { Object.assign(job, { step: "error", message: error.message, updatedAt: Date.now() }); }
            finally { busy = false; }
          })();
          return json(response, { id }, 202);
        }
      }
      if (!["GET", "HEAD"].includes(request.method)) throw fail("请求方法不支持。", 405);
      if (pathname === "/" || pathname === "/editor") { response.writeHead(302, { Location: "/editor/" }).end(); return; }
      if (pathname.startsWith("/editor/")) {
        const name = pathname.slice("/editor/".length) || "index.html";
        if (!["index.html", "editor.css", "editor.js"].includes(name)) throw fail("文件不存在。", 404);
        return await serveStatic(request, response, path.join(uiRoot, name));
      }
      const sitePath = pathname.replace(/^\/tactical-round(?=\/|$)/, "");
      if (sitePath === "/" || sitePath === "/index.html") return await serveStatic(request, response, path.join(root, "index.html"));
      if (["/app.js", "/styles.css", "/README.md"].includes(sitePath)) return await serveStatic(request, response, path.join(root, sitePath.slice(1)));
      if (sitePath.startsWith("/assets/")) {
        const relative = "." + sitePath;
        if (imageInfoExtension(relative)) return await serveStatic(request, response, await assetPath(root, relative));
        if (/^\.\/assets\/[a-zA-Z0-9_-]+\.(?:mp4|ttf)$/.test(relative)) return await serveStatic(request, response, path.resolve(root, relative));
      }
      throw fail("文件不存在。", 404);
    } catch (error) {
      if (!response.headersSent) json(response, { error: error.code === "ENOENT" ? "文件不存在。" : error.message }, error.status || (error.code === "ENOENT" ? 404 : 500));
      else response.end();
    }
  });
  return server;
}
function imageInfoExtension(filename) { return /\.(png|jpe?g|webp|gif|svg)$/i.test(filename); }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = createEditorServer();
  const port = Number(process.env.EDITOR_PORT || 4318);
  server.on("error", (error) => { console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use. Set EDITOR_PORT to choose another port.` : error.message); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`Tactical Round editor: http://127.0.0.1:${server.address().port}/editor/`));
}
