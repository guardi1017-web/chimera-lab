#!/usr/bin/env python3
"""Download the official three@0.170.0 files this game uses into src/vendor/three/.

Uses only the Python standard library. Run it from anywhere: python src/vendor/sync_three.py

Files placed in src/vendor/three/ (flat):
  build/three.module.min.js                    -> three.module.min.js
  examples/jsm/loaders/GLTFLoader.js           -> GLTFLoader.js
  examples/jsm/utils/SkeletonUtils.js          -> SkeletonUtils.js
  examples/jsm/libs/meshopt_decoder.module.js  -> meshopt_decoder.module.js
  LICENSE (+ meshoptimizer MIT notice)         -> LICENSE

three@0.170.0 has no build/three.core.min.js; three.module.min.js is complete on its
own, so three.core.min.js is never requested.

The official files can contain relative imports (GLTFLoader.js imports
'../utils/BufferGeometryUtils.js'). Every relative dependency is downloaded from the same
release, stored next to the others, and its specifier is changed to './<name>.js' so it
resolves inside src/vendor/three/. Nothing else in the files is changed.
"""
import posixpath
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

VERSION = '0.170.0'
BASES = (
    'https://cdn.jsdelivr.net/npm/three@' + VERSION + '/',
    'https://unpkg.com/three@' + VERSION + '/',
)
OUT = Path(__file__).resolve().parent / 'three'

# (path in the release, file name in src/vendor/three, symbol that must be in it)
FILES = (
    ('build/three.module.min.js', 'three.module.min.js', 'WebGLRenderer'),
    ('examples/jsm/loaders/GLTFLoader.js', 'GLTFLoader.js', 'GLTFLoader'),
    ('examples/jsm/utils/SkeletonUtils.js', 'SkeletonUtils.js', 'clone'),
    ('examples/jsm/libs/meshopt_decoder.module.js', 'meshopt_decoder.module.js', 'MeshoptDecoder'),
)
LICENSE_SRC = 'LICENSE'

# import / export ... from statements (line or statement start, so comment lines are skipped)
SPEC_RE = re.compile(
    r'(?:^|[;}\n])\s*(?:import\b\s*(?:[\w$*{},\s]*?from\s*)?|export\b[\w$*{},\s]*?from\s*)'
    r'(?P<q>[\'"])(?P<spec>[^\'"\n]+)(?P=q)',
    re.M,
)

MIT_BODY = (
    'Permission is hereby granted, free of charge, to any person obtaining a copy\n'
    'of this software and associated documentation files (the "Software"), to deal\n'
    'in the Software without restriction, including without limitation the rights\n'
    'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n'
    'copies of the Software, and to permit persons to whom the Software is\n'
    'furnished to do so, subject to the following conditions:\n'
    '\n'
    'The above copyright notice and this permission notice shall be included in all\n'
    'copies or substantial portions of the Software.\n'
    '\n'
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n'
    'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n'
    'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n'
    'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n'
    'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n'
    'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n'
    'SOFTWARE.\n'
)


class SyncError(Exception):
    pass


def check_text(text, where):
    if not text.strip():
        raise SyncError(where + ': empty file')
    head = text[:4096]
    if head.lstrip().startswith('<') or re.search(r'<!doctype\s+html|<html[\s>]', head, re.I):
        raise SyncError(where + ': looks like an HTML page, not the release file')


def fetch(rel):
    errors = []
    for base in BASES:
        url = base + rel
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'vendor-sync/1.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                status = getattr(r, 'status', 200)
                data = r.read()
            if status != 200:
                raise SyncError('HTTP ' + str(status))
            text = data.decode('utf-8')
            check_text(text, url)
            return text
        except (urllib.error.URLError, OSError, UnicodeDecodeError, SyncError) as e:
            errors.append(url + ': ' + str(e))
    raise SyncError('could not download ' + rel + '\n  ' + '\n  '.join(errors))


