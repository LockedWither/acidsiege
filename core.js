/* ============================================================
   ACID SIEGE — shared core: element ids, weapon ladder, and the
   damage / resistance formulas. Loaded by the World map mode so its
   weapons and numbers stay identical to the main game. Original work.
   Exposes window.ACID_CORE.
   ============================================================ */
(function(){
  // ---- element ids (mirror of singleplayer) ----
  const ids = { EMPTY:0, SAND:1, WATER:2, ACID:3, FIRE:4, WOOD:5, TNT:6, WALL:7,
    CITY:8, SMOKE:9, STEAM:10, OIL:11, STONE:12, GLASS:13, LAVA:14, PLASMA:15, PCITY:16,
    MAGMA:17, NAPALM:18, NUKE:19, HBOMB:20, ANTIMATTER:21, VIRUS:22, NEW_BASE:23 };
  const { ACID,FIRE,NAPALM,VIRUS,LAVA,MAGMA,PLASMA,ANTIMATTER,SAND,GLASS,WOOD,STONE,
          CITY,PCITY,WATER,OIL,TNT,NUKE,HBOMB,EMPTY,NEW_BASE } = ids;

  // ---- combat tunables (identical to the main game) ----
  const BASE_HP = { [SAND]:2,[GLASS]:4,[WOOD]:6,[STONE]:12,[CITY]:8,[PCITY]:8 };
  const DMG = { [ACID]:4,[FIRE]:2,[NAPALM]:3,[VIRUS]:2,[LAVA]:5,[MAGMA]:8,[PLASMA]:12,[ANTIMATTER]:4000 };
  const BOMB_PWR = { [TNT]:25,[NUKE]:120,[HBOMB]:350 };

  // flat protection a city/nation of level L subtracts from every hit — climbs fast, ramps hard past 40
  function cityProt(L){ const a=0.02*(L-1)*(L-1)*(L-1); const e=L>40?L-40:0; return Math.round(a + 0.18*e*e*e); }
  // coin multiplier by level — climbs to ~lv200 then nearly flat
  function coinLevelMult(L){ const m=Math.min(L,200), c=1+0.045*Math.pow(m-1,1.1); return L>200 ? c+(L-200)*0.05 : c; }
  function fmtCoin(n){ n=Math.floor(n); return n>=1e12 ? (n/1e12).toLocaleString(undefined,{maximumFractionDigits:2})+"T" : n.toLocaleString(); }
  function hexToRgb(h){ const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }

  // ---- base palette (ids 0..22) ----
  const PALETTE = [
    {t:ACID,  nm:"Acid",   col:"#8ef02a", cost:0},
    {t:WATER, nm:"Water",  col:"#367bd4", cost:0},
    {t:SAND,  nm:"Sand",   col:"#d9c17a", cost:0},
    {t:WOOD,  nm:"Wood",   col:"#7a4a23", cost:40},
    {t:OIL,   nm:"Oil",    col:"#3a2820", cost:60},
    {t:GLASS, nm:"Glass",  col:"#bce3ec", cost:70},
    {t:STONE, nm:"Stone",  col:"#6e6c68", cost:80},
    {t:FIRE,  nm:"Fire",   col:"#ff6a1e", cost:100},
    {t:TNT,   nm:"TNT",    col:"#e23a3a", cost:100000},
    {t:LAVA,  nm:"Lava",   col:"#ff5a14", cost:500},
    {t:MAGMA, nm:"Magma",  col:"#ff9a2a", cost:1500},
    {t:NAPALM,nm:"Napalm", col:"#ff8a1e", cost:2000},
    {t:PLASMA,nm:"Plasma", col:"#c47cff", cost:1200},
    {t:VIRUS, nm:"Virus",  col:"#b428b4", cost:12000},
    {t:NUKE,  nm:"Nuke",   col:"#6c8030", cost:1000000},
    {t:HBOMB, nm:"H-Bomb", col:"#46505c", cost:1500000},
    {t:ANTIMATTER,nm:"Antimatter", col:"#7a00c8", cost:2000000},
    {t:PCITY, nm:"City Block", col:"#3ec46b", cost:800},
    {t:EMPTY, nm:"Eraser", col:"#3a4a52", cost:0},
  ];

  // ---- super-weapon ladder (ids NEW_BASE+) — identical to the main game ----
  const NEWDEFS = [
    {nm:"Thermite",         col:"#ffb24a", kind:"goo",   dmg:60,                       cost:150000},
    {nm:"Caustic Wave",     col:"#9cff5a", kind:"goo",   dmg:90,                       cost:250000},
    {nm:"Cluster Bomb",     col:"#c8d24a", kind:"blast", dmg:2500,    r:22,fp:0.60,    cost:300000},
    {nm:"Daisy Cutter",     col:"#e0a832", kind:"blast", dmg:5000,    r:26,fp:0.65,    cost:600000},
    {nm:"Bunker Buster",    col:"#9a7a3a", kind:"blast", dmg:10000,   r:24,fp:0.50,    cost:1200000},
    {nm:"Fuel-Air Bomb",    col:"#ff7e3a", kind:"blast", dmg:20000,   r:30,fp:0.75,    cost:2000000},
    {nm:"Neutron Bomb",     col:"#aef0c0", kind:"beam",  dmg:40000,                    cost:3500000},
    {nm:"Sulfur Deluge",    col:"#d8d24a", kind:"goo",   dmg:120,                      cost:4500000},
    {nm:"Mercury Flood",    col:"#c0c8d0", kind:"goo",   dmg:240,                      cost:5500000},
    {nm:"Cobalt Bomb",      col:"#5a8fd0", kind:"blast", dmg:80000,   r:32,fp:0.70,    cost:6000000},
    {nm:"Gamma Burst",      col:"#b6ff7a", kind:"beam",  dmg:120000,                   cost:8000000},
    {nm:"Tsar Bomba",       col:"#ff5a2a", kind:"blast", dmg:160000,  r:38,fp:0.80,    cost:10000000},
    {nm:"Plasma Cannon",    col:"#c47cff", kind:"beam",  dmg:350000,                   cost:16000000},
    {nm:"Rail Mortar",      col:"#8fbfff", kind:"blast", dmg:500000,  r:30,fp:0.60,    cost:20000000},
    {nm:"Corrosive Tide",   col:"#7affc0", kind:"goo",   dmg:700,                      cost:22000000},
    {nm:"Railgun Slug",     col:"#9fd8ff", kind:"blast", dmg:700000,  r:28,fp:0.40,    cost:25000000},
    {nm:"Ion Storm",        col:"#7ce0ff", kind:"beam",  dmg:1500000,                  cost:38000000},
    {nm:"Void Lance",       col:"#6a4aff", kind:"anti",  dmg:2500000,                  cost:46000000},
    {nm:"Black Hole",       col:"#3a2a5a", kind:"anti",  dmg:4000000,                  cost:55000000},
    {nm:"Quicksilver Sea",  col:"#aeb6c4", kind:"goo",   dmg:1600,                     cost:65000000},
    {nm:"Singularity",      col:"#5a2a7a", kind:"anti",  dmg:9000000,                  cost:75000000},
    {nm:"Meteor Strike",    col:"#ff9a5a", kind:"blast", dmg:13000000, r:40,fp:0.80,   cost:88000000},
    {nm:"Nova Charge",      col:"#ffd24a", kind:"blast", dmg:18000000, r:42,fp:0.85,   cost:100000000},
    {nm:"Supernova",        col:"#ffe88a", kind:"blast", dmg:40000000, r:46,fp:0.90,   cost:130000000},
    {nm:"Plasma Sludge",    col:"#d27aff", kind:"goo",   dmg:5000,                     cost:145000000},
    {nm:"Quark Bomb",       col:"#ff4ad2", kind:"anti",  dmg:90000000,                 cost:160000000},
    {nm:"Neutronium Slug",  col:"#cfe0ff", kind:"blast", dmg:140000000,r:34,fp:0.50,   cost:172000000},
    {nm:"Strangelet",       col:"#b04aff", kind:"anti",  dmg:200000000,                cost:185000000},
    {nm:"Dark Matter Bomb", col:"#2a1840", kind:"blast", dmg:450000000,  r:24,fp:0.85, cost:200000000},
    {nm:"Vacuum Decay",     col:"#d0c0ff", kind:"beam",  dmg:900000000,                cost:225000000},
    {nm:"Annihilation Core",col:"#ffffff", kind:"anti",  dmg:2000000000,  cost:250000000},
    {nm:"Plasma Tempest",   col:"#c47cff", kind:"beam",  dmg:3000000000,  cost:400000000},
    {nm:"Acid Monsoon",     col:"#9cff5a", kind:"goo",   dmg:4000000000,  cost:600000000},
    {nm:"Bunker Nuke",      col:"#9a7a3a", kind:"blast", dmg:5500000000,  r:24,fp:0.70, cost:900000000},
    {nm:"Antiproton Beam",  col:"#7ce0ff", kind:"beam",  dmg:7000000000,  cost:1400000000},
    {nm:"Graviton Bomb",    col:"#5a4a8a", kind:"blast", dmg:9000000000,  r:26,fp:0.75, cost:2000000000},
    {nm:"Dark Pulse",       col:"#2a1840", kind:"anti",  dmg:12000000000, cost:3000000000},
    {nm:"Fusion Lance",     col:"#9fd8ff", kind:"beam",  dmg:16000000000, cost:4500000000},
    {nm:"Magma Surge",      col:"#ff7e3a", kind:"goo",   dmg:20000000000, cost:7000000000},
    {nm:"Photon Nova",      col:"#ffe88a", kind:"blast", dmg:27000000000, r:24,fp:0.80, cost:10000000000},
    {nm:"Tachyon Burst",    col:"#7affe0", kind:"beam",  dmg:35000000000, cost:15000000000},
    {nm:"Neutron Star Shard",col:"#cfe0ff",kind:"blast", dmg:45000000000, r:22,fp:0.60, cost:22000000000},
    {nm:"Void Collapse",    col:"#3a2a5a", kind:"anti",  dmg:60000000000, cost:33000000000},
    {nm:"Solar Flare",      col:"#ffb24a", kind:"beam",  dmg:80000000000, cost:50000000000},
    {nm:"Plasmoid Swarm",   col:"#d27aff", kind:"beam",  dmg:100000000000,cost:75000000000},
    {nm:"Hypernova",        col:"#fff0b0", kind:"blast", dmg:130000000000,r:24,fp:0.85, cost:110000000000},
    {nm:"Gamma Ray Burst",  col:"#b6ff7a", kind:"beam",  dmg:170000000000,cost:170000000000},
    {nm:"Strange Matter",   col:"#b04aff", kind:"anti",  dmg:220000000000,cost:250000000000},
    {nm:"Quasar Cannon",    col:"#7cc0ff", kind:"beam",  dmg:280000000000,cost:380000000000},
    {nm:"Big Rip",          col:"#1a1030", kind:"anti",  dmg:350000000000,cost:580000000000},
    {nm:"Entropy Wave",     col:"#5a2a7a", kind:"anti",  dmg:430000000000,cost:880000000000},
    {nm:"Cosmic String",    col:"#d0c0ff", kind:"beam",  dmg:500000000000,cost:1300000000000},
    {nm:"Reality Tear",     col:"#ff4ad2", kind:"anti",  dmg:550000000000,cost:2000000000000},
    {nm:"Doomsday Glitch",  col:"#ff5a5a", kind:"blast", dmg:600000000000,r:24,fp:0.90, cost:3000000000000},
    {nm:"Eternity Engine",  col:"#aef0ff", kind:"beam",  dmg:650000000000,cost:5000000000000},
    {nm:"Omega Singularity",col:"#ffffff", kind:"anti",  dmg:700000000000,cost:10000000000000},
  ];
  const DEFBYID = {}, ORIG = NEWDEFS.length - 25;          // first ORIG (30) = original ladder
  NEWDEFS.forEach((d,k)=>{
    const id = NEW_BASE + k; d.id = id;
    const f = 0.1 + 1.4*Math.pow(k/(NEWDEFS.length-1), 2);
    d.dmg = Math.round(d.dmg*f);
    if(d.r) d.r = Math.min(45, Math.round(d.r*2));
    let cost = k<ORIG ? 150000*Math.pow(1e13/150000, k/(ORIG-1))
                      : 1e13*Math.pow(100,(k-ORIG+1)/25);
    const mag = Math.pow(10, Math.floor(Math.log10(cost))-2); d.cost = Math.round(cost/mag)*mag;
    DEFBYID[id] = d;
    PALETTE.splice(PALETTE.length-2, 0, {t:id, nm:d.nm, col:d.col, cost:d.cost});
  });

  window.ACID_CORE = { ids, BASE_HP, DMG, BOMB_PWR, cityProt, coinLevelMult, fmtCoin, hexToRgb, PALETTE, NEWDEFS, DEFBYID };
})();
