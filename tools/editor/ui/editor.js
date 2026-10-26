const $ = (selector) => document.querySelector(selector);
const icons = ["home", "game", "box", "world", "grid", "help", "settings", "document"];
let state, values = {}, savedValues = {}, group = "home", busy = false, dirty = false, assets = [], pendingImage = null, viewport = "desktop", markdownSequence = 0, draftTimer, activeJob = null, staleDraft = false;
const draftKey = "tactical-round-editor-draft-v1";
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
function icon(name) { const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.classList.add("icon"); svg.setAttribute("aria-hidden", "true"); const use = document.createElementNS(svg.namespaceURI, "use"); use.setAttribute("href", `#i-${name}`); svg.append(use); return svg; }
function message(text, error = false) { $("#message").textContent = text; $(".statusbar").classList.toggle("error", error); }
async function api(route, payload, raw = false) {
  const response = await fetch(`/api/editor/${route}`, payload === undefined ? {} : { method: "POST", headers: { "X-Editor-Token": state.token, "Content-Type": raw ? "application/octet-stream" : "application/json" }, body: raw ? payload : JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
function setBusy(value) {
  busy = value;
  $("#fields").inert = value;
  $("#readme-source").readOnly = value;
  for (const button of document.querySelectorAll("#sections button, #reload, #save, #deploy")) button.disabled = value;
  if (!value) $("#save").disabled = !dirty;
}
function updateDirty() {
  dirty = state.readme !== $("#readme-source").value || Object.keys(values).some((key) => values[key] !== savedValues[key]);
  $("#save-status").textContent = dirty ? "未保存" : "所有更改已保存";
  $("#save").disabled = busy || !dirty;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try { if (dirty) localStorage.setItem(draftKey, JSON.stringify({ revision: state.revision, values, readme: $("#readme-source").value })); else if (!staleDraft) localStorage.removeItem(draftKey); }
    catch { message("浏览器草稿空间不足，请及时保存到本地文件。", true); }
  }, 200);
}
function assetUrl(value) { return new URL(value.replace(/^\.\//, ""), `${location.origin}/tactical-round/`).href; }
function fieldInput(field, half = false) {
  const label = element("label", `field${half ? " half" : ""}`);
  const caption = element("span", "", field.label);
  const multiline = field.multiline && field.label !== "主标语";
  const input = element(multiline ? "textarea" : "input");
  if (!multiline) input.type = "text";
  else input.rows = field.value.length > 65 ? 4 : 3;
  input.value = values[field.id];
  input.id = `field-${state.fields.indexOf(field)}`;
  label.htmlFor = input.id;
  input.addEventListener("input", () => { values[field.id] = input.value; updateDirty(); applyPreview(field); });
  label.append(caption, input);
  return label;
}
function imageField(field) {
  const wrapper = element("section", "image-field");
  wrapper.dataset.field = field.id;
  wrapper.append(element("h3", "", field.label));
  const image = element("img"); image.src = assetUrl(values[field.id]); image.alt = field.label;
  wrapper.append(image);
  const actions = element("div", "image-actions");
  const upload = element("button", "button", "上传图片"); upload.type = "button"; upload.prepend(icon("upload"));
  upload.addEventListener("click", () => { pendingImage = field; $("#upload").click(); });
  const select = element("button", "button", "选择素材"); select.type = "button"; select.prepend(icon("folder"));
  select.addEventListener("click", () => openAssets(field));
  actions.append(upload, select); wrapper.append(actions);
  wrapper.append(element("p", "image-path", values[field.id].replace(/^\.\//, "")));
  wrapper.append(element("small", "", "PNG / JPG / WebP / GIF，单张不超过 12 MB。建议保持原配图比例。"));
  const alt = state.fields.find((item) => item.kind === "alt" && item.selector === field.selector);
  if (alt) wrapper.append(fieldInput(alt));
  return wrapper;
}
function renderFields() {
  const form = $("#fields"); form.replaceChildren();
  const fields = state.fields.filter((field) => field.group === group);
  const homeLabels = ["英文标题（上）", "英文标题（下）", "主标语", "介绍文字", "主按钮文字", "视频按钮文字"];
  const textFields = fields.filter((field) => field.kind === "text");
  const images = fields.filter((field) => field.kind === "image");
  if (group === "home") {
    for (const label of homeLabels) for (const field of textFields.filter((item) => item.label === label)) form.append(fieldInput(field, label.includes("英文标题") || label.includes("按钮文字")));
    for (const field of images) form.append(imageField(field));
    for (const field of textFields.filter((item) => !homeLabels.includes(item.label))) form.append(fieldInput(field));
  } else {
    for (const field of textFields) form.append(fieldInput(field));
    for (const field of images) form.append(imageField(field));
  }
}
function selectGroup(id) {
  if (busy) return;
  group = id;
  const current = state.groups.find((item) => item.id === id);
  document.querySelectorAll(".section-button").forEach((button) => { button.classList.toggle("active", button.dataset.group === id); button.setAttribute("aria-current", button.dataset.group === id ? "page" : "false"); });
  $("#section-title").textContent = current.label;
  $("#section-description").textContent = current.description;
  const readme = id === "readme";
  $(".workspace").classList.toggle("readme-mode", readme);
  $("#fields").hidden = readme;
  $("#readme-source").hidden = !readme;
  $("#readme-label").hidden = !readme;
  $("#frame-wrap").hidden = readme;
  $("#readme-preview").hidden = !readme;
  $("#readme-preview-note").hidden = !readme;
  $("#viewport-tools").hidden = readme;
  $("#preview-title").textContent = readme ? "README 预览" : "实时预览";
  $(".edit-pane").scrollTop = 0;
  if (readme) updateMarkdown();
  else { renderFields(); fitPreview(); applyPreview(); scrollPreview(current.anchor); }
}
function applyPreview(editedField) {
  const document = $("#site-preview").contentDocument;
  if (!document?.querySelector("#hero-title")) return;
  for (const field of state.fields) {
    const target = document.querySelector(field.selector);
    if (!target) continue;
    const value = values[field.id];
    if (field.attribute) {
      const attributeValue = field.imageAbsolute ? state.siteUrl + value.slice(2) : value;
      if (target.getAttribute(field.attribute) !== attributeValue) target.setAttribute(field.attribute, attributeValue);
    } else if (field.textIndex !== undefined) {
      const text = target.childNodes[field.textIndex];
      if (text?.nodeType === 3) { const prefix = text.textContent.match(/^\s*/)?.[0] || ""; const suffix = text.textContent.match(/\s*$/)?.[0] || ""; text.textContent = prefix + value + suffix; }
    } else {
      const nodes = [];
      value.split("\n").forEach((line, index) => { if (index) nodes.push(document.createElement("br")); nodes.push(document.createTextNode(line)); });
      target.replaceChildren(...nodes);
    }
  }
  document.querySelectorAll("a[data-lightbox]").forEach((link) => { const image = link.querySelector("img"); if (image) link.href = image.src; });
  $("#site-preview").contentWindow.dispatchEvent(new Event("website-content-updated"));
  if (editedField?.selector.startsWith("#tactic-")) document.querySelector(editedField.selector)?.click();
}
function scrollPreview(anchor) {
  const document = $("#site-preview").contentDocument;
  const target = document?.getElementById(anchor || "top");
  if (target) { document.documentElement.style.scrollBehavior = "auto"; target.scrollIntoView({ block: "start", behavior: "instant" }); }
}
function fitPreview() {
  if (group === "readme") return;
  const stage = $("#preview-stage"), frame = $("#site-preview"), wrap = $("#frame-wrap");
  const width = viewport === "desktop" ? 1280 : 390;
  const scale = Math.min(viewport === "desktop" ? 2 : 1, Math.max(0.1, (stage.clientWidth - 18) / width));
  const height = Math.max(viewport === "desktop" ? 800 : 844, (stage.clientHeight - 18) / scale);
  frame.style.width = `${width}px`; frame.style.height = `${height}px`; frame.style.transform = `scale(${scale})`;
  wrap.style.width = `${width * scale}px`; wrap.style.height = `${height * scale}px`;
}
async function updateMarkdown() {
  const sequence = ++markdownSequence;
  try {
    const data = await api("markdown", { markdown: $("#readme-source").value });
    if (sequence !== markdownSequence) return;
    const style = "body{margin:0;padding:28px;color:#d4e3e7;background:#091a20;font:15px/1.9 'Microsoft YaHei',sans-serif;overflow-wrap:anywhere}h1{font-size:34px;color:#edf4f4}h2{font-size:24px;margin-top:32px;border-top:1px solid #28474e;padding-top:22px}h3{font-size:19px}a{color:#25e0e4}pre{background:#06151b;border:1px solid #28474e;padding:18px;overflow:auto;border-radius:3px}code{font-family:Consolas,monospace}img{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #28474e;padding:8px}blockquote{border-left:3px solid #25e0e4;margin-left:0;padding-left:20px}li{padding-left:3px}hr{border:0;border-top:1px solid #28474e}";
    $("#readme-preview").srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><base href="${location.origin}/tactical-round/" target="_blank"><style>${style}</style></head><body>${data.html}</body></html>`;
  } catch (error) { message(error.message, true); }
}
function acceptState(next) {
  staleDraft = false;
  state = next; values = Object.fromEntries(state.fields.map((field) => [field.id, field.value])); savedValues = { ...values };
  $("#readme-source").value = state.readme;
  dirty = false; clearTimeout(draftTimer); localStorage.removeItem(draftKey);
  $("#save-status").textContent = "所有更改已保存";
  if (group !== "readme") renderFields(); else updateMarkdown();
  applyPreview();
}
const payload = () => ({ revision: state.revision, values, readme: $("#readme-source").value });
async function save() {
  setBusy(true);
  try { const next = await api("save", payload()); acceptState(next); message(next.backup ? "已保存，并生成一份本地备份。" : "网站文件已是最新版本。"); }
  catch (error) { message(error.message, true); }
  finally { setBusy(false); }
}
async function startDeploy() {
  setBusy(true); $("#deployment").hidden = false; $("#deployment-link").hidden = true;
  try { const job = await api("deploy", payload()); activeJob = job.id; await pollDeployment(job.id); }
  catch (error) { message(error.message, true); $("#deployment-message").textContent = error.message; }
  finally { activeJob = null; setBusy(false); }
}
async function pollDeployment(id) {
  let accepted = false;
  while (true) {
    const job = await api(`jobs/${id}`);
    if (job.saved && !accepted) { acceptState(job.saved); accepted = true; }
    $("#deployment-message").textContent = job.message;
    const position = ["saving", "commit", "push", "pages", "success"].indexOf(job.step);
    for (const item of document.querySelectorAll("[data-step]")) { const target = { saving: 1, push: 3, pages: 4 }[item.dataset.step]; item.classList.toggle("done", position >= target); }
    message(job.message, job.step === "error");
    if (job.step === "success") { $("#deployment-link").hidden = false; $("#deployment-link").href = job.url; break; }
    if (job.step === "error") break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
async function openAssets(field) {
  pendingImage = field;
  try {
    assets = await api("assets");
    const list = $("#asset-list"); list.replaceChildren();
    for (const asset of assets) {
      const button = element("button", "asset-item"); button.type = "button";
      const image = element("img"); image.src = assetUrl(asset.path); image.alt = asset.name; image.loading = "lazy";
      button.append(image, element("span", "", asset.name), element("small", "", `${asset.width || "?"} × ${asset.height || "?"} · ${Math.round(asset.bytes / 1024)} KB`));
      button.addEventListener("click", () => { chooseImage(asset.path); $("#asset-dialog").close(); });
      list.append(button);
    }
    $("#asset-dialog").showModal();
  } catch (error) { message(error.message, true); }
}
function chooseImage(path) {
  if (!pendingImage) return;
  values[pendingImage.id] = path;
  renderFields(); applyPreview(pendingImage); updateDirty();
  message("配图已更新，保存后写入网站文件。");
}
$("#upload").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) { message("图片超过 12 MB，请先压缩再上传。", true); event.target.value = ""; return; }
  setBusy(true);
  try { const asset = await api("upload", await file.arrayBuffer(), true); chooseImage(asset.path); }
  catch (error) { message(error.message, true); }
  finally { event.target.value = ""; setBusy(false); }
});
$("#close-assets").addEventListener("click", () => $("#asset-dialog").close());
$("#fields").addEventListener("submit", (event) => event.preventDefault());
$("#save").addEventListener("click", save);
$("#deploy").addEventListener("click", startDeploy);
$("#reload").addEventListener("click", async () => {
  if (dirty && !confirm("重新载入将放弃本次未保存的草稿。继续吗？")) return;
  try { acceptState(await api("state")); updateDirty(); message("已读取最新的网站文件。"); } catch (error) { message(error.message, true); }
});
$("#readme-source").addEventListener("input", () => { updateDirty(); clearTimeout(window.markdownTimer); window.markdownTimer = setTimeout(updateMarkdown, 250); });
for (const mode of ["desktop", "mobile"]) $("#" + mode).addEventListener("click", () => { viewport = mode; for (const item of ["desktop", "mobile"]) { $("#" + item).classList.toggle("selected", item === mode); $("#" + item).setAttribute("aria-pressed", String(item === mode)); } fitPreview(); });
$("#site-preview").addEventListener("load", () => { if (state) { applyPreview(); scrollPreview(state.groups.find((item) => item.id === group)?.anchor); } });
new ResizeObserver(fitPreview).observe($("#preview-stage"));
window.addEventListener("beforeunload", (event) => { if (dirty || activeJob) { event.preventDefault(); event.returnValue = ""; } });
try {
  const next = await api("state");
  let draft;
  try { draft = JSON.parse(localStorage.getItem(draftKey)); } catch { /* An invalid browser draft must not block the editor. */ }
  acceptState(next);
  if (draft && draft.revision === state.revision) { for (const key of Object.keys(values)) if (typeof draft.values?.[key] === "string") values[key] = draft.values[key]; $("#readme-source").value = draft.readme ?? state.readme; message("已恢复上次未保存的本机草稿。"); }
  else if (draft) { staleDraft = true; localStorage.setItem(draftKey, JSON.stringify(draft)); message("检测到旧版本草稿。网站文件已经变化，请核对最新内容后再编辑。", true); }
  state.groups.forEach((item, index) => { const button = element("button", "section-button", item.label); button.type = "button"; button.dataset.group = item.id; button.prepend(icon(icons[index])); button.addEventListener("click", () => selectGroup(item.id)); $("#sections").append(button); });
  selectGroup("home"); updateDirty(); setBusy(false);
  if (next.activeJobId) {
    activeJob = next.activeJobId; $("#deployment").hidden = false; setBusy(true);
    try { await pollDeployment(activeJob); } finally { activeJob = null; setBusy(false); }
  }
} catch (error) { message(`编辑站读取失败：${error.message}`, true); }
