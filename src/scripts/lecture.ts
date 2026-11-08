import { parseFragment } from '../lib/time';
import { LecturePlayer, type TimeEvent } from './player';
import { ClaimList } from './claims';

const player = new LecturePlayer(document.getElementById('player')!);
const claims = new ClaimList(document);
const toCurrent = document.getElementById('to-current') as HTMLButtonElement;

// Адрес #t=… этого утверждения. replaceState, а не pushState: повторные клики не засоряют историю «Назад».
function setAddress(c: HTMLElement): string {
  history.replaceState(null, '', `#${c.id}`);
  return location.href;
}
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Старые браузеры и страницы без HTTPS: через временное поле.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
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
  // Тайм-код включает видео с этого места.
  c.querySelector('.tc')!.addEventListener('click', () => {
    setAddress(c);
    player.seek(Number(c.dataset.start));
  });
  // Цепочка только копирует ссылку и поднимает карточку наверх, видео не трогает.
  c.querySelector('.anchor')!.addEventListener('click', async (e) => {
    e.preventDefault();
    const url = setAddress(c);
    claims.reveal(c, 'smooth');
    showToast((await copyText(url)) ? 'Ссылка на это утверждение скопирована' : 'Адрес страницы теперь ведёт на это утверждение: скопируйте его');
  });
}

// Ссылка #t=…: открыть страницу на этом утверждении и поставить видео на этот момент.
// Первая прокрутка мгновенная: плавная в фоновой вкладке не срабатывает.
const initial = parseFragment(location.hash);
const initialClaim = initial === null ? null : claims.at(initial);
if (initialClaim) {
  claims.reveal(initialClaim, 'auto');
  // Браузер сам прокручивает к id из адреса после загрузки и прячет карточку под прилипшим плеером: повторяем с отступом.
  addEventListener('load', () => requestAnimationFrame(() => claims.reveal(initialClaim, 'auto')), { once: true });
}
// Автозапуск со звуком браузеры часто запрещают; тогда видео просто встанет на нужную секунду.
player.start(player.platform, initial ?? 0, initial !== null);

addEventListener('hashchange', () => {
  const t = parseFragment(location.hash);
  const c = t === null ? null : claims.at(t);
  if (!c || t === null) return;
  claims.reveal(c, 'smooth');
  player.seek(t);
});

// Подсветка утверждения, которое сейчас звучит.
let active: HTMLElement | null = null;
player.addEventListener('time', (e) => {
  const t = (e as TimeEvent).detail;
  const c = t === null ? null : claims.playingAt(t);
  if (c === active) return;
  active?.classList.remove('playing');
  active?.removeAttribute('aria-current');
  c?.classList.add('playing');
  c?.setAttribute('aria-current', 'true');
  active = c;
});
// Работает и на паузе: ведёт к месту, до которого дошло видео.
toCurrent.addEventListener('click', () => {
  const c = active ?? claims.at(player.position());
  if (c) claims.reveal(c, 'smooth');
});

// Телефон: видео можно свернуть в узкую полосу с кнопками, чтобы читать разбор.
const playerRoot = document.getElementById('player')!;
const mini = document.getElementById('mini-toggle')!;
mini.addEventListener('click', () => {
  const on = !playerRoot.classList.contains('mini');
  playerRoot.classList.toggle('mini', on);
  mini.setAttribute('aria-expanded', String(!on));
  mini.querySelector<HTMLElement>('.when-open')!.hidden = on;
  mini.querySelector<HTMLElement>('.when-mini')!.hidden = !on;
});
