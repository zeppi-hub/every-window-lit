"""Write public/credits-v2.html, the start page's Credits, from art/v2/CREDITS-v2.md.

Every scene the game ships is listed (scenes left out of this build are
skipped), with each CC BY work's title, author, licence and link as the
markdown gives them, plus the stylized townsfolk the far end of the queue
still uses. Run from the repository root:

    python3 art/v2/tools/credits_page.py
"""

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "art/v2/CREDITS-v2.md"
OUT = ROOT / "public/credits-v2.html"
# Sections of scenes this build does not ship (none: the valley is in).
SKIP: tuple[str, ...] = ()

LINK = re.compile(r"(https?://[^\s)]+)")


def inline(text: str) -> str:
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    return LINK.sub(lambda m: f'<a href="{m.group(1)}">{m.group(1)}</a>', out)


def convert(md: str) -> str:
    parts: list[str] = []
    in_list = False
    skipping = False
    for raw in md.splitlines():
        line = raw.rstrip()
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            skipping = any(s in line for s in SKIP)
            if in_list:
                parts.append("</ul>")
                in_list = False
            if not skipping:
                parts.append(f"<h2>{inline(line[3:])}</h2>")
            continue
        if skipping or line == "":
            if in_list and line == "":
                parts.append("</ul>")
                in_list = False
            continue
        if line.startswith("- "):
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{inline(line[2:])}</li>")
        else:
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<p>{inline(line)}</p>")
    if in_list:
        parts.append("</ul>")
    return "\n".join(parts)


def main() -> None:
    body = convert(SOURCE.read_text(encoding="utf-8"))
    page = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Repeat After Me · Credits</title>
    <style>
      body {{ margin: 0; background: #f3ead8; color: #2e2620; font-family: Georgia, 'Times New Roman', serif; line-height: 1.55; }}
      main {{ max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }}
      h1 {{ font-weight: normal; font-size: 30px; margin: 0 0 8px; }}
      h2 {{ font-weight: normal; font-size: 21px; margin: 32px 0 8px; }}
      p, li {{ font-size: 16px; overflow-wrap: anywhere; }}
      a {{ color: #7a3b1e; }}
      code {{ font-size: 14px; }}
    </style>
  </head>
  <body>
    <main>
      <h1>Repeat After Me · Credits</h1>
      <p><a href="./">Back to the game</a></p>
      <h2>Townsfolk at the far end of the queue</h2>
      <p>CC0: from the <a href="https://quaternius.com/packs/ultimatedanimatedcharacter.html">Ultimate Animated Character Pack</a> by Quaternius (Man in Suit, Woman in Dress; their colours vary in the game).</p>
{body}
    </main>
  </body>
</html>
"""
    OUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(page)} bytes)")


if __name__ == "__main__":
    main()
