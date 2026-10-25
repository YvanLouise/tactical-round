# Tactical Round

《战术回合》的游戏介绍网站，由 YvanLouise 制作。页面使用游戏原有插画、实机截图与开场视频，展示回合制塔防玩法和几何世界旅程。

网站地址：<https://yvanlouise.github.io/tactical-round/>

## 本地预览

需要 Node.js 20 或更高版本，无需安装依赖。

```sh
npm start
```

打开 <http://127.0.0.1:4173/tactical-round/>。运行 `npm run check` 检查 JavaScript 语法及本地素材引用。

## 文件

- `index.html`：页面内容、SEO 和语义结构。
- `styles.css`：桌面与移动端样式、减弱动态效果支持。
- `app.js`：实机画廊、玩法介绍切换、手机导航及开场视频弹窗。
- `assets/`：展示网站专用素材；来源见 `ASSETS.md`。
- `tools/`：本地预览与素材引用检查。

## 发布

GitHub Pages 使用 `main` 分支的根目录。`.nojekyll` 保留原始静态文件，无需构建。推送到 `main` 后会自动发布。

当前页面介绍开发中的游戏，未提供公开试玩下载。获得正式下载地址后，可在页面末尾添加下载入口。

## 素材与署名

游戏图像与视频归 YvanLouise 所有，保留所有权利。Barlow Condensed 字体使用 SIL Open Font License 1.1，许可保存在 `assets/OFL-Barlow.txt`。
