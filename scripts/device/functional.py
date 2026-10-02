"""Full handheld flow on an Android 11 emulator with a TEST build of the APK.

The test build is the shop's code with two differences only: another package name and a throwaway
signing key (so it can never replace the real app), and the Worker URL of a throwaway local Worker
reached through a public HTTPS tunnel. Everything else runs for real: WebView, native bridge,
native session, JS dialogs, realtime WebSocket, the in-app updater and Android's installer.

Usage: python3 functional.py TEST_V1_APK TEST_V2_APK OUT_DIR
Env:   TEST_APP_ID, DEVICE_PASSWORD, LOCAL_WORKER (http://127.0.0.1:8787)
"""
import json
import os
import re
import sys
import time
import urllib.request
import uuid
import xml.etree.ElementTree as ET

import uiautomator2 as u2

import lib
from lib import adb, check, finish, note, setup, shell, shot, wait_text

APP = os.environ.get('TEST_APP_ID', 'vn.lotusai.pos.phattaiapp.devicetest')
PASSWORD = os.environ['DEVICE_PASSWORD']
LOCAL = os.environ.get('LOCAL_WORKER', 'http://127.0.0.1:8787')
lib.PKG = APP


# ---------- screen helpers (WebView content is read through the accessibility tree) ----------

def nodes(d):
    root = ET.fromstring(d.dump_hierarchy())
    out = []
    for n in root.iter('node'):
        b = re.findall(r'\d+', n.get('bounds', ''))
        if len(b) != 4:
            continue
        x1, y1, x2, y2 = map(int, b)
        out.append({'text': n.get('text') or n.get('content-desc') or '', 'id': n.get('resource-id') or '',
                    'cls': n.get('class') or '', 'box': (x1, y1, x2, y2), 'pkg': n.get('package') or ''})
    return out


def screen(all_nodes):
    """Screen size in the same coordinates as the hierarchy (window_size() can disagree after wm size)."""
    w = max([n['box'][2] for n in all_nodes if n['box'][0] == 0 and n['box'][1] == 0] or [720])
    h = max([n['box'][3] for n in all_nodes if n['box'][0] == 0 and n['box'][1] == 0] or [1440])
    return w, h


def visible(n, size):
    w, h = size
    x1, y1, x2, y2 = n['box']
    return x2 > x1 and y2 > y1 and x1 >= 0 and x2 <= w + 2 and y1 >= 0 and y2 <= h + 2


def find(d, pattern, all_nodes=None):
    rx = re.compile(pattern)
    return [n for n in (all_nodes if all_nodes is not None else nodes(d)) if n['text'] and rx.search(n['text'])]


