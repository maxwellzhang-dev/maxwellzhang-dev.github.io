# Smoke test

`index.html` is one file with no build step, so nothing catches a deleted
function until the page is open in a browser. On 2026-09-13 a refactor removed
`each()`, `reportSize()` and the whole window-chrome block; `node --check`
passed (the syntax was fine) and the dead buttons only surfaced days later.

So: run this before every deploy.

```bash
npm i playwright && npx playwright install chromium
node test/smoke.mjs "$PWD/index.html"
```

93 checks — boot, every chip, the filesystem commands, grep, completion,
history keys, both languages, the window buttons, drag-resize, text selection,
localStorage persistence across reload, and a 390px viewport. Exits non-zero on
any failure or any uncaught JS error.
