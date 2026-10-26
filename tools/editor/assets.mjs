import path from "node:path";
import { readdir, readFile, realpath, stat, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
export function imageInfo(bytes) {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.length >= 24) return { extension: ".png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) return { extension: ".gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const type = bytes.toString("ascii", 12, 16);
    if (type === "VP8X" && bytes.length >= 30) return { extension: ".webp", width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    if (type === "VP8L" && bytes.length >= 25) { const bits = bytes.readUInt32LE(21); return { extension: ".webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    if (type === "VP8 " && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) return { extension: ".webp", width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 8 < bytes.length && bytes[offset] === 255) {
      const marker = bytes[offset + 1];
      if (marker === 217 || marker === 218) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return { extension: ".jpg", width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      offset += length + 2;
    }
  }
  return null;
}
export async function assetPath(root, value) {
  if (!/^\.\/assets\/[\p{L}\p{N}_./ -]+$/u.test(value) || value.split("/").some((part) => part === "..") || !imageExtensions.has(path.extname(value).toLowerCase())) throw Object.assign(new Error("请选择网站素材库中的图片。"), { status: 400 });
  const assets = await realpath(path.join(root, "assets"));
  let filename;
  try { filename = await realpath(path.resolve(root, value)); } catch { throw Object.assign(new Error("图片文件不存在，请重新选择。"), { status: 400 }); }
  if (!filename.startsWith(assets + path.sep) || !(await stat(filename)).isFile()) throw Object.assign(new Error("图片路径无效。"), { status: 400 });
  return filename;
}
export async function listAssets(root) {
  const result = [];
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.name.startsWith(".")) continue;
      const filename = path.join(directory, item.name);
      if (item.isDirectory()) await walk(filename);
      else if (item.isFile() && imageExtensions.has(path.extname(item.name).toLowerCase())) {
        const bytes = await readFile(filename);
        let info = imageInfo(bytes);
        if (!info && path.extname(item.name).toLowerCase() === ".svg") {
          const source = bytes.toString("utf8");
          const box = source.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)["']/i);
          info = box ? { width: Number(box[1]), height: Number(box[2]) } : null;
        }
        result.push({ path: "./" + path.relative(root, filename).split(path.sep).join("/"), name: item.name, bytes: bytes.length, width: info?.width || null, height: info?.height || null });
      }
    }
  }
  await walk(path.join(root, "assets"));
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
export async function uploadAsset(root, bytes) {
  const info = imageInfo(bytes);
  if (!info || !info.width || !info.height || info.width > 20000 || info.height > 20000) throw Object.assign(new Error("请上传有效的 PNG、JPG、WebP 或 GIF 图片，单边不超过 20000 像素。"), { status: 400 });
  const digest = createHash("sha256").update(bytes).digest("hex");
  const relative = `./assets/uploads/${digest}${info.extension}`;
  await mkdir(path.join(root, "assets", "uploads"), { recursive: true });
  try { await writeFile(path.resolve(root, relative), bytes, { flag: "wx" }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  return { path: relative, name: `${digest.slice(0, 12)}${info.extension}`, bytes: bytes.length, ...info };
}
