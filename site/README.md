# Last Caretaker Web Archive (`site/`)

Static ES-module viewer and diff explorer for *The Last Caretaker* data dumps (no build step required).

## Structure

- `index.html`, `styles.css`, `app.js` — CRT terminal shell, styles, and app bootstrap
- `js/api/` — Repo detection, UTF-8/UTF-16 decoding, `versions.json` / GitHub REST API + `localStorage` cache
- `js/core/`, `js/domain/`, `js/state/`, `js/ui/` — Formatters, domain logic, hash router/store, and UI views
- `sampledata/data.json`, `timeline/data.json` — Curated sample metadata and in-game asset timeline entries
- `tests/` — Unit tests (`node --test`)

## Local Development & Testing

Start a static HTTP server from the **repository root**:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/site/` (adds `Working Copy (Local Dumps)` alongside GitHub history).
Optional query parameters: `?repo=owner/repo` and `?nocache=1`.

Run unit tests:

```bash
node --test site/tests/*.test.mjs
```
