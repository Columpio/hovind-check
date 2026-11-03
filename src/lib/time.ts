// Чистые функции без node:fs: их используют и сборка, и скрипты в браузере.

export interface OffsetStep {
  from: number;
  offset: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 754.6 → «12:34», 3723 → «1:02:03». */
export function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** Фрагмент ссылки: 754.6 → «12m34s», 3723 → «1h02m03s». */
export function timeFragment(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${pad(m)}m${pad(s % 60)}s` : `${m}m${pad(s % 60)}s`;
}

/** «#t=12m34s» | «#t=1h02m03s» | «#t=754» → секунды; иначе null. */
export function parseFragment(hash: string): number | null {
  const m = hash.match(/^#t=(.+)$/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const p = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!p || !(p[1] || p[2] || p[3])) return null;
  return Number(p[1] ?? 0) * 3600 + Number(p[2] ?? 0) * 60 + Number(p[3] ?? 0);
}

/**
 * Какое утверждение открыть по времени t. Фрагмент ссылки округляет начало вниз до секунды,
 * поэтому сначала ищем утверждение, начинающееся в ту же секунду; иначе — последнее начавшееся
 * к моменту t (в паузе между утверждениями это то, что только что прозвучало).
 */
export function claimIndexAt(starts: readonly number[], t: number): number {
  if (starts.length === 0) return -1;
  const sec = Math.floor(t);
  const exact = starts.findIndex((s) => Math.floor(s) === sec);
  if (exact >= 0) return exact;
  let found = 0;
  starts.forEach((s, i) => {
    if (s <= t) found = i;
  });
  return found;
}

/** Время лекции → время на площадке: действует последняя ступень с from ≤ t. */
export function toPlatform(steps: readonly OffsetStep[], t: number): number {
  let off = 0;
  for (const s of steps) if (s.from <= t) off = s.offset;
  return Math.max(0, t + off);
}

/**
 * Время на площадке → время лекции. Ступень i покрывает на площадке отрезок
 * [from_i + off_i, from_{i+1} + off_i). Если в копии что-то вырезано, соседние отрезки перекрываются и одному
 * моменту площадки соответствуют два момента лекции; тогда берём ближайший к предыдущему
 * известному времени (hint): при просмотре время меняется непрерывно.
 */
export function fromPlatform(steps: readonly OffsetStep[], t: number, hint?: number): number {
  if (steps.length === 0) return t;
  const candidates: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    const begin = i === 0 ? -Infinity : steps[i].from + steps[i].offset;
    const end = i + 1 < steps.length ? steps[i + 1].from + steps[i].offset : Infinity;
    if (t >= begin && t < end) candidates.push(Math.max(0, t - steps[i].offset));
  }
  if (candidates.length === 0) {
    // Между участками (в копии что-то добавлено): начало следующего участка.
    return (steps.find((s) => s.from + s.offset > t) ?? steps[steps.length - 1]).from;
  }
  if (hint === undefined) return candidates[0];
  return candidates.reduce((a, b) => (Math.abs(b - hint) < Math.abs(a - hint) ? b : a));
}

/** 1 раз, 2 раза, 5 раз. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}
