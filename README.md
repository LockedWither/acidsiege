# ACID SIEGE

A 2D falling-sand siege game. Rain chemicals on the enemy city — solo vs a bot, or online 1v1.
Original cellular-automaton engine, no external game libraries.

## Structure

```
index.html              Landing page (served at /)
modes/singleplayer.html Single-player game (vs Bot) — fully static, self-contained
modes/multiplayer.html  Multiplayer client (online PvP)
engine.js               Headless 2-player simulation (server-authoritative)
server.js               HTTP static server + WebSocket game server
package.json            Node app (dependency: ws)
Dockerfile / render.yaml / Procfile   Deploy configs
```

Routes served by `server.js`:

| URL | Page |
|-----|------|
| `/` | Landing page |
| `/singleplayer` (or `/play`) | Single-player vs Bot |
| `/multiplayer` (or `/online`) | Online PvP |
| `/healthz` | Health check (for hosts) |

## Run locally

```bash
npm install
npm start
# open http://localhost:8080
```

For multiplayer, open the site in **two** browser tabs (or two devices on your network):
the first queues and waits, the second auto-matches and the round begins.

## Deploy to acidsiege.io

The whole thing is one Node app — the domain points at it, and it serves the landing
page, both game modes, and the multiplayer WebSocket from the same origin (so
`wss://acidsiege.io` works automatically; the client picks `wss` on HTTPS).

> Single-player is pure static HTML, but multiplayer needs a Node host that supports
> **WebSockets** (Render, Railway, Fly.io, a VPS — *not* GitHub Pages / plain static hosting).

### Option A — Render (easiest, free tier, free TLS)
1. Push this folder to a GitHub repo.
2. On https://render.com → **New → Web Service** → connect the repo.
   (`render.yaml` is detected automatically; otherwise: Build `npm install`, Start `node server.js`.)
3. After it deploys, go to **Settings → Custom Domains → Add** `acidsiege.io` and `www.acidsiege.io`.
4. At your domain registrar, add the DNS records Render shows you:
   - `acidsiege.io` → the provided `ALIAS`/`A` record
   - `www` → `CNAME` to your `*.onrender.com` host
5. TLS is issued automatically. Done — visit https://acidsiege.io.

### Option B — Docker (Fly.io / Railway / any VPS)
```bash
docker build -t acidsiege .
docker run -p 8080:8080 acidsiege
```
Point your host/reverse proxy at port 8080 (the app reads `PORT` if set). Ensure the proxy
forwards WebSocket upgrade headers (Nginx: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).

## Notes / limits (MVP multiplayer)
- First-come matchmaking (2 players per room); a disconnect ends the match.
- No client-side prediction (placement has one network round-trip of latency — fine on good connections).
- No rate-limiting/auth — fine for a fun public game; harden before any competitive/ranked use.
