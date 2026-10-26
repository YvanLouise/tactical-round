import { parse } from "parse5";
import { createHash } from "node:crypto";

export const LIVE_URL = "https://yvanlouise.github.io/tactical-round/";
export const REPOSITORY = "https://github.com/YvanLouise/tactical-round";
export const GROUPS = [
  { id: "home", label: "首页", description: "修改文案与主视觉", anchor: "top" },
  { id: "gameplay", label: "玩法与画廊", description: "玩法说明、回合流程与实机截图", anchor: "gameplay" },
  { id: "blueprints", label: "蓝图与建筑", description: "战前搭配、成长说明与建筑配图", anchor: "blueprints" },
  { id: "world", label: "世界与旅程", description: "旅程介绍、区域路线与地图", anchor: "world" },
  { id: "modes", label: "模式介绍", description: "战役、挑战与沙盒的介绍", anchor: "modes" },
  { id: "faq", label: "常见问题", description: "编辑问题、回答与发布状态", anchor: "faq" },
  { id: "settings", label: "页面设置", description: "导航、页尾、搜索与分享信息", anchor: "about" },
  { id: "readme", label: "GitHub README", description: "编辑仓库首页的介绍与使用说明" },
];
const textTags = new Set(["title", "h1", "h2", "h3", "h4", "p", "span", "a", "button", "summary", "figcaption", "li"]);
const labels = { "hero-tagline": "主标语", "hero-description": "介绍文字", "section-intro": "区块引言", "rule-note": "回合补充说明", "video-caption": "视频说明", "footer-note": "页尾备注", "footer-brand": "页尾名称", "creator": "作者署名", "scroll-link": "向下探索文字", "release-link": "发布状态入口", "back-to-top": "回到顶部文字" };
export function revision(html, readme) { return createHash("sha256").update(html).update("\0").update(readme).digest("hex"); }
export const escapeText = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const escapeAttribute = (value) => escapeText(value).replaceAll('"', "&quot;");
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value || "";
const classes = (node) => attr(node, "class").split(/\s+/);
const textOf = (node) => node.nodeName === "#text" ? node.value : node.tagName === "br" ? "\n" : (node.childNodes || []).map(textOf).join("");
function selectorOf(node) {
  if (attr(node, "id")) return `#${attr(node, "id")}`;
  const siblings = node.parentNode?.childNodes?.filter((item) => item.tagName === node.tagName) || [node];
  const part = `${node.tagName}:nth-of-type(${siblings.indexOf(node) + 1})`;
  return node.parentNode?.tagName ? `${selectorOf(node.parentNode)} > ${part}` : part;
}
function groupOf(node) {
  for (let current = node; current; current = current.parentNode) {
    const id = attr(current, "id");
    if (["gameplay", "blueprints", "world", "modes", "faq"].includes(id)) return id;
    if (classes(current).includes("expedition")) return "world";
    if (classes(current).includes("hero")) return "home";
  }
  return "settings";
}
function labelOf(node, value) {
  const classLabel = classes(node).map((name) => labels[name]).find(Boolean);
  if (classLabel) return classLabel;
  if (node.parentNode?.tagName === "h1") {
    const position = node.parentNode.childNodes.filter((item) => item.tagName === "span").indexOf(node);
    return position === 0 ? "英文标题（上）" : position === 1 ? "英文标题（下）" : "游戏中文名称";
  }
  if (classes(node.parentNode || {}).includes("hero-actions")) return node.tagName === "button" ? "视频按钮文字" : "主按钮文字";
  return value.length <= 22 ? value.replaceAll("\n", " / ") : `${node.tagName === "h2" ? "标题" : "文案"} · ${value.slice(0, 14)}…`;
}
function visit(node, callback) { callback(node); for (const child of node.childNodes || []) visit(child, callback); }
export function scan(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const fields = [];
  const add = (node, field) => {
    const selector = selectorOf(node);
    fields.push({ id: `${selector}|${field.attribute || (field.textIndex ?? "text")}`, selector, group: groupOf(node), ...field });
  };
  visit(document, (node) => {
    if (!node.tagName || !node.sourceCodeLocation) return;
    for (let parent = node; parent; parent = parent.parentNode) {
      if (["script", "style", "svg", "dialog"].includes(parent.tagName) || classes(parent).some((name) => ["sr-only", "section-index", "tactic-number", "step-number", "gallery-count", "image-caption"].includes(name))) return;
    }
    if (["gallery-label", "gallery-current"].includes(attr(node, "id"))) return;
    const location = node.sourceCodeLocation;
    const addAttribute = (name, kind, label) => {
      const source = location.attrs?.[name];
      if (!source) return;
      let value = attr(node, name);
      if (kind === "image" && value.startsWith(LIVE_URL)) value = `./${value.slice(LIVE_URL.length)}`;
      add(node, { kind, label, attribute: name, value, start: source.startOffset, end: source.endOffset, multiline: false, imageAbsolute: kind === "image" && node.tagName === "meta", width: Number(attr(node, "width")) || null, height: Number(attr(node, "height")) || null });
    };
    if (node.tagName === "img" && attr(node, "id") !== "gallery-image") {
      const imageLabels = { home: "主视觉配图", blueprints: "蓝图与建筑配图", world: "旅程配图", settings: "品牌图标" };
      addAttribute("src", "image", imageLabels[groupOf(node)] || "配图");
      if (attr(node, "alt")) addAttribute("alt", "alt", "图片说明");
    }
    if (node.tagName === "meta") {
      const name = attr(node, "name") || attr(node, "property");
      if (["description", "og:title", "og:description", "og:image:alt", "twitter:title", "twitter:description"].includes(name)) addAttribute("content", "text", `搜索与分享 · ${name}`);
      if (["og:image", "twitter:image"].includes(name)) addAttribute("content", "image", `分享配图 · ${name}`);
    }
    if (attr(node, "data-slide")) {
      const number = Number(attr(node, "data-slide")) + 1;
      addAttribute("data-image", "image", `画廊 ${number} · 配图`);
      addAttribute("data-image-alt", "alt", `画廊 ${number} · 图片说明`);
      addAttribute("data-label", "text", `画廊 ${number} · 标题`);
    } else if (attr(node, "id") === "tactic-0") {
      addAttribute("data-image", "image", "画廊 1 · 配图");
      addAttribute("data-image-alt", "alt", "画廊 1 · 图片说明");
      addAttribute("data-label", "text", "画廊 1 · 标题");
    }
    if (!textTags.has(node.tagName)) return;
    const children = node.childNodes || [];
    if (children.every((child) => child.nodeName === "#text" || child.tagName === "br")) {
      const value = textOf(node).trim();
      if (/[\p{L}\p{N}]/u.test(value) && location.endTag) add(node, { kind: "text", label: labelOf(node, value), value, start: location.startTag.endOffset, end: location.endTag.startOffset, multiline: node.tagName !== "title" && (value.includes("\n") || value.length > 48 || node.tagName === "p") });
    } else {
      children.forEach((child, index) => {
        if (child.nodeName !== "#text" || !/[\p{L}\p{N}]/u.test(child.value) || !child.sourceCodeLocation) return;
        const value = child.value.trim();
        add(node, { kind: "text", label: labelOf(node, value), value, start: child.sourceCodeLocation.startOffset, end: child.sourceCodeLocation.endOffset, textIndex: index, multiline: false });
      });
    }
  });
  return fields;
}
export function applyEdits(source, edits) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  return source;
}
export function render(html, fields, values) {
  const edits = [];
  for (const field of fields) {
    const value = values[field.id] ?? field.value;
    if (typeof value !== "string" || value.length > 20000 || value.includes("\0")) throw Object.assign(new Error(`字段无效：${field.label}`), { status: 400 });
    if (value === field.value) continue;
    let encoded = field.attribute ? `${field.attribute}="${escapeAttribute(field.imageAbsolute ? LIVE_URL + value.slice(2) : value)}"` : escapeText(value).replaceAll("\n", field.multiline ? "<br>" : " ");
    if (field.textIndex !== undefined) {
      const raw = html.slice(field.start, field.end);
      encoded = (raw.match(/^\s*/)?.[0] || "") + encoded + (raw.match(/\s*$/)?.[0] || "");
    }
    edits.push({ start: field.start, end: field.end, value: encoded });
  }
  return synchronize(applyEdits(html, edits));
}
export function synchronize(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const nodes = [];
  visit(document, (node) => { if (node.tagName) nodes.push(node); });
  const edits = [];
  const setAttribute = (node, name, value) => {
    const location = node?.sourceCodeLocation?.attrs?.[name];
    if (location && attr(node, name) !== value) edits.push({ start: location.startOffset, end: location.endOffset, value: `${name}="${escapeAttribute(value)}"` });
  };
  const firstSlide = nodes.find((node) => attr(node, "id") === "tactic-0");
  if (firstSlide) {
    const image = attr(firstSlide, "data-image");
    const label = attr(firstSlide, "data-label");
    const gallery = nodes.find((node) => attr(node, "id") === "gallery-image");
    const enlarge = nodes.find((node) => attr(node, "id") === "gallery-enlarge");
    setAttribute(gallery, "src", image);
    setAttribute(gallery, "alt", attr(firstSlide, "data-image-alt"));
    setAttribute(enlarge, "href", image);
    setAttribute(enlarge, "data-caption", `${label} · 开发版本实机`);
    const caption = nodes.find((node) => attr(node, "id") === "gallery-label");
    if (caption) edits.push({ start: caption.sourceCodeLocation.startTag.endOffset, end: caption.sourceCodeLocation.endTag.startOffset, value: escapeText(label) });
  }
  const hero = nodes.find((node) => node.tagName === "img" && classes(node.parentNode || {}).includes("hero-art"));
  setAttribute(nodes.find((node) => node.tagName === "link" && attr(node, "as") === "image"), "href", attr(hero || {}, "src"));
  for (const link of nodes.filter((node) => node.tagName === "a" && node.attrs?.some((item) => item.name === "data-lightbox") && attr(node, "id") !== "gallery-enlarge")) {
    const image = (link.childNodes || []).find((child) => child.tagName === "img");
    if (image) setAttribute(link, "href", attr(image, "src"));
  }
  return applyEdits(html, edits);
}
