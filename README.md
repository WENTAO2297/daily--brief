# 每日情报测试站

这是一个 iPhone 优先的静态网页测试项目。日报内容从 `data/2026-09-25.json` 读取，网页不调用 OpenAI API。示例内容附 NASA 原图、图片署名和原始来源链接。

## 本地预览

```bash
python3 -m http.server 8000
```

然后打开 `http://localhost:8000`。需要通过本地 HTTP 服务预览，因为页面会使用 `fetch()` 读取日报 JSON。

## 在线访问

公开站点：<https://wentao2297.github.io/daily--brief/>

每次向 `main` 分支推送更新时，GitHub Actions 会自动从 `dist/` 发布新版网页。

## 文件

- `index.html`：手机端新闻卡片页面
- `data/2026-09-25.json`：测试日报数据
- `CODEX_HANDOFF.md`：项目后续任务与约束
- `.openai/hosting.json`：私有测试站的 Sites 项目绑定
- `dist/`：静态站部署目录

## 当前阶段

本仓库已经完成“日报 JSON 写入 GitHub → GitHub Pages 自动发布 → 手机网站读取日报”的最小闭环。当前已配置一个本地 Codex 自动化任务，按上海时间每天 07:30 更新日报并推送到 `main`；测试项目不需要 OpenAI API key。历史归档和多条新闻卡片将在后续继续规划。
