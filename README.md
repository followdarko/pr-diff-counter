# PR Diff Counter

<div align="center">
  <img src="icons/source.svg" width="80" alt="PR Diff Counter" />
</div>

Appends `+added / -deleted` to the end of each pull request row on
`https://github.com/<organization>/<repo>/pulls`.

## Install

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. On the extension card → **Details** → **Extension options**
4. Paste a personal access token (the options page has the full instructions)

A token is required: `<organization>` repositories are private, and GitHub will not
return `additions`/`deletions` without auth. Create it on your personal
account — you don't need to own the organization, membership is enough. The
options page covers both token types (fine-grained and classic). The token is
stored in `chrome.storage.local` — locally, in the Chrome profile — and is
sent only to `api.github.com`.

## How it works

- One GraphQL request per page: all 25 PR numbers go out as aliases in a
  single query instead of 25 separate REST calls.
- The response is cached in `chrome.storage.session` for 10 minutes, so
  returning to the list within the same session makes no network request.
- Changing the token clears the cache.

## Extending to other organizations

Change `matches` in `manifest.json`:

```json
"matches": ["https://github.com/*"]
```

The token still needs access to those repositories. The match pattern is
intentionally broader than `/pulls`: GitHub renders the pull request list
with client-side navigation, and a narrower pattern would not inject the
script on in-site transitions. Extra pages are filtered out by a path check
inside `content.js`.

## Fragile bit

GitHub's new PR list is React with CSS modules; class names include a build
hash (`Description-module__container__hpqJz`) and change on deploys. The
code latches onto `data-testid="listitem-title-link"` and the prefix
`[class*="Description-module__container"]`, but if GitHub renames those too
the two selectors at the top of `src/content.js` are what need fixing.
