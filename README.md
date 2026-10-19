# gifwave

A Giphy-style GIF search demo — **369 handpicked loops across 12 moods**, instant local search, favorites, keyboard shortcuts, and a full detail viewer. Built with plain HTML, CSS, and JavaScript. No build step, no API key, no accounts.

**Live demo:** https://muhammadawais047.github.io/giphy-clone/

## Features

- **Curated vault** — 369 real GIPHY GIFs filed under 12 moods: Trending, Reactions, Cats, Dogs, Dance, Funny, Love, Excited, Food, Sports, Space, and Weird.
- **Instant search** — ranked matching across titles, descriptions, and categories. Runs entirely in the browser.
- **Shareable routes** — `#/`, `#/category/cats`, `#/search/dance`, and `#/favorites` are all deep-linkable.
- **Mood chips** — one-tap category browsing with live counts.
- **Favorites** — save loops to a personal vault persisted in `localStorage`, with a live badge in the top bar.
- **Detail dialog** — autoplaying MP4 previews with a WebP fallback, category context, related loops, copy-link, and one-click GIF download.
- **Discovery** — a daily round-robin home mix, a scrolling mood ticker, and a "Surprise me" random loop.
- **Infinite browsing** — 24 at a time, auto-loaded by `IntersectionObserver` or with the load-more button. Tall and square tiles create a masonry-like grid.
- **Responsive and accessible** — native `<dialog>`, focus-visible states, ARIA labels, live regions, full keyboard support (`/` or `Ctrl/⌘K` to search), and `prefers-reduced-motion` handling.
- **No dependencies** — zero frameworks, zero build tools, zero network calls beyond the GIF CDN.

## Tech

| Layer | Choice |
| --- | --- |
| Markup | Semantic HTML, native `<dialog>` |
| Styling | Hand-written CSS (custom properties, grid, media queries) |
| Logic | Vanilla JavaScript (IIFE, hash router, `localStorage`) |
| Data | 369-item catalogue scraped from public GIPHY search pages |
| Media | GIPHY CDN (WebP grid thumbs, MP4 previews, GIF downloads) |
| Hosting | GitHub Pages |

## Run locally

No install required.

```bash
cd giphy-clone
python -m http.server 8773
```

Then open <http://localhost:8773>.

Any static file server works; opening `index.html` directly also functions, though a server is recommended so downloads and clipboard behavior match production.

## Project structure

```
giphy-clone/
├── index.html    # app shell, hero, feed, detail dialog
├── styles.css    # complete dark-neon design system
├── app.js        # routing, search, favorites, dialog, downloads
├── catalog.js    # 369 GIF records { id, title, cat, desc? }
├── README.md
├── LICENSE
└── .gitignore
```

## Data and attribution

The catalogue stores only metadata (GIPHY media ID, short title, optional description, category). Every GIF is hotlinked from GIPHY's CDN and remains the property of GIPHY and its respective creators. This is a non-commercial portfolio demo and is **not affiliated with GIPHY**.

## License

[MIT](./LICENSE) © 2026 Muhammad Awais

Built by [Muhammad Awais](https://github.com/MuhammadAwais047).
