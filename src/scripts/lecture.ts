import { parseFragment } from '../lib/time';
import { LecturePlayer, type TimeEvent } from './player';
import { ClaimList } from './claims';

const player = new LecturePlayer(document.getElementById('player')!);
const claims = new ClaimList(document);
const toCurrent = document.getElementById('to-current') as HTMLButtonElement;

// Тайм-код и якорь: перемотать видео и поставить адрес #t=… этого утверждения.
// replaceState, а не pushState: повторные клики не засоряют историю «Назад».
function goTo(c: HTMLElement, scroll: boolean) {
  history.replaceState(null, '', `#${c.id}`);
  if (scroll) claims.reveal(c, 'smooth');
  player.seek(Number(c.dataset.start));
}
// После клика по якорю объясняем, что произошло: на телефоне адресную строку часто не видно.
const toast = document.getElementById('toast')!;
let toastTimer = 0;
function showToast(text: string) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3500);
}
for (const c of claims.items) {
  c.querySelector('.tc')!.addEventListener('click', () => goTo(c, false));
  c.querySelector('.anchor')!.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(c, true);
    showToast('Адрес страницы теперь ведёт на это утверждение: скопируйте его, чтобы поделиться');
  });
}

// Ссылка #t=…: открыть страницу на этом утверждении и поставить видео на этот момент.
// Первая прокрутка мгновенная: плавная в фоновой вкладке не срабатывает.
const initial = parseFragment(location.hash);
const initialClaim = initial === null ? null : claims.at(initial);
if (initialClaim) claims.reveal(initialClaim, 'auto');
// Автозапуск со звуком браузеры часто запрещают; тогда видео просто встанет на нужную секунду.
player.start(player.platform, initial ?? 0, initial !== null);

addEventListener('hashchange', () => {
  const t = parseFragment(location.hash);
  const c = t === null ? null : claims.at(t);
  if (!c || t === null) return;
  claims.reveal(c, 'smooth');
  player.seek(t);
});

// Подсветка утверждения, которое сейчас звучит; «Сейчас звучит» доступна, только пока видео играет.
let active: HTMLElement | null = null;
player.addEventListener('time', (e) => {
  const t = (e as TimeEvent).detail;
  toCurrent.disabled = t === null;
  const c = t === null ? null : claims.playingAt(t);
  if (c === active) return;
  active?.classList.remove('playing');
  active?.removeAttribute('aria-current');
  c?.classList.add('playing');
  c?.setAttribute('aria-current', 'true');
  active = c;
});
toCurrent.addEventListener('click', () => {
  const t = player.current();
  const c = active ?? (t === null ? null : claims.at(t));
  if (c) claims.reveal(c, 'smooth');
});

// Телефон: видео можно свернуть в узкую полосу с кнопками, чтобы читать разбор.
const playerRoot = document.getElementById('player')!;
const mini = document.getElementById('mini-toggle')!;
mini.addEventListener('click', () => {
  const on = !playerRoot.classList.contains('mini');
  playerRoot.classList.toggle('mini', on);
  mini.setAttribute('aria-pressed', String(on));
  mini.querySelector<HTMLElement>('.when-open')!.hidden = on;
  mini.querySelector<HTMLElement>('.when-mini')!.hidden = !on;
});
