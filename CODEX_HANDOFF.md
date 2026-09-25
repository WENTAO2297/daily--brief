# Codex 任务交接：每日新闻情报日报

请继续完成“ChatGPT 生成日报 → 写入 GitHub → 手机网站读取日报”的零 OpenAI API 费用测试。

## 用户目标

- 用 iPhone 阅读个人每日新闻情报站。
- 不使用 OpenAI API，不产生 API token 费用。
- 测试模式下每次独立重建一份完整日报，不做跨期去重；同一份日报内部严格去重。
- 日报采用新闻 App 信息流结构：主视觉、今日重点、全球 / AI / Coding-Agent / 论文 / 开源 / CS2 / 日本 / 经济产业 / 科技科学频道和今日收尾。

## 已完成

- 建好了移动端静态页面 `index.html`，从 `data/latest.json` 读取完整日报。
- 页面支持 HERO、LARGE、STANDARD、FLASH 四种卡片形态、图片组、来源链接和各频道信息流。
- 示例内容来自 NASA 2026-09-24 的 Earth Observatory 页面，图片 URL 和来源均已写入 JSON。
- 已部署一个私有测试站：<https://wentao-daily-brief-test.sweetiee-2297.chatgpt.site>
- 已部署一个公开 GitHub Pages 站点：<https://wentao2297.github.io/daily--brief/>；`main` 分支更新会触发自动发布。
- 已配置本地 Codex 自动化：每天 07:30（Asia/Shanghai）按正式日报提示词生成 18–25 条内容、搜索 8–12 组真实图片，写入当天 JSON 和 `latest.json`，提交并推送到 `main`；成功时静默，失败时通知。
- 没有调用 OpenAI API。
- 已将测试站的 Sites 项目绑定写入 `.openai/hosting.json`，部署目录为 `dist/`。

## 当前状态

- GitHub 仓库 `WENTAO2297/daily--brief` 现在可以由当前连接访问，默认分支为 `main`。
- 私有测试站仍托管在 ChatGPT Sites 的内部源仓库；公开正式测试站由 GitHub Pages 从用户仓库发布。
- 当前仍为测试模式；用户明确说“开始正式使用/结束测试模式”后，才恢复跨期去重。
- 公开正式测试站由 GitHub Pages 从用户仓库发布；私有 Sites 测试站继续保留。

## 接下来

1. 观察多频道自动化运行，确认新闻数量、图片来源和 GitHub 推送均成功。
2. 根据用户反馈调整频道优先级、卡片密度和图片比例。

## 约束

- 不调用 OpenAI API。
- 不覆盖用户现有博客或其他 GitHub 项目。
- 不提交 `.env`、密钥、访问令牌或含密钥的日志。
- 每次只修改测试站所需文件，并用真实提交/部署结果说明验证情况。
