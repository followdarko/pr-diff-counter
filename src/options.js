const input = document.getElementById('token');
const status = document.getElementById('status');

chrome.storage.local.get('token').then(({ token }) => {
  if (token) input.value = token;
});

function say(text, cls) {
  status.textContent = text;
  status.className = cls;
}

document.getElementById('save').addEventListener('click', async () => {
  const token = input.value.trim();
  await chrome.storage.local.set({ token });
  if (!token) return say('Token removed.', '');

  say('Checking…', '');
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{viewer{login}}' })
    });
    const body = await res.json();
    const login = body && body.data && body.data.viewer && body.data.viewer.login;
    if (login) say(`Done — the token works, signed in as ${login}.`, 'ok');
    else say(`GitHub rejected the token: ${(body.errors && body.errors[0].message) || res.status}`, 'err');
  } catch (err) {
    say(`Could not reach GitHub: ${err.message}`, 'err');
  }
});
