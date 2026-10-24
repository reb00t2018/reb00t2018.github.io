# Legend 1.76 Rebuild — Client

- `index.html`, `js/`, `ui/`, `assets/`, `audio/` — deployed GitHub Pages client
- `client/` — client source (HTML/CSS/JS)
- `tools/build_github_client.py` — builds the inlined GitHub Pages client

## Client source build

```bash
cd /path/to/legend-entry
python3 tools/build_github_client.py
```

The build inlines `js/main.js` into `index.html` and points static assets at the OSS CDN.

Original game artwork/audio/map resources are not committed here.
