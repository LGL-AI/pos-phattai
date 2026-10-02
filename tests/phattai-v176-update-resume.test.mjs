import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Found on the Android 11 emulator: granting "install unknown apps" makes Android kill the app
// ("REQUEST_INSTALL_PACKAGES changed"), so the owner's first in-app update silently stopped and the
// app reopened on the order list. The update must survive that restart.
const read=path=>readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/'+path,import.meta.url),'utf8');
const UPDATER=read('AppUpdater.java'),MAIN=read('MainActivity.java');

test('UPDATE the started update is remembered before Android settings open',()=>{
 const permission=UPDATER.slice(UPDATER.indexOf('if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls())'));
 const remember=permission.indexOf('putLong("resume_until"'),open=permission.indexOf('ACTION_MANAGE_UNKNOWN_APP_SOURCES');
 assert.ok(remember>0&&remember<open,'resume_until is written before the settings screen opens');
 assert.match(permission.slice(remember,open),/\.commit\(\)/,'written synchronously: the process may die right after');
});

test('UPDATE after the restart the update resumes only if allowed, recent, and still available',()=>{
 const ctor=UPDATER.slice(UPDATER.indexOf('public AppUpdater(Activity activity, Listener listener)'),UPDATER.indexOf('private boolean canInstallPackages()'));
 assert.match(ctor,/until > now && until - now <= RESUME_WINDOW_MS && canInstallPackages\(\)/);
 assert.match(ctor,/remove\("resume_until"\)/,'the flag is used once');
 const available=UPDATER.slice(UPDATER.indexOf('report("AVAILABLE"'),UPDATER.indexOf('} else {',UPDATER.indexOf('report("AVAILABLE"')));
 assert.match(available,/if \(resumeInstall\) \{\s*resumeInstall = false;[\s\S]*listener\.onResumeInstall\(\)/);
 assert.match(UPDATER,/\} else \{\s*resumeInstall = false;/,'nothing to resume when no update is published');
 assert.match(MAIN,/public void onResumeInstall\(\) \{[\s\S]{0,300}requestInstallUpdate\(false\);/,'resuming goes through the same owner, idle-print and idle-page checks');
});
