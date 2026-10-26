# Tactical Round

《战术回合》是 YvanLouise 制作的回合制塔防游戏。选好建筑蓝图，沿敌人的路线布置防线，和优莉、费洛一起守住旅行车。普通战役由玩家手动结束回合，建筑先行动，然后才轮到敌人。

这个仓库保存游戏介绍网站及本地编辑工具。网站里有玩法说明、开发版截图和游戏开场动画。游戏仍在开发，目前没有公开试玩包。

[打开介绍网站](https://yvanlouise.github.io/tactical-round/)

## 本地预览

需要 Node.js 20 或更高版本。只预览网站时，无需安装依赖。

```sh
npm start
```

打开 <http://127.0.0.1:4173/tactical-round/>。运行 `npm run check` 检查 JavaScript 语法、本地素材引用、页面锚点、ARIA 关联及结构化数据。

## 本地网站编辑站

Windows 双击 `edit-website.cmd`，或在网站目录运行：

```sh
npm install
npm run editor:open
```

默认地址为 <http://127.0.0.1:4318/editor/>。也可以用 `npm run editor` 在当前终端启动，按 Ctrl+C 停止；端口冲突时设置环境变量 `EDITOR_PORT`。

- 选一个栏目，修改文字，右侧会立即显示效果，也可以切换手机预览。
- 图片可以从素材库选择，也可以上传 PNG、JPG、WebP 或 GIF，单张不超过 12 MB。新图另存，原图保留。
- 选择「GitHub README」，编辑并预览仓库首页的 Markdown 说明。
- 点击「保存更改」，写入本地文件。保存前的 HTML 和 README 会备份到 `.local/editor/backups/`；如果文件已被其他程序改过，会提示重新载入。
- 点击「一键上线」，保存并提交文案、README 和所用的新图片，推送到 `origin/main`，然后显示 GitHub Pages 的部署结果。

上线前，需要让本机 Git 能正常推送到 GitHub。网站仓库应处于 `main` 分支，`origin` 指向 `YvanLouise/tactical-round`，暂存区保持为空。

编辑站仅在本机运行。上传图片保存在 `assets/uploads/`；GitHub Pages 发布的是静态介绍网站。

运行 `npm run test:editor` 检查保存、备份、文件冲突、图片上传、Markdown 和部署流程。测试使用临时文件。

## 页面内容

- 玩法与回合顺序：怎样布防、使用能量，以及双方的行动顺序。
- 建筑蓝图：获得、携带和研究蓝图，了解四种建筑的用途。
- 旅程地图：优莉、费洛和旅行车经过的区域。
- 游戏模式：战役、挑战、沙盒的区别与开放条件。
- 常见问题：试玩、存档、发行平台和图片来源。

截图可以点击放大，视频和图片弹窗可按 Esc 关闭。页面内容已按 2026-10-26 的游戏规则核对；玩法和发行安排变化时，需要同步更新介绍。

## 文件

- `index.html`：页面文字、图片引用、搜索与分享摘要。
- `styles.css`：桌面与移动端样式、减弱动态效果支持。
- `app.js`：实机画廊、玩法介绍切换、手机导航、图片放大及开场视频弹窗。
- `assets/`：展示网站专用素材；来源见 `ASSETS.md`。
- `tools/`：本地预览、网站检查和编辑站。

## 发布

GitHub Pages 使用 `main` 分支的根目录。`.nojekyll` 保留原始静态文件，无需构建。推送到 `main` 后会自动发布。

有公开试玩包后，在「常见问题」的试玩说明中添加下载入口，并更新首页介绍。

## 素材与署名

游戏图像与视频归 YvanLouise 所有，保留所有权利。Barlow Condensed 字体使用 SIL Open Font License 1.1，许可保存在 `assets/OFL-Barlow.txt`。
