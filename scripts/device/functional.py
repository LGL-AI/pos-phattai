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
    """Extent of what is on screen, in the hierarchy's own coordinates (a dialog window may be all
    the hierarchy holds, so use every node, not only full-screen roots)."""
    w = max([n['box'][2] for n in all_nodes] or [720])
    h = max([n['box'][3] for n in all_nodes] or [1440])
    return w, h


def visible(n, size):
    w, h = size
    x1, y1, x2, y2 = n['box']
    return x2 > x1 and y2 > y1 and x1 >= 0 and x2 <= w + 2 and y1 >= 0 and y2 <= h + 2


def find(d, pattern, all_nodes=None):
    rx = re.compile(pattern)
    return [n for n in (all_nodes if all_nodes is not None else nodes(d)) if n['text'] and rx.search(n['text'])]


CHROME = {'header': None, 'nav': None}


def webview_box(all_nodes, size):
    views = [n for n in all_nodes if n['cls'] == 'android.webkit.WebView']
    return views[0]['box'] if views else (0, 0, size[0], size[1])


def content_area(all_nodes, size):
    """Part of the screen where page content can really be tapped: below the sticky header and above
    the fixed bottom navigation (or the keyboard). WebView 83 reports fixed elements at their page
    position once the page scrolls, so their sizes are measured while they sit where they belong."""
    w, h = size
    wv = webview_box(all_nodes, size)
    for n in all_nodes:
        if n['id'] == 'diag' and wv[1] < n['box'][3] < wv[1] + h * 0.4:
            CHROME['header'] = n['box'][3] + 26 - wv[1]
        if n['text'] == 'Điều hướng POS' and n['box'][3] >= wv[3] - 4 and n['box'][1] > wv[1] + h * 0.5:
            CHROME['nav'] = n['box'][3] - n['box'][1]
    header = CHROME['header'] if CHROME['header'] is not None else int(h * 0.2)
    nav_h = CHROME['nav'] if CHROME['nav'] is not None else int(h * 0.115)
    return wv[1] + header, wv[3] - nav_h


def target_point(n, area):
    x1, y1, x2, y2 = n['box']
    lo, hi = max(y1, area[0]), min(y2, area[1])
    if hi - lo < 24 or x2 <= x1:
        return None
    return (x1 + x2) // 2, (lo + hi) // 2


