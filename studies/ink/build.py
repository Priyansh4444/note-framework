"""Build the standalone study; no network, bundler, or shared package changes."""
from base64 import b64encode
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SRC=Path(__file__).resolve().parent
font=ROOT/'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2'
style=(SRC/'style.css').read_text().replace('FONT_DATA',b64encode(font.read_bytes()).decode())
html=(SRC/'index.html').read_text().replace('/*STYLE*/',style).replace('/*SCRIPT*/',(SRC/'scene.js').read_text())
html=html.replace('</head>', '<!-- Embedded Newsreader font license:\n'+(SRC/'FONT-LICENSE.txt').read_text()+'\n--></head>')
out=ROOT/'public/studies/ink/index.html'
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(html)
print(f'Built {out.relative_to(ROOT)} ({len(html):,} bytes)')
