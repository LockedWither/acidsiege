/* ============================================================
   ACID SIEGE — authoritative multiplayer server
   - serves the static client files
   - matchmakes 2 players into a room
   - runs ONE simulation per room, streams state to both clients
   Run:  npm install && npm start   then open http://localhost:8080
   ============================================================ */
const http = require("http");
const fs   = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { Game, PALETTE, COLS, ROWS } = require("./engine");

const PORT = process.env.PORT || 8080;
const TICK_MS = 33;   // sim + broadcast rate (~30Hz)

// ---- static file server ----
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
               ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".webmanifest":"application/manifest+json" };
const ROUTES = {                              // clean URLs → files
  "/":            "/index.html",
  "/singleplayer":"/modes/singleplayer.html",
  "/play":        "/modes/singleplayer.html",
  "/multiplayer": "/modes/multiplayer.html",
  "/online":      "/modes/multiplayer.html",
};
const server = http.createServer((req,res)=>{
  let url = req.url.split("?")[0];
  if(url==="/healthz"){ res.writeHead(200,{"Content-Type":"text/plain"}); return res.end("ok"); }
  if(url==="/robots.txt"){ res.writeHead(200,{"Content-Type":"text/plain"}); return res.end("User-agent: *\nAllow: /\n"); }
  if(ROUTES[url]) url = ROUTES[url];
  const safe = path.normalize(url).replace(/^(\.\.[/\\])+/,"");
  const file = path.join(__dirname, safe);
  fs.readFile(file,(err,data)=>{
    if(err){ res.writeHead(404,{"Content-Type":"text/html; charset=utf-8"}); return res.end("<h1>404</h1><a href=\"/\">Back to Acid Siege</a>"); }
    const ext = path.extname(file);
    res.writeHead(200,{
      "Content-Type": MIME[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": ext===".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  });
});

// ---- game rooms ----
let nextRoom = 1;
class Room {
  constructor(a,b){
    this.id = nextRoom++;
    this.game = new Game();
    this.clients = [a,b];
    a.room=this; a.side=0; b.room=this; b.side=1;
    a.send(JSON.stringify({ t:"start", side:0, cols:COLS, rows:ROWS, palette:PALETTE }));
    b.send(JSON.stringify({ t:"start", side:1, cols:COLS, rows:ROWS, palette:PALETTE }));
    this.timer = setInterval(()=>this.tick(), TICK_MS);
  }
  tick(){
    this.game.step();
    const msg = JSON.stringify({ t:"state", grid:this.game.rleGrid(), meta:this.game.meta() });
    for(const c of this.clients) if(c.readyState===1) c.send(msg);
  }
  input(side,m){
    const g=this.game;
    if(m.t==="place"   && Number.isFinite(m.x) && Number.isFinite(m.y)) g.place(side, m.tool|0, m.x|0, m.y|0);
    else if(m.t==="unlock")  g.unlock(side, m.tool|0);
    else if(m.t==="upgrade") g.upgrade(side, m.what);
  }
  broadcastChat(side,text){
    const out = JSON.stringify({ t:"chat", from:"P"+(side+1), text:String(text).slice(0,140) });
    for(const c of this.clients) if(c.readyState===1) c.send(out);
  }
  close(except){
    clearInterval(this.timer);
    for(const c of this.clients){ if(c!==except && c.readyState===1) c.send(JSON.stringify({ t:"opponentLeft" })); c.room=null; }
  }
}

// ---- matchmaking ----
let waiting = null;
const wss = new WebSocketServer({ server });
wss.on("connection", ws=>{
  ws.room=null; ws.side=-1;
  ws.on("message", buf=>{
    let m; try{ m=JSON.parse(buf); }catch{ return; }
    if(m.t==="queue"){
      if(ws.room) return;
      if(waiting && waiting!==ws && waiting.readyState===1){ const a=waiting; waiting=null; new Room(a,ws); }
      else { waiting=ws; ws.send(JSON.stringify({ t:"waiting" })); }
    } else if(ws.room){
      if(m.t==="chat") ws.room.broadcastChat(ws.side, m.text);
      else ws.room.input(ws.side, m);
    }
  });
  ws.on("close", ()=>{
    if(waiting===ws) waiting=null;
    if(ws.room) ws.room.close(ws);
  });
});

server.listen(PORT, ()=> console.log(`ACID SIEGE running on http://localhost:${PORT}`));
