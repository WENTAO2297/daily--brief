# 每日情报测试站

这是一个 iPhone 优先的静态网页测试项目。日报内容从 `data/2026-09-25.json` 读取，网页不调用 OpenAI API。示例内容附 NASA 原图、图片署名和原始来源链接。

## 本地预览

```bash
python3 -m http.server 8000
```

然后打开 `http://localhost:8000`。需要通过本地 HTTP 服务预览，因为页面会使用 `fetch()` 读取日报 JSON。

## 文件

- `index.html`：手机端新闻卡片页面
- `data/2026-09-25.json`：测试日报数据
- `CODEX_HANDOFF.md`：项目后续任务与约束

## 当前阶段

本仓库用于验证“日报 JSON 写入 GitHub → 静态网站读取更新”的最小闭环。测试项目不需要 OpenAI API key；每日自动生成、历史归档和正式部署将在这次链路验证后继续规划。
