# Legend 1.76 Rebuild

- `index.html`, `js/`, `ui/`, `assets/`, `audio/` — deployed GitHub Pages client
- `client/` — client source (HTML/CSS/JS); original audio/art assets are not included
- `server/` — Go server source (`legend-web/server`)
- `tools/build_github_client.py` — builds the inlined GitHub Pages client

## Client source build

```bash
cd /path/to/legend-entry
python3 tools/build_github_client.py
```

The build inlines `js/main.js` into `index.html` and points static assets at the OSS CDN.

## Server build

```bash
cd server
go test ./...
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o legend-server .
```

Run with original client resources:

```bash
./legend-server -addr 127.0.0.1:18082 -web ../web -assets /opt/legend/client-assets \
  -save /opt/legend/data/players -invites /opt/legend/data/invites.json \
  -accounts /opt/legend/data/accounts.json
```

`client-assets/Map` and the `.wzl/.wzx` data files are original game resources and are not committed here.
