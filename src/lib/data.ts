import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { marked } from 'marked';
import { timeFragment, type OffsetStep } from './time';

export { formatTime, timeFragment } from './time';

const DATA = path.join(process.cwd(), 'data');

export type Rating = 'green' | 'neutral' | 'orange' | 'red' | 'purple';
export type CatalogKind = 'arguments' | 'rhetoric';

/** Порядок ключей — порядок в легенде: сначала важное. */
export const RATINGS: Record<Rating, { label: string; hint: string }> = {
  red: { label: 'Неверно', hint: 'не совпадает с проверяемыми фактами' },
  orange: { label: 'Полуправда', hint: 'отчасти правда, но вывод из неё неверный' },
  purple: { label: 'Богословский вопрос', hint: 'спорная трактовка, возможны разные позиции' },
  green: { label: 'Верно', hint: 'утверждение подтверждается' },
  neutral: { label: 'Нейтрально', hint: 'рассказ, шутка, переход; на довод не влияет' },
};
export const RATING_ORDER = Object.keys(RATINGS) as Rating[];

export interface Platform {
  id: string | null;
  channel?: string;
  offset?: number;
  /** Кусочное смещение: действует последний пункт с from <= время лекции. */
  offsets?: OffsetStep[];
}
export interface Lecture {
  slug: string;
  number: number;
  title: string;
  kind?: 'film';
  author: string;
  source: string;
  voiceover: string;
  rights: string;
  youtube: Platform;
  rutube: Platform;
  draft?: boolean;
  /** Короткое пояснение под заголовком страницы лекции. */
  note?: string;
}
export interface Claim {
  id: string;
  start: number;
  end: number;
  text: string;
  rating: Rating;
  verdict: string;
  arguments?: string[];
  rhetoric?: string[];
}
export interface Article {
  slug: string;
  title: string;
  summary: string;
  html: string;
  /** Фрагменты видео нашего канала, где разбирается эта тема. */
  videos: ChannelVideo[];
  /** Метка есть в словаре, но статьи ещё нет: показываем суть и места, текст «готовится». */
  pending: boolean;
  group?: TagGroup;
}
export interface ChannelVideo {
  /** YouTube id. */
  id: string;
  /** Секунда начала фрагмента. */
  t: number;
  title: string;
  note?: string;
}
/** Тематическая группа в каталоге: такие доводы идут отдельным блоком внизу. */
export type TagGroup = 'politics';
interface Tag { slug: string; title: string; summary: string; group?: TagGroup; }
export interface Occurrence {
  lecture: Lecture;
  claim: Claim;
}

// Во время сборки одни и те же файлы нужны каждой странице: читаем их один раз.
// В режиме разработки не кэшируем, чтобы правки данных были видны сразу.
const cache = new Map<string, unknown>();
function memo<T>(key: string, load: () => T): T {
  if (import.meta.env.DEV) return load();
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key) as T;
}

const readYaml = <T>(file: string): T => YAML.parse(fs.readFileSync(file, 'utf8')) as T;

export interface Feedback {
  formUrl: string;
  entries: { quote: string; link: string; page?: string };
}

/** Предзаполненная Google Форма для замечаний; null, пока форма не настроена. */
export function getFeedback(): Feedback | null {
  return memo('feedback', () => {
    const file = path.join(DATA, 'feedback.yaml');
    if (!fs.existsSync(file)) return null;
    const cfg = readYaml<{ formId: string; entries: Feedback['entries'] }>(file);
    if (!cfg?.formId || cfg.formId === 'TODO') return null;
    return { formUrl: `https://docs.google.com/forms/d/e/${cfg.formId}/viewform`, entries: cfg.entries };
  });
}

export function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

export function getLectures(): Lecture[] {
  return memo('lectures', () =>
    readYaml<Lecture[]>(path.join(DATA, 'lectures', 'lectures.yaml')).sort((a, b) => a.number - b.number),
  );
}

/** Ступени смещения для плеера: одно число превращается в одну ступеньку. */
export function offsetSteps(p: Platform | undefined): OffsetStep[] {
  if (p?.offsets?.length) return [...p.offsets].sort((a, b) => a.from - b.from);
  return [{ from: 0, offset: p?.offset ?? 0 }];
}

/** Заголовок для показа: у фильма нет номера лекции. */
export function lectureLabel(l: Lecture): string {
  return l.kind === 'film' ? `Фильм ${l.title}` : `Лекция ${l.number}. ${l.title}`;
}

