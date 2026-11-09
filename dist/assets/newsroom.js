'use strict';

const desks = [
  ['world', '全球', '全球重大新闻'],
  ['ai', 'AI', 'AI核心动态'],
  ['coding', 'Coding', 'AI Coding / Agent'],
  ['papers', '论文', '前沿论文 / 技术'],
  ['open', '开源', 'GitHub / 开源项目'],
  ['cs2', 'CS2', 'CS2专区'],
  ['japan', '日本', '日本动态'],
  ['economy', '经济产业', '经济 / 科技产业'],
  ['science', '科技科学', '其他值得知道的科技与科学'],
];
const deskByTitle = new Map(desks.map(desk => [desk[2], desk]));
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

function photo(story, style, count = 1, eager = false) {
  return (story.images || []).filter(image => httpsURL(image.url)).slice(0, count).map(image => {
    const caption = style !== 'thumbnail' && image.credit
      ? `<figcaption class="photo-credit">图片来源：${esc(image.credit)}</figcaption>` : '';
    const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
    return `<figure class="${style}"><img src="${esc(httpsURL(image.url))}" alt="${esc(style === 'thumbnail' ? '' : image.alt || '')}" ${loading} decoding="async">${caption}</figure>`;
  }).join('');
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
  const stories = new Map();
  function add(story, fallbackDesk) {
    if (!story?.title) return null;
    const id = storyKey(story);
    if (stories.has(id)) return null;
    const desk = deskByTitle.get(cleanTitle(story.channel || story.section))?.[0] || fallbackDesk;
    const record = {...story, id, desk, href: pageURL({date: edition.date, story: id})};
    stories.set(id, record);
    sections.get(desk)?.stories.push(record);
    return record;
  }
  const lead = add(edition.hero);
  const top = (edition.topStories || []).map(story => add(story)).filter(Boolean);
  for (const channel of edition.channels || []) {
    const desk = deskByTitle.get(cleanTitle(channel.title))?.[0];
    const section = sections.get(desk);
    if (section) section.note = channel.note;
    for (const story of channel.stories || []) {
      const record = add(story, desk);
      if (record) sections.get(record.desk)?.home.push(record);
    }
  }
  return {edition, lead, top, stories, sections};
}

