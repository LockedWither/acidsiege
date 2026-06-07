/* ============================================================
   ACID SIEGE — headless engine (authoritative server side)
   2-player: left city = player 0, right city = player 1.
   Damaging a city credits coins to its OPPONENT. Original CA;
   ported from the single-player prototype, DOM/render stripped.
   ============================================================ */

const EMPTY=0, SAND=1, WATER=2, ACID=3, FIRE=4, WOOD=5, TNT=6, WALL=7,
      CITY=8, SMOKE=9, STEAM=10, OIL=11, STONE=12, GLASS=13, LAVA=14,
      PLASMA=15, PCITY=16, MAGMA=17, NAPALM=18, NUKE=19, HBOMB=20,
      ANTIMATTER=21, VIRUS=22, NEW_BASE=23;

const COLS=180, ROWS=112;
const FLOOR_Y=ROWS-1, CITY_THICK=18, GAP=10;
const MID=(COLS/2)|0, P_END=MID-GAP/2, E_START=MID+GAP/2;
const CEIL_Y=FLOOR_Y-45;
const RAZE_RATIO=0.10;
function coinReward(w){ return 4; }   // flat base 4

const BASE_HP={ [SAND]:2,[GLASS]:4,[WOOD]:6,[STONE]:12,[CITY]:8,[PCITY]:8 };
const DMG    ={ [ACID]:4,[FIRE]:2,[NAPALM]:3,[VIRUS]:2,[LAVA]:5,[MAGMA]:8,[PLASMA]:12,[ANTIMATTER]:4000 };
function cityProt(L){ const a=0.02*(L-1)*(L-1)*(L-1); const e=L>40?L-40:0; return Math.round(a + 0.18*e*e*e); }   // faster protection growth; ramps hard past lv40
function coinLevelMult(L){ const m=Math.min(L,200), c=1+0.045*Math.pow(m-1,1.1); return L>200 ? c+(L-200)*0.05 : c; }   // climbs to ~lv200 then nearly flat — money slows late game
function genSkyline(arr,x0,x1){   // arr[x] = top row of building (lower = taller); skyscraper silhouette
  const base=FLOOR_Y-CITY_THICK; let x=x0;
  while(x<x1){ const w=3+(rnd()*9|0);
    let ty = rnd()<0.42 ? base-(6+(rnd()*22|0)) : base+(rnd()*4|0);
    ty=Math.max(CEIL_Y, Math.min(FLOOR_Y-4, ty));
    for(let k=0;k<w&&x<x1;k++,x++) arr[x]=ty; }
}

