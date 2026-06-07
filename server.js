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

// ---- leaderboards: per-name bests, separate single-player & multiplayer (file-backed) ----
const LB_FILE = path.join(__dirname, "leaderboard.json");
let lb = { sp:{}, mp:{} }; try { const j=JSON.parse(fs.readFileSync(LB_FILE,"utf8")); if(j&&j.sp&&j.mp) lb=j; } catch {}
let lbTimer = null;
function persistLB(){ if(lbTimer) return; lbTimer = setTimeout(()=>{ lbTimer=null; fs.writeFile(LB_FILE, JSON.stringify(lb), ()=>{}); }, 800); }
function lbSubmit(scope,name,d){
  if(scope!=="sp"&&scope!=="mp") return; const nm=String(name||"guest").slice(0,16);
  const e=lb[scope][nm]||(lb[scope][nm]={money:0,weapons:0,levels:0,wave:0,wins:0});
  e.money=Math.max(e.money,Math.floor(+d.money||0)); e.weapons=Math.max(e.weapons,d.weapons|0);
  e.levels=Math.max(e.levels,d.levels|0); e.wave=Math.max(e.wave,d.wave|0); e.wins+=(d.winInc|0); persistLB();
}
function lbTop(scope,cat){ const s=lb[scope]||{};
  return Object.keys(s).map(n=>({name:n,value:s[n][cat]||0})).filter(e=>e.value>0).sort((a,b)=>b.value-a.value).slice(0,50); }

// ---- static file server ----
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
               ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".webmanifest":"application/manifest+json" };
const ROUTES = {                              // clean URLs → files
  "/":            "/index.html",
  "/singleplayer":"/modes/singleplayer.html",
  "/play":        "/modes/singleplayer.html",
  "/multiplayer": "/modes/multiplayer.html",
  "/online":      "/modes/multiplayer.html",
  "/world":       "/modes/world.html",
  "/conquer":     "/modes/world.html",
  "/terms":       "/terms.html",
  "/privacy":     "/privacy.html",
  "/license":     "/license.html",
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
  if(url==="/leaderboard"){ const u=new URL(req.url,"http://x");
    const scope=u.searchParams.get("scope")==="mp"?"mp":"sp";
    let cat=u.searchParams.get("cat")||"money"; if(!["money","weapons","levels","wave","wins"].includes(cat)) cat="money";
    res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify(lbTop(scope,cat))); }
  if(url==="/score" && req.method==="POST"){
    let body=""; req.on("data",c=>{ body+=c; if(body.length>2000) req.destroy(); });
    req.on("end",()=>{ try{ const d=JSON.parse(body); lbSubmit(d.scope, d.name, d); }catch{}
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
  constructor(clients, mode, waves){
    this.id = nextRoom++; this.mode=mode; const cfg=MODES[mode];
    stats.matches++; console.log(`[match #${stats.matches}] ${mode} ${waves||"6"}w — ${stats.online} online`);
    this.game = new Game(); this.game.botSide = cfg.bot;
    this.game.maxWaves = (waves===0||waves==="inf") ? Infinity : (+waves||6);   // 6/20/50/100/∞
    this.clients = clients;
    clients.forEach((c,i)=>{ c.room=this; c.side=cfg.sides[i];
      c.send(JSON.stringify({ t:"start", side:c.side, mode, waves:(this.game.maxWaves===Infinity?0:this.game.maxWaves), cols:COLS, rows:ROWS, palette:PALETTE })); });
    this.timer = setInterval(()=>this.tick(), TICK_MS);
  }
  tick(){
    this.game.step();
    if(this.game.botSide>=0) this.game.botStep();
    const msg = JSON.stringify({ t:"state", grid:this.game.rleGrid(), meta:this.game.meta() });
    for(const c of this.clients) if(c.readyState===1) c.send(msg);
    if(this.game.over) clearInterval(this.timer);   // match decided — final state already sent
  }
  resign(side){ this.game.forfeit(side); }          // the resigning side loses; opponent wins
  input(side,m){
    const g=this.game;
    if(m.t==="place"   && Number.isFinite(m.x) && Number.isFinite(m.y)) g.place(side, m.tool|0, m.x|0, m.y|0);
    else if(m.t==="unlock")  g.unlock(side, m.tool|0);
    else if(m.t==="sell")    g.sell(side, m.tool|0);
    else if(m.t==="upgrade") g.upgrade(side, m.what, m.tool|0);
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

// ---- matchmaking (per mode + wave length) ----
const queues = {};   // key "mode|waves" → [clients]
function dequeue(ws){ for(const k in queues){ const i=queues[k].indexOf(ws); if(i>=0) queues[k].splice(i,1); } }
function tryStart(mode,waves){
  const key=mode+"|"+waves, q=queues[key]||(queues[key]=[]), need=MODES[mode].need;
  if(q.length>=need){ new Room(q.splice(0,need), mode, waves); }
  else q.forEach(c=>{ if(c.readyState===1) c.send(JSON.stringify({ t:"waiting", mode, waves, have:q.length, need })); });
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
      const waves = [6,20,50,100,0].includes(m.waves) ? m.waves : 6;   // 0 = infinite
      dequeue(ws); (queues[mode+"|"+waves]||(queues[mode+"|"+waves]=[])).push(ws); tryStart(mode,waves);
    } else if(ws.room){
      if(m.t==="chat") ws.room.broadcastChat(ws.side, m.text);
      else if(m.t==="resign") ws.room.resign(ws.side);
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
