"""Smoke test of the PUBLISHED, signed APK on an Android 11 emulator (SUNMI V2s: Android 11, 720x1440).

Read-only against production: the app only loads the menu and checks for updates before login.
Usage: python3 scripts/device/smoke_release.py OLD_APK_DIR NEW_APK_DIR OUT_DIR
"""
import glob
import re
import sys
import time

import uiautomator2 as u2

from lib import PKG, adb, check, finish, note, setup, shell, shot, version_code, version_name, wait_text


def apk_in(folder):
    path = sorted(glob.glob(folder + '/*.apk'))[0]
    return path, re.search(r'_(\d+\.\d+\.\d+)\.apk$', path).group(1)


def main():
    old_dir, new_dir, out = sys.argv[1:4]
    setup(out)
    old_apk, old_name = apk_in(old_dir)
    new_apk, new_name = apk_in(new_dir)

    # Look like a SUNMI V2s: 720x1440 at 320 dpi.
    shell('wm', 'size', '720x1440')
    shell('wm', 'density', '320')
    note('Android ' + shell('getprop', 'ro.build.version.release') + ' / API ' + shell('getprop', 'ro.build.version.sdk'))
    webview = re.search(r'Current WebView package \(name, version\): \(([^)]*)\)', shell('dumpsys', 'webviewupdate'))
    note('WebView ' + (webview.group(1) if webview else 'unknown'))

    adb('uninstall', PKG)
    out_old = adb('install', '-r', old_apk)
    check('Success' in out_old, f'published APK {old_name} installs on Android 11' + ('' if 'Success' in out_old else ': ' + out_old[-300:]))
    d = u2.connect()
    d.app_start(PKG, stop=True, wait=True)
    login = wait_text(d, r'Đăng nhập', 60)
    shot(d, f'{old_name} login')
    check(login, f'{old_name} starts and its bundled UI renders the login screen in the system WebView', d)

    # Same signing key: an in-place update keeps the app's data, exactly like the in-app updater.
    out_new = adb('install', '-r', new_apk)
    check('Success' in out_new, f'APK {new_name} installs over {old_name} (same signing key)' + ('' if 'Success' in out_new else ': ' + out_new[-300:]))
    check(version_name() == new_name, f'installed version is now {new_name} (code {version_code()})')

    shell('am', 'force-stop', PKG)
    started = time.time()
    launch = shell('am', 'start', '-W', '-n', PKG + '/.MainActivity')
    total = re.search(r'TotalTime: (\d+)', launch)
    note(f'cold start {total.group(1) if total else "?"} ms (Android activity launch)')
    d = u2.connect()
    login = wait_text(d, r'Đăng nhập', 60)
    check(login, f'{new_name} starts and renders the login screen', d)
    strip = wait_text(d, r'^APK \S+ \(\d+\) · Server (?!—)\S+', 60)
    took = time.time() - started
    shot(d, f'{new_name} login strip')
    check(strip and strip.startswith(f'APK {new_name} ('), f'the info strip shows the installed APK: {strip}', d)
    check(strip and re.search(r'Server \d+\.\d+\.\d+', strip) and re.search(r'Menu r\d+', strip),
          f'the native bridge reached the production Worker over HTTPS and read the menu in {took:.1f}s', d)
    check(wait_text(d, r'D1 trực tuyến', 10), 'connection badge says the Worker is online', d)

    # Leave and come back; then a cold start after the process is killed.
    d.press('home')
    time.sleep(8)
    d.app_start(PKG)
    check(wait_text(d, r'Đăng nhập', 30), 'returns to the app after Home without restarting into an error', d)
    shell('am', 'kill', PKG)
    d.app_start(PKG, wait=True)
    check(wait_text(d, r'^APK \S+ \(\d+\) · Server (?!—)', 60), 'restarts cleanly after Android kills the process', d)
    shot(d, 'after restart')
    return finish()


if __name__ == '__main__':
    sys.exit(main())
