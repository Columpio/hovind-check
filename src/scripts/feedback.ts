/**
 * «Замечание к этому месту»: выделенный текст открывает предзаполненную Google Форму.
 * Настройки формы приходят из data/feedback.yaml через data-атрибуты корневого элемента.
 */
const root = document.getElementById('feedback');
if (root) init(root);

const MAX_QUOTE = 1500;

function init(root: HTMLElement) {
  const formUrl = root.dataset.form!;
  const entries = JSON.parse(root.dataset.entries!) as { quote: string; link: string; page?: string };
  const button = root.querySelector<HTMLButtonElement>('.fb-float')!;
  const main = document.getElementById('content')!;

  function pageUrl(anchor?: string): string {
    const url = new URL(location.href);
    url.hash = anchor ? anchor : url.hash;
    return url.toString();
  }

  function formLink(quote: string, anchor?: string): string {
    const params = new URLSearchParams({ usp: 'pp_url' });
    if (quote) params.set(entries.quote, quote.slice(0, MAX_QUOTE));
    params.set(entries.link, pageUrl(anchor));
    if (entries.page) params.set(entries.page, document.title);
    return `${formUrl}?${params}`;
  }

  // Ссылки без цитаты: «Напишите нам» в футере и «Замечание к этому месту» в карточке (с якорем утверждения).
  document.querySelectorAll<HTMLAnchorElement>('[data-feedback-link]').forEach((a) => {
    a.addEventListener('click', () => (a.href = formLink('', a.dataset.feedbackAnchor)));
  });

  let current: { quote: string; anchor?: string } | null = null;

  function selectionInMain(): Selection | null {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!main.contains(range.commonAncestorContainer)) return null;
    if (button.contains(range.commonAncestorContainer)) return null;
    return sel.toString().trim() ? sel : null;
  }

  function hide() {
    button.hidden = true;
    current = null;
  }

  function show() {
    const sel = selectionInMain();
    if (!sel) return hide();
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node instanceof Element ? node : node.parentElement;
    const claim = el?.closest<HTMLElement>('.claim');
    current = { quote: sel.toString().trim(), anchor: claim ? `#${claim.id}` : undefined };

    // Под выделением: системное меню копирования на телефоне появляется над ним.
    const rects = range.getClientRects();
    const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
    button.hidden = false;
    const width = button.offsetWidth;
    const left = Math.min(Math.max(8, last.left + last.width / 2 - width / 2), innerWidth - width - 8);
    button.style.left = `${left + scrollX}px`;
    button.style.top = `${last.bottom + scrollY + 10}px`;
  }

  let timer = 0;
  document.addEventListener('selectionchange', () => {
    clearTimeout(timer);
    // Ждём, пока выделение «устоится», иначе кнопка прыгает за пальцем.
    timer = window.setTimeout(show, 250);
  });
  addEventListener('resize', () => current && show());

  button.addEventListener('mousedown', (e) => e.preventDefault()); // не сбрасывать выделение
  button.addEventListener('click', () => {
    if (!current) return;
    open(formLink(current.quote, current.anchor), '_blank', 'noopener');
    hide();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());

  // Для проверки в консоли: window.__feedbackUrl('цитата', '#t=1m02s')
  (window as unknown as { __feedbackUrl: typeof formLink }).__feedbackUrl = formLink;
}
