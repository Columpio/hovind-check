# Формат данных

- `lectures/lectures.yaml` — список лекций: `slug`, `number`, `title`, `kind` (`film` для «Ложи во имя науки»), `author`, `source`, `voiceover`, `rights`, `youtube {id, channel, offset}`, `rutube {id, channel, offset | offsets}`, `draft`. Время в разметке — по локальному файлу (совпадает с YouTube-загрузкой). `offset` в секундах: время на площадке = время лекции + offset. Если копия смонтирована иначе, вместо `offset` — `offsets: [{from, offset}]`: действует последний пункт с `from` ≤ время лекции.
- `lectures/<slug>/claims.yaml` — утверждения: `id`, `start`, `end` (секунды), `text` (короткий фрагмент), `rating` (`green|neutral|orange|red|purple`), `verdict` (1–2 фразы), `arguments: [slug]` (не больше одного), `rhetoric: [slug]`. Своего текста «Подробнее» у утверждения нет: там только вставки статей довода и приёмов.
- `arguments/<slug>.md`, `rhetoric/<slug>.md` — статьи каталогов. Frontmatter: `title`, `summary`; тело — markdown.
- Два нейтральных утверждения не идут подряд: соседние нейтральные куски объединяем в одно (start первого, end последнего, общий вердикт).
- Ошибки разметки (в том числе нейтральные подряд, неизвестные метки, повтор id) останавливают `npm run build`; та же проверка идёт перед `git push` (хук ставится командой `npm run hooks`) и в GitHub Actions.
- Частоты и связи «довод ↔ приём» считаются при сборке по меткам в `claims.yaml`.
