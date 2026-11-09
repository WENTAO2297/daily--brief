# 每日新闻情报日报

这是一个 iPhone 优先的新闻 App 信息流。日报内容从 `data/latest.json` 读取，网页不调用 OpenAI API；每日报告包含主视觉、今日重点、多个频道卡片和收尾链接。

## 本地预览

```bash
python3 -m http.server 8000
```

然后打开 `http://localhost:8000`。需要通过本地 HTTP 服务预览，因为页面会使用 `fetch()` 读取日报 JSON。

## 在线访问

公开站点：<https://wentao2297.github.io/daily--brief/>

在仓库的 Actions Secrets 配置 `OPENAI_API_KEY`（需有 Responses 写入权限），再从 [Generate and publish daily brief](https://github.com/WENTAO2297/daily--brief/actions/workflows/daily-brief.yml) 点击 **Run workflow**，选择 `main`。日报只手动生成，定时触发已关闭。

工作流从公开新闻源分地区和频道收集候选，检查文章配图，用一次 OpenAI Responses API 请求编写日报。来源和配图来自已抓取的资料，校验通过后保存并发布到 GitHub Pages。Actions 的运行摘要显示实际输入、输出 token 数，以及按官方标准单价计算的费用估算。

## 文件

- `index.html`：手机端新闻 App 信息流页面
- `data/YYYY-MM-DD.json`：按日期保存的完整日报
- `data/latest.json`：首页读取的最新日报
- `CODEX_HANDOFF.md`：项目后续任务与约束
- `.openai/hosting.json`：私有测试站的 Sites 项目绑定
- `dist/`：静态站部署目录

## 当前阶段

测试模式下每次独立重建当天日报。同一期的新闻去重，信息不足时允许缩短。可用 `python3 scripts/generate_brief.py --sources-only` 只检查公开来源和配图，无需 API 密钥。
