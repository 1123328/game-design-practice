/* ---------- Canvas 基本 ---------- */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
resize();

window.addEventListener('resize', resize);
// main.js (最上面 resize())
function resize(){
  const dpr = window.devicePixelRatio || 1;   // Retina 支援
  cvs.width  = innerWidth  * dpr;
  cvs.height = innerHeight * dpr;
  cvs.style.width  = innerWidth +'px';
  cvs.style.height = innerHeight+'px';
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);                        // 繪圖統一用 CSS 像素
}


/* ---------- 常量 ---------- */
const RAD60 = Math.PI / 3;
const TILE_R = 50;                    // 外接圓半徑
const FLOW_SPEED = 0.04;              // 0~1 / frame
const DIR6 = [...Array(6).keys()];
const AXIAL = [
  [ 1, 0],   // 0: 右
  [ 1,-1],   // 1: 右上
  [ 0,-1],   // 2: 左上
  [-1, 0],   // 3: 左
  [-1, 1],   // 4: 左下
  [ 0, 1]    // 5: 右下
];


/* ---------- 工具 ---------- */
function opposite(dir) { return (dir + 3) % 6; }
function portToSide(port) { return Math.floor(port / 2); }
function shuffle(arr) { for (let i = arr.length - 1; i; i--) {
  const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]];
} return arr; }
function hexCorner(cx, cy, r, side) {
  const ang = RAD60 * side - Math.PI / 2;
  return [ cx + r * Math.cos(ang), cy + r * Math.sin(ang) ];
}

/* ---------- Tile 物件 ---------- */
class Tile {
  constructor(q, r, cx, cy, locked = false) {
    this.q=q;
    this.r=r;
    this.x = cx; this.y = cy;
    this.rot = 0;
    this.locked = locked;
    this.paths = [];          // [[port,port]×6]
    this.active = false;      // 當前可操作
    this.passed = [];         // 已流動的路徑 [[p1,p2],...]
    this.anim = null;         // {pair, t:0~1}
    this.genPaths();
  }

  genPaths() {                // 12 個 port → 6 組 pair
    const ports = shuffle([...Array(12).keys()]);
    const a = ports.pop(), b = (a + 6) % 12;      // 保證 180°
    this.paths.push([a, b]);
    while (ports.length) this.paths.push([ports.pop(), ports.pop()]);
  }

  rotate(d) { if (!this.locked) this.rot = (this.rot + d + 6) % 6; }

  getOutDir(inPort) {                  // 給入口 port，回對端 port
    for (const [p1,p2] of this.paths)
      if (p1 === inPort) return p2;
      else if (p2 === inPort) return p1;
    return null;
  }

  hasPort(port) { return this.paths.some(([a,b]) => a===port||b===port); }

  /* ---- 畫圖 ---- */
  draw() {
    // 外框
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot * RAD60);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();

    // ----- Tile.draw() 補丁 -----
    if (this === board.center) {
      ctx.fillStyle = '#262626';    // 深灰底
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const [px, py] = hexCorner(0, 0, TILE_R, i);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    for (let i=0;i<6;i++){
      const [px,py] = hexCorner(0,0,TILE_R,i);
      i?ctx.lineTo(px,py):ctx.moveTo(px,py);
    }
    ctx.closePath(); ctx.stroke();

    // 畫所有通道
    for (const pair of this.paths){
      const col = this.passed.find(p=>samePair(p,pair))?'#0ff':'#64c8ff';
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      const [p1,p2] = pair.map(p=>portPos(p));
      ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.stroke();
    }

    // 畫正在流動的黃線
    if (this.anim){
      ctx.strokeStyle = '#ff0'; ctx.lineWidth = 4;
      const [a,b] = this.anim.pair.map(p=>portPos(p));
      const mx = a[0] + (b[0]-a[0])*this.anim.t;
      const my = a[1] + (b[1]-a[1])*this.anim.t;
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(mx,my); ctx.stroke();
    }
    ctx.restore();

    /* 內部小函式 */
    function portPos(port) {
      const side  = portToSide(port);          // 0‥5
      const edge  = hexCorner(0, 0, TILE_R, side);
      const edge2 = hexCorner(0, 0, TILE_R, (side+1)%6);
      // 邊中點
      const mx = (edge[0] + edge2[0]) / 2;
      const my = (edge[1] + edge2[1]) / 2;
      // 同一邊 2 個 port 再用 ±offset 推一點點
      const offset = (port % 2 ? +8 : -8);     // 像火車軌道兩條線
      const ang = RAD60*side - Math.PI/2 + Math.PI/2; // 法線方向
      return [ mx + offset * Math.cos(ang),  my + offset * Math.sin(ang) ];
    }    
    function samePair(p,q){ return (p[0]===q[0]&&p[1]===q[1])||(p[0]===q[1]&&p[1]===q[0]); }
  }
}

