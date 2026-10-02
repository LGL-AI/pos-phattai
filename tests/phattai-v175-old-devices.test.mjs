import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

// The SUNMI handheld runs the bundled UI in its system WebView: Android 11 ships Chromium 83 and,
// with no Play Store on SUNMI, it is never updated. Customers on older iPhones are stuck on iOS 15.
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const APK=['public/staff/staff.js','public/staff/app-update.js','public/staff/scanner.js','public/staff/barcode.js','public/staff/qrcode.js'];
const CUSTOMER=['public/assets/app.js','public/assets/qrcode.js'];
const OTHER=['public/display/display.js','public/counter/devices.js'];

test('OLD DEVICES every script the handheld and the customer load parses on Chromium 83',()=>{
 for(const file of [...APK,...CUSTOMER]){
  const code=read(file);
  // Optional chaining works from Chromium 80; esbuild marks it newer only for edge cases we do not use.
  const modern=transformSync(code,{target:'esnext'}).code,old=transformSync(code,{target:'chrome83',supported:{'optional-chain':true}}).code;
  assert.equal(old,modern,file+' uses syntax Chromium 83 cannot run');
 }
});

test('OLD DEVICES no unguarded browser API that Chromium 83 or iOS 15 lacks',()=>{
 const banned={'AbortSignal.timeout(':/AbortSignal\.timeout\((?!ms\))/,'replaceAll':/\.replaceAll\(/,'Object.hasOwn':/Object\.hasOwn\(/,'structuredClone':/structuredClone\(/,'findLast':/\.findLast(Index)?\(/,'toSorted':/\.to(Sorted|Reversed|Spliced)\(/,'.at(':/[\w\])]\.at\(/};
 for(const file of [...APK,...CUSTOMER,...OTHER]){
  // crypto.randomUUID exists only where replaceAll also exists, so that one guarded use is fine.
  const code=read(file).replace("crypto.randomUUID?crypto.randomUUID().replaceAll('-','')",'');
  for(const [name,re] of Object.entries(banned))assert.doesNotMatch(code,re,`${file} calls ${name}`);
 }
});

test('OLD DEVICES requests still time out where AbortSignal.timeout is missing',()=>{
 for(const file of ['public/assets/app.js','public/staff/staff.js','public/display/display.js','public/counter/devices.js']){
  const code=read(file),line=code.match(/const timeoutSignal=[^\n]*/)?.[0];
  assert.ok(line,file+' defines timeoutSignal');
  let fire=null,delay=0;
  const signal=vm.runInNewContext(line+';timeoutSignal(7500)',{AbortSignal:class{},AbortController,setTimeout:(fn,ms)=>{fire=fn;delay=ms}});
  assert.equal(signal.aborted,false);assert.equal(delay,7500);fire();assert.equal(signal.aborted,true,file);
  const native=vm.runInNewContext(line+';timeoutSignal(5)',{AbortSignal:{timeout:ms=>'native:'+ms},AbortController,setTimeout});
  assert.equal(native,'native:5','modern engines keep the built-in');
 }
});

test('OLD DEVICES the customer page keeps a vh fallback wherever it uses dvh (iOS < 15.4)',()=>{
 const css=read('public/assets/app.css');
 for(const m of css.matchAll(/(min-height|max-height|height):([^;}]*dvh[^;}]*)/g)){
  const fallback=`${m[1]}:${m[2].replaceAll('dvh','vh')};${m[0]}`;
  assert.ok(css.includes(fallback),'missing vh fallback before '+m[0]);
 }
 assert.doesNotMatch(css,/[;{]inset:/,'inset needs iOS 14.5; use top/right/bottom/left');
});