// one-time unlock palette (shared with client UI)
const PALETTE=[
  {t:ACID,nm:"Acid",col:"#8ef02a",cost:0},   {t:WATER,nm:"Water",col:"#367bd4",cost:0},
  {t:SAND,nm:"Sand",col:"#d9c17a",cost:0},   {t:WOOD,nm:"Wood",col:"#7a4a23",cost:40},
  {t:OIL,nm:"Oil",col:"#3a2820",cost:60},    {t:GLASS,nm:"Glass",col:"#bce3ec",cost:70},
  {t:STONE,nm:"Stone",col:"#6e6c68",cost:80},{t:FIRE,nm:"Fire",col:"#ff6a1e",cost:100},
  {t:TNT,nm:"TNT",col:"#e23a3a",cost:100000}, {t:LAVA,nm:"Lava",col:"#ff5a14",cost:500},
  {t:MAGMA,nm:"Magma",col:"#ff9a2a",cost:1500},{t:NAPALM,nm:"Napalm",col:"#ff8a1e",cost:2000},
  {t:PLASMA,nm:"Plasma",col:"#c47cff",cost:1200},{t:VIRUS,nm:"Virus",col:"#b428b4",cost:12000},
  {t:NUKE,nm:"Nuke",col:"#6c8030",cost:1000000},{t:HBOMB,nm:"H-Bomb",col:"#46505c",cost:1500000},
  {t:ANTIMATTER,nm:"Antimatter",col:"#7a00c8",cost:2000000},
  {t:PCITY,nm:"City Block",col:"#3ec46b",cost:800},{t:EMPTY,nm:"Eraser",col:"#3a4a52",cost:0},
];
const NEWDEFS=[
  {nm:"Thermite",col:"#ffb24a",kind:"goo",dmg:60,cost:150000},
  {nm:"Caustic Wave",col:"#9cff5a",kind:"goo",dmg:90,cost:250000},
  {nm:"Cluster Bomb",col:"#c8d24a",kind:"blast",dmg:2500,r:22,fp:0.6,cost:300000},
  {nm:"Daisy Cutter",col:"#e0a832",kind:"blast",dmg:5000,r:26,fp:0.65,cost:600000},
  {nm:"Bunker Buster",col:"#9a7a3a",kind:"blast",dmg:10000,r:24,fp:0.5,cost:1200000},
  {nm:"Fuel-Air Bomb",col:"#ff7e3a",kind:"blast",dmg:20000,r:30,fp:0.75,cost:2000000},
  {nm:"Neutron Bomb",col:"#aef0c0",kind:"beam",dmg:40000,cost:3500000},
  {nm:"Sulfur Deluge",col:"#d8d24a",kind:"goo",dmg:120,cost:4500000},
  {nm:"Mercury Flood",col:"#c0c8d0",kind:"goo",dmg:240,cost:5500000},
  {nm:"Cobalt Bomb",col:"#5a8fd0",kind:"blast",dmg:80000,r:32,fp:0.7,cost:6000000},
  {nm:"Gamma Burst",col:"#b6ff7a",kind:"beam",dmg:120000,cost:8000000},
  {nm:"Tsar Bomba",col:"#ff5a2a",kind:"blast",dmg:160000,r:38,fp:0.8,cost:10000000},
  {nm:"Plasma Cannon",col:"#c47cff",kind:"beam",dmg:350000,cost:16000000},
  {nm:"Rail Mortar",col:"#8fbfff",kind:"blast",dmg:500000,r:30,fp:0.6,cost:20000000},
  {nm:"Corrosive Tide",col:"#7affc0",kind:"goo",dmg:700,cost:22000000},
  {nm:"Railgun Slug",col:"#9fd8ff",kind:"blast",dmg:700000,r:28,fp:0.4,cost:25000000},
  {nm:"Ion Storm",col:"#7ce0ff",kind:"beam",dmg:1500000,cost:38000000},
  {nm:"Void Lance",col:"#6a4aff",kind:"anti",dmg:2500000,cost:46000000},
  {nm:"Black Hole",col:"#3a2a5a",kind:"anti",dmg:4000000,cost:55000000},
  {nm:"Quicksilver Sea",col:"#aeb6c4",kind:"goo",dmg:1600,cost:65000000},
  {nm:"Singularity",col:"#5a2a7a",kind:"anti",dmg:9000000,cost:75000000},
  {nm:"Meteor Strike",col:"#ff9a5a",kind:"blast",dmg:13000000,r:40,fp:0.8,cost:88000000},
  {nm:"Nova Charge",col:"#ffd24a",kind:"blast",dmg:18000000,r:42,fp:0.85,cost:100000000},
  {nm:"Supernova",col:"#ffe88a",kind:"blast",dmg:40000000,r:46,fp:0.9,cost:130000000},
  {nm:"Quark Bomb",col:"#ff4ad2",kind:"anti",dmg:90000000,cost:160000000},
  {nm:"Neutronium Slug",col:"#cfe0ff",kind:"blast",dmg:140000000,r:34,fp:0.5,cost:172000000},
  {nm:"Strangelet",col:"#b04aff",kind:"anti",dmg:200000000,cost:185000000},
  {nm:"Dark Matter Bomb",col:"#2a1840",kind:"blast",dmg:450000000,r:24,fp:0.85,cost:200000000},
  {nm:"Vacuum Decay",col:"#d0c0ff",kind:"beam",dmg:900000000,cost:225000000},
  {nm:"Annihilation Core",col:"#ffffff",kind:"anti",dmg:2000000000,cost:250000000},
  {nm:"Plasma Tempest",col:"#c47cff",kind:"beam",dmg:3000000000,cost:400000000},
  {nm:"Acid Monsoon",col:"#9cff5a",kind:"goo",dmg:4000000000,cost:600000000},
  {nm:"Bunker Nuke",col:"#9a7a3a",kind:"blast",dmg:5500000000,r:24,fp:0.7,cost:900000000},
  {nm:"Antiproton Beam",col:"#7ce0ff",kind:"beam",dmg:7000000000,cost:1400000000},
  {nm:"Graviton Bomb",col:"#5a4a8a",kind:"blast",dmg:9000000000,r:26,fp:0.75,cost:2000000000},
  {nm:"Dark Pulse",col:"#2a1840",kind:"anti",dmg:12000000000,cost:3000000000},
  {nm:"Fusion Lance",col:"#9fd8ff",kind:"beam",dmg:16000000000,cost:4500000000},
  {nm:"Magma Surge",col:"#ff7e3a",kind:"goo",dmg:20000000000,cost:7000000000},
  {nm:"Photon Nova",col:"#ffe88a",kind:"blast",dmg:27000000000,r:24,fp:0.8,cost:10000000000},
  {nm:"Tachyon Burst",col:"#7affe0",kind:"beam",dmg:35000000000,cost:15000000000},
  {nm:"Neutron Star Shard",col:"#cfe0ff",kind:"blast",dmg:45000000000,r:22,fp:0.6,cost:22000000000},
  {nm:"Void Collapse",col:"#3a2a5a",kind:"anti",dmg:60000000000,cost:33000000000},
  {nm:"Solar Flare",col:"#ffb24a",kind:"beam",dmg:80000000000,cost:50000000000},
  {nm:"Plasmoid Swarm",col:"#d27aff",kind:"beam",dmg:100000000000,cost:75000000000},
  {nm:"Hypernova",col:"#fff0b0",kind:"blast",dmg:130000000000,r:24,fp:0.85,cost:110000000000},
  {nm:"Gamma Ray Burst",col:"#b6ff7a",kind:"beam",dmg:170000000000,cost:170000000000},
  {nm:"Strange Matter",col:"#b04aff",kind:"anti",dmg:220000000000,cost:250000000000},
  {nm:"Quasar Cannon",col:"#7cc0ff",kind:"beam",dmg:280000000000,cost:380000000000},
  {nm:"Big Rip",col:"#1a1030",kind:"anti",dmg:350000000000,cost:580000000000},
  {nm:"Entropy Wave",col:"#5a2a7a",kind:"anti",dmg:430000000000,cost:880000000000},
  {nm:"Cosmic String",col:"#d0c0ff",kind:"beam",dmg:500000000000,cost:1300000000000},
  {nm:"Reality Tear",col:"#ff4ad2",kind:"anti",dmg:550000000000,cost:2000000000000},
  {nm:"Doomsday Glitch",col:"#ff5a5a",kind:"blast",dmg:600000000000,r:24,fp:0.9,cost:3000000000000},
  {nm:"Eternity Engine",col:"#aef0ff",kind:"beam",dmg:650000000000,cost:5000000000000},
  {nm:"Omega Singularity",col:"#ffffff",kind:"anti",dmg:700000000000,cost:10000000000000},
];
const DEFBYID={}, ORIG=NEWDEFS.length-25;
NEWDEFS.forEach((d,k)=>{ d.id=NEW_BASE+k;
  const f=0.1 + 1.4*Math.pow(k/(NEWDEFS.length-1), 2);                    // early tiers nerfed, newer tiers hit FAR harder
  d.dmg=Math.round(d.dmg*f);
  if(d.r) d.r=Math.min(45, Math.round(d.r*2));                            // blast tiers → city-sized radius
  let cost = k<ORIG ? 150000*Math.pow(1e13/150000, k/(ORIG-1)) : 1e13*Math.pow(100,(k-ORIG+1)/25);   // originals 150k→10T · new 10T→1Q
  const mag=Math.pow(10,Math.floor(Math.log10(cost))-2); d.cost=Math.round(cost/mag)*mag;
  DEFBYID[d.id]=d; PALETTE.splice(PALETTE.length-2,0,{t:d.id,nm:d.nm,col:d.col,cost:d.cost}); });

