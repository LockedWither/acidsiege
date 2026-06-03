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

// ---- usage stats (in-memory; resets on restart/redeploy) ----
const stats = { pageViews:0, singleplayer:0, multiplayer:0, connections:0, matches:0, online:0, peakOnline:0, since:new Date().toISOString() };

// ---- single-player saves: { clientId -> lastGameState } (file-backed; survives restarts, not redeploys) ----
const SAVE_FILE = path.join(__dirname, "saves.json");
let saves = {}; try { saves = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8")); } catch {}
let saveTimer = null;
function persistSaves(){ if(saveTimer) return; saveTimer = setTimeout(()=>{ saveTimer=null; fs.writeFile(SAVE_FILE, JSON.stringify(saves), ()=>{}); }, 800); }

// ---- leaderboard: best wave per name (file-backed) ----
const LB_FILE = path.join(__dirname, "leaderboard.json");
let lb = []; try { lb = JSON.parse(fs.readFileSync(LB_FILE, "utf8")); } catch {}
let lbTimer = null;
function persistLB(){ if(lbTimer) return; lbTimer = setTimeout(()=>{ lbTimer=null; fs.writeFile(LB_FILE, JSON.stringify(lb), ()=>{}); }, 800); }

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
  if(url==="/stats"){ res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify(stats,null,2)); }
  if(url==="/load"){ const id=new URL(req.url,"http://x").searchParams.get("id");
    res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify((id&&saves[id])||null)); }
  if(url==="/save" && req.method==="POST"){
    let body=""; req.on("data",c=>{ body+=c; if(body.length>200000) req.destroy(); });
    req.on("end",()=>{ try{ const {id,state}=JSON.parse(body);
        if(id){ if(state==null) delete saves[id]; else saves[id]=state; persistSaves(); } }catch{}
      res.writeHead(200,{"Content-Type":"application/json"}); res.end('{"ok":true}'); });
    return;
  }
  if(url==="/leaderboard"){ res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify(lb.slice(0,50))); }
  if(url==="/score" && req.method==="POST"){
    let body=""; req.on("data",c=>{ body+=c; if(body.length>2000) req.destroy(); });
    req.on("end",()=>{ try{ const {name,wave}=JSON.parse(body); const w=Math.floor(+wave||0);
        if(name && w>0){ const nm=String(name).slice(0,16); const ex=lb.find(e=>e.name===nm);
          if(ex){ if(w>ex.wave) ex.wave=w; } else lb.push({name:nm,wave:w});
          lb.sort((a,b)=>b.wave-a.wave); lb=lb.slice(0,100); persistLB(); } }catch{}
      res.writeHead(200,{"Content-Type":"application/json"}); res.end('{"ok":true}'); });
    return;
  }
  if(ROUTES[url]){ stats.pageViews++;                              // count page loads (not assets)
    if(url==="/singleplayer"||url==="/play") stats.singleplayer++;
    if(url==="/multiplayer"||url==="/online") stats.multiplayer++;
    url = ROUTES[url]; }
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
const MODES = {                                // humansNeeded, side assignment, bot side
  "1v1":   { need:2, sides:[0,1],     bot:-1 },
  "2v2":   { need:4, sides:[0,0,1,1], bot:-1 },
  "2v1bot":{ need:2, sides:[0,0],     bot:1  },
};
class Room {
  constructor(clients, mode){
    this.id = nextRoom++; this.mode=mode; const cfg=MODES[mode];
    stats.matches++; console.log(`[match #${stats.matches}] ${mode} — ${stats.online} online`);
    this.game = new Game(); this.game.botSide = cfg.bot;
    this.clients = clients;
    clients.forEach((c,i)=>{ c.room=this; c.side=cfg.sides[i];
      c.send(JSON.stringify({ t:"start", side:c.side, mode, cols:COLS, rows:ROWS, palette:PALETTE })); });
    this.timer = setInterval(()=>this.tick(), TICK_MS);
  }
  tick(){
    this.game.step();
    if(this.game.botSide>=0) this.game.botStep();
    const msg = JSON.stringify({ t:"state", grid:this.game.rleGrid(), meta:this.game.meta() });
    for(const c of this.clients) if(c.readyState===1) c.send(msg);
    if(this.game.over) clearInterval(this.timer);   // match decided at wave 6 — final state already sent
  }
  input(side,m){
    const g=this.game;
    if(m.t==="place"   && Number.isFinite(m.x) && Number.isFinite(m.y)) g.place(side, m.tool|0, m.x|0, m.y|0);
    else if(m.t==="unlock")  g.unlock(side, m.tool|0);
    else if(m.t==="upgrade") g.upgrade(side, m.what);
  }
  broadcastChat(side,text){
    const out = JSON.stringify({ t:"chat", from:"Team "+(side+1), text:String(text).slice(0,140) });
    for(const c of this.clients) if(c.readyState===1) c.send(out);
  }
  close(except){
    clearInterval(this.timer);
    for(const c of this.clients){ if(c!==except && c.readyState===1) c.send(JSON.stringify({ t:"opponentLeft" })); c.room=null; }
  }
}

// ---- matchmaking (per mode) ----
const queues = { "1v1":[], "2v2":[], "2v1bot":[] };
function dequeue(ws){ for(const k in queues){ const i=queues[k].indexOf(ws); if(i>=0) queues[k].splice(i,1); } }
function tryStart(mode){
  const q=queues[mode], need=MODES[mode].need;
  if(q.length>=need){ new Room(q.splice(0,need), mode); }
  else q.forEach(c=>{ if(c.readyState===1) c.send(JSON.stringify({ t:"waiting", mode, have:q.length, need })); });
}
const wss = new WebSocketServer({ server });
wss.on("connection", ws=>{
  ws.room=null; ws.side=-1;
  stats.connections++; stats.online++; if(stats.online>stats.peakOnline) stats.peakOnline=stats.online;
  ws.on("message", buf=>{
    let m; try{ m=JSON.parse(buf); }catch{ return; }
    if(m.t==="queue"){
      if(ws.room) return;
      const mode = MODES[m.mode] ? m.mode : "1v1";
      dequeue(ws); queues[mode].push(ws); tryStart(mode);
    } else if(ws.room){
      if(m.t==="chat") ws.room.broadcastChat(ws.side, m.text);
      else ws.room.input(ws.side, m);
    }
  });
  ws.on("close", ()=>{
    stats.online=Math.max(0,stats.online-1);
    dequeue(ws);
    if(ws.room) ws.room.close(ws);
  });
});

server.listen(PORT, ()=> console.log(`ACID SIEGE running on http://localhost:${PORT}`));
