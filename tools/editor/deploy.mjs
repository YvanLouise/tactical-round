import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REPOSITORY, LIVE_URL } from "./model.mjs";

const execute = promisify(execFile);
export async function git(root, args) {
  return (await execute("git", ["-c", "credential.interactive=never", ...args], { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } })).stdout.trim();
}
export async function deploymentPreflight(root) {
  const top = await git(root, ["rev-parse", "--show-toplevel"]);
  if (top.replaceAll("\\", "/").toLowerCase() !== root.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase()) throw new Error("编辑站必须位于独立的网站 Git 仓库中。");
  const remote = await git(root, ["remote", "get-url", "origin"]);
  if (remote.replace(/\.git$/, "").toLowerCase() !== REPOSITORY.toLowerCase()) throw new Error("origin 与指定的网站仓库不一致，请先检查 Git 配置。");
  if (await git(root, ["branch", "--show-current"]) !== "main") throw new Error("一键部署需要网站仓库处于 main 分支。");
  if (await git(root, ["diff", "--cached", "--name-only"])) throw new Error("Git 暂存区已有其他改动。请先处理暂存内容，再重试上线；当前草稿与已保存文件会保留。");
}
export async function deploy(root, files, update, options = {}) {
  const runGit = options.git || ((args) => git(root, args));
  const fetcher = options.fetch || fetch;
  const pause = options.pause || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let staged = false;
  let committed = false;
  try {
    update("commit", "正在提交本次网站修改…");
    const changed = await runGit(["status", "--porcelain", "--", ...files]);
    if (changed) {
      await runGit(["add", "--", ...files]);
      staged = true;
      await runGit(["diff", "--cached", "--check"]);
      await runGit(["commit", "-m", "Update website content from local editor", "--", ...files]);
      committed = true;
    }
    const head = await runGit(["rev-parse", "HEAD"]);
    update("push", "正在推送到 GitHub…", { commit: head });
    await runGit(["push", "origin", "main"]);
    update("pages", "推送完成，等待 GitHub Pages 部署…", { commit: head });
    for (let attempt = 0; attempt < 60; attempt++) {
      const response = await fetcher("https://api.github.com/repos/YvanLouise/tactical-round/actions/runs?per_page=10", { headers: { Accept: "application/vnd.github+json", "User-Agent": "TacticalRound-local-editor" }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`GitHub 部署状态查询失败（${response.status}）。代码已推送，可打开仓库 Actions 查看。`);
      const data = await response.json();
      const run = data.workflow_runs?.find((item) => item.head_sha === head && item.name === "pages build and deployment");
      if (run?.status === "completed") {
        if (run.conclusion !== "success") throw new Error(`Pages 部署结果：${run.conclusion}。请打开 GitHub Actions 查看构建日志。`);
        const live = await fetcher(LIVE_URL + `?editor-deploy=${head.slice(0, 12)}`, { signal: AbortSignal.timeout(20000) });
        if (!live.ok) throw new Error(`部署已完成，但首页暂未就绪（${live.status}），请稍后刷新。`);
        update("success", "已上线", { commit: head, url: LIVE_URL, runUrl: run.html_url });
        return;
      }
      await pause(5000);
    }
    throw new Error("代码已推送，Pages 部署仍在进行。可打开仓库 Actions 查看进度，稍后再次点击上线继续检查。");
  } catch (error) {
    if (staged && !committed) {
      try { await runGit(["restore", "--staged", "--", ...files]); } catch { /* Preserve the original failure and never discard working files. */ }
    }
    const detail = error.stderr || error.message;
    if (/credential|Authentication failed|could not read Username|Access is denied|terminal prompts disabled/i.test(detail)) throw new Error("无法读取本机 GitHub 授权。请在终端登录 GitHub 后重试；本地修改和提交已保留。");
    throw error;
  }
}