const brushCosts=[200,500,1000,2500,6000,14000,32000,70000,160000,360000,800000,1800000,4000000,9000000,20000000,45000000,100000000,220000000,480000000,1050000000,2300000000,5000000000,11000000000,24000000000,52000000000,110000000000,240000000000,520000000000,1100000000000];  // 29 tiers → brush up to 30
function upCost(L){ return Math.round(400*Math.pow(L,1.6)); }
const TIER_MULT=[1,1.3,1.7,2.2];   // weapon upgrade damage tiers I/II/III
const rnd=Math.random;   // authoritative single sim — no determinism needed

const isGas    = t => t===SMOKE||t===STEAM;
const isLiquid = t => t===WATER||t===ACID||t===OIL||t===LAVA||t===MAGMA||t===NAPALM||t===ANTIMATTER;
const isHeat   = t => t===FIRE||t===LAVA||t===MAGMA||t===PLASMA||t===NAPALM;
const powderPass = t => t===EMPTY||isLiquid(t)||isGas(t);
const liquidPass = t => t===EMPTY||isGas(t);
const solidPass  = t => t===EMPTY||isGas(t)||isLiquid(t);

class Game {
  constructor(){
    this.grid=new Uint8Array(COLS*ROWS);
    this.health=new Float32Array(COLS*ROWS);
    this.moved=new Uint8Array(COLS*ROWS);
    this.skyP=new Int16Array(COLS); this.skyE=new Int16Array(COLS);
    this.round=1; this.wave=1; this.scores=[0,0];
    // players: 0 = left (PCITY), 1 = right (CITY)
    this.players=[this.newPlayer(),this.newPlayer()];
    this.cells=[1,1]; this.max=[1,1]; this.over=false; this.winner=-1;
    this.botSide=-1; this.botTimer=0;   // set by server for 2v1bot mode
    this.maxWaves=6;                    // set by server: 6/20/50/100/Infinity
    this.buildCities();
  }
  forfeit(side){ if(this.over) return; this.over=true; this.winner = side^1; }   // resign → opponent wins
  // ---- extreme bot (drives one side in 2v1bot mode) ----
  botInterval(){ return Math.max(5, 24 - this.wave*3); }   // very aggressive, speeds up each wave
  botPick(){ const r=rnd(), w=this.wave;
    if(w>=4 && r<0.16) return ANTIMATTER;
    if(w>=3 && r<0.40) return PLASMA;
    if(w>=2 && r<0.62) return MAGMA;
    if(r<0.82) return LAVA; return ACID; }
  botStep(){
    if(this.botSide<0 || this.over) return;
    if(++this.botTimer < this.botInterval()) return;
    this.botTimer=0;
    const foe=this.botSide^1;                               // attack the human team's city
    const cityT=foe===0?PCITY:CITY, sky=foe===0?this.skyP:this.skyE;
    const x0=foe===0?2:E_START+2, x1=foe===0?P_END-2:COLS-2;
    let best=-1,bs=-1;
    for(let x=x0;x<x1;x++){ let s=0; for(let y=FLOOR_Y-CITY_THICK;y<FLOOR_Y;y++) if(this.grid[this.I(x,y)]===cityT) s++; s+=rnd()*4; if(s>bs){bs=s;best=x;} }
    if(best<0) best=(x0+x1)>>1;
    const el=this.botPick(), br=3, surf=sky[best];
    for(let dy=-br;dy<=br;dy++)for(let dx=-br;dx<=br;dx++){ if(dx*dx+dy*dy>br*br)continue;
      const nx=best+dx, ny=surf+dy; if(!this.inB(nx,ny))continue; const j=this.I(nx,ny);
      if(this.grid[j]===EMPTY||isGas(this.grid[j])) this.grid[j]=el; }
  }
  newPlayer(){ return { coins:300, level:1, brush:2, unlocked:new Set([ACID,WATER,SAND,EMPTY]), upg:{} }; }
  I(x,y){ return y*COLS+x; }
  inB(x,y){ return x>=0&&x<COLS&&y>=0&&y<ROWS; }

