// Small, transactional revision counters. A revision is a hint to refetch;
// it never replaces permissions, order versions, or print-job claims.
export async function syncRevisions(env) {
  const {results = []} = await env.DB.prepare('SELECT scope,revision FROM pos_sync_revisions').all();
  return Object.fromEntries(results.map(row => [row.scope, String(row.revision)]));
}

export function mutationScopes(path) {
  if (path.startsWith('/api/staff/jobs/')) return ['print'];
  if (path.startsWith('/api/staff/display/')) return [];
  if (/\/api\/staff\/(?:login|logout|voucher)$/.test(path)) return [];
  if (path.startsWith('/api/staff/service-requests/')) return ['service'];
  if (/^\/api\/(?:staff\/)?orders(?:\/|$)/.test(path)) return ['orders','print','inventory','reports','service'];
  if (path.startsWith('/api/staff/bills/')) return ['orders','reports','service'];
  if (path.startsWith('/api/staff/products') || path === '/api/staff/store') return ['catalog','inventory'];
  if (/^\/api\/staff\/(?:inventory|restock)/.test(path)) return ['inventory','catalog'];
  if (path.startsWith('/api/staff/refunds')) return ['orders','reports','inventory'];
  if (/^\/api\/staff\/(?:accounts|roles)/.test(path)) return ['staff'];
  if (/^\/api\/staff\/(?:schedules|attendance|cash-shifts|shift-ops)/.test(path)) return ['shifts','reports'];
  if (path.startsWith('/api/staff/customers') || path.startsWith('/api/staff/members/')) return ['customers'];
  if (path.startsWith('/api/staff/vouchers')) return ['vouchers'];
  return [];
}