/** Ошибки разметки останавливают сборку: опечатка не должна превратиться в битую ссылку на сайте. */
function checkClaims(slug: string, claims: Claim[]): void {
  const known: Record<CatalogKind, Set<string>> = {
    arguments: new Set(getTags('arguments').map((t) => t.slug)),
    rhetoric: new Set(getTags('rhetoric').map((t) => t.slug)),
  };
  const ids = new Set<string>();
  const fragments = new Map<string, string>();
  let previous: Claim | undefined;
  for (const c of claims) {
    const where = `data/lectures/${slug}/claims.yaml, утверждение ${c.id}`;
    if (!c.id) throw new Error(`${where}: нет id`);
    if (ids.has(c.id)) throw new Error(`${where}: id повторяется`);
    ids.add(c.id);
    if (!(c.rating in RATINGS)) throw new Error(`${where}: неизвестная оценка «${c.rating}»`);
    if (!(c.start < c.end)) throw new Error(`${where}: start должен быть меньше end`);
    // «Почему так» состоит только из вставок статей: свой текст пишем в статью довода или приёма.
    if ('details' in c) throw new Error(`${where}: поле details больше не используется; перенесите текст в статью довода или приёма`);
    if ((c.arguments?.length ?? 0) > 1) throw new Error(`${where}: больше одного повторяющегося довода; оставьте один`);
    const needsArticle = c.rating === 'red' || c.rating === 'orange' || c.rating === 'purple';
    if (needsArticle && !c.arguments?.length && !c.rhetoric?.length) {
      throw new Error(`${where}: у оценки «${c.rating}» нужен довод или приём, иначе в «Почему так» нечего показать`);
    }
    const frag = timeFragment(c.start);
    const twin = fragments.get(frag);
    if (twin) throw new Error(`${where}: начинается в ту же секунду, что и ${twin}; ссылка #t=${frag} была бы неоднозначной`);
    fragments.set(frag, c.id);
    if (c.rating === 'neutral' && previous?.rating === 'neutral') {
      throw new Error(`${where}: идёт сразу после нейтрального ${previous.id}; объедините их в одно утверждение`);
    }
    previous = c;
    for (const kind of ['arguments', 'rhetoric'] as const) {
      for (const tag of c[kind] ?? []) {
        if (!known[kind].has(tag)) throw new Error(`${where}: метки «${tag}» нет в data/tags.yaml (${kind})`);
      }
    }
  }
}

export function getClaims(slug: string): Claim[] {
  return memo(`claims:${slug}`, () => {
    const file = path.join(DATA, 'lectures', slug, 'claims.yaml');
    if (!fs.existsSync(file)) return [];
    const claims = (readYaml<Claim[]>(file) ?? []).sort((a, b) => a.start - b.start);
    checkClaims(slug, claims);
    return claims;
  });
}

/** Словарь меток: каждая метка в разметке должна быть здесь. Статья к метке необязательна. */
function getTags(kind: CatalogKind): Tag[] {
  return memo(`tags:${kind}`, () => readYaml<Record<CatalogKind, Tag[]>>(path.join(DATA, 'tags.yaml'))[kind] ?? []);
}

function parseArticle(file: string): Omit<Article, 'pending'> {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`Нет frontmatter: ${file}`);
  const meta = YAML.parse(m[1]) as { title: string; summary: string; videos?: ChannelVideo[] };
  const videos = meta.videos ?? [];
  for (const v of videos) {
    if (!/^[\w-]{11}$/.test(String(v.id)) || typeof v.t !== 'number' || v.t < 0 || !v.title) {
      throw new Error(`${file}: в videos нужны id (11 символов YouTube), t (секунды ≥ 0) и title: ${JSON.stringify(v)}`);
    }
  }
  return {
    slug: path.basename(file, '.md'),
    title: meta.title,
    summary: meta.summary,
    html: md(m[2]),
    videos,
  };
}

