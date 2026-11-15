#!/usr/bin/env python3
"""Build the bundled KJV text files from the aruljohn/Bible-kjv per-book JSON.

Usage:
    python3 scripts/build_kjv.py <source_dir> [output_dir]

<source_dir> must contain Books.json plus one <BookNameWithoutSpaces>.json per
book, as published at https://github.com/aruljohn/Bible-kjv (public domain).
Writes kjv.json, kjv.js (for the reader) and kjv.tsv to data/kjv/ by default.

Only whitespace is normalized (runs of spaces collapsed, ends trimmed); the
verse text is otherwise left exactly as in the source.
"""
import json
import re
import sys
from pathlib import Path

EXPECTED = {"books": 66, "chapters": 1189, "verses": 31102}

ABBREV = [
    "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam",
    "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job", "Ps", "Prov",
    "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos",
    "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
    "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph",
    "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb",
    "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
]


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "data" / "kjv"
    out.mkdir(parents=True, exist_ok=True)

    names = json.loads((src / "Books.json").read_text(encoding="utf-8-sig"))
    assert len(names) == len(ABBREV), "unexpected book count"

    books, lines = [], []
    n_ch = n_v = 0
    for i, name in enumerate(names):
        raw = json.loads((src / f"{name.replace(' ', '')}.json").read_text(encoding="utf-8-sig"))
        chapters = []
        for ci, ch in enumerate(raw["chapters"], 1):
            assert int(ch["chapter"]) == ci, f"{name}: chapter order"
            verses = []
            for vi, v in enumerate(ch["verses"], 1):
                assert int(v["verse"]) == vi, f"{name} {ci}: verse order"
                t = clean(v["text"])
                assert t, f"{name} {ci}:{vi} empty"
                verses.append(t)
                lines.append(f"{ABBREV[i]}\t{ci}\t{vi}\t{t}")
            chapters.append(verses)
            n_ch += 1
            n_v += len(verses)
        books.append({
            "id": i + 1,
            "abbrev": ABBREV[i],
            "name": name,
            "testament": "OT" if i < 39 else "NT",
            "chapters": chapters,
        })

    counts = {"books": len(books), "chapters": n_ch, "verses": n_v}
    assert counts == EXPECTED, f"count mismatch: {counts}"

    bible = {
        "translation": "King James Version",
        "abbrev": "KJV",
        "edition": "1769 Oxford standard text",
        "license": "Public domain",
        "source": "https://github.com/aruljohn/Bible-kjv",
        "counts": counts,
        "books": books,
    }
    payload = json.dumps(bible, ensure_ascii=False, separators=(",", ":"))
    (out / "kjv.json").write_text(payload + "\n", encoding="utf-8")
    # Same data as a script, so the reader works from file:// where fetch() is blocked.
    (out / "kjv.js").write_text(f"window.KJV={payload};\n", encoding="utf-8")
    (out / "kjv.tsv").write_text("book\tchapter\tverse\ttext\n" + "\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out}: {counts}")


if __name__ == "__main__":
    main()
