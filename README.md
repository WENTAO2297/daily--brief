# 每日新闻情报日报

这是一个 iPhone 优先的新闻 App 信息流。日报内容从 `data/latest.json` 读取，网页不调用 OpenAI API；每日报告包含主视觉、今日重点、多个频道卡片和收尾链接。

## 本地预览

```bash
python3 -m http.server 8000
```

然后打开 `http://localhost:8000`。需要通过本地 HTTP 服务预览，因为页面会使用 `fetch()` 读取日报 JSON。

## 在线访问

公开站点：<https://wentao2297.github.io/daily--brief/>

每次向 `main` 分支推送更新时，GitHub Actions 会自动从 `dist/` 发布新版网页。另有一个每日生成工作流：北京时间 07:30 自动收集 RSS/网页候选新闻，调用 DeepSeek Flash 进行筛选、DeepSeek Pro 生成最终 JSON，校验后提交 `data/` 和 `dist/`。也可以从手机在 GitHub Actions 页面手动点击 `Run workflow`。

## 文件

- `index.html`：手机端新闻 App 信息流页面
- `data/YYYY-MM-DD.json`：按日期保存的完整日报
- `data/latest.json`：首页读取的最新日报
- `CODEX_HANDOFF.md`：项目后续任务与约束
- `.openai/hosting.json`：私有测试站的 Sites 项目绑定
- `dist/`：静态站部署目录

## 当前阶段

本仓库已经完成“多频道日报 JSON 写入 GitHub → GitHub Pages 自动发布 → 手机网站读取日报”的闭环。当前处于测试模式：云端工作流按上海时间每天 07:30 独立重建当天日报，目标为 18–25 条卡片和尽量多的真实图片，并推送到 `main`；需要在 GitHub Actions Secrets 中配置 `DEEPSEEK_API_KEY`。
