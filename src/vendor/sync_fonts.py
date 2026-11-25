#!/usr/bin/env python3
"""Download subset Gowun Batang Bold (700) / Gowun Dodum Regular (400) woff2 files into src/vendor/fonts/.

Uses only the Python standard library. Run it from anywhere: python src/vendor/sync_fonts.py

Files placed in src/vendor/fonts/:
  GowunBatang-Bold.subset.woff2     <- Google Fonts css2 family=Gowun+Batang:wght@700&text=...
  GowunDodum-Regular.subset.woff2   <- Google Fonts css2 family=Gowun+Dodum&text=...
  LICENSE                           <- google/fonts ofl/gowunbatang/OFL.txt + ofl/gowundodum/OFL.txt
  chars.txt                         <- the characters in the subset (UTF-8)

The subset holds every non-ASCII character (BOM excluded) in src/page.html, src/render.js,
src/sim.js and src/render3d.js, plus printable ASCII (0x20-0x7E). Add Korean (or other
non-ASCII) text to the screen -> run this again, then python src/vendor/build_pages.py.

Nothing is written until every download and check has passed. If the downloads fail because
of the network and the existing files in src/vendor/fonts/ are valid and already cover the
characters, a warning is printed and the existing files are kept (exit code 0).
"""
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / 'fonts'
SOURCES = ('src/page.html', 'src/render.js', 'src/sim.js', 'src/render3d.js')
CSS_API = 'https://fonts.googleapis.com/css2'
# A current desktop Chrome User-Agent, so the css2 API answers with woff2 sources
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/131.0.0.0 Safari/537.36')
MAX_BYTES = 2000000

# (css2 family parameter, family name, weight, file in src/vendor/fonts, OFL.txt source)
FONTS = (
    ('Gowun+Batang:wght@700', 'Gowun Batang', 700, 'GowunBatang-Bold.subset.woff2',
     'https://raw.githubusercontent.com/google/fonts/main/ofl/gowunbatang/OFL.txt'),
    ('Gowun+Dodum', 'Gowun Dodum', 400, 'GowunDodum-Regular.subset.woff2',
     'https://raw.githubusercontent.com/google/fonts/main/ofl/gowundodum/OFL.txt'),
)

WOFF2_URL_RE = re.compile(
    r'url\(\s*[\'"]?(https://fonts\.gstatic\.com/[^\'")\s]+)[\'"]?\s*\)\s*format\(\s*[\'"]woff2[\'"]\s*\)'
)


class SyncError(Exception):
    pass


class NetError(SyncError):
    """A download failed (network, HTTP or timeout)."""


def collect_chars():
    found = set(chr(c) for c in range(0x20, 0x7F))
    for rel in SOURCES:
        p = ROOT / rel
        if not p.is_file():
            raise SyncError(rel + ': file not found')
        text = p.read_text(encoding='utf-8')
        for ch in text:
            if ord(ch) > 0x7F and ch != '\ufeff':
                found.add(ch)
    return ''.join(sorted(found))


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            status = getattr(r, 'status', 200)
            data = r.read()
    except (urllib.error.URLError, OSError) as e:
        raise NetError(url.split('?')[0] + ': ' + str(e))
    if status != 200:
        raise NetError(url.split('?')[0] + ': HTTP ' + str(status))
    return data


def check_woff2(data, where):
    if not data or len(data) <= 0:
        raise SyncError(where + ': empty file')
    if len(data) >= MAX_BYTES:
        raise SyncError(where + ': ' + str(len(data)) + ' bytes, must be under ' + str(MAX_BYTES))
    if data[:4] != b'wOF2':
        raise SyncError(where + ': not a woff2 file (no wOF2 header)')


def check_ofl(text, where):
    if 'SIL OPEN FONT LICENSE' not in text or 'Version 1.1' not in text:
        raise SyncError(where + ': not the SIL Open Font License, Version 1.1')


def woff2_url(css, family):
    urls = []
    for u in WOFF2_URL_RE.findall(css):
        if u not in urls:
            urls.append(u)
    if not urls:
        raise SyncError(family + ': no fonts.gstatic.com woff2 url in the css2 response')
    if len(urls) > 1:
        raise SyncError(family + ': css2 response split the subset into ' + str(len(urls)) + ' files')
    return urls[0]


def mapping_lines():
    return ['  ' + name + ' -> ' + family + ' (font-weight: ' + str(weight) + ', font-style: normal)'
            for _, family, weight, name, _ in FONTS]