  buildCities(){
    const g=this.grid,h=this.health;
    for(let i=0;i<g.length;i++){ g[i]=EMPTY; h[i]=0; }
    for(let x=0;x<COLS;x++) g[this.I(x,FLOOR_Y)]=WALL;
    genSkyline(this.skyP,0,P_END); genSkyline(this.skyE,E_START,COLS);
    const php=BASE_HP[PCITY]+cityProt(this.players[0].level);
    const ehp=BASE_HP[CITY]+cityProt(this.players[1].level);
    let pc=0,ec=0;
    for(let x=0;x<P_END;x++)for(let y=this.skyP[x];y<FLOOR_Y;y++){ const i=this.I(x,y); g[i]=PCITY; h[i]=php; pc++; }
    for(let x=E_START;x<COLS;x++)for(let y=this.skyE[x];y<FLOOR_Y;y++){ const i=this.I(x,y); g[i]=CITY; h[i]=ehp; ec++; }
    this.cells=[pc,ec]; this.max=[pc,ec];
  }

  // ---- economy / rounds ----
  protOf(i){ const t=this.grid[i]; return t===PCITY?cityProt(this.players[0].level): t===CITY?cityProt(this.players[1].level):0; }
  hurtCity(owner){ // a cell of `owner`'s city died → opponent earns, check raze
    this.cells[owner]--; const foe=owner^1;
    const wStep=Math.floor((this.wave-1)/5)*5+1;                  // reward steps every 5 waves
    this.players[foe].coins += coinReward(wStep)*wStep*coinLevelMult(this.players[foe].level);   // boosted by attacker's level

    if(this.cells[owner]/this.max[owner] <= RAZE_RATIO) this.razed(owner);
  }
  razed(owner){ // owner's city destroyed → opponent wins the round
    if(this.over) return;
    const foe=owner^1; this.scores[foe]++;
    if(this.wave>=this.maxWaves){ // match ends at the wave cap — higher score wins (-1 = draw)
      this.over=true;
      this.winner = this.scores[0]===this.scores[1] ? -1 : (this.scores[0]>this.scores[1]?0:1);
      return;
    }
    this.round++; this.wave++;
    this.players.forEach(p=>p.coins += 200*this.wave);
    this.buildCities();
  }