def tap(d, pattern, timeout=60, scroll=True, page=True, by_id=False, accept=True, click=True):
    """Tap the first element whose text (or HTML id) matches. WebView only exposes what is on screen,
    so look at the current screen, then from the top of the page downwards. With page=True only the
    part not covered by the sticky header or the bottom navigation counts."""
    deadline = time.time() + timeout
    plan = ['here'] + (['top'] * 6 + ['down'] * 16 if scroll else [])
    step = 0
    top_ref = None
    rx = re.compile(pattern)
    while time.time() < deadline:
        try:
            all_nodes = nodes(d)
            size = screen(all_nodes)
            area = content_area(all_nodes, size) if page else (0, size[1])
            hits = [n for n in all_nodes if (rx.search(n['id']) if by_id else (n['text'] and rx.search(n['text'])))]
            points = [p for p in (target_point(n, area) for n in hits if n['box'][2] <= size[0] + 2) if p]
            if points and not click:
                return True
            if points:
                d.click(*points[0])
                time.sleep(0.9)
                # Many actions ask "are you sure?" (confirm) or "how much cash?" (prompt, prefilled),
                # sometimes one after the other: accept what the app proposes.
                for _ in range(3):
                    if not (page and accept and d(resourceId='android:id/button1').wait(timeout=2)):
                        break
                    shot(d, 'confirm ' + pattern)
                    d(resourceId='android:id/button1').click()
                    time.sleep(1)
                return True
            if not scroll:
                time.sleep(0.6)
                continue
            if step >= len(plan):
                step = 1
            move = plan[step]
            step += 1
            w, h = size
            texts_now = tuple(n['text'] for n in all_nodes if n['text'] and n['id'] != 'diag')[:40]
            mid_lo, mid_hi = area[0] + (area[1] - area[0]) // 5, area[1] - (area[1] - area[0]) // 5
            if hits and move != 'here':
                # Partly hidden: nudge it into the free area.
                y = hits[0]['box'][1]
                if y < area[0]:
                    d.swipe(w // 2, mid_lo, w // 2, min(mid_hi, mid_lo + (area[0] - y) + 80), 0.3)
                else:
                    d.swipe(w // 2, mid_hi, w // 2, max(mid_lo, mid_hi - (hits[0]['box'][3] - area[1]) - 80), 0.3)
            elif move == 'top':
                if top_ref is not None and texts_now == top_ref:
                    step = plan.index('down')  # the page no longer moves: we are at the top
                else:
                    top_ref = texts_now
                    d.swipe(w // 2, mid_lo, w // 2, mid_hi, 0.2)
                    time.sleep(0.6)
            elif move == 'down':
                d.swipe(w // 2, mid_hi, w // 2, mid_lo, 0.3)
        except Exception as e:
            print('  (tap retry:', e, ')')
        time.sleep(0.6)
    return False


def fill(d, element_id, value, timeout=40):
    """Type into the input with this HTML id (WebView exposes HTML ids as resource-id)."""
    if not tap(d, '^' + re.escape(element_id) + '$', by_id=True, timeout=timeout):
        return False
    time.sleep(0.4)
    try:
        field = d(focused=True)
        if field.exists:
            field.set_text(value)
            time.sleep(0.4)
            hide_keyboard(d)
            return True
    except Exception as e:
        print('  (set_text failed:', e, ')')
    shell('input', 'text', value)
    return True


def nav(d, pattern):
    """Bottom navigation: tabs in a row that scrolls sideways. Only the x position reported for a tab
    is trusted; its y is the bottom bar of the WebView."""
    for attempt in range(8):
        all_nodes = nodes(d)
        w, h = screen(all_nodes)
        content_area(all_nodes, (w, h))
        wv = webview_box(all_nodes, (w, h))
        nav_h = CHROME['nav'] or int(h * 0.115)
        y = wv[3] - nav_h // 2
        hits = [n for n in find(d, pattern, all_nodes) if n['cls'] == 'android.widget.Button' and (n['box'][3] - n['box'][1]) <= nav_h + 8]
        on = [n for n in hits if n['box'][0] >= 0 and n['box'][2] <= w + 2]
        if on:
            x1, _, x2, _ = on[0]['box']
            d.click((x1 + x2) // 2, y)
            time.sleep(1.2)
            return True
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


def hide_keyboard(d):
    """The soft keyboard can cover the button that comes next; close it when it is up."""
    if 'mInputShown=true' in shell('dumpsys', 'input_method'):
        d.press('back')
        time.sleep(0.8)


def type_into(d, node, value):
    x1, y1, x2, y2 = node['box']
    d.click((x1 + x2) // 2, (y1 + y2) // 2)
    time.sleep(0.5)
    try:
        field = d(focused=True)
        if field.exists:
            field.set_text(value)
            time.sleep(0.4)
            hide_keyboard(d)
            return
    except Exception as e:
        print('  (set_text failed:', e, ')')
    try:
        d.send_keys(value, clear=True)
    except Exception as e:
        print('  (send_keys failed:', e, '; using adb input)')
        shell('input', 'text', value)
    time.sleep(0.4)


def dialog_answer(d, value=None, timeout=15):
    """Native AlertDialog that MainActivity shows for window.prompt / window.confirm."""
    ok = d(resourceId='android:id/button1')
    if not ok.wait(timeout=timeout):
        return False
    if value is not None:
        field = d(resourceId='android:id/custom').child(className='android.widget.EditText')
        if not field.exists:
            field = d(resourceId='android:id/customPanel').child(className='android.widget.EditText')
        if not field.exists:
            return False
        field.set_text(value)
        time.sleep(0.3)
    shot(d, 'dialog')
    ok.click()
    time.sleep(1)
    return True


def strip(d, timeout=30):
    return wait_text(d, r'^APK \S+ \(\d+\) · Server ', timeout) or ''


def worker(path, body):
    req = urllib.request.Request(LOCAL + path, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Origin': LOCAL})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, json.loads(r.read())


def qr_order(table):
    return worker('/api/orders', {'table': table, 'items': [{'productId': '110', 'qty': 1, 'mods': {'size': '中', 'spice': '中', 'note': ''}}],
                                  'idempotencyKey': str(uuid.uuid4())})


def app_pid():
    return shell('pidof', APP).strip()


def screen_kept_on():
    """FLAG_KEEP_SCREEN_ON on the app's own window (set through NativePOS.keepScreenOn)."""
    out = shell('dumpsys', 'window', 'windows')
    mine = [b for b in re.split(r'\n\s*Window #', out) if APP + '/' in b.split('\n', 1)[0]]
    return any('KEEP_SCREEN_ON' in b for b in mine)


class Page:
    """The WebView page through Chrome DevTools (DevTools is on in the test build only), to read the
    page and call the Java bridge (TextToSpeech, tone, audio outputs) for real."""

    def __init__(self):
        import websocket  # websocket-client, installed by the workflow for this job
        pid = app_pid().split()
        if not pid:
            raise RuntimeError('the app is not running')
        adb('forward', 'tcp:9333', 'localabstract:webview_devtools_remote_' + pid[0])
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        pages = []
        for _ in range(15):
            try:
                pages = [p for p in json.loads(opener.open('http://127.0.0.1:9333/json', timeout=10).read())
                         if p.get('type') == 'page' and p.get('webSocketDebuggerUrl')]
                if pages:
                    break
            except Exception as e:
                print('  (devtools retry:', e, ')')
            time.sleep(2)
        if not pages:
            raise RuntimeError('no WebView page on DevTools')
        pages.sort(key=lambda p: '/staff' not in p.get('url', ''))
        self.ws = websocket.create_connection(pages[0]['webSocketDebuggerUrl'], timeout=30, suppress_origin=True)
        self.n = 0

    def js(self, expression):
        self.n += 1
        self.ws.send(json.dumps({'id': self.n, 'method': 'Runtime.evaluate',
                                 'params': {'expression': expression, 'returnByValue': True, 'awaitPromise': True}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.n:
                r = msg.get('result', {})
                if 'exceptionDetails' in r:
                    raise RuntimeError('JS: ' + json.dumps(r['exceptionDetails'], ensure_ascii=False)[:300])
                return r.get('result', {}).get('value')

    def wait(self, expression, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                v = self.js(expression)
                if v:
                    return v
            except Exception as e:
                print('  (js retry:', e, ')')
            time.sleep(1)
        return None

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass
        adb('forward', '--remove', 'tcp:9333')


TOAST = '(()=>{const el=document.querySelector("#announce-toast");return JSON.stringify(el?[...el.children].map(x=>x.textContent):[])})()'


def toast_line(page, word, timeout=45):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            for line in json.loads(page.js(TOAST) or '[]'):
                if word in line:
                    return line
        except Exception as e:
            print('  (toast retry:', e, ')')
        time.sleep(1)
    return None


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
    hide_keyboard(d)
    tap(d, r'^Đăng nhập / 登录$')
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
    check(tap(d, r'^Cập nhật ứng dụng / 更新应用', accept=False), 'taps Update app', d)
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
                tap(d, button, timeout=3, scroll=False, page=False)
                time.sleep(6)
        if lib.version_code() == 2000002:
            installed = True
            break
        time.sleep(2)
    check(installed, f'Android installed the update: version {lib.version_name()} ({lib.version_code()})', d)
    for button in (r'^(OPEN|Open|MỞ|Mở)$', r'^(DONE|Done|XONG|Xong)$'):
        tap(d, button, timeout=3, scroll=False, page=False)
    d.app_start(APP, wait=True)
    s = strip(d, 60)
    shot(d, 'after update')
    check(s.startswith('APK 9.0.2 (2000002)'), f'the updated app runs 9.0.2: {s}', d)
    check(not find(d, r'^Đăng nhập /') and wait_text(d, r'Chọn món|Quản trị chủ tiệm', 20),
          'still signed in after the update (session and settings kept)', d)

    # 3. Sale: order -> kitchen -> add items -> cash payment.
    check(nav(d, r'^Chọn món'), 'opens New order', d)
    check(tap(d, r'Set cơm chân giò'), 'taps a dish', d)
    check(tap(d, r'Thêm vào giỏ', page=False), 'adds it to the cart', d)
    t0 = time.time()
    check(tap(d, r'^Chốt đơn'), 'submits the order', d)
    code = wait_text(d, r'\d{8}-\d{4}-\d{6}', 30)
    shot(d, 'order created')
    check(code, f'order created ({code}) in {time.time() - t0:.1f}s', d)
    check(tap(d, r'Thêm món vào đơn'), 'opens Add items', d)
    check(tap(d, r'Canh thịt lát'), 'picks a soup', d)
    tap(d, r'Thêm vào giỏ', page=False)
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
    typed = fill(d, 'member-phone', '0909555777', timeout=12)
    if not typed:  # the member panel is folded away until opened
        tap(d, r'Hội viên & voucher')
        typed = fill(d, 'member-phone', '0909555777')
    check(typed, 'types the member phone', d)
    check(tap(d, r'^Đăng ký(\s*/.*)?$', accept=False), 'taps Register member', d)
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
    check(tap(d, r'Tiền mặt', click=False), 'report shows cash takings', d)
    shot(d, 'report')
    tap(d, r'In SUNMI')
    time.sleep(2)

    # 6b. Speaker announcements (module of 1.7.98). The emulator has no Bluetooth: first the path the shop
    #     sees with the speaker off/unpaired, then the Java bridge called for real (TextToSpeech, tone,
    #     audio outputs), then a QR order announced as if a Bluetooth speaker were paired.
    nav(d, r'Quản trị chủ tiệm')
    check(tap(d, r'Thiết bị & máy in'), 'speaker: opens Devices & printers', d)
    check(tap(d, r'^Bật loa trên máy này'), 'speaker: turns it on for this device', d)
    pid = app_pid()
    page = Page()
    check(page.wait('localStorage.getItem("lotus-cloud:announce")==="on"', 10), 'speaker: setting saved on the device', d)
    status = page.wait('(document.querySelector("#announce-speaker")||{}).textContent', 10) or ''
    check('Chưa kết nối loa Bluetooth' in status, f'speaker: no Bluetooth on the emulator and the card says so ({status[:70]})', d)
    note('speaker: voice line on this emulator: ' + (page.js('(document.querySelector("#announce-voice")||{}).textContent') or '')[:110])
    time.sleep(2)
    check(screen_kept_on(), 'speaker: the screen is kept on while the speaker is on (FLAG_KEEP_SCREEN_ON)', d)
    shot(d, 'speaker on')
    check(tap(d, r'^Thử loa'), 'speaker: taps Test speaker', d)
    check(page.wait('document.body.innerText.includes("Chưa kết nối loa Bluetooth: ghép loa")', 10),
          'speaker: Test speaker without a speaker asks to pair one', d)
    status, body = qr_order('T05')
    check(status in (200, 201) and body.get('ok'), f'speaker: QR order T05 accepted by the Worker ({status})')
    line = toast_line(page, '5号桌')
    shot(d, 'speaker no bluetooth order')
    check(line and '有新订单' in line and '未连接音箱' in line, f'speaker: QR order without a speaker is shown, not spoken: {line}', d)
    raw = json.loads(page.js('JSON.stringify({tts:NativePOS.ttsStatus(),out:NativePOS.audioOutput()})'))
    tts, out = json.loads(raw['tts']), json.loads(raw['out'])
    note(f'speaker: TextToSpeech {tts.get("state")} (engine {tts.get("engine") or "none"}); outputs bluetooth={out.get("bluetooth")} wired={out.get("wired")}')
    check(tts.get('state') in ('READY', 'NO_VOICE', 'NO_ENGINE'), f'speaker: TextToSpeech started ({tts.get("state")}; each state is handled by the page)', d)
    spoken = page.js('NativePOS.speak("5号桌，有新订单")')
    page.js('NativePOS.chime(),1')
    check(spoken == ('OK' if tts.get('state') == 'READY' else tts.get('state')), f'speaker: NativePOS.speak returns {spoken}', d)
    time.sleep(3)
    check(app_pid() == pid and page.js('1+1') == 2, 'speaker: app alive and responsive after speak + chime', d)
    patched = page.js('(()=>{const n=window.NativePOS,speak=n.speak;window.__spoken=[];try{'
                      'n.audioOutput=()=>JSON.stringify({bluetooth:true,wired:false});'
                      'n.speak=t=>{const r=speak.call(n,t);window.__spoken.push(r);return r}}catch(e){return "error "+e}'
                      'return JSON.parse(n.audioOutput()).bluetooth===true?"patched":"read-only"})()')
    if patched == 'patched':
        status, body = qr_order('T06')
        check(status in (200, 201) and body.get('ok'), f'speaker: QR order T06 accepted by the Worker ({status})')
        line = toast_line(page, '6号桌')
        time.sleep(3)
        results = json.loads(page.js('JSON.stringify(window.__spoken)') or '[]')
        shot(d, 'speaker bluetooth order')
        check(line and '有新订单' in line and '未连接音箱' not in line, f'speaker: with a Bluetooth speaker the QR order is announced: {line}', d)
        check(results and all(r == (spoken if spoken != 'OK' else 'OK') for r in results),
              f'speaker: the order text went to Android TextToSpeech: {results}', d)
        check(app_pid() == pid, 'speaker: app alive after the announcement', d)
    else:
        note('speaker: bridge methods not replaceable from DevTools (' + str(patched) + '); Bluetooth path covered by the browser cross-check only')
    page.close()

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

    # 9. The speaker setting survives a cold start (screen still kept on), then turning it off clears it.
    page = Page()
    check(page.wait('localStorage.getItem("lotus-cloud:announce")==="on"', 10), 'speaker: still on after a cold start', d)
    page.close()
    time.sleep(2)
    check(screen_kept_on(), 'speaker: screen kept on again after a cold start', d)
    nav(d, r'Quản trị chủ tiệm')
    tap(d, r'Thiết bị & máy in')
    check(tap(d, r'^Tắt loa trên máy này'), 'speaker: turns it off', d)
    time.sleep(2)
    check(not screen_kept_on(), 'speaker: off releases the screen (normal sleep again)', d)
    shot(d, 'speaker off')
    return finish()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:  # keep the diagnostics of an unexpected stop
        check(False, f'device test stopped: {type(error).__name__}: {error}')
        sys.exit(finish())