/** Все метки словаря; у кого есть статья, берём её заголовок, суть и текст. */
function getArticles(kind: CatalogKind): Article[] {
  return memo(`articles:${kind}`, () => {
    const dir = path.join(DATA, kind);
    const written = new Map(
      (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
        .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
        .map((f) => parseArticle(path.join(dir, f)))
        .map((a) => [a.slug, a]),
    );
    const tags = getTags(kind);
    for (const slug of written.keys()) {
      if (!tags.some((t) => t.slug === slug)) throw new Error(`Статья data/${kind}/${slug}.md: метки «${slug}» нет в data/tags.yaml`);
    }
    return tags.map((t) => {
      const a = written.get(t.slug);
      return a ? { ...a, group: t.group, pending: false } : { ...t, html: '', videos: [], pending: true };
    });
  });
}

export const getArguments = () => getArticles('arguments');
export const getRhetoric = () => getArticles('rhetoric');

export function getArticle(kind: CatalogKind, slug: string): Article {
  const a = getArticles(kind).find((x) => x.slug === slug);
  if (!a) throw new Error(`Метки «${slug}» нет в data/tags.yaml (${kind})`);
  return a;
}

export function occurrences(kind: CatalogKind, slug: string): Occurrence[] {
  const result: Occurrence[] = [];
  for (const lecture of getLectures()) {
    for (const claim of getClaims(lecture.slug)) {
      if ((claim[kind] ?? []).includes(slug)) result.push({ lecture, claim });
    }
  }
  return result;
}

/** Метки, которые встречаются в разметке или уже имеют статью, по убыванию частоты. */
export function withFrequency(kind: CatalogKind) {
  return getArticles(kind)
    .map((a) => ({ article: a, count: occurrences(kind, a.slug).length }))
    .filter(({ article, count }) => count > 0 || !article.pending)
    .sort((x, y) => y.count - x.count || x.article.title.localeCompare(y.article.title, 'ru'));
}

/** Связь довод↔приём: сколько раз встречаются в одних и тех же утверждениях. */
export function related(kind: CatalogKind, slug: string): { article: Article; count: number }[] {
  const otherKind: CatalogKind = kind === 'arguments' ? 'rhetoric' : 'arguments';
  const counts = new Map<string, number>();
  for (const { claim } of occurrences(kind, slug)) {
    for (const s of claim[otherKind] ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts]
    .map(([s, count]) => ({ article: getArticle(otherKind, s), count }))
    .sort((x, y) => y.count - x.count);
}

export interface ArticleRef { kind: CatalogKind; article: Article; }
const refKey = (kind: CatalogKind, slug: string) => `${kind}/${slug}`;

/** Какие статьи каталога упомянуты ссылкой в тексте статьи: ключ «kind/slug» → множество ключей. */
function textLinks(): Map<string, Set<string>> {
  return memo('textLinks', () => {
    const links = new Map<string, Set<string>>();
    for (const kind of ['arguments', 'rhetoric'] as CatalogKind[]) {
      for (const a of getArticles(kind)) {
        const self = refKey(kind, a.slug);
        const out = new Set<string>();
        for (const m of a.html.matchAll(/href="[^"]*\/(arguments|rhetoric)\/([a-z0-9-]+)\/?["#]/g)) {
          const key = refKey(m[1] as CatalogKind, m[2]);
          if (key !== self && getArticles(m[1] as CatalogKind).some((x) => x.slug === m[2])) out.add(key);
        }
        links.set(self, out);
      }
    }
    return links;
  });
}

/** Статьи (любого каталога), в тексте которых есть ссылка на эту. */
export function backlinks(kind: CatalogKind, slug: string, limit = 6): ArticleRef[] {
  const target = refKey(kind, slug);
  const result: ArticleRef[] = [];
  for (const [key, out] of textLinks()) {
    if (!out.has(target)) continue;
    const [k, s] = key.split('/') as [CatalogKind, string];
    result.push({ kind: k, article: getArticle(k, s) });
  }
  return result.sort((x, y) => x.article.title.localeCompare(y.article.title, 'ru')).slice(0, limit);
}

/** Соседство в лекциях: метки одного каталога в том же или в соседних (±2) утверждениях. */
const NEAR = 2;
function proximity(kind: CatalogKind): Map<string, Map<string, number>> {
  return memo(`proximity:${kind}`, () => {
    const score = new Map<string, Map<string, number>>();
    const add = (a: string, b: string) => {
      if (a === b) return;
      const row = score.get(a) ?? new Map<string, number>();
      row.set(b, (row.get(b) ?? 0) + 1);
      score.set(a, row);
    };
    for (const lecture of getLectures()) {
      const claims = getClaims(lecture.slug);
      claims.forEach((claim, i) => {
        const near = new Set<string>();
        for (let j = Math.max(0, i - NEAR); j <= Math.min(claims.length - 1, i + NEAR); j++) {
          for (const s of claims[j][kind] ?? []) near.add(s);
        }
        for (const a of claim[kind] ?? []) for (const b of near) add(a, b);
      });
    }
    return score;
  });
}

/** Похожие статьи того же каталога: соседство в лекциях плюс ссылки из текста этой статьи. */
const TEXT_LINK_WEIGHT = 3;
export function similar(kind: CatalogKind, slug: string, limit = 6): Article[] {
  const score = new Map(proximity(kind).get(slug) ?? []);
  for (const key of textLinks().get(refKey(kind, slug)) ?? []) {
    const [k, s] = key.split('/');
    if (k === kind) score.set(s, (score.get(s) ?? 0) + TEXT_LINK_WEIGHT);
  }
  return [...score]
    .map(([s, n]) => ({ article: getArticle(kind, s), n }))
    .sort((x, y) => y.n - x.n || x.article.title.localeCompare(y.article.title, 'ru'))
    .slice(0, limit)
    .map((x) => x.article);
}
