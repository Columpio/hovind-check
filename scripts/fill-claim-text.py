"""Fill every claim's `text` with the full transcript between its start and the next claim's start.

The transcripts live in resources/ (not in git), so this runs locally:
    python scripts/fill-claim-text.py
Every transcript segment ends up in exactly one claim, so the lecture page shows the whole talk.
"""
import json
import pathlib
import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
TRANSCRIPTS = ROOT / "resources" / "transcripts" / "lectures"
SITES = {
    "lecture-1": "01-age-of-earth",
    "lecture-2": "02-garden-of-eden",
    "lecture-3": "03-dinosaurs",
    "lecture-4": "04-textbooks",
    "lecture-5": "05-dangers-of-evolution",
    "lecture-6": "06-hovind-theory",
    "lecture-7": "07-qa",
    "lies-in-the-name-of-science": "08-lies-in-textbooks-film",
}
FIELDS = ["id", "start", "end", "text", "rating", "verdict", "arguments", "rhetoric"]
HEADER = (
    "# Утверждения лекции. Формат: data/README.md.\n"
    "# text заполняет scripts/fill-claim-text.py из полной расшифровки — вручную не сокращать.\n\n"
)


def fill(site: str, transcript: str) -> None:
    path = ROOT / "data" / "lectures" / site / "claims.yaml"
    claims = sorted(yaml.safe_load(path.read_text(encoding="utf-8")), key=lambda c: c["start"])
    segments = json.loads((TRANSCRIPTS / f"{transcript}.json").read_text(encoding="utf-8"))

    for i, claim in enumerate(claims):
        lo = -1.0 if i == 0 else claim["start"] - 0.05
        hi = claims[i + 1]["start"] - 0.05 if i + 1 < len(claims) else float("inf")
        own = [s for s in segments if lo <= s["start"] < hi]
        if not own:
            raise SystemExit(f"{site}: у утверждения {claim['id']} нет ни одного сегмента расшифровки")
        claim["start"] = round(min(claim["start"], own[0]["start"]), 1)
        end = own[-1]["end"]
        if i + 1 < len(claims):
            end = min(end, claims[i + 1]["start"])
        claim["end"] = round(max(end, claim["start"] + 0.1), 1)
        claim["text"] = " ".join(s["text"].strip() for s in own)

    ordered = [{k: c[k] for k in FIELDS if c.get(k)} for c in claims]
    body = yaml.safe_dump(ordered, allow_unicode=True, sort_keys=False, width=10**6)
    path.write_text(HEADER + body.replace("\n- id:", "\n\n- id:"), encoding="utf-8")
    print(f"{site}: {len(claims)} утверждений, {len(segments)} сегментов")


for site, transcript in SITES.items():
    fill(site, transcript)
