import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".mp4": "video/mp4",
  ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};
const server = http.createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname.replace(/^\/tactical-round(?=\/|$)/, "");
    const segments = relative.split("/");
    if (segments.some((segment) => segment.startsWith(".") || segment.includes("\\"))) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const filename = path.resolve(root, `.${relative.endsWith("/") ? `${relative}index.html` : relative || "/index.html"}`);
    if (!filename.startsWith(root)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(filename);
    if (!info.isFile()) throw new Error("Not a file");
    const headers = { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-cache", "Accept-Ranges": "bytes" };
    let start = 0;
    let end = info.size - 1;
    const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), end) : end;
      if (start > end || start >= info.size) {
        response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
        return;
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
    headers["Content-Length"] = end - start + 1;
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === "HEAD") response.end();
    else createReadStream(filename, { start, end }).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Tactical Round: http://127.0.0.1:${port}/tactical-round/`));
