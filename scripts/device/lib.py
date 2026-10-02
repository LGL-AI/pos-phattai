"""Shared helpers for the Android emulator checks (run inside reactivecircus/android-emulator-runner)."""
import json
import os
import re
import subprocess
import time

PKG = 'vn.lotusai.pos.phattaiapp'
_results = []
_shots = [0]
OUT = 'device-out'


def setup(out):
    global OUT
    OUT = out
    os.makedirs(OUT, exist_ok=True)


def adb(*args, timeout=180):
    r = subprocess.run(['adb', *args], capture_output=True, text=True, timeout=timeout)
    return (r.stdout + r.stderr).strip()


def shell(*args, timeout=120):
    return adb('shell', *args, timeout=timeout)


def shot(d, name):
    """Screenshot + UI hierarchy, so a failure in CI can be read without a device."""
    _shots[0] += 1
    base = f'{OUT}/{_shots[0]:02d}-{re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:50]}'
    try:
        d.screenshot(base + '.png')
    except Exception as e:  # pragma: no cover - diagnostics only
        print('  (screenshot failed:', e, ')')
    try:
        with open(base + '.xml', 'w', encoding='utf-8') as f:
            f.write(d.dump_hierarchy())
    except Exception as e:  # pragma: no cover
        print('  (hierarchy failed:', e, ')')


def check(ok, label, d=None):
    ok = bool(ok)
    _results.append({'ok': ok, 'label': label})
    print(('PASS  ' if ok else 'FAIL  ') + label, flush=True)
    if not ok:
        if os.environ.get('GITHUB_ACTIONS'):
            print('::error::DEVICE: ' + label.replace('\n', ' | ')[:900], flush=True)
        if d is not None:
            shot(d, 'fail ' + label)
    return ok


def note(label):
    print('INFO  ' + label, flush=True)
    _results.append({'ok': None, 'label': label})


def version_name():
    m = re.search(r'versionName=(\S+)', shell('dumpsys', 'package', PKG))
    return m.group(1) if m else None


def version_code():
    m = re.search(r'versionCode=(\d+)', shell('dumpsys', 'package', PKG))
    return int(m.group(1)) if m else None


def texts(d):
    """Every text and description on screen (WebView content is exposed through accessibility)."""
    xml = d.dump_hierarchy()
    return [t for t in re.findall(r'(?:text|content-desc)="([^"]*)"', xml) if t]


def wait_text(d, pattern, timeout=30):
    """First on-screen text that matches the regex, or None after the timeout."""
    deadline = time.time() + timeout
    rx = re.compile(pattern)
    while time.time() < deadline:
        try:
            for t in texts(d):
                if rx.search(t):
                    return t
        except Exception:
            pass
        time.sleep(1)
    return None


def finish():
    crash = adb('logcat', '-d', '-b', 'crash')
    check(PKG not in crash, 'no crash of the app in the Android crash log' + ('' if PKG not in crash else ': ' + crash[-600:]))
    log = adb('logcat', '-d', timeout=120)
    with open(f'{OUT}/logcat.txt', 'w', encoding='utf-8') as f:
        f.write(log)
    anr = [line for line in log.splitlines() if 'ANR in ' + PKG in line]
    check(not anr, 'no "app not responding" (ANR)' + ('' if not anr else ': ' + anr[0]))
    js = [line for line in log.splitlines() if 'Uncaught' in line and ('CONSOLE' in line or 'chromium' in line)]
    check(not js, 'no uncaught JavaScript error in the WebView' + ('' if not js else ': ' + ' | '.join(js[:3])[:700]))
    with open(f'{OUT}/results.json', 'w', encoding='utf-8') as f:
        json.dump(_results, f, ensure_ascii=False, indent=1)
    failed = [r for r in _results if r['ok'] is False]
    print(f'\n{len([r for r in _results if r["ok"]])} passed, {len(failed)} failed', flush=True)
    return 1 if failed else 0
