# Видео: YouTube, RuTube, замены

Проверено 01.11.2026 через yt-dlp и API RuTube (`/api/search/video/`, `/api/video/<id>/`, `/api/play/options/<id>/`). Длительности локальных файлов взяты ffprobe.

## Таблица

| № | Лекция | Локальный файл (YT id), с | YouTube (рабочий) | RuTube (основной) | Смещение | Озвучка / канал |
|---|---|---|---|---|---|---|
| 01 | Возраст Земли | YXHGTPGcnzE, 6143 | [YXHGTPGcnzE](https://www.youtube.com/watch?v=YXHGTPGcnzE), 6143 | [787b1549…](https://rutube.ru/video/787b154918c923c60aeaf1ad53b86103/), 6143 | 0 / RT 0 | kornel Zastavnetchi (2010) |
| 02 | Эдемский сад | GEahxWOYeQ8, 4168 | ~~GEahxWOYeQ8~~ удалено → [g-7cnkhgAjg](https://www.youtube.com/watch?v=g-7cnkhgAjg), 4168 | [6d072423…](https://rutube.ru/video/6d0724237d129ed5952b3757302c6d2f/), 4168 | YT ? / RT 0 | Дмитрий Слепухин (2026) |
| 03 | Динозавры и Библия | 5b-4Aj2bt5c, 8524 | [5b-4Aj2bt5c](https://www.youtube.com/watch?v=5b-4Aj2bt5c), 8524 | [4092114c…](https://rutube.ru/video/4092114c8f50e49c6935eb5035598727/), 8524 | 0 / RT 0 | kornel Zastavnetchi |
| 04 | Что в учебниках | scPVRG6Zwbc, 8791 | [scPVRG6Zwbc](https://www.youtube.com/watch?v=scPVRG6Zwbc), 8791 | [cc09db10…](https://rutube.ru/video/cc09db10bdc81c4b28ba24502617c5f3/), 8792 | 0 / RT 0 | kornel Zastavnetchi |
| 05 | Опасность теории эволюции | S0XiCBdEQao, 7120 | [S0XiCBdEQao](https://www.youtube.com/watch?v=S0XiCBdEQao), 7120 | [f3b67456…](https://rutube.ru/video/f3b6745c5f1bf4ece401620d290e3dd2/), 7120 | 0 / RT 0 | kornel Zastavnetchi |
| 06 | Теория Ховинда | 53GssR9DqMA, 6243 | [53GssR9DqMA](https://www.youtube.com/watch?v=53GssR9DqMA), 6243 | [de594924…](https://rutube.ru/video/de59492fd40fd7a34e5b3d2313424d46/), 6243 | 0 / RT 0 | kornel Zastavnetchi |
| 07 | Вопросы и ответы | jlpLRQOotTg, 7866 | ~~jlpLRQOotTg~~ удалено → [e3mSkSpmSYE](https://www.youtube.com/watch?v=e3mSkSpmSYE), 7866 | [6334913d…](https://rutube.ru/video/6334913d7bfeacb45f2cdeb1817bae43/), 7866 | YT ? / RT 0 | Mr.Synel`nikoff (2012) |
| 08 | «Ложь во имя науки» (фильм А. Иванова, 2010) | xrGvc6wMEvk, 3194 | [xrGvc6wMEvk](https://www.youtube.com/watch?v=xrGvc6wMEvk), 3195 | [d20a6296…](https://rutube.ru/video/d20a62967ab9ae1005e9b0949c589f79/), 3196 | 0 / RT кусочное | Alexandr Ivanov (автор, 2014) |

Все YouTube-ролики из таблицы: `playable_in_embed = True`. Все RuTube-ролики лекций 1–7: канал «Библиотека христианских материалов» (author id 23512588), загружены 21.09.2025 одним комплектом, не скрыты, не 18+, плеер отдаёт поток (`play/options` ok).

## Запасные копии

**YouTube.** Канал Victor Chernomor (UC1Gua6C2qTnkMSkgQt8Jh-A, 2011, подпись «dinozavr.us»): 1 — tK0tO05InZA (6144), 3 — ty24WZJsjZ0 (8524), 4 — R2JeROcl9jU (8791), 5 — rDgIo8RQ1aI (7121). Лекций 2, 6, 7 на канале нет. Лекция 7: также uHJd9W3JHyA (канал «Раби ХАНИНА Бен ДОСА», 2015, 7866).

**RuTube.** Комплект «Школа Христианской Мудрости»: 1 — bee9f0618db3027d145b2c766ca65f75, 2 — bb17f3f37e2ff4ada3b7c44c9736f68e, 3 — c9f5aa7e01ab24d3fa68b8dfb044dddf, 4 — 07483e50e003828793503d3edf00efa3, 6 — 70a36373b690b9c94988f56c27cd78cb, 7 — 34725474cf21005fa2f3e64e2db2192d (длительности совпадают до секунды). Комплект «channel44568877» (2025): 1 — c9915dba88f1320ceec7389ad3f88809, 3 — 0a93c56bca492d19a3c47e113081f3b2, 4 — 72cfddc447f244ded4e4d06896877a78, 5 — 0aa148595439b3e21360bc21cf28f6c1, 6 — de676a051b63562dd87f9ea04a6709d2, 7 — 336d1c54482473de8b28a554534df57b. «Ложь во имя науки»: также 3ce9649f89af73a2c675480ada4926fc («Кузьма Прутков», 3195).

**Internet Archive.** `archive.org/details/ru-Hovind-1` … `ru-Hovind-7` (та же озвучка, см. `research/licensing.md`).

## Смещения таймкодов

Считаем относительно **локальных файлов** (`resources/Видеозаписи лекций Ховинда/`): по ним делается расшифровка. Локальные файлы скачаны с YouTube (id в имени файла), поэтому для 1, 3, 4, 5, 6 и фильма xrGvc6wMEvk таймкоды YouTube = локальным.

RuTube измерено взаимной корреляцией звука (8 кГц, два окна по 20 с: 10-я и 40-я минута; для фильма — 10 точек), коэффициент сходства 0,93–0,98:

| № | RuTube − локальный, с |
|---|---|
| 01–07 | 0,0–0,05 на обеих точках, т. е. **смещения нет** |
| 08 (фильм) | **кусочное**: 0–400 с: +0,3; 800–1000 с: −22,4; 1600 с: −15,3; 2400–2800 с: −7,1; 3100 с: −3,1 |

Фильм на RuTube — другая редакция (места монтажа отличаются; то же у трёх других RuTube-копий: −22,7 / −10,6 на 600 / 2000 с). Для фильма одним смещением не обойтись: либо хранить отдельные таймкоды RuTube, либо таблицу смещений по участкам, либо показывать фильм только с YouTube.

YouTube-замены для лекций 2 (g-7cnkhgAjg) и 7 (e3mSkSpmSYE) по звуку **не проверены**: YouTube отдаёт 403 / «Sign in to confirm you're not a bot» для скачивания без cookies (cookies Edge не расшифровываются через DPAPI). Длительности совпадают с локальными до секунды, вероятнее всего смещения нет; проверить вручную по 2–3 таймкодам.

## Плейлист о мировоззрении

Канал «In the Beginning And Around» (UCO6L9ojVzwAsCO7PSlGHwpQ) — тот же, что у плейлистов PLdHB3SMueff… из `AGENTS.md`. Плейлист: **«Библия и культура Древнего Востока („Мировоззренческий“ подход)»** — https://www.youtube.com/playlist?list=PLdHB3SMueff-Ppt_hcyYE-ixRxbSNN7oX (40+ бесед: «Те самые семь дней», «Различные подходы к Бытие 1», «Третий день и эволюция», «Миллионы лет смерти» и др.). Есть английская версия: PLdHB3SMueff-41g0BrJFOxQhWeLK71rCs. Ссылка на «Ховиндоведение» в описаниях роликов, ведущая на этот плейлист, — вероятно, ошибка в описаниях.

Другие плейлисты канала: «Антинаучный креационизм или „Ховиндоведение“» (= разбор Ховинда), «РИФ» (= PLdHB3SMueff_xMSf9Fq8hse8VPfffvVUQ, «о самом Ховинде»), «Научные теории для неверующих в них» (= PLdHB3SMueff_ShTK_FhomWCeYok_MGH52), «По страницам Книги Бытие», «Слово Божие или…?», «Из архивов древних цивилизаций», «Сократов клуб», «Очарованный странник», «Переводы».

## Статус

- [x] YouTube-плейлист проверен: доступны 1, 3, 4, 5, 6; удалены GEahxWOYeQ8 (2), jlpLRQOotTg (7), BGeDjN_zLOM.
- [x] Фильм xrGvc6wMEvk доступен (Alexandr Ivanov, 10.03.2014, 3195 с).
- [x] Замены для лекций 2 и 7 найдены (длительность совпадает до секунды).
- [x] RuTube для всех 8, все встраиваются.
- [x] Смещения RuTube измерены по звуку (лекции — ноль, фильм — кусочное).
- [ ] Смещения YouTube-замен 2 и 7 — проверить вручную.
- [x] Плейлист о мировоззрении найден.
