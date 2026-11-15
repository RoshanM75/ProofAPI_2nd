#!/usr/bin/env python3
"""Re-fetch pinned optional browser runtime assets; verify every SHA-256."""
import hashlib
import json
import pathlib
import urllib.request

target = pathlib.Path(__file__).resolve().parents[1] / 'assets/vendor/transformers'
manifest = json.loads((target / 'manifest.json').read_text())
for name, spec in manifest.items():
    with urllib.request.urlopen(spec['url'], timeout=120) as response:
        data = response.read()
    if len(data) != spec['bytes'] or hashlib.sha256(data).hexdigest() != spec['sha256']:
        raise RuntimeError(f'Integrity mismatch for {name}; no file was written')
    (target / name).write_bytes(data)
    print('Verified', name)
