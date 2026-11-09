# Codex 任务交接：每日新闻情报日报

## 用户目标

- 用 iPhone 阅读个人新闻情报站。导航分全球、中国、AI 与开发、CS2。全球频道下有日本，AI 与开发频道下有 AI、Coding、论文和开源。
- 采用新闻 App 信息流结构，展示主视觉、今日重点、频道卡片和今日收尾。尽量分散配图，优先原始来源和有信息量的新闻图。
- 测试模式下每次独立重建当天日报，同一期严格去重。用户明确结束测试模式后，再恢复跨期去重。
- 使用 OpenAI Responses API。密钥只放在 GitHub Actions Secret `OPENAI_API_KEY`，所需权限为 Responses Write。

## 实现

- `index.html` 从 `data/latest.json` 加载日报，支持 HERO、LARGE、STANDARD、FLASH、图片和来源链接。
- `scripts/brief_sources.py` 采集按地区和频道分组的公开来源，按时间筛选，并验证配图。
- `scripts/generate_brief.py` 单次调用 OpenAI 编写，校验后生成 `data/` 和 `dist/`。工作流记录模型用量和费用估算。
- [GitHub Pages 公开站点](https://wentao2297.github.io/daily--brief/)由 `WENTAO2297/daily--brief` 发布。生成工作流可手动触发，并在同一次运行中部署。
- 私有测试站仍为 [Sites 测试站](https://wentao-daily-brief-test.sweetiee-2297.chatgpt.site)，其绑定由 `.openai/hosting.json` 记录。

## 验证

用 `python3 scripts/generate_brief.py --sources-only` 检查候选和配图。真实试跑后检查 Actions 运行摘要、线上最新日期和手机画幅的图文显示。定时触发保持关闭，等用户明确要求后再开启。

不要将凭据写入仓库，不修改其他 GitHub 项目。
