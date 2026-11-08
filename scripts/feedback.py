"""Замечания читателей из Google Формы: забрать новые, разложить в HTML для владельца, применить его ответы.

  python scripts/feedback.py pull [--check]         # забрать новые ответы формы (только свежие), обновить inbox.html
  python scripts/feedback.py pull --csv FILE.csv    # то же из выгрузки таблицы, без API
  python scripts/feedback.py pending [--json]       # замечания, к которым агент ещё не предложил варианты
  python scripts/feedback.py fill FILE.json         # записать варианты агента в inbox.html (формат — в SKILL.md)
  python scripts/feedback.py answers [--json]       # ответы владельца: что применить, что обсудить
  python scripts/feedback.py mark KEY STATUS "ответ"   # done | rejected | duplicate | question | new
  python scripts/feedback.py push                   # записать статусы в таблицу (столбцы «Статус (агент)», «Ответ агента»)
  python scripts/feedback.py list [--all]           # журнал текстом

pull --check: выход с кодом 1, если замечаний без вариантов нет (предпроверка еженедельной автоматизации).

Журнал: resources/feedback/state.json (не в git: там почты читателей). Страница для владельца:
feedback-inbox/inbox.html (не в git), её ответы — feedback-inbox/answers.json. Оболочка страницы:
scripts/feedback-inbox.html. Доступ к таблице: resources/secrets/feedback-api.json {"url", "token"} —
веб-приложение Apps Script (resources/feedback/apps-script.gs). Друзья владельца: resources/feedback/friends.txt.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
FEEDBACK = ROOT / 'resources' / 'feedback'
STATE = FEEDBACK / 'state.json'
FRIENDS = FEEDBACK / 'friends.txt'
API = ROOT / 'resources' / 'secrets' / 'feedback-api.json'
DATA = ROOT / 'data'
INBOX_DIR = ROOT / 'feedback-inbox'
INBOX = INBOX_DIR / 'inbox.html'
ANSWERS = INBOX_DIR / 'answers.json'
SHELL = ROOT / 'scripts' / 'feedback-inbox.html'
SITE = 'https://columpio.github.io/hovind-check/'
STATUSES = ('new', 'done', 'rejected', 'question', 'duplicate')
OPEN = ('new', 'question')  # такие замечания видны в inbox.html
RATINGS = {'red': '🔴 неверно', 'orange': '🟠 полуправда', 'purple': '🟣 богословский вопрос',
           'green': '🟢 верно', 'neutral': '⚪ нейтрально'}

# Столбцы таблицы ответов узнаём по началу заголовка: вопросы формы можно переименовать.
FIELDS = {
    'timestamp': ('отметка времени', 'timestamp'),
    'email': ('адрес электронной почты', 'электронная почта', 'email'),
    'quote': ('цитата',),
    'link': ('ссылка',),
    'comment': ('ваше замечание', 'замечание'),
    'source': ('ваш источник', 'источник'),
    'status': ('статус (агент)',),
}


def field_of(header: str) -> str | None:
    h = header.strip().lower()
    for name, prefixes in FIELDS.items():
        if any(h.startswith(p) for p in prefixes):
            return name
    return None


def normalize(row: int | None, values: dict[str, str], ts: str | None = None) -> dict:
    item: dict = {'row': row}
    if ts:
        item['ts'] = ts
    for header, value in values.items():
        name = field_of(header)
        if name and name not in item:
            item[name] = (value or '').strip()
    return item


def key_of(item: dict) -> str:
    raw = f"{item.get('timestamp', '')}|{item.get('email', '')}|{item.get('comment', '')}"
    return hashlib.sha1(raw.encode()).hexdigest()[:10]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def load_state() -> dict:
    state = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {}
    state.setdefault('lastPull', None)
    state.setdefault('since', None)
    state.setdefault('items', {})
    state.setdefault('nextNum', 1)
    for it in state['items'].values():
        if 'num' not in it:
            it['num'] = state['nextNum']
            state['nextNum'] += 1
    return state


def save_state(state: dict) -> None:
    FEEDBACK.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def api_config() -> dict:
    if not API.exists():
        sys.exit(f'Нет {API.relative_to(ROOT)}: настройте веб-приложение (resources/feedback/apps-script.gs) или используйте --csv.')
    cfg = json.loads(API.read_text(encoding='utf-8'))
    if not cfg.get('url', '').startswith('https://'):
        sys.exit(f'В {API.relative_to(ROOT)} не указан url веб-приложения.')
    return cfg


def fetch_rows(since: str | None) -> list[dict]:
    """Строки таблицы. С since — только новые: так их отдаёт свежая версия apps-script.gs;
    старая версия отдаёт всё, и тогда отсеиваем здесь же по ts, а без ts — по ключу в журнале."""
    cfg = api_config()
    query = {'token': cfg['token']}
    if since:
        query['since'] = since
    with urllib.request.urlopen(f"{cfg['url']}?{urllib.parse.urlencode(query)}", timeout=60) as r:
        data = json.loads(r.read().decode('utf-8'))
    if 'error' in data:
        sys.exit(f"Таблица ответила: {data['error']}")
    rows = [normalize(r['row'], r['values'], r.get('ts')) for r in data['rows']]
    return [r for r in rows if not (since and r.get('ts') and r['ts'] < since)]


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding='utf-8-sig', newline='') as f:
        return [normalize(i + 2, row) for i, row in enumerate(csv.DictReader(f))]


# --- привязка ссылки к утверждению или статье ---

def claims_of(slug: str) -> list[dict]:
    file = DATA / 'lectures' / slug / 'claims.yaml'
    return yaml.safe_load(file.read_text(encoding='utf-8')) if file.exists() else []


def seconds(fragment: str) -> int | None:
    m = re.fullmatch(r't=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?', fragment)
    if m and any(m.groups()):
        h, mi, s = (int(g or 0) for g in m.groups())
        return h * 3600 + mi * 60 + s
    m = re.fullmatch(r't=(\d+(?:\.\d+)?)', fragment)
    return int(float(m.group(1))) if m else None


def squash(s: str) -> str:
    return re.sub(r'\W+', ' ', s.lower()).strip()


def locate(item: dict) -> dict:
    """Куда относится замечание: файл и, для лекции, id утверждения."""
    link = urllib.parse.urlparse(item.get('link', ''))
    parts = [p for p in link.path.split('/') if p]
    if 'hovind-check' in parts:
        parts = parts[parts.index('hovind-check') + 1:]
    if len(parts) >= 2 and parts[0] in ('arguments', 'rhetoric'):
        return {'file': f'data/{parts[0]}/{parts[1]}.md'}
    if len(parts) >= 2 and parts[0] == 'lectures':
        slug = parts[1]
        claims = claims_of(slug)
        found = None
        t = seconds(link.fragment)
        if t is not None:
            found = next((c for c in claims if int(c['start']) == t), None)
            found = found or next((c for c in reversed(claims) if c['start'] <= t), None)
        quote = squash(item.get('quote', ''))[:200]
        if quote and not (found and quote in squash(f"{found.get('text', '')} {found.get('verdict', '')}")):
            found = next((c for c in claims if quote in squash(f"{c.get('text', '')} {c.get('verdict', '')}")), found)
        loc = {'file': f'data/lectures/{slug}/claims.yaml'}
        if found:
            loc['claim'] = found['id']
        return loc
    if parts:
        return {'file': None, 'page': '/'.join(parts)}
    return {'file': None}


def claim_of(it: dict) -> dict | None:
    if not it.get('claim'):
        return None
    slug = it['file'].split('/')[2]
    return next((c for c in claims_of(slug) if c['id'] == it['claim']), None)


def article_of(it: dict) -> dict | None:
    file = it.get('file')
    if not file or not file.endswith('.md') or not (ROOT / file).exists():
        return None
    text = (ROOT / file).read_text(encoding='utf-8')
    m = re.match(r'---\n(.*?)\n---', text, re.S)
    return yaml.safe_load(m.group(1)) if m else None


def place_of(it: dict) -> str:
    return it.get('claim') or it.get('file') or it.get('page') or 'место не определено'


# --- inbox.html ---

def friends() -> set[str]:
    if not FRIENDS.exists():
        return set()
    return {l.strip().lower() for l in FRIENDS.read_text(encoding='utf-8').splitlines() if l.strip() and not l.startswith('#')}


def esc(s) -> str:
    return html.escape(str(s or ''))


def card(key: str, it: dict, mates: set[str]) -> str:
    who = it.get('email') or 'без почты'
    friend = ' <span class="friend">друг</span>' if who.lower() in mates else ''
    link = it.get('link', '')
    meta = [('Где', f'<a href="{esc(link)}" target="_blank" rel="noopener">{esc(link)}</a>' if link else '—'),
            ('Место в данных', f'<code>{esc(place_of(it))}</code>' + (f' · <code>{esc(it["file"])}</code>' if it.get('claim') else '')),
            ('Ключ', f'<code>{esc(key)}</code>')]
    if it.get('status') == 'question':
        meta.append(('Статус', 'ждёт решения владельца'))
    h = [f'<article class="item" id="fb-{key}" data-key="{key}" data-num="{it["num"]}" data-rev="{it.get("rev", 0)}">',
         f'<header><a class="num" href="#fb-{key}">№{it["num"]}</a><time>{esc(it.get("timestamp"))}</time>'
         f'<span class="who">{esc(who)}{friend}</span></header>',
         '<dl class="meta">' + ''.join(f'<dt>{t}</dt><dd>{v}</dd>' for t, v in meta) + '</dl>']
    if it.get('quote'):
        h.append(f'<div class="label">Цитата с сайта</div><blockquote class="quote">{esc(it["quote"])}</blockquote>')
    h.append(f'<div class="label">Замечание</div><div class="comment">{esc(it.get("comment"))}</div>')
    if it.get('source'):
        h.append(f'<div class="label">Источник читателя</div><div class="source">{esc(it["source"])}</div>')
    claim, article = claim_of(it), article_of(it)
    if claim:
        r = claim.get('rating', '')
        tags = ', '.join((claim.get('arguments') or []) + (claim.get('rhetoric') or []))
        h.append(f'<details class="site-now"><summary>Сейчас на сайте</summary><p><span class="rating {r}">{esc(RATINGS.get(r, r))}</span>'
                 f'{" · " + esc(tags) if tags else ""}</p><p>{esc(claim.get("verdict"))}</p></details>')
    elif article:
        h.append(f'<details class="site-now"><summary>Сейчас на сайте</summary><p><b>{esc(article.get("title"))}</b></p>'
                 f'<p>{esc(article.get("summary"))}</p></details>')
    h.append(f'<section class="analysis" data-for="{key}">{it.get("analysis", "")}</section>')
    if it.get('options'):
        h.append(f'<ol class="options" data-for="{key}">')
        for o in it['options']:
            rec = ' data-recommended' if o.get('recommended') else ''
            h.append(f'<li data-id="{esc(o["id"])}"{rec}><b>{esc(o["title"])}</b>{o.get("body", "")}</li>')
        h.append('</ol>')
    h.append('</article>')
    return '\n'.join(h)


def open_items(state: dict) -> list[tuple[str, dict]]:
    items = [(k, v) for k, v in state['items'].items() if v['status'] in OPEN]
    return sorted(items, key=lambda kv: kv[1]['num'])


def render(state: dict) -> None:
    """Пересобирает inbox.html из журнала и убирает из answers.json ответы на ушедшие замечания."""
    INBOX_DIR.mkdir(exist_ok=True)
    mates = friends()
    cards = '\n'.join(card(k, v, mates) for k, v in open_items(state))
    shell = SHELL.read_text(encoding='utf-8')
    page = re.sub(r'<!-- ITEMS -->.*<!-- /ITEMS -->', lambda _: f'<!-- ITEMS -->\n{cards}\n<!-- /ITEMS -->', shell, flags=re.S)
    INBOX.write_text(page, encoding='utf-8')
    answers = load_answers()
    keep = {k for k, _ in open_items(state)}
    if set(answers['answers']) - keep:
        answers['answers'] = {k: v for k, v in answers['answers'].items() if k in keep}
        ANSWERS.write_text(json.dumps(answers, ensure_ascii=False, indent=2), encoding='utf-8')


def load_answers() -> dict:
    data = json.loads(ANSWERS.read_text(encoding='utf-8')) if ANSWERS.exists() else {}
    data.setdefault('answers', {})
    return data


def answer_of(it: dict, answers: dict) -> dict | None:
    """Ответ владельца, если он дан на текущую версию вариантов и заполнен."""
    a = answers['answers'].get(it['key'])
    if not a or str(a.get('rev')) != str(it.get('rev', 0)) or not a.get('choice'):
        return None
    if a['choice'] in ('custom', 'discuss') and not (a.get(a['choice']) or '').strip():
        return None
    return a


# --- команды ---

def show(key: str, it: dict, mates: set[str]) -> None:
    who = it.get('email') or 'без почты'
    tag = ' [друг]' if who.lower() in mates else ''
    print(f"\n## №{it['num']} · {key} · {it.get('status')} · {it.get('timestamp', '')} · {who}{tag}")
    print(f"Место: {place_of(it)}  file: {it.get('file')}  ({it.get('link', '')})")
    if it.get('quote'):
        print(f"Цитата: {it['quote']}")
    print(f"Замечание: {it.get('comment', '')}")
    if it.get('source'):
        print(f"Источник: {it['source']}")
    if it.get('note'):
        print(f"Ответ агента: {it['note']}")


def cmd_pull(args) -> None:
    state = load_state()
    rows = read_csv(Path(args.csv)) if args.csv else fetch_rows(state['since'])
    added = 0
    for r in rows:
        if r.get('ts') and (not state['since'] or r['ts'] > state['since']):
            state['since'] = r['ts']
        if not r.get('comment'):
            continue
        key = key_of(r)
        known = state['items'].get(key)
        if known:
            known['row'] = r['row']
            continue
        sheet_status = r.pop('status', '') or ''
        r.update(locate(r))
        r.update(key=key, num=state['nextNum'], rev=0, addedAt=now(),
                 status=sheet_status if sheet_status in STATUSES else 'new')
        state['nextNum'] += 1
        state['items'][key] = r
        added += 1
    state['lastPull'] = now()
    save_state(state)
    render(state)
    waiting = [k for k, v in open_items(state) if not v.get('options')]
    print(f'Новых замечаний: {added}. В inbox.html: {len(open_items(state))}, из них без вариантов: {len(waiting)}.')
    if args.check:
        sys.exit(0 if waiting else 1)


def cmd_pending(args) -> None:
    state = load_state()
    todo = [(k, v) for k, v in open_items(state) if not v.get('options')]
    if args.json:
        out = []
        for k, v in todo:
            c = claim_of(v)
            out.append({**{f: v.get(f) for f in ('key', 'num', 'timestamp', 'link', 'file', 'claim', 'page', 'quote', 'comment', 'source', 'status')},
                        'friend': (v.get('email') or '').lower() in friends(),
                        'claimNow': {f: c.get(f) for f in ('rating', 'verdict', 'arguments', 'rhetoric')} if c else None})
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return
    if not todo:
        print('Все замечания уже с вариантами.')
    mates = friends()
    for k, v in todo:
        show(k, v, mates)
        c = claim_of(v)
        if c:
            print(f"Сейчас: {c.get('rating')} · доводы {c.get('arguments') or []} · приёмы {c.get('rhetoric') or []}\nВердикт: {c.get('verdict')}")


def cmd_fill(args) -> None:
    """FILE.json: {"KEY": {"analysis": "<p>…</p>", "options": [{"title", "body", "recommended"}]}}"""
    data = json.loads(Path(args.file).read_text(encoding='utf-8'))
    state = load_state()
    errors = []
    for key, s in data.items():
        it = state['items'].get(key)
        opts = s.get('options') or []
        if not it:
            errors.append(f'{key}: нет такого замечания')
        elif not 2 <= len(opts) <= 4:
            errors.append(f'{key}: вариантов должно быть 2–4, а не {len(opts)}')
        elif sum(bool(o.get('recommended')) for o in opts) != 1:
            errors.append(f'{key}: нужен ровно один recommended')
        elif not all(o.get('title') for o in opts):
            errors.append(f'{key}: у каждого варианта нужен title')
    if errors:
        sys.exit('\n'.join(errors))
    for key, s in data.items():
        it = state['items'][key]
        it['analysis'] = s.get('analysis', '')
        it['options'] = [{'id': 'abcd'[i], 'title': o['title'], 'body': o.get('body', ''), 'recommended': bool(o.get('recommended'))}
                         for i, o in enumerate(s['options'])]
        it['rev'] = it.get('rev', 0) + 1
    save_state(state)
    render(state)
    print(f'Варианты записаны: {len(data)}.')


def strip_html(s: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def cmd_answers(args) -> None:
    state = load_state()
    answers = load_answers()
    groups: dict[str, list] = {'apply': [], 'discuss': [], 'none': []}
    for k, it in open_items(state):
        a = answer_of(it, answers)
        if not a:
            groups['none'].append((k, it, None))
        else:
            groups['discuss' if a['choice'] == 'discuss' else 'apply'].append((k, it, a))
    if args.json:
        def pack(k, it, a):
            opt = next((o for o in it.get('options', []) if a and o['id'] == a['choice']), None)
            return {'key': k, 'num': it['num'], 'place': place_of(it), 'file': it.get('file'), 'link': it.get('link'),
                    'quote': it.get('quote'), 'comment': it.get('comment'), 'analysis': strip_html(it.get('analysis', '')),
                    'choice': a and a['choice'], 'option': opt and {'title': opt['title'], 'body': strip_html(opt['body'])},
                    'custom': a and a.get('custom'), 'discuss': a and a.get('discuss')}
        print(json.dumps({g: [pack(*x) for x in v] for g, v in groups.items()}, ensure_ascii=False, indent=2))
        return
    titles = {'apply': 'Применить', 'discuss': 'Обсудить', 'none': 'Без ответа (не трогать)'}
    for g, rows in groups.items():
        print(f'\n# {titles[g]}: {len(rows)}')
        if g == 'none':
            print(', '.join(f"№{it['num']}" for _, it, _ in rows))
            continue
        for k, it, a in rows:
            print(f"\n## №{it['num']} · {k} · {place_of(it)} · {it.get('file')}")
            if it.get('quote'):
                print(f"Цитата: {it['quote']}")
            print(f"Замечание: {it.get('comment', '')}")
            if a['choice'] == 'discuss':
                print(f"ВОПРОС ВЛАДЕЛЬЦА: {a['discuss'].strip()}")
            elif a['choice'] == 'custom':
                print(f"СВОЙ ВАРИАНТ ВЛАДЕЛЬЦА: {a['custom'].strip()}")
            else:
                o = next((o for o in it.get('options', []) if o['id'] == a['choice']), {})
                print(f"Выбран вариант {a['choice']}: {o.get('title')} — {strip_html(o.get('body', ''))}")


def cmd_mark(args) -> None:
    if args.status not in STATUSES:
        sys.exit(f'Статус: {", ".join(STATUSES)}')
    state = load_state()
    it = state['items'].get(args.key) or sys.exit(f'Нет замечания {args.key}')
    a = load_answers()['answers'].get(args.key)
    if a:
        it['ownerAnswer'] = a
    if args.status in OPEN:
        it['rev'] = it.get('rev', 0) + 1  # прежний ответ («обсудим») больше не считается ответом
    it.update(status=args.status, note=args.note, resolvedAt=now(), synced=False)
    save_state(state)
    render(state)
    print(f"№{it['num']} {args.key}: {args.status}")


def cmd_push(args) -> None:
    state = load_state()
    todo = [(k, v) for k, v in state['items'].items() if v.get('synced') is False and v.get('row')]
    if not todo:
        print('Нечего записывать в таблицу.')
        return
    cfg = api_config()
    body = {'token': cfg['token'], 'updates': [{'row': v['row'], 'status': v['status'], 'note': v.get('note', '')} for _, v in todo]}
    req = urllib.request.Request(cfg['url'], data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read().decode('utf-8'))
    if not res.get('ok'):
        sys.exit(f'Таблица ответила: {res}')
    for _, v in todo:
        v['synced'] = True
    save_state(state)
    print(f'Записано в таблицу: {res["updated"]}.')


def cmd_list(args) -> None:
    state = load_state()
    mates = friends()
    items = [(k, v) for k, v in sorted(state['items'].items(), key=lambda kv: kv[1]['num']) if args.all or v['status'] in OPEN]
    if not items:
        print('Необработанных замечаний нет.')
    for k, v in items:
        show(k, v, mates)


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('pull'); s.add_argument('--csv'); s.add_argument('--check', action='store_true'); s.set_defaults(fn=cmd_pull)
    s = sub.add_parser('pending'); s.add_argument('--json', action='store_true'); s.set_defaults(fn=cmd_pending)
    s = sub.add_parser('fill'); s.add_argument('file'); s.set_defaults(fn=cmd_fill)
    s = sub.add_parser('answers'); s.add_argument('--json', action='store_true'); s.set_defaults(fn=cmd_answers)
    s = sub.add_parser('mark'); s.add_argument('key'); s.add_argument('status'); s.add_argument('note', nargs='?', default=''); s.set_defaults(fn=cmd_mark)
    s = sub.add_parser('push'); s.set_defaults(fn=cmd_push)
    s = sub.add_parser('list'); s.add_argument('--all', action='store_true'); s.set_defaults(fn=cmd_list)
    s = sub.add_parser('render'); s.set_defaults(fn=lambda a: render(load_state()))
    args = p.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
