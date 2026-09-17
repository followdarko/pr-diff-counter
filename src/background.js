const GRAPHQL_URL = 'https://api.github.com/graphql';
const CACHE_TTL_MS = 10 * 60 * 1000;

async function getToken() {
  const { token } = await chrome.storage.local.get('token');
  return typeof token === 'string' ? token.trim() : '';
}

function parseKey(key) {
  const m = /^([^/]+)\/([^#]+)#(\d+)$/.exec(key);
  return m ? { owner: m[1], name: m[2], number: Number(m[3]) } : null;
}

function buildQuery(parsed) {
  const byRepo = new Map();
  for (const { key, owner, name, number } of parsed) {
    const nwo = `${owner}/${name}`;
    if (!byRepo.has(nwo)) byRepo.set(nwo, { owner, name, items: [] });
    byRepo.get(nwo).items.push({ key, number });
  }

  const aliases = new Map();
  let query = 'query {';
  let i = 0;
  for (const { owner, name, items } of byRepo.values()) {
    const repoAlias = `r${i++}`;
    query += `${repoAlias}:repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){`;
    for (const { key, number } of items) {
      const prAlias = `p${number}`;
      query += `${prAlias}:pullRequest(number:${number}){additions deletions}`;
      aliases.set(`${repoAlias}.${prAlias}`, key);
    }
    query += '}';
  }
  return { query: query + '}', aliases };
}

async function fetchStats(keys, token) {
  const parsed = [];
  for (const key of keys) {
    const p = parseKey(key);
    if (p) parsed.push({ key, ...p });
  }
  if (!parsed.length) return {};

  const { query, aliases } = buildQuery(parsed);
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error(`http_${res.status}`);

  const body = await res.json();
  const data = body && body.data;
  // GraphQL returns 200 with a null `data` only when the whole query failed to
  // resolve (bad token scope, malformed query); partial nulls are normal.
  if (!data) throw new Error(firstError(body) || 'no_data');

  const stats = {};
  for (const [path, key] of aliases) {
    const [repoAlias, prAlias] = path.split('.');
    const pr = data[repoAlias] && data[repoAlias][prAlias];
    if (pr) stats[key] = [pr.additions, pr.deletions];
  }
  if (!Object.keys(stats).length) throw new Error(firstError(body) || 'empty');
  return stats;
}

function firstError(body) {
  const e = body && body.errors && body.errors[0];
  return e && (e.type === 'NOT_FOUND' ? 'not_found' : e.message);
}

async function handle(keys) {
  const now = Date.now();
  const cached = await chrome.storage.session.get(keys);
  const stats = {};
  const missing = [];

  for (const key of keys) {
    const hit = cached[key];
    if (hit && now - hit.t < CACHE_TTL_MS) stats[key] = [hit.a, hit.d];
    else missing.push(key);
  }
  if (!missing.length) return { stats };

  const token = await getToken();
  if (!token) return { stats, error: 'no_token' };

  const fresh = await fetchStats(missing, token);
  const toCache = {};
  for (const [key, [a, d]] of Object.entries(fresh)) {
    stats[key] = [a, d];
    toCache[key] = { a, d, t: now };
  }
  chrome.storage.session.set(toCache);
  return { stats };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'diffstats') {
    handle(msg.keys).then(sendResponse, (err) => sendResponse({ stats: {}, error: String(err.message || err) }));
    return true;
  }
  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.token) chrome.storage.session.clear();
});