def build_license(ofls):
    sep = '-' * 80
    parts = [
        'Fonts in src/vendor/fonts/ (subsets made with the Google Fonts css2 API, text= parameter).',
        'Each font is licensed under the SIL Open Font License, Version 1.1; the full texts follow.',
        '',
    ]
    for (_, family, _, _, src), text in zip(FONTS, ofls):
        parts += [sep, family + ' - ' + src, sep, '', text.rstrip(), '']
    parts += [sep, 'Subset files and families:'] + mapping_lines() + ['']
    return '\n'.join(parts)


def download(chars):
    q = urllib.parse.quote(chars, safe='')
    out = {}
    for fam, family, _, name, _ in FONTS:
        print('download css2 ' + fam + ' (' + str(len(chars)) + ' chars)')
        css = fetch(CSS_API + '?family=' + fam + '&text=' + q).decode('utf-8', 'replace')
        url = woff2_url(css, family)
        print('download ' + url.split('?')[0])
        data = fetch(url)
        check_woff2(data, name)
        out[name] = data
    ofls = []
    for _, family, _, _, src in FONTS:
        print('download ' + src)
        try:
            text = fetch(src).decode('utf-8')
        except UnicodeDecodeError as e:
            raise SyncError(src + ': ' + str(e))
        text = text.replace('\r\n', '\n')
        check_ofl(text, src)
        ofls.append(text)
    out['LICENSE'] = build_license(ofls).encode('utf-8')
    out['chars.txt'] = (chars + '\n').encode('utf-8')
    return out


def existing_reason(chars):
    """None if the files already in src/vendor/fonts/ are usable, else why not."""
    try:
        for _, _, _, name, _ in FONTS:
            p = OUT / name
            if not p.is_file():
                return 'missing src/vendor/fonts/' + name
            check_woff2(p.read_bytes(), name)
        lic = OUT / 'LICENSE'
        if not lic.is_file():
            return 'missing src/vendor/fonts/LICENSE'
        check_ofl(lic.read_text(encoding='utf-8'), 'src/vendor/fonts/LICENSE')
        ct = OUT / 'chars.txt'
        if not ct.is_file():
            return 'missing src/vendor/fonts/chars.txt'
        have = set(ct.read_text(encoding='utf-8'))
        missing = [c for c in chars if c not in have]
        if missing:
            return 'src/vendor/fonts/chars.txt lacks ' + str(len(missing)) + ' characters (U+' + ', U+'.join('%04X' % ord(c) for c in missing[:20]) + ')'
    except (SyncError, OSError, UnicodeDecodeError) as e:
        return str(e)
    return None


def write_atomic(files):
    OUT.mkdir(parents=True, exist_ok=True)
    tmps = []
    try:
        for name, data in files.items():
            tmp = OUT / (name + '.tmp')
            tmp.write_bytes(data)
            tmps.append((tmp, OUT / name))
        for tmp, dst in tmps:
            os.replace(tmp, dst)
    finally:
        for tmp, _ in tmps:
            if tmp.exists():
                tmp.unlink()


def summary(sizes, nchars):
    woff = 0
    for name, size in sizes:
        print('src/vendor/fonts/' + name + ': ' + str(size) + ' bytes')
        if name.endswith('.woff2'):
            woff += size
    print('woff2 total: ' + str(woff) + ' bytes (' + '%.1f' % (woff / 1024) + ' KiB), all files: '
          + str(sum(s for _, s in sizes)) + ' bytes')
    print('subset characters: ' + str(nchars))


def main():
    chars = collect_chars()
    try:
        files = download(chars)
    except NetError as e:
        print('sync_fonts: download failed: ' + str(e), file=sys.stderr)
        reason = existing_reason(chars)
        if reason is None:
            print('sync_fonts: WARNING: network error, keeping the existing files in src/vendor/fonts/')
            names = [f[3] for f in FONTS] + ['LICENSE', 'chars.txt']
            summary([(n, (OUT / n).stat().st_size) for n in names], len(chars))
            return 0
        print('sync_fonts: existing files cannot be kept: ' + reason, file=sys.stderr)
        return 1
    write_atomic(files)
    summary([(n, len(d)) for n, d in files.items()], len(chars))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except SyncError as e:
        print('sync_fonts: ' + str(e), file=sys.stderr)
        sys.exit(1)