def localize_imports(text, rel, deps):
    """Point relative imports at flat files next to this one; collect what they need."""
    def repl(m):
        spec = m.group('spec')
        if not (spec.startswith('./') or spec.startswith('../')):
            if re.match(r'^[a-z][a-z0-9+.-]*:|^//', spec, re.I):
                raise SyncError(rel + ': external import ' + spec)
            return m.group(0)
        dep = posixpath.normpath(posixpath.join(posixpath.dirname(rel), spec))
        if dep.startswith('../'):
            raise SyncError(rel + ': import leaves the release: ' + spec)
        name = posixpath.basename(dep)
        if name.startswith('three.core'):
            raise SyncError(rel + ': imports ' + name + ', which three@' + VERSION + ' must not need')
        if name in deps and deps[name] != dep:
            raise SyncError('two dependencies share the name ' + name)
        deps[name] = dep
        s, e = m.start('spec') - m.start(), m.end('spec') - m.start()
        whole = m.group(0)
        return whole[:s] + './' + name + whole[e:]
    return SPEC_RE.sub(repl, text)


def meshopt_notice(src):
    header = []
    for line in src.splitlines():
        if line.startswith('//'):
            header.append(line)
        elif header or line.strip():
            break
    m = re.search(r'Copyright \(C\)\s*([^\n]+)', src)
    holder = m.group(1).strip() if m else '2016-2024, by Arseny Kapoulkine'
    if 'Kapoulkine' not in holder:
        raise SyncError('meshopt_decoder.module.js: unexpected copyright line: ' + holder)
    parts = ['meshopt_decoder.module.js (meshoptimizer, https://github.com/zeux/meshoptimizer)', '']
    if header:
        parts += ['File header:'] + header + ['']
    parts += ['MIT License', '', 'Copyright (c) ' + holder, '', MIT_BODY]
    return '\n'.join(parts)


def main():
    out = {}          # file name -> text
    origin = {}       # file name -> path in the release
    queue = []
    for rel, name, symbol in FILES:
        queue.append((rel, name, symbol))
    while queue:
        rel, name, symbol = queue.pop(0)
        if name in out:
            continue
        print('download ' + rel)
        text = fetch(rel)
        if symbol and not re.search(r'\b' + re.escape(symbol) + r'\b', text):
            raise SyncError(rel + ': symbol ' + symbol + ' not found')
        deps = {}
        text = localize_imports(text, rel, deps)
        out[name] = text
        origin[name] = rel
        for dep_name, dep_rel in deps.items():
            if dep_name not in out:
                queue.append((dep_rel, dep_name, None))

    if not re.search(r'["\']170["\']', out['three.module.min.js']):
        raise SyncError('three.module.min.js: REVISION 170 not found')

    lic = fetch(LICENSE_SRC)
    if 'MIT License' not in lic or 'Permission is hereby granted' not in lic or 'three.js authors' not in lic.lower():
        raise SyncError('LICENSE: not the three.js MIT license')
    files_note = '\n'.join('  ' + name + ' <- three@' + VERSION + '/' + origin[name] for name in sorted(out))
    out['LICENSE'] = (
        lic.rstrip() + '\n\n'
        + '-' * 80 + '\n\n'
        + meshopt_notice(out['meshopt_decoder.module.js'])
        + '\n' + '-' * 80 + '\n\n'
        + 'Vendored files (three@' + VERSION + ', relative imports pointed at these flat files):\n'
        + files_note + '\n'
    )

    OUT.mkdir(parents=True, exist_ok=True)
    for name, text in out.items():
        (OUT / name).write_text(text, encoding='utf-8', newline='\n')
        print('wrote src/vendor/three/' + name + ' (' + str(len(text.encode('utf-8'))) + ' bytes)')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except SyncError as e:
        print('sync_three: ' + str(e), file=sys.stderr)
        sys.exit(1)
