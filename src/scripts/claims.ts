import { claimIndexAt } from '../lib/time';

/** Список утверждений на странице лекции: раскрытие, фильтр по оценкам, поиск по времени. */
export class ClaimList {
  readonly items: HTMLElement[];
  private readonly starts: number[];
  private readonly filters: HTMLButtonElement[];
  private readonly emptyNote: HTMLElement | null;

  constructor(root: ParentNode) {
    this.items = Array.from(root.querySelectorAll<HTMLElement>('.claim'));
    this.starts = this.items.map((c) => Number(c.dataset.start));
    this.filters = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-filter]'));
    this.emptyNote = root.querySelector('#empty-filter');

    for (const c of this.items) {
      c.querySelector<HTMLButtonElement>('.claim-cut')?.addEventListener('click', () => this.setOpen(c, !this.isOpen(c)));
    }
    for (const b of this.filters) {
      b.addEventListener('click', () => this.setFilter(b.dataset.filter!, b.getAttribute('aria-pressed') !== 'true'));
    }
    root.querySelector('#expand-all')?.addEventListener('click', () => this.setAll(true));
    root.querySelector('#collapse-all')?.addEventListener('click', () => this.setAll(false));
  }

  at(t: number): HTMLElement | null {
    return this.items[claimIndexAt(this.starts, t)] ?? null;
  }

  /** Утверждение, внутри которого находится t (для подсветки звучащего). */
  playingAt(t: number): HTMLElement | null {
    const c = this.at(t);
    return c && t >= Number(c.dataset.start) && t < Number(c.dataset.end) ? c : null;
  }

  /** Цитата и вердикт видны всегда; раскрывается только «Подробнее» со вставками. */
  isOpen(c: HTMLElement): boolean {
    const more = c.querySelector<HTMLElement>('.more');
    return Boolean(more && !more.hidden);
  }

  setOpen(c: HTMLElement, open: boolean): void {
    const more = c.querySelector<HTMLElement>('.more');
    if (!more) return;
    more.hidden = !open;
    c.querySelector<HTMLButtonElement>('.claim-cut')!.setAttribute('aria-expanded', String(open));
  }

  private setAll(open: boolean): void {
    for (const c of this.items) {
      this.setOpen(c, open);
      c.querySelectorAll<HTMLDetailsElement>('details.inset').forEach((d) => (d.open = open));
    }
  }

  setFilter(rating: string, on: boolean): void {
    this.filters.find((f) => f.dataset.filter === rating)?.setAttribute('aria-pressed', String(on));
    for (const c of this.items) if (c.dataset.rating === rating) c.hidden = !on;
    if (this.emptyNote) this.emptyNote.hidden = this.items.some((c) => !c.hidden);
  }

  /** Показать утверждение: снять с него фильтр, раскрыть и прокрутить к нему. */
  reveal(c: HTMLElement, behavior: ScrollBehavior): void {
    if (c.hidden) this.setFilter(c.dataset.rating!, true);
    // На телефоне сверху прилипает видео: отступаем на его высоту, иначе карточка спрячется под ним.
    const player = document.getElementById('player')!;
    const header = document.querySelector<HTMLElement>('header.site')!;
    const offset =
      getComputedStyle(player).position === 'sticky'
        ? player.offsetHeight + 8
        : getComputedStyle(header).position === 'sticky' ? header.offsetHeight + 16 : 16;
    scrollTo({ top: c.getBoundingClientRect().top + scrollY - offset, behavior });
  }
}
