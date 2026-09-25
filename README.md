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
- `.openai/hosting.json`：私有测试站的 Sites 项目绑定
- `dist/`：静态站部署目录

## 当前阶段

本仓库用于验证“日报 JSON 写入 GitHub → 静态网站读取更新”的最小闭环。当前私有测试站会部署与 GitHub 提交相同的静态内容，但 Sites 的内部源仓库与本 GitHub 仓库尚未建立自动同步；后续需要单独验证自动部署方案。测试项目不需要 OpenAI API key。
