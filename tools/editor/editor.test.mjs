import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { scan, render } from "./model.mjs";
import { createEditorServer, readState, saveContent, markdownPreview } from "./server.mjs";
import { uploadAsset } from "./assets.mjs";
import { deploy } from "./deploy.mjs";

const website = fileURLToPath(new URL("../../", import.meta.url));
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV7sAAAAASUVORK5CYII=", "base64");
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tactical-round-editor-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const html = await readFile(path.join(website, "index.html"), "utf8");
  await mkdir(path.join(root, "assets"));
  for (const field of scan(html).filter((item) => item.kind === "image")) await writeFile(path.resolve(root, field.value), tinyPng);
  await writeFile(path.join(root, "index.html"), html, "utf8");
  await writeFile(path.join(root, "README.md"), "# Fixture\n", "utf8");
  return root;
}
const payloadFor = (state) => ({ revision: state.revision, readme: state.readme, values: Object.fromEntries(state.fields.map((field) => [field.id, field.value])) });

test("editable fields preserve icons, text escaping, line breaks and gallery links", async () => {
  const html = await readFile(path.join(website, "index.html"), "utf8");
  const fields = scan(html);
  assert.equal(new Set(fields.map((field) => field.id)).size, fields.length);
  const values = Object.fromEntries(fields.map((field) => [field.id, field.value]));
  const tagline = fields.find((field) => field.label === "主标语");
  const action = fields.find((field) => field.label === "主按钮文字");
  const heading = fields.find((field) => field.selector === "#blueprints-title");
  const gallery = fields.find((field) => field.id === "#tactic-0|data-image");
  values[tagline.id] = '<img src=x onerror="alert(1)"> & 优莉';
  values[action.id] = '开始 <探索>';
  values[heading.id] = "第一行\n第二行";
  values[gallery.id] = "./assets/enemies.webp";
  const result = render(html, fields, values);
  assert.ok(result.includes("&lt;img src=x onerror=\"alert(1)\"&gt; &amp; 优莉"));
  assert.ok(result.includes('开始 &lt;探索&gt; <svg'));
  assert.ok(result.includes("第一行<br>第二行"));
  assert.match(result, /id="gallery-image" src="\.\/assets\/enemies\.webp"/);
  assert.match(result, /id="gallery-enlarge" href="\.\/assets\/enemies\.webp"/);
  assert.equal(scan(result).find((field) => field.id === tagline.id).value, values[tagline.id]);
});

test("save writes UTF-8, backups, README and rejects stale revisions without overwriting", async (t) => {
  const root = await fixture(t);
  const state = await readState(root);
  const payload = payloadFor(state);
  const field = state.fields.find((item) => item.label === "主标语");
  payload.values[field.id] = "保存后的主标语";
  payload.readme = "# 编辑站\n\n中文 README 内容。\n";
  const saved = await saveContent(root, payload);
  assert.notEqual(saved.revision, state.revision);
  assert.ok(saved.backup);
  assert.equal(await readFile(path.join(root, saved.backup, "README.md"), "utf8"), state.readme);
  assert.equal((await readFile(path.join(root, "index.html"))).subarray(0, 3).toString("hex"), "3c2164");
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"), payload.readme);
  await assert.rejects(saveContent(root, payload), (error) => error.status === 409);
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"), payload.readme);
  const fresh = payloadFor(saved);
  fresh.values[field.id] = "不应写入";
  await writeFile(path.join(root, "README.md"), "# 外部修改\n", "utf8");
  await assert.rejects(saveContent(root, fresh), (error) => error.status === 409);
  assert.equal(await readFile(path.join(root, "README.md"), "utf8"), "# 外部修改\n");
});

test("images are retained, validated, deduplicated and limited to asset paths", async (t) => {
  const root = await fixture(t);
  const uploaded = await uploadAsset(root, tinyPng);
  assert.equal(uploaded.width, 1);
  assert.equal(uploaded.height, 1);
  assert.equal((await uploadAsset(root, tinyPng)).path, uploaded.path);
  assert.equal((await readdir(path.join(root, "assets", "uploads"))).length, 1);
  await assert.rejects(uploadAsset(root, Buffer.from('<svg onload="alert(1)"></svg>')));
  const state = await readState(root);
  const payload = payloadFor(state);
  const image = state.fields.find((field) => field.kind === "image");
  payload.values[image.id] = "./assets/../../README.md";
  await assert.rejects(saveContent(root, payload), (error) => error.status === 400);
  payload.values[image.id] = uploaded.path;
  const saved = await saveContent(root, payload);
  assert.equal(saved.fields.find((field) => field.id === image.id).value, uploaded.path);
});

test("README preview renders Markdown while removing scripts and executable links", () => {
  const html = markdownPreview('# Title\n\n**Bold**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n<img src="x" onerror="alert(1)">');
  assert.ok(html.includes("<h1>Title</h1>"));
  assert.ok(html.includes("<strong>Bold</strong>"));
  assert.ok(!/script|onerror|javascript:/i.test(html));
});

test("HTTP editing requires a local session and runs a complete asynchronous deployment", async (t) => {
  const root = await fixture(t);
  const steps = [];
  const server = createEditorServer({ root, port: 0, preflight: async () => {}, deployRunner: async (_root, files, update) => { assert.deepEqual(files, ["index.html", "README.md"]); for (const step of ["commit", "push", "pages", "success"]) { steps.push(step); update(step, step, { url: "https://yvanlouise.github.io/tactical-round/" }); } } });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(base + "/api/editor/state")).json();
  const unauthorized = await fetch(base + "/api/editor/save", { method: "POST", body: "{}" });
  assert.equal(unauthorized.status, 403);
  const foreign = await fetch(base + "/api/editor/state", { headers: { Origin: "https://example.invalid" } });
  assert.equal(foreign.status, 403);
  assert.equal((await fetch(base + "/.git/config")).status, 404);
  const upload = await fetch(base + "/api/editor/upload", { method: "POST", headers: { "X-Editor-Token": state.token }, body: tinyPng });
  assert.equal(upload.status, 200);
  const deployment = await fetch(base + "/api/editor/deploy", { method: "POST", headers: { "X-Editor-Token": state.token, "Content-Type": "application/json" }, body: JSON.stringify(payloadFor(state)) });
  assert.equal(deployment.status, 202);
  const { id } = await deployment.json();
  let job;
  for (let attempt = 0; attempt < 30; attempt++) {
    job = await (await fetch(base + "/api/editor/jobs/" + id)).json();
    if (job.step === "success" || job.step === "error") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(job.step, "success");
  assert.deepEqual(steps, ["commit", "push", "pages", "success"]);
});

test("deployment stages only explicit files and waits for the matching commit", async () => {
  const commands = [], states = [];
  let polls = 0;
  await deploy("fixture", ["index.html", "README.md"], (step) => states.push(step), {
    git: async (args) => { commands.push(args); if (args[0] === "status") return " M README.md"; if (args[0] === "rev-parse") return "abc123"; return ""; },
    pause: async () => {},
    fetch: async (url) => ({ ok: true, json: async () => { polls++; return { workflow_runs: [{ name: "pages build and deployment", head_sha: polls === 1 ? "old" : "abc123", status: "completed", conclusion: "success", html_url: "https://github.com/example/run" }] }; } }),
  });
  assert.deepEqual(commands.find((args) => args[0] === "add"), ["add", "--", "index.html", "README.md"]);
  assert.ok(!commands.some((args) => args.includes("-A") || args.includes(".")));
  assert.ok(states.includes("success"));
  assert.equal(polls, 2);
});
