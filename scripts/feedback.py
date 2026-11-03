"""Замечания читателей из Google Формы: забрать новые, привязать к утверждению или статье, отметить отработанные.

  python scripts/feedback.py pull                  # забрать ответы, показать необработанные
  python scripts/feedback.py pull --csv FILE.csv   # то же из выгрузки таблицы, без API
  python scripts/feedback.py list [--all]          # необработанные (или все) из локального журнала
  python scripts/feedback.py mark KEY STATUS "ответ"   # done | rejected | question | duplicate
  python scripts/feedback.py push                  # записать статусы в таблицу (столбцы «Статус (агент)», «Ответ агента»)

Журнал: resources/feedback/state.json (не в git: там почты читателей).
Доступ к таблице: resources/secrets/feedback-api.json {"url", "token"} — веб-приложение Apps Script
(resources/feedback/apps-script.gs). Друзья владельца: resources/feedback/friends.txt, по адресу в строке.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
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
STATUSES = ('new', 'done', 'rejected', 'question', 'duplicate')

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


def normalize(row: int | None, values: dict[str, str]) -> dict:
    item: dict = {'row': row}
    for header, value in values.items():
        name = field_of(header)
        if name and name not in item:
            item[name] = (value or '').strip()
    return item


def key_of(item: dict) -> str:
    raw = f"{item.get('timestamp', '')}|{item.get('email', '')}|{item.get('comment', '')}"
    return hashlib.sha1(raw.encode()).hexdigest()[:10]


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding='utf-8'))
    return {'lastPull': None, 'items': {}}


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


def fetch_rows() -> list[dict]:
    cfg = api_config()
    url = f"{cfg['url']}?{urllib.parse.urlencode({'token': cfg['token']})}"
    with urllib.request.urlopen(url, timeout=60) as r:
        data = json.loads(r.read().decode('utf-8'))
    if 'error' in data:
        sys.exit(f"Таблица ответила: {data['error']}")
    return [normalize(r['row'], r['values']) for r in data['rows']]


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
    return {'file': None}


# --- команды ---

def friends() -> set[str]:
    if not FRIENDS.exists():
        return set()
    return {l.strip().lower() for l in FRIENDS.read_text(encoding='utf-8').splitlines() if l.strip() and not l.startswith('#')}


def show(key: str, it: dict, mates: set[str]) -> None:
    who = it.get('email') or 'без почты'
    tag = ' [друг]' if who.lower() in mates else ''
    where = it.get('claim') or it.get('file') or 'место не определено'
    print(f"\n## {key} · {it.get('status')} · {it.get('timestamp', '')} · {who}{tag}")
    print(f"Место: {where}  ({it.get('link', '')})")
    if it.get('quote'):
        print(f"Цитата: {it['quote']}")
    print(f"Замечание: {it.get('comment', '')}")
    if it.get('source'):
        print(f"Источник: {it['source']}")
    if it.get('note'):
        print(f"Ответ агента: {it['note']}")


def cmd_pull(args) -> None:
    rows = read_csv(Path(args.csv)) if args.csv else fetch_rows()
    state = load_state()
    added = 0
    for r in rows:
        if not r.get('comment'):
            continue
        key = key_of(r)
        known = state['items'].get(key)
        if known:
            known['row'] = r['row']
            continue
        sheet_status = r.pop('status', '') or ''
        r.update(locate(r))
        r['status'] = sheet_status if sheet_status in STATUSES else 'new'
        state['items'][key] = r
        added += 1
    state['lastPull'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    save_state(state)
    print(f'Новых замечаний: {added}. Всего в журнале: {len(state["items"])}.')
    cmd_list(argparse.Namespace(all=False))


def cmd_list(args) -> None:
    state = load_state()
    mates = friends()
    items = [(k, v) for k, v in state['items'].items() if args.all or v['status'] in ('new', 'question')]
    if not items:
        print('Необработанных замечаний нет.')
    for k, v in items:
        show(k, v, mates)


def cmd_mark(args) -> None:
    if args.status not in STATUSES:
        sys.exit(f'Статус: {", ".join(STATUSES)}')
    state = load_state()
    it = state['items'].get(args.key) or sys.exit(f'Нет замечания {args.key}')
    it.update(status=args.status, note=args.note, resolvedAt=datetime.now(timezone.utc).isoformat(timespec='seconds'), synced=False)
    save_state(state)
    print(f'{args.key}: {args.status}')


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


def main() -> None:
    sys.stdout.reconfigure(encoding='utf-8')
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('pull'); s.add_argument('--csv'); s.set_defaults(fn=cmd_pull)
    s = sub.add_parser('list'); s.add_argument('--all', action='store_true'); s.set_defaults(fn=cmd_list)
    s = sub.add_parser('mark'); s.add_argument('key'); s.add_argument('status'); s.add_argument('note', nargs='?', default=''); s.set_defaults(fn=cmd_mark)
    s = sub.add_parser('push'); s.set_defaults(fn=cmd_push)
    args = p.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
