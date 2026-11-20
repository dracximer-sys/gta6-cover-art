# Sunset Cover Studio — GTA-style Cover Art Maker

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/dracximer-sys/gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/dracximer-sys/gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An **offline web app** that turns any photo + caption into GTA-style cover art and exports it as a PNG. Your photos never leave your machine — everything runs locally in the browser.

## What it does

- **Upload up to 4 photos** (or use the built-in demo scenes) and arrange them in a comic-style multi-panel grid: Hero + 2, Hero + 1, or 4-panel collage.
- **Pan and zoom** any panel by dragging it, or with the zoom slider.
- **Edit the lettering**: big outlined title, numeral badge, tagline and location stamp — all live.
- **Two palettes**: Miami Sunset and Neon Night.
- **Export PNG** in 1080×1080, 1080×1350 or 1920×1080 — one click, instant, on-device.

The cover style is original parody artwork: sunset gradients, palm and skyline silhouettes, a helicopter in the sky, thick black comic outlines, cel shading and film grain. No Rockstar logos, artwork or fonts are used.

## Run the app

Open `app/index.html` in a desktop browser (Chrome, Edge, Firefox). No server, no build step, no network — double-click the file and it works. `app.js` and `app.css` are plain local files; nothing is fetched from the internet.

## Run the grader entrypoint

```sh
node main.ts
```

`main.ts` (Node 22, standard library only) verifies the app bundle is complete and fully offline, then renders a demo cover PNG with a pure-TypeScript software rasterizer and writes `cover.png` (+ `manifest.json`) to `$MAKEFUN_OUTPUT_DIR` (default `/output`). Deterministic, no network, no model call, finishes in well under 10 seconds.

Other sizes:

```sh
MAKEFUN_SIZE=1080x1350 node main.ts
MAKEFUN_SIZE=1920x1080 node main.ts
```

## Screenshots

See `screenshots/` — the demo cover exported at all three sizes.

## License

MIT — see `LICENSE`.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash
