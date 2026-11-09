'use strict';

const desks = [
  ['world', '全球要闻', '全球重大新闻'],
  ['china', '中国', '中国新闻'],
  ['ai', 'AI', 'AI核心动态'],
  ['coding', 'Coding', 'AI Coding / Agent'],
  ['papers', '论文', '前沿论文 / 技术'],
  ['open', '开源', 'GitHub / 开源项目'],
  ['cs2', 'CS2', 'CS2专区'],
  ['japan', '日本', '日本动态'],
];
const channelGroups = [
  {id: 'global', label: '全球', children: ['world', 'japan']},
  {id: 'china', label: '中国', children: []},
  {id: 'ai-dev', label: 'AI 与开发', children: ['ai', 'coding', 'papers', 'open']},
  {id: 'cs2', label: 'CS2', children: []},
];
const deskByTitle = new Map([
  ...desks.map(([id, , name]) => [name, id]),
  ['经济 / 科技产业', 'world'],
  ['其他值得知道的科技与科学', 'world'],
]);
const retiredChannels = new Set(['economy', 'science']);
const groupForDesk = id => channelGroups.find(group => group.id === id || group.children.includes(id));
const app = document.getElementById('app');
const nav = document.getElementById('channels');
const archiveLink = document.getElementById('archive-link');
const issueDate = document.getElementById('issue-date');
const generationUsage = document.getElementById('generation-usage');
const params = new URLSearchParams(location.search);
const requestedDate = params.get('date');
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const chinaDate = new Intl.DateTimeFormat('zh-CN', {dateStyle: 'full', timeZone: 'Asia/Shanghai'});
const chinaTime = new Intl.DateTimeFormat('zh-CN', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Shanghai'});
const matchDate = new Intl.DateTimeFormat('zh-CN', {month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai'});
const tokenCount = new Intl.NumberFormat('zh-CN');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => (
  {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]
));
const cleanTitle = title => String(title ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim();

function httpsURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function pageURL(values = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return search ? `./?${search}` : './';
}

function datedPage(values = {}) {
  return pageURL({date: requestedDate, ...values});
}

function dateLabel(date) {
  const day = new Date(`${date}T12:00:00+08:00`);
  return Number.isNaN(day.getTime()) ? date : chinaDate.format(day);
}

function readLabel(url, label) {
  const destination = httpsURL(url);
  return destination
    ? `<a href="${esc(destination)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span><span class="sr-only">（新标签页）</span></a>`
    : '';
}

function storyImages(story, count = 1) {
  return (story.images || []).filter(image => httpsURL(image.url)).slice(0, count);
}

function photos(images, style, eager = false) {
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return images.map(image =>
    `<figure class="${style}"><img src="${esc(httpsURL(image.url))}" alt="${esc(style === 'thumbnail' ? '' : image.alt || '')}" ${loading} decoding="async"></figure>`
  ).join('');
}

function storyKey(story) {
  if (story.id) return story.id;
  // Keep shared links tied to the story when an edition is re-ordered.
  const identity = `${story.sources?.[0]?.url || ''}|${story.title}`;
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

function organize(edition) {
  const sections = new Map(desks.map(([id, short, name]) => [id, {id, short, name, note: '', stories: [], home: []}]));
  sections.get('cs2').results = edition.cs2Results || [];
  const stories = new Map();
  function add(story, fallbackDesk) {
    if (!story?.title) return null;
    const id = storyKey(story);
    if (stories.has(id)) return null;
    const originalDesk = deskByTitle.get(cleanTitle(story.channel || story.section)) || fallbackDesk;
    const desk = originalDesk === 'world' && story.region === '中国' ? 'china' : originalDesk;
    const record = {...story, id, desk, href: pageURL({date: edition.date, story: id})};
    stories.set(id, record);
    sections.get(desk)?.stories.push(record);
    return record;
  }
  const lead = add(edition.hero);
  const top = (edition.topStories || []).map(story => add(story)).filter(Boolean);
  for (const channel of edition.channels || []) {
    const title = cleanTitle(channel.title);
    const desk = deskByTitle.get(title);
    const section = sections.get(desk);
    if (section?.name === title) section.note = channel.note;
    for (const story of channel.stories || []) {
      const record = add(story, desk);
      if (record) sections.get(record.desk)?.home.push(record);
    }
  }
  for (const {id, label, children} of channelGroups) {
    if (!children.length) continue;
    const homeLists = children.map(child => sections.get(child).home);
    const firstStories = homeLists.map(list => list[0]).filter(Boolean);
    sections.set(id, {
      id, short: label, name: label,
      stories: [...stories.values()].filter(story => children.includes(story.desk)),
      home: [...firstStories, ...homeLists.flatMap(list => list.slice(1))].slice(0, 4),
    });
  }
  return {edition, lead, top, stories, sections};
}

function renderNav(active, archive = false) {
  const activeGroup = groupForDesk(active)?.id ?? active;
  const tabs = [{id: '', label: '首页'}, ...channelGroups];
  nav.innerHTML = tabs.map(({id, label}) => {
    const href = archive ? pageURL({channel: id}) : datedPage({channel: id});
    const current = !archive && activeGroup === id ? ` aria-current="${active === id ? 'page' : 'true'}"` : '';
    return `<a href="${esc(href)}"${current}>${esc(label)}</a>`;
  }).join('');
  if (archive) archiveLink.setAttribute('aria-current', 'page');
  const current = nav.querySelector('[aria-current]');
  if (current && current.getBoundingClientRect().right > nav.getBoundingClientRect().right) {
    nav.scrollLeft += current.getBoundingClientRect().left - nav.getBoundingClientRect().left - 10;
  }
}

function channelTabs(sections, section, preview = false) {
  const group = groupForDesk(section.id);
  if (!group?.children.length) return '';
  const ids = preview ? group.children : [group.id, ...group.children];
  return `<nav class="channel-tabs" aria-label="${esc(group.label)}子栏目">
    ${ids.map(id => `<a href="${esc(datedPage({channel: id}))}"${id === section.id ? ' aria-current="page"' : ''}>${esc(id === group.id ? '全部' : sections.get(id).short)}</a>`).join('')}
  </nav>`;
}

function setEditionDate(date) {
  issueDate.dateTime = date;
  issueDate.textContent = dateLabel(date);
}

function renderUsage(usage) {
  generationUsage.hidden = false;
  if (!usage || !Number.isFinite(usage.estimated_usd)) {
    generationUsage.textContent = '本期未记录 API 用量。';
    return;
  }
  const total = tokenCount.format(usage.input_tokens + usage.output_tokens);
  const amount = `$${usage.estimated_usd.toFixed(6)}`;
  generationUsage.innerHTML = `<details>
    <summary><span>本期生成用量</span><span class="usage-figures"><b>${total} tokens</b><span>估算 ${amount}</span></span></summary>
    <dl>
      <div><dt>模型</dt><dd>${esc(usage.model)}${usage.reasoning_effort ? `（${esc(usage.reasoning_effort)}）` : ''}</dd></div>
      <div><dt>输入</dt><dd>${tokenCount.format(usage.input_tokens)} tokens${usage.cached_input_tokens ? `，缓存 ${tokenCount.format(usage.cached_input_tokens)}` : ''}</dd></div>
      <div><dt>输出</dt><dd>${tokenCount.format(usage.output_tokens)} tokens${usage.reasoning_tokens ? `，含推理 ${tokenCount.format(usage.reasoning_tokens)}` : ''}</dd></div>
    </dl>
    <p>Token 数来自 OpenAI 返回值。金额为美元，按 <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer">OpenAI 标准单价</a>换算，结算以平台账单为准。</p>
    ${usage.note ? `<p>${esc(usage.note)}</p>` : ''}
  </details>`;
}

function blockTitle(title, side = '') {
  return `<header class="block-title"><h2>${esc(title)}</h2>${side}</header>`;
}

function storyMeta(story, label = '', withSource = true) {
  const source = withSource ? story.sources?.[0]?.label : '';
  const details = [story.region, source].filter(Boolean);
  return label || details.length ? `<p class="story-meta">${label ? `<b>${esc(label)}</b>` : ''}${details.map(text => `<span>${esc(text)}</span>`).join('')}</p>` : '';
}

function teaser(story, limit) {
  const text = (story.summary || story.what || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit);
  const sentenceEnd = Math.max(prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？'));
  return sentenceEnd > limit * .55 ? prefix.slice(0, sentenceEnd + 1) : `${prefix.trimEnd()}…`;
}

const headline = story => `<h3><a href="${esc(story.href)}">${esc(story.title)}</a></h3>`;

function compact(story, limit, showImage) {
  const summary = limit ? teaser(story, limit) : '';
  const image = showImage ? photos(storyImages(story), 'thumbnail') : '';
  return `<article class="compact-story"><div>${storyMeta(story)}${headline(story)}${summary ? `<p class="teaser">${esc(summary)}</p>` : ''}</div>${image}</article>`;
}

function feature(story) {
  return `<article class="feature-story">${photos(storyImages(story), 'feature-image')}
    <div class="feature-text">${storyMeta(story)}${headline(story)}<p class="teaser">${esc(teaser(story, 105))}</p></div>
  </article>`;
}

function storyList(stories, {className = 'story-list', limit = 0, imageLimit = stories.length} = {}) {
  return `<ul class="${className}">${stories.map((story, index) => `<li>${compact(story, limit, index < imageLimit)}</li>`).join('')}</ul>`;
}

const matchMetrics = [
  ['K–D', '击杀数与死亡数'],
  ['Swing', '选手对回合胜率的影响'],
  ['ADR', '平均每回合伤害'],
  ['KAST', '取得击杀或助攻、存活或被队友补枪的回合占比'],
  ['Rating', 'HLTV 对选手表现的综合评分'],
];

function teamLabel(team, logos) {
  const url = httpsURL(logos?.[team]?.url);
  return `<span class="cs2-team">
    ${url ? `<img class="cs2-team-logo" src="${esc(url)}" width="20" height="20" alt="" decoding="async">` : ''}
    <span>${esc(team)}</span>
  </span>`;
}

function matchTeamTable(team, rows, ratingVersion) {
  return `<table class="match-table">
    <caption>${esc(team)}</caption>
    <thead><tr><th scope="col">选手</th>${matchMetrics.map(([label]) =>
      `<th scope="col">${esc(label)}${label === 'Rating' && ratingVersion ? ` <small>${esc(ratingVersion)}</small>` : ''}</th>`
    ).join('')}</tr></thead>
    <tbody>${rows.map(player => {
      const swingTone = player.swing > 0 ? 'stat-high' : player.swing < 0 ? 'stat-low' : '';
      const ratingTone = player.rating > 1.04 ? 'stat-high' : player.rating < 0.96 ? 'stat-low' : '';
      const swing = `${player.swing > 0 ? '+' : ''}${player.swing.toFixed(2)}%`;
      return `<tr><th scope="row">${esc(player.name)}</th><td>${player.kills}–${player.deaths}</td>
        <td class="${swingTone}">${swing}</td><td>${player.adr.toFixed(1)}</td><td>${player.kast.toFixed(1)}%</td>
        <td class="rating-value ${ratingTone}">${player.rating.toFixed(2)}</td></tr>`;
    }).join('')}</tbody>
  </table>`;
}

function matchPanel(match, logos) {
  const maps = match.maps || [];
  const views = [{name: '全场', stats: match.stats}, ...maps];
  const firstStats = views.findIndex(view => view.stats?.teams?.length);
  const hasStats = firstStats !== -1;
  const day = matchDate.format(new Date(`${match.date}T12:00:00+08:00`));
  const source = readLabel(match.source?.url, match.source?.label || '比赛来源');
  const replayLinks = (match.replays || []).map(replay => `<li>${readLabel(replay.url, replay.label)}</li>`).join('');
  const [left, right] = match.teams;
  const [winsLeft, winsRight] = match.score;
  return `<section class="match-panel" aria-label="${esc(`${match.event} ${left} 对阵 ${right}`)}">
    <header class="match-header">
      <h2>${esc(match.event)} <span>${esc(match.round)}</span></h2>
      <p><time datetime="${esc(match.date)}">${esc(day)}</time>${match.bestOf ? `<span>BO${esc(match.bestOf)}</span>` : ''}</p>
    </header>
    <div class="match-score">
      <span class="${winsLeft > winsRight ? 'match-winner' : ''}">${teamLabel(left, logos)}</span>
      <strong>${winsLeft}<span>–</span>${winsRight}</strong>
      <span class="${winsRight > winsLeft ? 'match-winner' : ''}">${teamLabel(right, logos)}</span>
    </div>
    ${hasStats ? `<div class="match-tabs" role="group" aria-label="选择选手数据">
      ${views.map((view, index) => `<button type="button" data-match-tab="${index}" aria-pressed="${index === firstStats}">
        <span>${esc(view.name)}</span>${view.score ? `<small>${view.score.join('–')}</small>` : ''}</button>`).join('')}
    </div>
    ${views.map((view, index) => `<div class="match-view" data-match-view="${index}"${index === firstStats ? '' : ' hidden'}>
      ${view.stats?.teams?.length ? view.stats.teams.map((rows, side) => matchTeamTable(match.teams[side], rows, match.ratingVersion)).join('')
        : '<p class="match-empty">暂无这场比赛的选手数据。</p>'}
      ${view.stats?.url ? `<p class="match-data-link">${readLabel(view.stats.url, '查看原始数据')}</p>` : ''}
    </div>`).join('')}` : maps.length ? `<ul class="match-map-scores">${maps.map(map =>
      `<li><span>${esc(map.name)}</span><b>${map.score.join('–')}</b></li>`).join('')}</ul>` : ''}
    ${source || hasStats || match.veto?.length || replayLinks ? `<footer class="match-footer">${source}
      ${match.veto?.length ? `<details><summary>选图与禁图</summary><ol>${match.veto.map(step => `<li>${esc(step)}</li>`).join('')}</ol></details>` : ''}
      ${replayLinks ? `<details><summary>比赛回放</summary><ul>${replayLinks}</ul></details>` : ''}
      ${hasStats ? `<details><summary>指标说明</summary><dl>${matchMetrics.map(([label, definition]) =>
        `<div><dt>${esc(label)}</dt><dd>${esc(definition)}</dd></div>`).join('')}</dl></details>` : ''}</footer>` : ''}
  </section>`;
}

function fixtureCard(fixture, logos, pinned = false) {
  const start = new Date(fixture.startAt);
  return `<article class="cs2-fixture${pinned ? ' cs2-fixture-pinned' : ''}">
    <time datetime="${esc(fixture.startAt)}"><span>${esc(matchDate.format(start))}</span><b>${esc(chinaTime.format(start))}</b></time>
    <div class="cs2-fixture-info">
      ${pinned ? '<p class="cs2-fixture-kicker">Falcons 下一场</p>' : ''}
      <h3>${teamLabel(fixture.teams[0], logos)} <span class="cs2-versus">vs</span> ${teamLabel(fixture.teams[1], logos)}</h3>
      <p class="cs2-meta">${esc(fixture.event)} · ${esc(fixture.round)} · BO${esc(fixture.bestOf)}</p>
      ${fixture.note ? `<p class="cs2-fixture-note">${esc(fixture.note)}</p>` : ''}
    </div>
  </article>`;
}

function cs2Schedule(edition) {
  const schedule = edition.cs2Schedule;
  if (!schedule) return '';
  const now = new Date();
  const isCurrent = dateLabel(edition.date) === chinaDate.format(now);
  const snapshot = Date.parse(schedule.asOf);
  const from = isCurrent ? Math.max(now.getTime(), snapshot) : snapshot;
  const upcoming = schedule.fixtures
    .filter(fixture => Date.parse(fixture.startAt) > from)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const falcons = upcoming.find(fixture => fixture.teams.some(team => /^(Team )?Falcons$/i.test(team)));
  const other = upcoming.filter(fixture => fixture !== falcons);
  const date = isCurrent ? '' : `<time datetime="${esc(schedule.asOf)}">${esc(matchDate.format(snapshot))} ${esc(chinaTime.format(snapshot))}</time> · `;
  return `<section class="cs2-block cs2-schedule">
    ${blockTitle(isCurrent ? '赛程' : '当期赛程', `<p>${date}北京时间</p>`)}
    ${falcons ? fixtureCard(falcons, edition.cs2Logos, true) : ''}
    ${other.length ? `<h3 class="cs2-schedule-label">${falcons ? '其他重点对阵' : '重点对阵'}</h3>
      ${other.map(fixture => fixtureCard(fixture, edition.cs2Logos)).join('')}`
      : `<p class="cs2-schedule-empty">暂无${falcons ? '其他' : ''}已确认的重点对阵。</p>`}
  </section>`;
}

function cs2Ranking(edition) {
  const ranking = edition.cs2Vrs;
  if (!ranking?.entries.length) return '';
  const day = matchDate.format(new Date(`${ranking.date}T12:00:00+08:00`));
  return `<section class="cs2-block cs2-vrs">
    ${blockTitle('VRS 世界排名', `<p><time datetime="${esc(ranking.date)}">${esc(day)}</time> · HLTV 估算</p>`)}
    <table class="cs2-vrs-table" aria-label="VRS 世界排名前十">
      <thead><tr><th scope="col">排名</th><th scope="col">战队</th><th scope="col">VRS 积分</th></tr></thead>
      <tbody>${ranking.entries.map(({rank, team, points}) => `<tr${team === 'Falcons' ? ' class="cs2-vrs-falcons"' : ''}>
        <td>${esc(rank)}</td>
        <th scope="row">${teamLabel(team, edition.cs2Logos)}</th>
        <td>${esc(points)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="cs2-vrs-source">${readLabel(ranking.url, 'HLTV 完整榜单')}</p>
  </section>`;
}

function readingGuide(closing) {
  const themes = closing?.themes || [];
  const links = (closing?.links || []).map(item => readLabel(item.url, item.label || '原文')).filter(Boolean);
  if (!themes.length && !links.length) return '';
  return `<aside class="reading-guide" aria-label="本期阅读指南">
    ${themes.length ? `<section><h2>本期脉络</h2><ol>${themes.map(theme => `<li>${esc(theme)}</li>`).join('')}</ol></section>` : ''}
    ${links.length ? `<section><h2>延伸阅读</h2><ol>${links.map(link => `<li>${link}</li>`).join('')}</ol></section>` : ''}
  </aside>`;
}

function homeSection(sections, section) {
  const href = datedPage({channel: section.id});
  const [first, ...rest] = section.home;
  return `<section class="desk">
    <header class="block-title desk-title">
      <h2>${esc(section.name)}</h2>
      <a class="section-link" href="${esc(href)}">查看全部 ${section.stories.length} 条 <span aria-hidden="true">›</span></a>
      ${channelTabs(sections, section, true)}
    </header>
    ${rest.length ? `<div class="desk-layout">${feature(first)}${storyList(rest, {imageLimit: 0})}</div>` : feature(first)}
  </section>`;
}

function renderHome(model) {
  const {edition, lead, top, sections, stories} = model;
  const mainSections = channelGroups.map(({id}) => sections.get(id));
  const available = mainSections.filter(section => section.home.length);
  const empty = mainSections.filter(section => !section.stories.length);
  const updated = new Date(edition.updatedAt);
  const imageSearchLimited = edition.imageSearchLimited ?? edition.overview?.includes('本次图片检索受限');
  app.innerHTML = `<h1 class="sr-only">每日新闻情报日报首页</h1>
    <div class="edition-line"><strong><time datetime="${esc(edition.date)}">${esc(dateLabel(edition.date))}</time></strong>
      <span>${stories.size} 条报道</span>
      ${Number.isNaN(updated.getTime()) ? '' : `<span>北京时间 ${esc(chinaTime.format(updated))} 更新</span>`}
      ${imageSearchLimited ? '<span>本次图片检索受限</span>' : ''}
      ${requestedDate ? '<a href="./">查看最新一期</a>' : ''}
    </div>
    <div class="front-grid">
      <section class="lead-panel">
        ${blockTitle('头条')}
        ${lead ? `<article class="lead">${photos(storyImages(lead), 'lead-image', true)}
          <div class="lead-text">${storyMeta(lead, sections.get(lead.desk)?.short)}${headline(lead)}
            <p class="teaser">${esc(teaser(lead, 120))}</p>
          </div>
          <a class="read-story" href="${esc(lead.href)}">查看报道 <span aria-hidden="true">›</span></a>
        </article>` : '<p class="empty-state">本期暂无头条。</p>'}
      </section>
      <section class="top-panel">${blockTitle('重点新闻')}
        ${top.length ? storyList(top, {className: 'top-list', limit: 63, imageLimit: 1}) : '<p class="empty-state">本期暂无重点新闻。</p>'}
      </section>
    </div>
    <div class="body-grid">
      ${available.length ? `<div class="desk-grid">${available.map(section => homeSection(sections, section)).join('')}</div>` : ''}
      ${empty.length ? `<p class="channel-empty-list">本期暂无收录：${empty.map(section => `<a href="${esc(datedPage({channel: section.id}))}">${esc(section.short)}</a>`).join('、')}</p>` : ''}
      ${readingGuide(edition.closing)}
    </div>`;
  renderNav('');
}

function renderChannel(model, section) {
  document.title = `${section.name} | 每日新闻情报日报`;
  const extras = section.id === 'cs2'
    ? cs2Schedule(model.edition) + cs2Ranking(model.edition)
    : '';
  const lead = extras ? section.stories[0] : null;
  const remaining = lead ? section.stories.slice(1) : section.stories;
  const empty = `<div class="empty-state"><p>本期这个频道暂无收录。</p><a href="${esc(pageURL({view: 'archive'}))}">浏览往期日报</a></div>`;
  const coverage = (lead ? feature(lead) : '') + (remaining.length ? storyList(remaining, {limit: 112}) : '');
  const news = `<div class="channel-news">
    ${extras ? blockTitle('频道报道') : ''}
    ${coverage || empty}
  </div>`;
  app.innerHTML = `<a class="back-link" href="${esc(datedPage())}"><span aria-hidden="true">‹ </span>本期首页</a>
    <header class="channel-header"><h1>${esc(section.name)}</h1>
      <p>${esc(section.note || dateLabel(model.edition.date))}${section.stories.length ? `　${section.stories.length} 条报道` : ''}</p>
    </header>
    ${channelTabs(model.sections, section)}
    ${extras ? `<div class="cs2-channel">${news}<aside class="cs2-rail" aria-label="赛程与 VRS 世界排名">${extras}</aside></div>` : news}`;
  renderNav(section.id);
}

function renderArticle(model, story) {
  document.title = `${story.title} | 每日新闻情报日报`;
  const section = model.sections.get(story.desk);
  const links = (story.sources || []).map(item => readLabel(item.url, item.label || '原文')).filter(Boolean);
  const images = storyImages(story, 2);
  const credits = [...new Set(images.map(image => image.credit).filter(Boolean))];
  const sources = links.length || credits.length ? `<footer class="article-sources" aria-label="报道来源"><h2>报道来源</h2>
    ${links.length ? `<ul class="source-list">${links.map(link => `<li>${link}</li>`).join('')}</ul>` : ''}
    ${credits.length ? `<p class="article-image-credit">图片署名 · ${esc(credits.join('、'))}</p>` : ''}
  </footer>` : '';
  const back = section ? datedPage({channel: section.id}) : datedPage();
  const body = story.paragraphs?.length ? story.paragraphs : [story.what || story.summary, story.why].filter(Boolean);
  const deck = story.paragraphs?.length && story.summary !== body[0] ? story.summary : '';
  const results = (section?.results || []).filter(match => match.storyId === story.id);
  app.innerHTML = `<article class="article">
    <a class="back-link" href="${esc(back)}"><span aria-hidden="true">‹ </span>${esc(section?.name || '本期首页')}</a>
    <h1>${esc(story.title)}</h1>
    ${deck ? `<p class="article-deck">${esc(deck)}</p>` : ''}
    <p class="article-byline"><time datetime="${esc(model.edition.date)}">${esc(dateLabel(model.edition.date))}收录</time>
      ${story.region ? `<span>${esc(story.region)}</span>` : ''}
      ${results.length ? '<a class="section-link" href="#match-results">比分与 Rating</a>' : ''}</p>
    ${photos(images, 'article-photo', true)}
    <div class="article-copy">${body.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</div>
    ${results.length ? `<div id="match-results" class="match-results">${results.map(match => matchPanel(match, model.edition.cs2Logos)).join('')}</div>` : ''}
    ${sources}
  </article>`;
  renderNav(story.desk);
}

function renderArchive(editions) {
  document.title = '往期日报 | 每日新闻情报日报';
  if (editions.length) setEditionDate(editions[0].date);
  app.innerHTML = `<a class="back-link" href="./"><span aria-hidden="true">‹ </span>最新一期</a>
    <header class="archive-header"><h1>往期日报</h1><p>按日期查阅已发布的报道。</p></header>
    ${editions.length ? `<ul class="archive-list">${editions.map(edition => `<li>
      <a href="${esc(pageURL({date: edition.date}))}"><time datetime="${esc(edition.date)}">${esc(dateLabel(edition.date))}</time>
      <strong>${esc(edition.title)}</strong><span>${edition.count} 条报道</span></a></li>`).join('')}</ul>` : '<p class="empty-state">暂无往期日报。</p>'}`;
  renderNav('', true);
}

function renderError(title, message, href = './', label = '返回最新一期') {
  app.innerHTML = `<header class="channel-header"><h1>${esc(title)}</h1></header>
    <div class="empty-state"><p>${esc(message)}</p><a href="${esc(href)}">${esc(label)}</a></div>`;
}

async function readJSON(name) {
  const response = await fetch(`./data/${name}.json`, {cache: 'no-store'});
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

async function start() {
  renderNav('');
  if (params.get('view') === 'archive') {
    renderArchive(await readJSON('editions'));
    return;
  }
  if (requestedDate && !datePattern.test(requestedDate)) {
    renderError('找不到这一期日报', '可以在往期日报中按日期查找。', './?view=archive', '浏览往期日报');
    return;
  }
  const edition = await readJSON(requestedDate || 'latest');
  setEditionDate(edition.date);
  renderUsage(edition.apiUsage);
  const model = organize(edition);
  const storyId = params.get('story');
  const sectionId = params.get('channel');
  if (storyId) {
    const story = model.stories.get(storyId);
    if (story) renderArticle(model, story);
    else renderError('找不到这条报道', '这条链接可能来自同一期的旧版本。', datedPage(), '返回本期首页');
  } else if (sectionId) {
    const section = model.sections.get(retiredChannels.has(sectionId) ? 'world' : sectionId);
    if (section) renderChannel(model, section);
    else renderError('找不到这个频道', '请从频道栏选择一个栏目。', datedPage(), '返回本期首页');
  } else {
    renderHome(model);
  }
}

app.addEventListener('error', event => {
  if (event.target.tagName !== 'IMG') return;
  if (event.target.classList.contains('cs2-team-logo')) event.target.remove();
  else event.target.closest('figure')?.remove();
}, true);
app.addEventListener('click', event => {
  const button = event.target.closest('button[data-match-tab]');
  if (!button || button.getAttribute('aria-pressed') === 'true') return;
  const panel = button.closest('.match-panel');
  for (const tab of panel.querySelectorAll('[data-match-tab]')) {
    tab.setAttribute('aria-pressed', String(tab === button));
  }
  for (const view of panel.querySelectorAll('[data-match-view]')) {
    view.hidden = view.dataset.matchView !== button.dataset.matchTab;
  }
});
start().catch(error => {
  if (requestedDate && error.message === '404') {
    renderError('找不到这一期日报', '这个日期没有已发布的日报。', './?view=archive', '浏览往期日报');
  } else {
    renderError('日报暂时无法加载', '请检查网络后重试。', location.href, '重新加载');
  }
});
