# 每日新闻情报日报

这是一个适配手机和桌面的中文新闻网站。首页汇集头条、重点新闻和频道报道；文章详情、频道和往期日报可通过链接直接打开。网页从静态 JSON 读取内容。

## 本地预览

```bash
python3 scripts/build_site.py
python3 -m http.server 8000 --directory dist
```

然后打开 `http://localhost:8000`。修改页面或样式后，重新运行 `python3 scripts/build_site.py` 同步部署目录和往期索引。这一步不调用 API。

## 在线访问

公开站点：<https://wentao2297.github.io/daily--brief/>

在仓库的 Actions Secrets 配置 `OPENAI_API_KEY`（需有 Responses 写入权限），再从 [Generate and publish daily brief](https://github.com/WENTAO2297/daily--brief/actions/workflows/daily-brief.yml) 点击 **Run workflow**，选择 `main`。日报只手动生成，定时触发已关闭。

工作流从公开新闻源分地区和频道收集候选，核对摘要、原文摘录和配图，用一次 OpenAI Responses API 请求编写导语和正文。校验通过后发布到 GitHub Pages。Actions 摘要和该期日报页脚都显示 API 返回的 token 数，以及按标准单价换算的费用估算。

CS2 的比赛数据填在当期 JSON，11 月 9 日版有完整示例。`cs2Schedule.fixtures` 录入已确认的重点场次，例如 Falcons、HLTV 前十和顶级赛事的对阵，`startAt` 用带时区的 ISO 时间。页面按北京时间置顶 Falcons 下一场，其余场次按开赛时间排列。往期使用 `cs2Schedule.asOf` 的时间点。`cs2Logos` 以显示队名为键，`url` 填官方队标的 HTTPS 地址，浅色队标可设 `dark: true` 加深底色。

`cs2Vrs` 保存当期 HLTV 全球 VRS 估算榜的日期、原榜链接与前十名，显示在赛程下方。`cs2Results` 中的比分、选手数据、选禁图和回放显示在 `storyId` 关联的详情页，`stats.teams` 的两组行要与 `teams` 的顺序一致。当天重新生成正文时会保留手工核实的 CS2 数据。

## 文件

- `index.html`、`assets/`：网页结构、样式和页面逻辑
- `data/YYYY-MM-DD.json`：按日期保存的完整日报
- `data/latest.json`：首页读取的最新日报
- `CODEX_HANDOFF.md`：项目后续任务与约束
- `.openai/hosting.json`：私有测试站的 Sites 项目绑定
- `dist/`：静态站部署目录

## 当前阶段

测试模式下每次独立重建当天日报。同一期的新闻去重，信息不足时允许缩短。可用 `python3 scripts/generate_brief.py --sources-only` 只检查公开来源和配图，无需 API 密钥。
