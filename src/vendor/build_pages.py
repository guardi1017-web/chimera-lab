#!/usr/bin/env python3
"""Rebuild index.html and 2d.html from src/ (runs node build.cjs at the repository root).

Uses only the Python standard library. Run it from anywhere: python src/vendor/build_pages.py
The exit code is node's exit code.
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def main():
    node = shutil.which('node')
    if not node:
        print('build_pages: node not found on PATH', file=sys.stderr)
        return 1
    return subprocess.run([node, 'build.cjs'], cwd=str(ROOT)).returncode


if __name__ == '__main__':
    sys.exit(main())
