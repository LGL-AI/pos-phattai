import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The APK does not use fetch(): every Staff UI call goes through MainActivity.cloudApi().
// These checks keep the browser-tested UI and the native transport from drifting apart.
const STAFF=readFileSync(new URL('../public/staff/staff.js',import.meta.url),'utf8');
const MAIN=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/MainActivity.java',import.meta.url),'utf8');
const LAN=readFileSync(new URL('../android/app/src/main/java/vn/lotusai/pos/phattaiapp/LanKitchenPrinter.java',import.meta.url),'utf8');

function nativePathFilter(){
 const java=MAIN.match(/!path\.matches\("((?:[^"\\]|\\.)*)"\)/);
 assert.ok(java,'MainActivity path filter not found');
 assert.match(MAIN,/path\.contains\("\.\."\)\|\|/,'dot segments must be refused');
 const pattern=new RegExp('^(?:'+java[1].replaceAll('\\\\','\\')+')$');
 return {test:path=>pattern.test(path)&&!path.includes('..')};
}

test('NATIVE every API path used by the Staff UI passes the APK bridge filter',()=>{
 const filter=nativePathFilter();
 const paths=[...STAFF.matchAll(/api\('(?:GET|POST|PUT|PATCH|DELETE)','(\/api\/[^']*)'/g)].map(match=>match[1]);
 assert.ok(paths.length>40,'expected the Staff UI API inventory');
 assert.ok(paths.includes('/api/catalog/meta'));
 for(const path of paths)assert.ok(filter.test(path),`APK would reject ${path} before it reaches the Worker`);
});

test('NATIVE dynamic ids and searches keep working when they contain characters encodeURIComponent leaves as-is',()=>{
 const filter=nativePathFilter();
 for(const value of ['ORD-20261001-0001','0909.123.456','Nguyễn Văn A','a.b@c.vn','Cơm (lớn)!*~\''])
  assert.ok(filter.test('/api/staff/customers?query='+encodeURIComponent(value)),value);
 for(const path of ['/api/android/update','/api/staff/../../x','https://evil.test/api/staff/me','/api/staff/me#x','/api/staff/a b'])
  assert.ok(!filter.test(path),path);
});

test('NATIVE network calls run on their own pool, never behind a receipt print',()=>{
 assert.match(MAIN,/private final ExecutorService network = Executors\.newFixedThreadPool\(4\);/);
 const cloudApi=MAIN.slice(MAIN.indexOf('private void cloudApi('),MAIN.indexOf('private void returnApi('));
 assert.match(cloudApi,/network\.execute\(/);
 assert.doesNotMatch(cloudApi,/worker\.execute\(/);
 assert.match(MAIN,/network\.shutdownNow\(\)/);
});

test('NATIVE a request that waited too long is not sent after the WebView gave up',()=>{
 const cloudApi=MAIN.slice(MAIN.indexOf('private void cloudApi('),MAIN.indexOf('private void returnApi('));
 assert.match(MAIN,/API_MAX_QUEUE_MS = 2000/);
 assert.match(cloudApi,/elapsedRealtime\(\)-queuedAt>API_MAX_QUEUE_MS/);
 const connect=Number(cloudApi.match(/setConnectTimeout\((\d+)\)/)[1]),read=Number(cloudApi.match(/setReadTimeout\((\d+)\)/)[1]);
 const webTimeout=Number(STAFF.match(/Hết thời gian chờ Worker; tải lại đơn trước khi thử tiếp'\)\)\},(\d+)\)/)[1]);
 assert.ok(2000+connect+read<webTimeout,`native worst case ${2000+connect+read} ms must finish before the WebView timeout ${webTimeout} ms`);
});

test('NATIVE successful responses keep the TLS connection for reuse',()=>{
 const cloudApi=MAIN.slice(MAIN.indexOf('private void cloudApi('),MAIN.indexOf('private void returnApi('));
 assert.match(cloudApi,/reusable=true/);
 assert.match(cloudApi,/if\(conn!=null&&!reusable\)conn\.disconnect\(\);/);
});

test('NATIVE print de-duplication ledgers are pruned instead of growing forever',()=>{
 assert.match(MAIN,/putLong\("started:"\+requestId,System\.currentTimeMillis\(\)\)/);
 assert.match(MAIN,/worker\.execute\(this::prunePrintLedger\)/);
 assert.match(LAN,/putLong\("at:"\+id,System\.currentTimeMillis\(\)\)/);
 assert.match(LAN,/queue\.execute\(this::prune\)/);
 assert.match(LAN,/"SENDING"\.equals\(prefs\.getString\("status:"\+id,""\)\)\)continue;/);
});