function renderNav(active, archive = false) {
  nav.innerHTML = [['', '首页'], ...desks].map(([id, label]) => {
    const href = archive ? pageURL({channel: id}) : datedPage({channel: id});
    const current = !archive && active === id ? ' aria-current="page"' : '';
    return `<a href="${esc(href)}"${current}>${esc(label)}</a>`;
  }).join('');
  if (archive) archiveLink.setAttribute('aria-current', 'page');
  const current = nav.querySelector('[aria-current]');
  if (current && current.getBoundingClientRect().right > nav.getBoundingClientRect().right) {
    nav.scrollLeft += current.getBoundingClientRect().left - nav.getBoundingClientRect().left - 10;
  }
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

function compact(story, limit = 0) {
  const summary = limit ? teaser(story, limit) : '';
  return `<article class="compact-story"><div>${storyMeta(story)}${headline(story)}${summary ? `<p class="teaser">${esc(summary)}</p>` : ''}</div>${photo(story, 'thumbnail')}</article>`;
}

function feature(story) {
  return `<article class="feature-story">${photo(story, 'feature-image')}${storyMeta(story)}${headline(story)}<p class="teaser">${esc(teaser(story, 105))}</p></article>`;
}

function storyList(stories, className = 'story-list', limit = 0) {
  return `<ul class="${className}">${stories.map(story => `<li>${compact(story, limit)}</li>`).join('')}</ul>`;
}

function readingRail(closing) {
  const themes = closing?.themes || [];
  const links = (closing?.links || []).map(item => readLabel(item.url, item.label || '原文')).filter(Boolean);
  if (!themes.length && !links.length) return '';
  return `<aside class="reading-rail" aria-label="本期阅读指南">
    <h2>本期脉络</h2>
    ${themes.length ? `<ol>${themes.map(theme => `<li>${esc(theme)}</li>`).join('')}</ol>` : ''}
    ${links.length ? `<h3>延伸阅读</h3><ol>${links.map(link => `<li>${link}</li>`).join('')}</ol>` : ''}
  </aside>`;
}

function homeSection(section) {
  const href = datedPage({channel: section.id});
  const [first, ...rest] = section.id === 'world' ? section.home.slice(0, 4) : section.home;
  return `<section class="desk">${blockTitle(section.name, `<a class="section-link" href="${esc(href)}">查看全部 ${section.stories.length} 条 <span aria-hidden="true">›</span></a>`)}
    ${rest.length ? `<div class="desk-layout">${feature(first)}${storyList(rest)}</div>` : feature(first)}
  </section>`;
}

function renderHome(model) {
  const {edition, lead, top, sections, stories} = model;
  const available = [...sections.values()].filter(section => section.home.length);
  const empty = [...sections.values()].filter(section => !section.stories.length);
  const updated = new Date(edition.updatedAt);
  app.innerHTML = `<h1 class="sr-only">每日新闻情报日报首页</h1>
    <div class="edition-line"><strong><time datetime="${esc(edition.date)}">${esc(dateLabel(edition.date))}</time></strong>
      <span>${stories.size} 条报道</span>
      ${Number.isNaN(updated.getTime()) ? '' : `<span>北京时间 ${esc(chinaTime.format(updated))} 更新</span>`}
      ${requestedDate ? '<a href="./">查看最新一期</a>' : ''}
    </div>
    ${edition.overview ? `<p class="overview">${esc(edition.overview)}</p>` : ''}
    <div class="front-grid">
      <section class="lead-panel">
        ${blockTitle('头条')}
        ${lead ? `<article class="lead">${photo(lead, 'lead-image', 1, true)}
          <div class="lead-text">${storyMeta(lead, sections.get(lead.desk)?.short)}${headline(lead)}
          <p class="teaser">${esc(teaser(lead, 120))}</p><a class="read-story" href="${esc(lead.href)}">查看报道 <span aria-hidden="true">›</span></a></div></article>` : '<p class="empty-state">本期暂无头条。</p>'}
      </section>
      <section class="top-panel">${blockTitle('重点新闻')}
        ${top.length ? storyList(top, 'top-list', 63) : '<p class="empty-state">本期暂无重点新闻。</p>'}
      </section>
    </div>
    <div class="body-grid">
      <div>
        ${available.map(homeSection).join('')}
        ${empty.length ? `<p class="channel-empty-list">本期暂无收录：${empty.map(section => `<a href="${esc(datedPage({channel: section.id}))}">${esc(section.short)}</a>`).join('、')}</p>` : ''}
      </div>
      ${readingRail(edition.closing)}
    </div>`;
  renderNav('');
}

function renderChannel(model, section) {
  document.title = `${section.name} | 每日新闻情报日报`;
  app.innerHTML = `<a class="back-link" href="${esc(datedPage())}"><span aria-hidden="true">‹ </span>本期首页</a>
    <header class="channel-header"><h1>${esc(section.name)}</h1>
      <p>${esc(section.note || dateLabel(model.edition.date))}${section.stories.length ? `　${section.stories.length} 条报道` : ''}</p>
    </header>
    <div class="channel-news">
      ${section.stories.length ? storyList(section.stories, 'story-list', 112) : `<div class="empty-state"><p>本期这个频道暂无收录。</p><a href="${esc(pageURL({view: 'archive'}))}">浏览往期日报</a></div>`}
    </div>`;
  renderNav(section.id);
}

function renderArticle(model, story) {
  document.title = `${story.title} | 每日新闻情报日报`;
  const section = model.sections.get(story.desk);
  const related = (section?.stories || []).filter(item => item.id !== story.id).slice(0, 3);
  const links = (story.sources || []).map(item => readLabel(item.url, item.label || '原文')).filter(Boolean);
  const back = section ? datedPage({channel: section.id}) : datedPage();
  const body = story.paragraphs?.length ? story.paragraphs : [story.what || story.summary, story.why].filter(Boolean);
  const deck = story.paragraphs?.length && story.summary !== body[0] ? story.summary : '';
  app.innerHTML = `<article class="article">
    <a class="back-link" href="${esc(back)}"><span aria-hidden="true">‹ </span>${esc(section?.name || '本期首页')}</a>
    <h1>${esc(story.title)}</h1>
    ${deck ? `<p class="article-deck">${esc(deck)}</p>` : ''}
    <p class="article-byline"><time datetime="${esc(model.edition.date)}">${esc(dateLabel(model.edition.date))}收录</time>
      ${story.region ? `<span>${esc(story.region)}</span>` : ''}${story.sources?.[0]?.label ? `<span>${esc(story.sources[0].label)}</span>` : ''}</p>
    ${photo(story, 'article-photo', 2, true)}
    <div class="article-grid">
      <div class="article-copy">${body.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</div>
      ${links.length || related.length ? `<aside class="article-notes" aria-label="来源与延伸阅读">
        ${links.length ? `<section><h2>报道来源</h2><ul class="source-list">${links.map(link => `<li>${link}</li>`).join('')}</ul></section>` : ''}
        ${related.length ? `<section class="related"><h2>同频道报道</h2><ul class="related-list">${related.map(item => `<li><a href="${esc(item.href)}">${esc(item.title)}</a></li>`).join('')}</ul></section>` : ''}
      </aside>` : ''}
    </div>
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
    const section = model.sections.get(sectionId);
    if (section) renderChannel(model, section);
    else renderError('找不到这个频道', '请从频道栏选择一个栏目。', datedPage(), '返回本期首页');
  } else {
    renderHome(model);
  }
}

app.addEventListener('error', event => {
  if (event.target.tagName === 'IMG') event.target.closest('figure')?.remove();
}, true);
start().catch(error => {
  if (requestedDate && error.message === '404') {
    renderError('找不到这一期日报', '这个日期没有已发布的日报。', './?view=archive', '浏览往期日报');
  } else {
    renderError('日报暂时无法加载', '请检查网络后重试。', location.href, '重新加载');
  }
});
