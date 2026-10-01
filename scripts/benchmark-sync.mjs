import {currentFixture} from '../tests/helpers/current-fixture.mjs';
const f=currentFixture(),a=f.actor();
try{
 for(let i=0;i<30;i++)await f.order(a);
 const catalog=(await f.call('/api/catalog')).data,orders=(await f.call('/api/staff/orders','GET',null,a.headers)).data;
 const metadata=(await f.call('/api/staff/sync-meta','GET',null,a.headers)).data,queue=(await f.call('/api/staff/paid-labels','GET',null,a.headers)).data;
 f.queries.length=0;
 const unchanged=(await f.call('/api/staff/paid-labels?revision='+encodeURIComponent(queue.revision),'GET',null,a.headers)).data;
 const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
 console.log(JSON.stringify({fixture:'30 open orders, in-memory current SQLite schema; payload sizes, not production latency',orders:bytes(orders),catalog:bytes(catalog),syncMetadata:bytes(metadata),kitchenQueue:bytes(queue),unchangedKitchenQueue:bytes(unchanged),unchangedQueueAvoidsHeavyQuery:!f.queries.some(sql=>sql.includes('JOIN pos_auto_print_config')),queuePayloadReductionPercent:+((1-bytes(unchanged)/bytes(queue))*100).toFixed(2),realtimeSafetyPollMs:60000,fallbackPollMs:15000,printPullMs:3000},null,2));
}finally{f.db.close()}
