const ROW_LINK = 'a[data-testid="listitem-title-link"]';
const META = '[class*="Description-module__container"]';
const PULLS_PATH = /^\/[^/]+\/[^/]+\/pulls\/?$/;

const template = document.createElement('template');
template.innerHTML =
  '<span class="prdc">' +
    '<svg class="prdc-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
      '<path d="M8.75 1.75V5H12a.75.75 0 0 1 0 1.5H8.75v3.25a.75.75 0 0 1-1.5 0V6.5H4A.75.75 0 0 1 4 5h3.25V1.75a.75.75 0 0 1 1.5 0ZM4 13a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 13Z"></path>' +
    '</svg>' +
    '<span class="prdc-add"></span>' +
    '<span class="prdc-sep">/</span>' +
    '<span class="prdc-del"></span>' +
  '</span>';

// A key lands here once a response came back without numbers for it. Without
// this the row stays unrendered and every observer tick re-requests it.
const giveUp = new Set();
const inflight = new Set();
let scheduled = false;
let noticeShown = false;

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan();
  });
}

function collect() {
  const jobs = [];
  for (const link of document.querySelectorAll(ROW_LINK)) {
    const row = link.closest('li');
    if (!row || row.querySelector('.prdc')) continue;
    const m = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(new URL(link.href).pathname);
    if (!m) continue;
    const key = `${m[1]}/${m[2]}#${m[3]}`;
    if (inflight.has(key) || giveUp.has(key)) continue;
    jobs.push({ row, key });
  }
  return jobs;
}

function render(row, additions, deletions) {
  if (!row.isConnected || row.querySelector('.prdc')) return;
  const node = template.content.firstElementChild.cloneNode(true);
  node.children[1].textContent = `+${additions}`;
  node.children[3].textContent = `-${deletions}`;
  node.title = `${additions} added, ${deletions} removed`;
  (row.querySelector(META) || row).appendChild(node);
}

const NOTICES = {
  no_token: 'PR Diff Counter: a GitHub token is required. ',
  unauthorized: 'PR Diff Counter: GitHub rejected the token — it expired or was revoked. ',
  not_found: 'PR Diff Counter: the token cannot see this repository. The repo scope is required, ' +
    'and with SAML SSO the token must be authorized for the organization. '
};

function showNotice(reason) {
  if (noticeShown) return;
  const anchor = document.querySelector(ROW_LINK);
  const list = anchor && anchor.closest('ul');
  if (!list || !list.parentElement) return;
  noticeShown = true;

  const box = document.createElement('div');
  box.className = 'prdc-notice';
  box.textContent = NOTICES[reason];
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open options';
  button.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openOptions' }));
  box.appendChild(button);
  list.parentElement.insertBefore(box, list);
}

function scan() {
  if (!PULLS_PATH.test(location.pathname)) return;
  const jobs = collect();
  if (!jobs.length) return;

  const keys = [...new Set(jobs.map((j) => j.key))];
  keys.forEach((k) => inflight.add(k));

  chrome.runtime.sendMessage({ type: 'diffstats', keys }, (res) => {
    keys.forEach((k) => inflight.delete(k));

    const stats = (!chrome.runtime.lastError && res && res.stats) || {};
    const rendered = new Set();
    for (const { row, key } of jobs) {
      const s = stats[key];
      if (!s) continue;
      render(row, s[0], s[1]);
      rendered.add(key);
    }
    keys.forEach((k) => { if (!rendered.has(k)) giveUp.add(k); });

    if (res && NOTICES[res.error]) showNotice(res.error);
  });
}

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
schedule();
