// Reads an existing Vercel runtime log export. No network, telemetry or identifiers.
import { readFileSync } from 'node:fs';
const input = process.argv[2];
if (!input) throw Error('Usage: node scripts/summarize-gateway-usage.mjs <export.json-or-jsonl>');
const text = readFileSync(input, 'utf8').replace(/^\uFEFF/, '');
let records;
try { const parsed = JSON.parse(text); records = Array.isArray(parsed) ? parsed : parsed.logs || [parsed]; }
catch { records = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
const clients = {}, routes = {}; let matched = 0, upstreamRequests = 0;
for (const record of records) {
  let item = record;
  if (typeof record.message === 'string') { try { item = JSON.parse(record.message); } catch { continue; } }
  if (item.event !== 'gateway_request') continue;
  matched++; upstreamRequests += Number(item.upstreamRequests) || 0;
  const key = ['desktop','website','crawler','scheduled-test'].includes(item.client) ? item.client : 'unknown';
  const client = clients[key] ||= { functionExecutions: 0, upstreamRequests: 0, cacheStates: {} };
  client.functionExecutions++; client.upstreamRequests += Number(item.upstreamRequests) || 0;
  client.cacheStates[item.cache] = (client.cacheStates[item.cache] || 0) + 1;
  routes[item.route] = (routes[item.route] || 0) + 1;
}
console.log(JSON.stringify({ functionExecutions: matched, upstreamRequests, clients, routes,
  limits: 'Only exported runtime logs for the two gateways. CDN cache hits, WAF denies, CPU, transfer and direct provider/Supabase traffic require separate Vercel/provider reports. Client hints are self-reported, never authorization.' }, null, 2));