def tap(d, pattern, timeout=40, scroll=True, label=None):
    """Tap the first on-screen element whose text matches. WebView only exposes what is on screen,
    so look at the current screen, then from the top of the page downwards."""
    deadline = time.time() + timeout
    plan = ['here'] + (['top'] * 6 + ['down'] * 14 if scroll else [])
    step = 0
    last = None
    while time.time() < deadline:
        try:
            all_nodes = nodes(d)
            size = screen(all_nodes)
            on = [n for n in find(d, pattern, all_nodes) if visible(n, size)]
            if on:
                x1, y1, x2, y2 = on[0]['box']
                d.click((x1 + x2) // 2, (y1 + y2) // 2)
                time.sleep(0.8)
                return True
            if step >= len(plan):
                if not scroll:
                    time.sleep(0.6)
                    continue
                step = 1
            move = plan[step]
            step += 1
            w, h = size
            texts_now = tuple(n['text'] for n in all_nodes if n['text'])[:40]
            if move == 'top':
                if texts_now == last:
                    step = plan.index('down')  # already at the top
                else:
                    d.swipe(w // 2, int(h * 0.35), w // 2, int(h * 0.80), 0.2)
            elif move == 'down':
                d.swipe(w // 2, int(h * 0.75), w // 2, int(h * 0.40), 0.25)
            last = texts_now
        except Exception as e:
            print('  (tap retry:', e, ')')
        time.sleep(0.6)
    return False


def nav(d, pattern):
    """Bottom navigation: a row of tabs that scrolls sideways on a narrow screen."""
    for attempt in range(8):
        all_nodes = nodes(d)
        w, h = screen(all_nodes)
        hits = sorted([n for n in find(d, pattern, all_nodes) if n['box'][1] > h * 0.75], key=lambda n: -n['box'][1])
        on = [n for n in hits if visible(n, (w, h))]
        if on:
            x1, y1, x2, y2 = on[0]['box']
            d.click((x1 + x2) // 2, (y1 + y2) // 2)
            time.sleep(1.2)
            return True
        y = (hits[0]['box'][1] + hits[0]['box'][3]) // 2 if hits else int(h * 0.95)
        if attempt < 4:
            d.swipe(int(w * 0.9), y, int(w * 0.1), y, 0.3)
        else:
            d.swipe(int(w * 0.1), y, int(w * 0.9), y, 0.3)
        time.sleep(0.8)
    return False


def edits(d):
    all_nodes = nodes(d)
    size = screen(all_nodes)
    return [n for n in all_nodes if n['cls'] == 'android.widget.EditText' and visible(n, size)]


def type_into(d, node, value):
    x1, y1, x2, y2 = node['box']
    d.click((x1 + x2) // 2, (y1 + y2) // 2)
    time.sleep(0.5)
    try:
        field = d(focused=True)
        if field.exists:
            field.set_text(value)
            time.sleep(0.4)
            return
    except Exception as e:
        print('  (set_text failed:', e, ')')
    try:
        d.send_keys(value, clear=True)
    except Exception as e:
        print('  (send_keys failed:', e, '; using adb input)')
        shell('input', 'text', value)
    time.sleep(0.4)


def dialog_answer(d, value=None, button=r'^(OK|Xác nhận.*)$', timeout=15):
    """Native AlertDialog used for window.prompt / window.confirm."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if value is not None:
            field = d(className='android.widget.EditText', packageName=APP)
            if field.exists and not find(d, 'Tài khoản POS'):
                field.set_text(value)
                time.sleep(0.3)
        if tap(d, button, timeout=2, scroll=False):
            return True
        time.sleep(0.5)
    return False


def strip(d, timeout=30):
    return wait_text(d, r'^APK \S+ \(\d+\) · Server ', timeout) or ''


def worker(path, body):
    req = urllib.request.Request(LOCAL + path, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Origin': LOCAL})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, json.loads(r.read())


# ---------- the flow ----------

def main():
    v1, v2, out = sys.argv[1:4]
    setup(out)
    shell('wm', 'size', '720x1440')
    shell('wm', 'density', '320')
    adb('uninstall', APP)
    res = adb('install', '-r', v1)
    check('Success' in res, 'test APK 9.0.1 installs' + ('' if 'Success' in res else ': ' + res[-300:]))
    d = u2.connect()
    d.app_start(APP, stop=True, wait=True)

    # 1. Login through the native bridge, native session kept by PosAuth.
    check(wait_text(d, r'Đăng nhập', 60), 'login screen renders', d)
    fields = edits(d)
    check(len(fields) >= 2, f'login form has user and password fields ({len(fields)})', d)
    if len(fields) >= 2:
        type_into(d, fields[1], PASSWORD)
    t0 = time.time()
    tap(d, r'^Đăng nhập / 登录$', scroll=False)
    logged = wait_text(d, r'Chọn món|Quản trị chủ tiệm', 40)
    check(logged, f'owner logs in through the native bridge in {time.time() - t0:.1f}s', d)
    s = wait_text(d, r'^APK 9\.0\.1 \(2000001\) · .*RT ✓', 45) or strip(d, 5)
    shot(d, 'after login')
    check(s.startswith('APK 9.0.1 (2000001)') and 'RT ✓' in s, f'info strip after login (realtime connected): {s}', d)

    # 2. In-app update 9.0.1 -> 9.0.2 before any order exists (prints must be idle to update).
    check(nav(d, r'Quản trị chủ tiệm'), 'opens the owner hub', d)
    check(tap(d, r'Thiết bị & máy in'), 'opens Devices & printers', d)
    check(tap(d, r'Kiểm tra cập nhật'), 'taps Check for update', d)
    found = wait_text(d, r'Có bản 9\.0\.2', 40)
    shot(d, 'update found')
    check(found, 'the app finds 9.0.2 on the Worker update channel', d)
    check('⬆ có bản 9.0.2' in strip(d, 10), 'the info strip announces the new version', d)
    check(tap(d, r'^Cập nhật ứng dụng / 更新应用'), 'taps Update app', d)
    check(dialog_answer(d), 'confirms the update in the app dialog', d)
    # First update: Android asks once to allow installing from this app.
    deadline = time.time() + 90
    installed = False
    while time.time() < deadline:
        if d(resourceId='android:id/switch_widget').exists:
            shot(d, 'unknown sources permission')
            d(resourceId='android:id/switch_widget').click()
            time.sleep(1)
            d.press('back')
            note('allowed "install unknown apps" for the app once (first update only)')
            time.sleep(2)
            continue
        for button in (r'^(UPDATE|Update|INSTALL|Install|CẬP NHẬT|Cập nhật|CÀI ĐẶT|Cài đặt)$',):
            if find(d, button) and any(n['pkg'].startswith('com.android') or 'packageinstaller' in n['pkg'] for n in find(d, button)):
                shot(d, 'android installer')
                tap(d, button, timeout=3, scroll=False)
                time.sleep(6)
        if lib.version_code() == 2000002:
            installed = True
            break
        time.sleep(2)
    check(installed, f'Android installed the update: version {lib.version_name()} ({lib.version_code()})', d)
    for button in (r'^(OPEN|Open|MỞ|Mở)$', r'^(DONE|Done|XONG|Xong)$'):
        tap(d, button, timeout=3, scroll=False)
    d.app_start(APP, wait=True)
    s = strip(d, 60)
    shot(d, 'after update')
    check(s.startswith('APK 9.0.2 (2000002)'), f'the updated app runs 9.0.2: {s}', d)
    check(not find(d, r'^Đăng nhập /') and wait_text(d, r'Chọn món|Quản trị chủ tiệm', 20),
          'still signed in after the update (session and settings kept)', d)

    # 3. Sale: order -> kitchen -> add items -> cash payment.
    check(nav(d, r'^Chọn món'), 'opens New order', d)
    check(tap(d, r'Set cơm chân giò'), 'taps a dish', d)
    check(tap(d, r'Thêm vào giỏ'), 'adds it to the cart', d)
    t0 = time.time()
    check(tap(d, r'^Chốt đơn'), 'submits the order', d)
    code = wait_text(d, r'\d{8}-\d{4}-\d{6}', 30)
    shot(d, 'order created')
    check(code, f'order created ({code}) in {time.time() - t0:.1f}s', d)
    check(tap(d, r'Thêm món vào đơn'), 'opens Add items', d)
    check(tap(d, r'Canh thịt lát'), 'picks a soup', d)
    tap(d, r'Thêm vào giỏ')
    check(tap(d, r'Lưu thêm món'), 'saves the added items', d)
    check(wait_text(d, r'Canh thịt lát', 20), 'added item is on the order', d)
    check(tap(d, r'Xác nhận đúng đơn'), 'starts payment', d)
    check(tap(d, r'Tiền mặt · 现金'), 'chooses cash', d)
    check(tap(d, r'Xác nhận thu tiền mặt'), 'confirms cash received', d)
    paid = wait_text(d, r'\d{8}-\d{4}-\d{6}-TM', 30)
    shot(d, 'paid')
    check(paid, f'order paid in cash ({paid}); receipt printing has no SUNMI printer here and must not block', d)

    # 4. Member registration with the native prompt dialog.
    nav(d, r'^Chọn món')
    tap(d, r'Hội viên & voucher')
    phone = [n for n in edits(d) if 'member-phone' in n['id']] or edits(d)
    check(phone, 'member phone field is reachable', d)
    if phone:
        type_into(d, phone[0], '0909555777')
    check(tap(d, r'^Đăng ký(\s*/.*)?$', scroll=False), 'taps Register member', d)
    check(dialog_answer(d, 'Khach May Ao'), 'answers the member name prompt', d)
    check(wait_text(d, r'Khach May Ao · 0909555777', 20), 'member registered and attached to the order', d)
    shot(d, 'member')

    # 5. Realtime: a customer orders by QR; the handheld shows it without a refresh.
    nav(d, r'^Đơn hàng')
    time.sleep(2)
    t0 = time.time()
    status, body = worker('/api/orders', {'table': 'T08', 'items': [{'productId': '110', 'qty': 1, 'mods': {'size': '中', 'spice': '中', 'note': ''}}],
                                          'idempotencyKey': str(uuid.uuid4())})
    check(status in (200, 201) and body.get('ok'), f'QR order accepted by the Worker ({status})')
    seen = wait_text(d, r'T08', 20)
    check(seen, f'QR order appears on the handheld after {time.time() - t0:.1f}s (realtime WebSocket)', d)

    # 6. Reports: one tap on a shift, print to the (absent) SUNMI printer must not crash.
    nav(d, r'Quản trị chủ tiệm')
    check(tap(d, r'Báo cáo ngày & ca'), 'opens Reports', d)
    check(tap(d, r'Cả ngày'), 'taps the whole-day shift', d)
    check(wait_text(d, r'Tiền mặt', 20), 'report shows cash takings', d)
    shot(d, 'report')
    tap(d, r'In SUNMI')
    time.sleep(2)

    # 7. Network loss and recovery.
    shell('svc', 'wifi', 'disable')
    shell('svc', 'data', 'disable')
    lost = wait_text(d, r'Chưa kết nối|RT ✗', 120)
    shot(d, 'offline')
    check(lost, 'shows the connection is lost', d)
    shell('svc', 'wifi', 'enable')
    shell('svc', 'data', 'enable')
    back = wait_text(d, r'^APK .*RT ✓', 120) and wait_text(d, r'D1 trực tuyến', 60)
    check(back, 'reconnects by itself (realtime and Worker)', d)

    # 8. Home and back, then a cold start: still signed in.
    d.press('home')
    time.sleep(10)
    d.app_start(APP)
    check(wait_text(d, r'Chọn món|Đơn hàng', 30) and not find(d, r'^Đăng nhập /'), 'back from Home, still signed in', d)
    shell('am', 'force-stop', APP)
    d.app_start(APP, wait=True)
    check(wait_text(d, r'Chọn món|Đơn hàng', 60) and not find(d, r'^Đăng nhập /'), 'after a cold start, still signed in', d)
    shot(d, 'cold start')
    return finish()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:  # keep the diagnostics of an unexpected stop
        check(False, f'device test stopped: {type(error).__name__}: {error}')
        sys.exit(finish())
