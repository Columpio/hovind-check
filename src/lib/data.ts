import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { marked } from 'marked';

const DATA = path.join(process.cwd(), 'data');

export type Rating = 'green' | 'neutral' | 'orange' | 'red' | 'purple';

/** Порядок ключей — порядок в легенде: сначала важное. */
export const RATINGS: Record<Rating, { label: string; hint: string }> = {
  red: { label: 'Неверно', hint: 'противоречит фактам или науке' },
  orange: { label: 'Полуправда', hint: 'формально верно, но подано так, чтобы ввести в заблуждение' },
  purple: { label: 'Богословский вопрос', hint: 'спорная трактовка, возможны разные позиции' },
  green: { label: 'Верно', hint: 'утверждение подтверждается' },
  neutral: { label: 'Нейтрально', hint: 'рассказ, шутка, переход; на довод не влияет' },
};

export interface OffsetStep {
  from: number;
  offset: number;
}
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
  kind?: 'lecture' | 'film';
  author: string;
  source: string;
  voiceover: string;
  rights: string;
  youtube: Platform;
  rutube: Platform;
  draft?: boolean;
}
export interface Claim {
  id: string;
  start: number;
  end: number;
  text: string;
  rating: Rating;
  verdict: string;
  details?: string;
  arguments?: string[];
  rhetoric?: string[];
}
export interface Article {
  slug: string;
  title: string;
  summary: string;
  html: string;
}
export interface Occurrence {
  lecture: Lecture;
  claim: Claim;
}

const readYaml = <T>(file: string): T => YAML.parse(fs.readFileSync(file, 'utf8')) as T;

export function md(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

export function getLectures(): Lecture[] {
  return readYaml<Lecture[]>(path.join(DATA, 'lectures', 'lectures.yaml')).sort(
    (a, b) => a.number - b.number,
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

export function getClaims(slug: string): Claim[] {
  const file = path.join(DATA, 'lectures', slug, 'claims.yaml');
  if (!fs.existsSync(file)) return [];
  return (readYaml<Claim[]>(file) ?? []).sort((a, b) => a.start - b.start);
}

function parseArticle(file: string): Article {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`Нет frontmatter: ${file}`);
  const meta = YAML.parse(m[1]) as { title: string; summary: string };
  return {
    slug: path.basename(file, '.md'),
    title: meta.title,
    summary: meta.summary,
    html: md(m[2]),
  };
}

function getArticles(dir: string): Article[] {
  const full = path.join(DATA, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .map((f) => parseArticle(path.join(full, f)));
}

export const getArguments = () => getArticles('arguments');
export const getRhetoric = () => getArticles('rhetoric');

export function occurrences(kind: 'arguments' | 'rhetoric', slug: string): Occurrence[] {
  const result: Occurrence[] = [];
  for (const lecture of getLectures()) {
    for (const claim of getClaims(lecture.slug)) {
      if ((claim[kind] ?? []).includes(slug)) result.push({ lecture, claim });
    }
  }
  return result;
}

/** Статьи с частотой употребления, по убыванию частоты. */
export function withFrequency(kind: 'arguments' | 'rhetoric') {
  const articles = kind === 'arguments' ? getArguments() : getRhetoric();
  return articles
    .map((a) => ({ article: a, count: occurrences(kind, a.slug).length }))
    .sort((x, y) => y.count - x.count || x.article.title.localeCompare(y.article.title, 'ru'));
}

/** Связь довод↔приём: сколько раз встречаются в одних и тех же утверждениях. */
export function related(kind: 'arguments' | 'rhetoric', slug: string): { article: Article; count: number }[] {
  const otherKind = kind === 'arguments' ? 'rhetoric' : 'arguments';
  const others = otherKind === 'arguments' ? getArguments() : getRhetoric();
  const counts = new Map<string, number>();
  for (const { claim } of occurrences(kind, slug)) {
    for (const s of claim[otherKind] ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return others
    .filter((a) => counts.has(a.slug))
    .map((a) => ({ article: a, count: counts.get(a.slug)! }))
    .sort((x, y) => y.count - x.count);
}

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Фрагмент ссылки: 12m34s / 1h02m03s. */
export function timeFragment(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s` : `${m}m${String(s).padStart(2, '0')}s`;
}