/* ---------- Board (只做一圈蜂巢即可) ---------- */
class Board{
  constructor(){
    this.grid={};          // {q,r:tile}
    this.tiles=[];
    this.center = new Tile(0, 0, cvs.width/2, cvs.height/2, true);
    this.center.active=false;
    this.tiles.push(this.center);
    this.cur = null;
  }
  spawn(){
    if(this.currentTile) return; // 不能重複放置
    const t = new Tile(0,0,0,0);
    t.active=true;
    this.cur = t;
  }
  place() {
    if(!this.currentTile) return null; // 不能重複放置
    const t = this.currentTile;
    const last = energy.lastTile || this.center;
  
    // ── 1) 讓它貼到出口邊 ────────────────────
    const side  = energy.lastOutDir ?? 0;       // 第一次還沒有 → 放右邊
    const [dq, dr] = AXIAL[side];
    t.q = last.q + dq;
    t.r = last.r + dr;
  
    // 把 axial 轉成畫布座標 (平頂六角)
    const w = Math.sqrt(3) * TILE_R;
    t.x = this.center.x + (t.q * w + t.r * w/2);
    t.y = this.center.y + t.r * 1.5 * TILE_R;
  
    t.locked=true; t.active=false;
    this.grid[`${t.q},${t.r}`] = t;
    this.tiles.push(t);
    this.currentTile=null;
    return t;
  }
  
  drawAll(){ this.tiles.forEach(t=>t.draw()); if(this.cur&&!this.cur.locked) this.cur.draw(); }
  getNeighbor(tile, side) {
    const [dq, dr] = AXIAL[side];
    return this.grid[`${tile.q + dq},${tile.r + dr}`] || null;
  }  
}
const board = new Board();

/* ---------- Energy ---------- */
class Energy{
  constructor(){this.queue=[];this.running=false;}
  startFrom(t,inPort,outPort){
    this.queue=[{tile:t,inPort,outPort}];
    this.running=true; this.lastTile=null;
  }
  step(){
    if(!this.running) return;
    if(!this.queue.length){ this.running=false; return; }

    const cur=this.queue[0];
    const t = cur.tile;
    if(!t.anim){                 // 啟動該 tile 動畫
      t.anim={pair:[cur.inPort,cur.outPort],t:0};
      return;
    }
    t.anim.t += FLOW_SPEED;      // 進度
    if(t.anim.t>=1){
      t.passed.push(t.anim.pair); t.anim=null;
      this.queue.shift();        // 完成，彈出
      this.lastTile = t; this.lastOutDir = portToSide(cur.outPort);

      // 找鄰居
      const nbr = board.getNeighbor(t,this.lastOutDir);
      if(!nbr) return;
      const need = (cur.outPort+6)%12;
      if(!nbr.hasPort(need)) return;
      const out = nbr.getOutDir(need);
      this.queue.push({tile:nbr,inPort:need,outPort:out});
    }
  }
}
const energy = new Energy();

/* ---------- 鍵盤控制 ---------- */
window.addEventListener('keydown',e=>{
  if(board.cur&&board.cur.active){
    if(e.key==='ArrowLeft')  board.cur.rotate(-1);
    if(e.key==='ArrowRight') board.cur.rotate(+1);
    if(e.key==='Enter' && board.currentTile){
      const inPort = 0;                         // 固定入口在右側 (demo)
      const outPort= board.cur.getOutDir(inPort);
      const placed = board.place();
      energy.startFrom(placed,inPort,outPort);
      board.spawn();                            // 再生下一塊
    }
  }
});

/* ---------- 遊戲主迴圈 ---------- */
board.spawn();
(function loop(){
  ctx.clearRect(0,0,cvs.width,cvs.height);
  board.drawAll();
  energy.step();
  requestAnimationFrame(loop);
})();
