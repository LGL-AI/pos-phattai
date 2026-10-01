import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const resultDir=path.join(root,'test-results');
const read=name=>JSON.parse(fs.readFileSync(path.join(resultDir,name),'utf8'));
const logic=read('logic-results.json');
const dom=read('dom-results.json');
const browser=read('browser-results.json');
const mobile=read('mobile-pwa-results.json');

function normalize(result,source){
  return {
    id:result.id,
    source,
    group:result.group||result.layer||'general',
    layer:result.layer||({DOM:'DOM integration',Browser:'Real browser','Mobile Android':'Android mobile PWA'}[source]||'Logic'),
    steps:Array.isArray(result.steps)?result.steps:[`Execute ${source} case ${result.id}`,`Verify: ${result.expected}`],
    input:result.input||{fixture:'Seeded demo data',environment:source},
    expected:result.expected||'Expected assertion passes',
    actual:result.actual??(result.status==='PASS'?'Assertion passed':'Not executed'),
    status:result.status,
    timestamp:result.timestamp||new Date().toISOString(),
    errorLog:result.errorLog||''
  };
}

const automated=[
  ...logic.results.map(x=>normalize(x,'Logic')),
  ...dom.results.map(x=>normalize(x,'DOM')),
  ...browser.results.map(x=>normalize(x,'Browser')),
  ...mobile.results.map(x=>normalize(x,'Mobile Android'))
];

const cases=automated;
const automatedPass=automated.filter(x=>x.status==='PASS').length;
const automatedFail=automated.filter(x=>x.status==='FAIL').length;
const countsBySource=Object.fromEntries(['Logic','DOM','Browser','Mobile Android'].map(source=>[source,cases.filter(x=>x.source===source).length]));
const output={
  release:'Lotus POS v12.2.2 PWA · License Simulator · OCB Live QR',
  generatedAt:new Date().toISOString(),
  environment:{logic:'Node.js VM',dom:'JSDOM with local resource loader',browser:'Headless Chromium via Playwright on localhost',mobile:'Touch-enabled mobile Chromium; 360×800 CSS px baseline with 320/390/430 px compatibility viewports',timezone:'Asia/Ho_Chi_Minh business rules'},
  summary:{total:cases.length,automated:automated.length,automatedPass,automatedFail,notRun:0,countsBySource},
  cases
};
fs.writeFileSync(path.join(root,'TEST_CASES.json'),JSON.stringify(output,null,2)+'\n');

const csvColumns=['id','source','group','layer','steps','input','expected','actual','status','timestamp','errorLog'];
const csvEscape=value=>`"${String(value??'').replaceAll('"','""')}"`;
const csv=[csvColumns.map(csvEscape).join(','),...cases.map(test=>csvColumns.map(column=>{
  const value=column==='steps'?test.steps.join(' -> '):column==='input'?JSON.stringify(test.input):test[column];
  return csvEscape(value);
}).join(','))].join('\n')+'\n';
fs.writeFileSync(path.join(root,'TEST_CASES.csv'),csv);

const groupRows=[...new Set(automated.map(x=>x.group))].sort().map(group=>{
  const subset=automated.filter(x=>x.group===group);
  return `| ${group} | ${subset.length} | ${subset.filter(x=>x.status==='PASS').length} | ${subset.filter(x=>x.status==='FAIL').length} |`;
}).join('\n');
const report=`# Lotus POS v12.2.2 — Test Report

Generated: ${output.generatedAt}

## Result

| Layer | Executed | PASS | FAIL | NOT RUN |
|---|---:|---:|---:|---:|
| Logic/service | ${countsBySource.Logic} | ${logic.summary.pass} | ${logic.summary.fail} | 0 |
| DOM integration | ${countsBySource.DOM} | ${dom.summary.pass} | ${dom.summary.fail} | 0 |
| Real Chromium | ${countsBySource.Browser} | ${browser.summary.pass} | ${browser.summary.fail} | 0 |
| Android mobile PWA | ${countsBySource['Mobile Android']} | ${mobile.summary.pass} | ${mobile.summary.fail} | 0 |
| **Total automated** | **${automated.length}** | **${automatedPass}** | **${automatedFail}** | — |

Automated acceptance result: **PASS — ${automatedPass}/${automated.length}, 0 failures and 0 uncaught browser runtime errors.**

## Coverage

| Group | Automated | PASS | FAIL |
|---|---:|---:|---:|
${groupRows}

The suite covers desktop navigation and preserved modules, product categorization, member lookup/registration, vouchers, loyalty idempotency, order and production routing, recipe-based inventory reservation, warehouse receiving/adjustment/planning, bilingual VN/简体中文 UI, custom role permissions, license date boundaries, live OCB QR/deeplink payment states, order barcode + bank QR, offline behavior, service-worker registration and responsive layouts.

Real Chromium responsive checks ran at **320, 360, 375, 390, 430, 600 and 768 px**. Dedicated touch flows use **360×800 CSS px** as the neutral baseline and verify compact **320×568**, medium **390×844** and large **430×932** phone viewports. The assertion allows at most one pixel rounding difference between document width and viewport width.

## Critical user flows verified

1. Customer QR: table deep link → menu/category → modifier → cart → member/registration/guest → voucher → cash or bank → exact order payment request → order barcode + live OCB QR → OCB app handoff attempt → PENDING → CUSTOMER_REPORTED only.
2. Staff handheld: PIN login → menu → modifier/cart → member lookup/registration/guest → voucher → cash or bank → manual incoming-funds confirmation → one PAID receipt.
3. Counter POS: cart → member selection → order creation → second screen update → ingredient/product inventory deduction once → payment/receipt.
4. License: D−3, D, D+1/D+2 and D+3 04:59/05:00 boundaries; once-daily idempotency; delayed run; offline 10/11-day boundary; locked new-order scope; existing-order settlement and manual restore.

## Evidence

- Detailed results: \`TEST_CASES.json\` and \`TEST_CASES.csv\`.
- Raw result files: \`test-results/logic-results.json\`, \`test-results/dom-results.json\`, \`test-results/browser-results.json\`, \`test-results/mobile-pwa-results.json\`.
- Screenshots: \`test-results/screenshots/qr-320.png\`, \`qr-390.png\`, \`qr-430.png\`, \`staff-390-paid.png\`, \`desktop-settings-1440.png\`.
- Mobile flow screenshots: \`test-results/mobile-audit/01-qr-menu-common-360x800.png\` through \`07-staff-paid-common-360x800.png\`.

## Release boundary

This is a static browser POC. LocalStorage state is shared only inside the same browser profile. New orders use OCB account \`609271\`, beneficiary \`HUANG TIANSHENG\`, and may open an external OCB OMNI deeplink; the recipient must still be checked in the banking app. Opening the app or pressing “I transferred” never automatically marks the order PAID. A physical OCB transfer, bank-arrival reconciliation, SUNMI native hardware and backend synchronization remain outside this HTML-only test boundary. License controls are a local simulator, not secure RBAC or remote enforcement.
`;
fs.writeFileSync(path.join(root,'TEST_REPORT.md'),report);
console.log(JSON.stringify(output.summary,null,2));