  // ---- damage model (per-cell HP + flat protection minuser, overkill spills) ----
  applyDamage(i,dmg,deathType){
    const t=this.grid[i], base=BASE_HP[t]; if(base===undefined) return;
    const prot=this.protOf(i); const eff=dmg-prot; if(eff<=0) return;
    const hp=this.health[i]>0?this.health[i]:base+prot;
    if(hp>eff){ this.health[i]=hp-eff; return; }
    const leftover=eff-hp;
    if(t===PCITY) this.hurtCity(0); else if(t===CITY) this.hurtCity(1);
    if(deathType===undefined||deathType===EMPTY){ this.grid[i]=EMPTY; this.health[i]=0; }
    else { this.grid[i]=deathType; this.health[i]=BASE_HP[deathType]||0; }
    this.moved[i]=1;
    if(leftover>0) this.spread(i,leftover,deathType);
  }
  spread(i,dmg,dt){ const x=i%COLS,y=(i/COLS)|0;
    for(const [nx,ny] of [[x,y+1],[x-1,y],[x+1,y],[x,y-1]]){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny);
      if(BASE_HP[this.grid[j]]!==undefined){ this.applyDamage(j,dmg,dt); return; } } }

  // weapon-upgrade multiplier, attributed by which side's city is being hit (cities are side-specific)
  tmul(tj,t){ if(t==null) return 1; const u=tj===CITY?this.players[0].upg:tj===PCITY?this.players[1].upg:null; return u?TIER_MULT[u[t]||0]:1; }
  explodeR(cx,cy,R,fp,dmg,wid){ const g=this.grid;
    for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){ if(dx*dx+dy*dy>R*R)continue;
      const x=cx+dx,y=cy+dy; if(!this.inB(x,y)||y===FLOOR_Y)continue; const j=this.I(x,y),tj=g[j];
      if(tj===WALL||tj===TNT||tj===NUKE||tj===HBOMB)continue;
      if(BASE_HP[tj]!==undefined){ this.applyDamage(j,dmg*this.tmul(tj,wid)); continue; }
      if(rnd()<fp){ g[j]=FIRE; } else { g[j]=EMPTY; } this.moved[j]=1; } }
  detonate(x,y,t){ if(t===HBOMB)this.explodeR(x,y,46,0.45,350,t); else if(t===NUKE)this.explodeR(x,y,42,0.40,120,t); else this.explodeR(x,y,20,0.30,25,t); }   // city-sized radius, low damage

  swap(i,j){ const g=this.grid,h=this.health; const t=g[i],hh=h[i]; g[i]=g[j];h[i]=h[j]; g[j]=t;h[j]=hh; this.moved[i]=1;this.moved[j]=1; }

  // ---- movement helpers ----
  mSand(x,y,i){ const g=this.grid; if(y+1<ROWS){const d=this.I(x,y+1); if(powderPass(g[d])&&g[d]!==SAND){this.swap(i,d);return;}}
    const dir=rnd()<0.5?-1:1; for(const k of [dir,-dir]){const nx=x+k; if(!this.inB(nx,y+1))continue; const dd=this.I(nx,y+1); if(powderPass(g[dd])){this.swap(i,dd);return;}} }
  mSolid(x,y,i){ const g=this.grid; if(y+1<ROWS){const d=this.I(x,y+1); if(solidPass(g[d])){this.swap(i,d);return;}} }
  mLiquid(x,y,i){ const g=this.grid; if(y+1<ROWS){const d=this.I(x,y+1); if(liquidPass(g[d])){this.swap(i,d);return;}}
    const dir=rnd()<0.5?-1:1;
    for(const k of [dir,-dir]){const nx=x+k; if(!this.inB(nx,y+1))continue; const dd=this.I(nx,y+1); if(liquidPass(g[dd])){this.swap(i,dd);return;}}
    for(const k of [dir,-dir]){const nx=x+k; if(!this.inB(nx,y))continue; const s=this.I(nx,y); if(liquidPass(g[s])){this.swap(i,s);return;}} }
  mGas(x,y,i){ const g=this.grid; if(rnd()<0.05){g[i]=EMPTY;this.health[i]=0;this.moved[i]=1;return;}
    if(y>0){const u=this.I(x,y-1); if(g[u]===EMPTY){this.swap(i,u);return;}}
    const dir=rnd()<0.5?-1:1; for(const k of [dir,-dir]){const nx=x+k; if(!this.inB(nx,y-1))continue; const uu=this.I(nx,y-1); if(g[uu]===EMPTY){this.swap(i,uu);return;}} }

  step(){
    const g=this.grid; this.moved.fill(0);
    for(let y=ROWS-1;y>=0;y--){ const ltr=(y&1)===0;
      for(let xi=0;xi<COLS;xi++){ const x=ltr?xi:COLS-1-xi; const i=this.I(x,y); if(this.moved[i])continue;
        const t=g[i];
        switch(t){
          case SAND: this.mSand(x,y,i); break;
          case WATER: this.sWater(x,y,i); break;
          case ACID: this.sAcid(x,y,i); break;
          case OIL: this.sOil(x,y,i); break;
          case LAVA: this.sLava(x,y,i); break;
          case PLASMA: this.sPlasma(x,y,i); break;
          case FIRE: this.sFire(x,y,i); break;
          case TNT:   if(y+1<ROWS&&solidPass(g[this.I(x,y+1)])){this.swap(i,this.I(x,y+1));} else { this.detonate(x,y,TNT);  g[i]=EMPTY;this.health[i]=0;this.moved[i]=1; } break;   // explode on impact, then consumed
          case NUKE:  if(y+1<ROWS&&solidPass(g[this.I(x,y+1)])){this.swap(i,this.I(x,y+1));} else { this.detonate(x,y,NUKE); g[i]=EMPTY;this.health[i]=0;this.moved[i]=1; } break;
          case HBOMB: if(y+1<ROWS&&solidPass(g[this.I(x,y+1)])){this.swap(i,this.I(x,y+1));} else { this.detonate(x,y,HBOMB);g[i]=EMPTY;this.health[i]=0;this.moved[i]=1; } break;
          case MAGMA: this.sMagma(x,y,i); break;
          case NAPALM: this.sNapalm(x,y,i); break;
          case ANTIMATTER: this.sAnti(x,y,i); break;
          case VIRUS: this.sVirus(x,y,i); break;
          case WOOD: case STONE: case GLASS: this.mSolid(x,y,i); break;
          case SMOKE: case STEAM: this.mGas(x,y,i); break;
          default: if(t>=NEW_BASE) this.sNew(x,y,i); break;
        }
      }
    }
  }
  nearHeat(x,y){ const g=this.grid,I=this.I.bind(this);
    return (x>0&&isHeat(g[I(x-1,y)]))||(x<COLS-1&&isHeat(g[I(x+1,y)]))||(y>0&&isHeat(g[I(x,y-1)]))||(y<ROWS-1&&isHeat(g[I(x,y+1)])); }

  ns4(x,y){ return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]; }

  sWater(x,y,i){ const g=this.grid; for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if(tj===FIRE){ g[j]=STEAM; this.moved[j]=1; } else if(tj===LAVA){ g[j]=STONE; this.health[j]=0; this.moved[j]=1; g[i]=STEAM; this.moved[i]=1; return; } }
    this.mLiquid(x,y,i); }
  sOil(x,y,i){ const g=this.grid; for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const tj=g[this.I(nx,ny)];
      if((tj===FIRE||tj===LAVA||tj===PLASMA)&&rnd()<0.35){ g[i]=FIRE; this.moved[i]=1; return; } } this.mLiquid(x,y,i); }
  sAcid(x,y,i){ const g=this.grid; const T=[]; if(y+1<ROWS)T.push([x,y+1]); if(x>0)T.push([x-1,y]); if(x<COLS-1)T.push([x+1,y]); if(y>0)T.push([x,y-1]);
    for(const [nx,ny] of T){ const j=this.I(nx,ny),tj=g[j];
      if(tj===TNT||tj===NUKE||tj===HBOMB){ this.detonate(nx,ny,tj); g[i]=EMPTY;this.moved[i]=1; return; }
      if(BASE_HP[tj]!==undefined){ this.applyDamage(j,DMG[ACID]*this.tmul(tj,ACID)); g[i]=EMPTY;this.moved[i]=1; return; } }
    this.mLiquid(x,y,i); }
  sLava(x,y,i){ const g=this.grid; for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if((tj===WOOD||tj===OIL)&&rnd()<0.3){ g[j]=FIRE; this.moved[j]=1; }
      else if(tj===CITY||tj===PCITY||tj===GLASS){ this.applyDamage(j,DMG[LAVA]*this.tmul(tj,LAVA)); }
      else if(tj===WATER){ g[i]=STONE;this.health[i]=0;this.moved[i]=1; g[j]=STEAM;this.moved[j]=1; return; }
      else if(tj===TNT){ this.detonate(nx,ny,TNT); } } this.mLiquid(x,y,i); }
  sPlasma(x,y,i){ const g=this.grid; for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if(BASE_HP[tj]!==undefined){ this.applyDamage(j,DMG[PLASMA]*this.tmul(tj,PLASMA)); } else if(tj===TNT){ this.detonate(nx,ny,TNT); } }
    if(rnd()<0.18){ g[i]=EMPTY;this.health[i]=0;this.moved[i]=1; return; }
    if(y>0){const u=this.I(x,y-1); if(g[u]===EMPTY||isGas(g[u])){this.swap(i,u);return;}}
    const dir=rnd()<0.5?-1:1; for(const k of [dir,-dir]){const nx=x+k; if(!this.inB(nx,y))continue; const s=this.I(nx,y); if(g[s]===EMPTY){this.swap(i,s);return;}} }
  sFire(x,y,i){ const g=this.grid; for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if((tj===WOOD||tj===OIL)&&rnd()<0.3){ g[j]=FIRE; this.moved[j]=1; }
      else if(tj===CITY||tj===PCITY){ if(rnd()<0.4) this.applyDamage(j,DMG[FIRE]*this.tmul(tj,FIRE)); }
      else if(tj===SAND&&rnd()<0.06){ g[j]=GLASS; this.moved[j]=1; }
      else if(tj===TNT){ this.detonate(nx,ny,TNT); } }
    if(rnd()<0.12){ g[i]=rnd()<0.5?SMOKE:EMPTY; if(g[i]===EMPTY)this.health[i]=0; this.moved[i]=1; return; }
    if(y>0){const u=this.I(x,y-1); if(g[u]===EMPTY&&rnd()<0.5)this.swap(i,u);} }
  sMagma(x,y,i){ const g=this.grid;
    if(y>0&&rnd()<0.05){const u=this.I(x,y-1); if(g[u]===EMPTY){g[u]=FIRE;this.moved[u]=1;}}
    for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if((tj===WOOD||tj===OIL||tj===NAPALM)&&rnd()<0.5){ g[j]=FIRE; this.moved[j]=1; }
      else if(tj===CITY||tj===PCITY){ this.applyDamage(j,DMG[MAGMA]*this.tmul(tj,MAGMA)); }
      else if(tj===WATER){ g[i]=STONE;this.health[i]=0;this.moved[i]=1; g[j]=STEAM;this.moved[j]=1; return; }
      else if((tj===SAND||tj===GLASS||tj===STONE)&&rnd()<0.06){ g[j]=MAGMA;this.health[j]=0;this.moved[j]=1; } }
    if(rnd()<0.008){ g[i]=STONE;this.health[i]=0;this.moved[i]=1; return; }
    if(rnd()<0.6) this.mLiquid(x,y,i); }
  sNapalm(x,y,i){ const g=this.grid; for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if((tj===WOOD||tj===OIL)&&rnd()<0.45){ g[j]=FIRE; this.moved[j]=1; }
      else if(tj===CITY||tj===PCITY){ if(rnd()<0.5) this.applyDamage(j,DMG[NAPALM]*this.tmul(tj,NAPALM)); }
      else if(tj===TNT||tj===NUKE||tj===HBOMB){ this.detonate(nx,ny,tj); } }
    if(y>0&&rnd()<0.07){const u=this.I(x,y-1); if(g[u]===EMPTY){g[u]=FIRE;this.moved[u]=1;}}
    if(rnd()<0.012){ g[i]=rnd()<0.5?SMOKE:EMPTY; if(g[i]===EMPTY)this.health[i]=0; this.moved[i]=1; return; }
    this.mLiquid(x,y,i); }
  sAnti(x,y,i){ const g=this.grid; for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if(tj===EMPTY||tj===WALL||tj===ANTIMATTER||isGas(tj))continue;
      if(BASE_HP[tj]!==undefined){ this.applyDamage(j,DMG[ANTIMATTER]*this.tmul(tj,ANTIMATTER)); } else { g[j]=EMPTY;this.health[j]=0;this.moved[j]=1; }
      if(rnd()<0.55){ const flash=rnd()<0.3; g[i]=flash?PLASMA:EMPTY; if(!flash)this.health[i]=0; this.moved[i]=1; return; } }
    this.mLiquid(x,y,i); }
  sVirus(x,y,i){ const g=this.grid; for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if(tj===CITY||tj===PCITY){ if(rnd()<0.5) this.applyDamage(j,DMG[VIRUS]*this.tmul(tj,VIRUS),VIRUS); }
      else if((tj===WOOD||tj===SAND||tj===STONE||tj===GLASS)&&rnd()<0.04){ this.applyDamage(j,DMG[VIRUS]*this.tmul(tj,VIRUS),VIRUS); } }
    if(rnd()<0.04){ g[i]=EMPTY;this.health[i]=0;this.moved[i]=1; return; } this.mSolid(x,y,i); }
  sNew(x,y,i){ const g=this.grid; const d=DEFBYID[g[i]];
    if(d.kind==="blast"){ if(y+1<ROWS){ const dd=this.I(x,y+1); if(solidPass(g[dd])){ this.swap(i,dd); return; } } this.explodeR(x,y,d.r,d.fp,d.dmg,d.id); g[i]=EMPTY;this.health[i]=0;this.moved[i]=1; return; }   // explode on impact, then consumed
    for(const [nx,ny] of this.ns4(x,y)){ if(!this.inB(nx,ny))continue; const j=this.I(nx,ny),tj=g[j];
      if(BASE_HP[tj]!==undefined){ this.applyDamage(j,d.dmg*this.tmul(tj,d.id)); }
      else if(tj===TNT||tj===NUKE||tj===HBOMB){ this.detonate(nx,ny,tj); }
      else if(d.kind==="anti"&&tj!==EMPTY&&tj!==WALL&&tj!==g[i]&&!isGas(tj)){ g[j]=EMPTY;this.health[j]=0;this.moved[j]=1; } }
    if(d.kind==="beam"){ if(rnd()<0.14){g[i]=EMPTY;this.health[i]=0;this.moved[i]=1;return;}
      if(y>0){const u=this.I(x,y-1); if(g[u]===EMPTY||isGas(g[u])){this.swap(i,u);return;}} return; }
    if(d.kind==="anti"&&rnd()<0.35){ const flash=rnd()<0.3; g[i]=flash?PLASMA:EMPTY; if(!flash)this.health[i]=0; this.moved[i]=1; return; }
    this.mLiquid(x,y,i); }

  // ---- inputs (validated, authoritative) ----
  canBuildCity(owner,x,y){ // each player builds only on their own side, below the ceiling
    if(y<CEIL_Y||y>=FLOOR_Y) return false;
    return owner===0 ? x<P_END : x>=E_START;
  }
  place(owner,tool,gx,gy){
    const p=this.players[owner]; if(tool!==EMPTY && !p.unlocked.has(tool)) return;
    const r=p.brush, g=this.grid;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){ if(dx*dx+dy*dy>r*r)continue;
      const x=gx+dx,y=gy+dy; if(!this.inB(x,y)||y===FLOOR_Y)continue; const i=this.I(x,y),t=g[i];
      if(tool===EMPTY){ if(t!==CITY&&t!==PCITY&&t!==WALL){ g[i]=EMPTY; this.health[i]=0; } }
      else if(tool===PCITY){ if(this.canBuildCity(owner,x,y)&&(t===EMPTY||isGas(t))){
          const ct=owner===0?PCITY:CITY; g[i]=ct; this.health[i]=BASE_HP[ct]+cityProt(p.level);
          this.cells[owner]++; this.max[owner]++; } }
      else if(t===EMPTY||isGas(t)){ g[i]=tool; }
    }
  }
  unlock(owner,tool){ const p=this.players[owner]; const it=PALETTE.find(e=>e.t===tool);
    if(!it||p.unlocked.has(tool)) return; if(p.coins>=it.cost){ p.coins-=it.cost; p.unlocked.add(tool); } }
  sell(owner,tool){ const p=this.players[owner]; const it=PALETTE.find(e=>e.t===tool);
    if(!it||it.cost<=0||!p.unlocked.has(tool)) return; p.coins+=it.cost; p.unlocked.delete(tool); }   // 100% refund (anti-softlock only)
  upgrade(owner,what,tool){ const p=this.players[owner];
    if(what==="level"){ const c=upCost(p.level); if(p.coins>=c){ p.coins-=c; const before=cityProt(p.level); p.level++; const add=cityProt(p.level)-before;
      if(add>0){ const ct=owner===0?PCITY:CITY; for(let i=0;i<this.grid.length;i++) if(this.grid[i]===ct) this.health[i]=(this.health[i]>0?this.health[i]:BASE_HP[ct]+before)+add; } } }
    else if(what==="brush"){ if(p.brush<30){ const cost=brushCosts[p.brush-2]; if(cost!=null && p.coins>=cost){ p.coins-=cost; p.brush++; } } }
    else if(what==="weapon"){ const it=PALETTE.find(e=>e.t===tool); if(!it) return; const cur=p.upg[tool]||0; if(cur>=3) return;
      const unit=Math.max(1500,(it.cost||0)*0.5), cost=Math.round(unit*[0,1,3,7][cur+1]);
      if(p.coins>=cost){ p.coins-=cost; p.upg[tool]=cur+1; } }
  }

  // ---- serialization for broadcast ----
  rleGrid(){ const g=this.grid, out=[]; let v=g[0],c=1;
    for(let i=1;i<g.length;i++){ if(g[i]===v&&c<65535){ c++; } else { out.push(v,c); v=g[i]; c=1; } } out.push(v,c); return out; }
  meta(){ return { round:this.round, wave:this.wave, maxWaves:(this.maxWaves===Infinity?0:this.maxWaves), scores:this.scores, over:this.over, winner:this.winner,
    players:this.players.map((p,k)=>({ coins:Math.floor(p.coins), level:p.level, brush:p.brush,
      cells:this.cells[k], max:this.max[k], upCost:upCost(p.level), brushCost:(p.brush<30?brushCosts[p.brush-2]:null),
      unlocked:[...p.unlocked], upg:p.upg })) }; }
}

module.exports = { Game, PALETTE, COLS, ROWS, P_END, E_START };
