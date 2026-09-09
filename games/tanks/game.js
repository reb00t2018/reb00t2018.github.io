/* Standalone canvas game: no remote assets or runtime dependencies. */
(() => {
'use strict';
const TILE=24, SIZE=624, N=26, DIRS=[[0,-1],[1,0],[0,1],[-1,0]];
const POWERUPS={ammo:{name:'强化弹药',icon:'×2',color:'#ffc65e',duration:8},river:{name:'渡河',icon:'≈',color:'#63e6f3',duration:10},bomb:{name:'炸弹',icon:'✹',color:'#ff9675',duration:0},shield:{name:'基地护盾',icon:'◇',color:'#bc9cff',duration:10}};
const DROP_TTL=12, BLAST_RADIUS=72;
const maps=[
 {name:'前线哨站',en:'FRONTLINE OUTPOST',count:8},
 {name:'钢铁迷城',en:'IRON LABYRINTH',count:10},
 {name:'渡河行动',en:'RIVER CROSSING',count:12},
 {name:'密林突围',en:'FOREST AMBUSH',count:14},
 {name:'最终防线',en:'THE LAST STAND',count:16}
];
function createMap(level){
 const grid=Array.from({length:N},()=>Array(N).fill(0));
 const rect=(x,y,w,h,v)=>{for(let r=y;r<y+h;r++)for(let c=x;c<x+w;c++)grid[r][c]=v;};
 // Hand-authored river fortress inspired by the supplied arcade reference.
 rect(4,2,2,2,1);rect(2,4,6,2,1);rect(10,2,2,5,1);
 rect(14,4,2,1,1);rect(14,6,2,2,1);rect(18,2,2,5,1);rect(20,4,1,2,1);rect(23,6,2,2,1);
 rect(0,4,2,6,4);rect(2,6,4,2,4);
 rect(2,8,20,2,3);rect(24,8,2,2,3);
 rect(2,10,2,2,1);rect(4,12,2,2,1);rect(0,14,4,2,1);rect(6,14,2,2,1);
 rect(12,11,4,1,1);rect(11,12,5,4,1);rect(16,12,6,1,1);rect(18,13,2,3,1);rect(24,14,2,2,1);
 rect(22,12,4,1,2);rect(20,15,4,1,2);rect(6,16,2,2,2);rect(10,17,2,1,2);
 rect(16,14,2,2,4);rect(14,16,8,2,4);
 rect(0,18,4,2,3);rect(6,18,10,2,3);rect(18,18,8,2,3);
 rect(0,20,4,4,4);rect(4,22,2,2,1);rect(7,20,1,2,1);rect(8,22,1,2,1);
 rect(11,21,5,1,1);rect(15,22,1,2,1);rect(20,22,4,1,1);rect(22,23,2,1,1);rect(18,23,2,1,1);
 if(level===2){rect(2,8,2,2,0);rect(22,8,2,2,3);rect(10,8,2,2,0);rect(4,18,2,2,3);rect(10,18,2,2,0);rect(0,12,2,2,1);rect(8,11,2,3,1);}
 if(level===3){rect(8,8,2,2,0);rect(22,8,2,2,3);rect(16,18,2,2,3);rect(12,18,2,2,0);rect(8,12,2,3,4);rect(22,20,2,2,1);}
 if(level===4){rect(0,4,8,4,4);rect(10,2,2,5,4);rect(0,12,3,2,4);rect(8,13,2,3,4);rect(18,20,3,2,4);rect(20,8,2,2,0);rect(22,8,2,2,3);}
 if(level===5){rect(6,4,2,3,2);rect(10,3,2,3,2);rect(18,4,2,2,2);rect(14,11,2,1,2);rect(18,13,2,2,2);rect(2,8,2,2,0);rect(22,8,2,2,3);rect(4,18,2,2,3);rect(8,18,2,2,0);rect(8,3,2,20,0);}
 // Open staging and spawn lanes on every map.
 rect(0,0,26,3,0);rect(0,23,26,3,0);
 rect(11,23,4,1,1);rect(11,24,1,2,1);rect(14,24,1,2,1);
 return grid;
}
class Game{
 constructor(random=Math.random){this.random=random;this.best=0;this.load(1);}
 load(level,carry=false){this.level=level;this.grid=createMap(level);this.total=maps[level-1].count;this.spawned=0;this.kills=0;this.enemies=[];this.bullets=[];this.particles=[];this.items=[];this.explosions=[];this.effects={ammo:0,river:0,shield:0};this.notice='';this.noticeTime=0;this.score=carry?this.score:0;this.lives=carry?Math.min(5,this.lives+1):3;this.baseAlive=true;this.state='ready';this.spawnTimer=.8;this.time=0;this.player=this.tank(9*TILE,24*TILE,false);this.player.shield=3;}
 tank(x,y,enemy){return{x,y,w:20,h:20,dir:enemy?2:0,enemy,hp:enemy&&this.level>=4&&this.random()<.3?2:1,cooldown:0,turn:.2+this.random(),shield:0};}
 blocked(x,y,tank){if(x<0||y<0||x+20>SIZE||y+20>SIZE)return true;for(let r=Math.floor(y/TILE);r<=Math.floor((y+19.99)/TILE);r++)for(let c=Math.floor(x/TILE);c<=Math.floor((x+19.99)/TILE);c++)if(this.grid[r][c]===1||this.grid[r][c]===2||(this.grid[r][c]===3&&!(tank===this.player&&this.effects.river>0)))return true;
 if(overlap({x,y,w:20,h:20},{x:288,y:576,w:48,h:48}))return true;
 return [this.player,...this.enemies].some(t=>t&&t!==tank&&overlap({x,y,w:20,h:20},t));}
 move(t,dir,dt){t.dir=dir;const speed=t.enemy?55+this.level*5:122;const [dx,dy]=DIRS[dir];const x=t.x+dx*speed*dt,y=t.y+dy*speed*dt;if(!this.blocked(x,y,t)){t.x=x;t.y=y;return true;}return false;}
 fire(t){if(t.cooldown>0)return;const [dx,dy]=DIRS[t.dir];this.bullets.push({x:t.x+10+dx*13,y:t.y+10+dy*13,dx,dy,enemy:t.enemy,damage:!t.enemy&&this.effects.ammo>0?2:1,w:5,h:5});t.cooldown=t.enemy?1.3+this.random()*1.3:.24;if(!t.enemy)this.onSound?.('shoot');}
 burst(x,y,color){for(let i=0;i<12;i++)this.particles.push({x,y,vx:(this.random()-.5)*150,vy:(this.random()-.5)*150,life:.4+this.random()*.25,color});}
 // Find a whole dry tile, excluding the base and optionally live tanks.
 drySpot(x,y,avoidTanks=false){
  const spots=[];
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){
   if(![0,4].includes(this.grid[r][c]))continue;
   const spot={x:c*TILE+2,y:r*TILE+2,w:20,h:20};
   if(overlap(spot,{x:288,y:576,w:48,h:48}))continue;
   if(avoidTanks&&this.enemies.some(e=>!e.dead&&overlap(spot,e)))continue;
   spots.push(spot);
  }
  spots.sort((a,b)=>(a.x-x)**2+(a.y-y)**2-((b.x-x)**2+(b.y-y)**2));
  return spots[0];
 }
 drop(t){
  const spot=this.drySpot(t.x,t.y);if(!spot)return;
  const types=Object.keys(POWERUPS),type=types[Math.min(3,Math.floor(this.random()*4))];
  this.items.push({...spot,type,life:DROP_TTL});
 }
 kill(t){
  if(t.dead)return;t.dead=true;this.kills++;this.score+=100*this.level;this.best=Math.max(this.best,this.score);
  this.burst(t.x+10,t.y+10,t.special?'#c597ff':'#e8986c');
  if(t.special)this.drop(t);this.onSound?.('hit');
 }
 detonate(){
  // Snapshot enemies: every current enemy dies once, including armored/special units.
  const targets=this.enemies.filter(e=>!e.dead);
  const centers=[{x:this.player.x+10,y:this.player.y+10},...targets.map(e=>({x:e.x+10,y:e.y+10}))];
  for(const center of centers){
   this.explosions.push({...center,life:.7,maxLife:.7,radius:BLAST_RADIUS});
   this.burst(center.x,center.y,'#ffbf66');
  }
  targets.forEach(t=>this.kill(t));this.enemies=this.enemies.filter(t=>!t.dead);
  this.bullets=this.bullets.filter(b=>!b.enemy);this.spawnTimer=Math.max(1.7,this.spawnTimer);this.onSound?.('bomb');
 }
 collect(item){
  const power=POWERUPS[item.type];
  if(item.type==='bomb')this.detonate();else this.effects[item.type]=power.duration;
  this.notice=`${power.name}${power.duration?' · '+power.duration+' 秒':' · 已引爆'}`;this.noticeTime=2.5;this.onSound?.('pickup');
 }
 updatePowerups(dt){
  const wasRiver=this.effects.river>0;
  for(const type of Object.keys(this.effects))this.effects[type]=Math.max(0,this.effects[type]-dt);
  if(wasRiver&&this.effects.river===0){
   // Expiry while crossing returns the player to the nearest safe bank, never traps it.
   const p=this.player;let wet=false;
   for(let r=Math.floor(p.y/TILE);r<=Math.floor((p.y+19.99)/TILE);r++)for(let c=Math.floor(p.x/TILE);c<=Math.floor((p.x+19.99)/TILE);c++)if(this.grid[r][c]===3)wet=true;
   if(wet){const spot=this.drySpot(p.x,p.y,true);if(spot){p.x=spot.x;p.y=spot.y;p.shield=Math.max(p.shield,1);}}
  }
  this.noticeTime=Math.max(0,this.noticeTime-dt);
  this.items=this.items.filter(item=>{item.life-=dt;return item.life>0;});
 }
 advanceVisuals(dt){
  for(const e of this.explosions)e.life-=dt;this.explosions=this.explosions.filter(e=>e.life>0);
  for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}this.particles=this.particles.filter(p=>p.life>0);
 }
 pickupNearby(){
  const picked=this.items.filter(item=>overlap(this.player,item));
  this.items=this.items.filter(item=>!picked.includes(item));
  picked.forEach(item=>this.collect(item));
 }
 end(state){this.state=state;this.best=Math.max(this.best,this.score);this.onSound?.(state==='won'?'win':'lose');}
 update(dt,keys={}){
 dt=Math.min(dt,.04);if(this.state!=='playing'){if(['won','lost'].includes(this.state))this.advanceVisuals(dt);return;}this.time+=dt;this.updatePowerups(dt);this.pickupNearby();this.player.cooldown=Math.max(0,this.player.cooldown-dt);this.player.shield=Math.max(0,this.player.shield-dt);
 const dir=keys.ArrowUp||keys.KeyW?0:keys.ArrowRight||keys.KeyD?1:keys.ArrowDown||keys.KeyS?2:keys.ArrowLeft||keys.KeyA?3:-1;
 if(dir!==-1)this.move(this.player,dir,dt);this.pickupNearby();if(keys.Space||keys.KeyJ)this.fire(this.player);
 this.spawnTimer-=dt;if(this.spawned<this.total&&this.enemies.length<Math.min(5,2+this.level)&&this.spawnTimer<=0){const positions=[24,302,580];const x=positions[this.spawned%3];const t=this.tank(x,4,true);if(!this.blocked(x,4,t)){t.special=this.spawned%3===0;if(t.special)t.hp=2;this.enemies.push(t);this.spawned++;this.spawnTimer=1.7;}else this.spawnTimer=.25;}
 for(const e of this.enemies){e.cooldown-=dt;e.turn-=dt;if(e.turn<=0){const roll=this.random();e.dir=roll<.5?2:Math.floor(this.random()*4);if(Math.abs(e.y-this.player.y)<18&&this.random()<.7)e.dir=e.x<this.player.x?1:3;e.turn=.4+this.random()*1.1;}if(!this.move(e,e.dir,dt))e.turn=0;if(e.cooldown<=0)this.fire(e);}
 for(const b of this.bullets){if(b.dead)continue;const steps=Math.ceil(330*dt/4);for(let step=0;step<steps&&!b.dead;step++){b.x+=b.dx*330*dt/steps;b.y+=b.dy*330*dt/steps;if(b.x<0||b.y<0||b.x>=SIZE||b.y>=SIZE){b.dead=true;break;}const c=Math.floor(b.x/TILE),r=Math.floor(b.y/TILE),tile=this.grid[r][c];if(tile===1||tile===2){b.dead=true;if(tile===1){this.grid[r][c]=0;this.burst(c*TILE+12,r*TILE+12,'#ac7b52');}break;}
 if(b.enemy&&overlap(b,{x:288,y:576,w:48,h:48})){b.dead=true;if(this.effects.shield>0){this.burst(b.x,b.y,'#bc9cff');break;}this.baseAlive=false;this.burst(312,600,'#e8be60');this.end('lost');break;}
 const targets=b.enemy?[this.player]:this.enemies;for(const t of targets){if(overlap(b,t)){b.dead=true;if(t.shield>0)break;if(t.enemy){t.hp-=b.damage??1;if(t.hp<=0)this.kill(t);}else{this.lives--;this.burst(t.x+10,t.y+10,'#e2d57b');if(this.lives<=0)this.end('lost');else{this.player=this.tank(216,576,false);this.player.shield=3;}}break;}}
 if(this.state!=='playing')break;
 }this.enemies=this.enemies.filter(e=>!e.dead);if(this.state!=='playing')break;}
 for(let i=0;i<this.bullets.length;i++)for(let j=i+1;j<this.bullets.length;j++){const a=this.bullets[i],b=this.bullets[j];if(!a.dead&&!b.dead&&a.enemy!==b.enemy&&Math.abs(a.x-b.x)<9&&Math.abs(a.y-b.y)<9){a.dead=b.dead=true;}}
 this.bullets=this.bullets.filter(b=>!b.dead);this.advanceVisuals(dt);if(this.kills===this.total&&this.state==='playing')this.end('won');
 }
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
// Export the same simulation for deterministic regression tests.
if(typeof module!=='undefined'&&module.exports){module.exports={Game,createMap,maps,POWERUPS,DROP_TTL,BLAST_RADIUS};return;}
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),game=new Game(),keys={};let sound=false,audio,last=0,previousState='';
try{game.best=Number(localStorage.getItem('tank-best'))||0;}catch{}
function beep(type){if(!sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='square';o.frequency.setValueAtTime({shoot:220,hit:80,win:520,lose:65,pickup:680,bomb:45}[type],audio.currentTime);o.frequency.exponentialRampToValueAtTime(type==='win'?900:35,audio.currentTime+.12);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.16);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.17);}catch{}}
game.onSound=beep;
function drawTank(t){ctx.save();ctx.translate(Math.round(t.x+10),Math.round(t.y+10));ctx.rotate(t.dir*Math.PI/2);const color=t.enemy?(t.special?'#b978ef':t.hp>1?'#e5a077':'#c77761'):'#f4c64b';ctx.fillStyle='#11170f';ctx.fillRect(-12,-10,7,22);ctx.fillRect(5,-10,7,22);ctx.fillStyle=t.enemy?(t.special?'#674187':'#925b4b'):'#8a7434';for(let y=-9;y<12;y+=5){ctx.fillRect(-11,y,5,3);ctx.fillRect(6,y,5,3);}ctx.fillStyle=color;ctx.fillRect(-7,-9,14,19);ctx.fillStyle=t.enemy?(t.special?'#e3b5ff':'#e5a18a'):'#f0ecb1';ctx.fillRect(-5,-7,10,3);ctx.fillStyle=t.enemy?(t.special?'#7937a4':'#914e40'):'#b79031';ctx.fillRect(-5,-3,10,10);ctx.fillStyle=color;ctx.fillRect(-2,-16,4,16);ctx.fillStyle='#ffffff55';ctx.fillRect(-2,0,4,3);ctx.restore();if(t.special){ctx.fillStyle='#edd2ff';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText('★',t.x+10,t.y-6);}if(t.shield>0){ctx.strokeStyle=`rgba(221,238,148,${.5+Math.sin(game.time*15)*.3})`;ctx.lineWidth=1.5;ctx.strokeStyle='#4cdae4';ctx.beginPath();ctx.arc(t.x+10,t.y+10,19+Math.sin(game.time*5)*2,0,Math.PI*2);ctx.stroke();}}
// Pre-render the textured terrain once; only water and combat effects animate.
const ground=document.createElement('canvas');ground.width=ground.height=SIZE;
const terrain=ground.getContext('2d');
const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
terrain.fillStyle='#343e36';terrain.fillRect(0,0,SIZE,SIZE);
for(let r=0;r<26;r++)for(let c=0;c<14;c++){
 const x=c*48-(r%2)*24,y=r*24,n=noise(c,r);
 terrain.fillStyle=`rgb(${57+n*12},${65+n*12},${54+n*10})`;
 terrain.beginPath();terrain.moveTo(x+3,y+2);terrain.lineTo(x+42,y+1);terrain.lineTo(x+46,y+5);terrain.lineTo(x+45,y+20);terrain.lineTo(x+39,y+23);terrain.lineTo(x+2,y+22);terrain.lineTo(x+1,y+7);terrain.closePath();terrain.fill();
 terrain.strokeStyle='#28352f';terrain.lineWidth=2;terrain.stroke();terrain.fillStyle='#a0a17c18';terrain.fillRect(x+5,y+3,34,2);
 for(let i=0;i<13;i++){terrain.fillStyle=i%2?'#101c181f':'#a5aa7b13';terrain.fillRect(x+noise(c+i,r)*44,y+noise(c,r+i)*22,2,2);}
}
const leaves=document.createElement('canvas');leaves.width=leaves.height=48;const leaf=leaves.getContext('2d');leaf.fillStyle='#234e27';leaf.fillRect(0,0,48,48);
for(let i=0;i<170;i++){const x=noise(i,1)*48,y=noise(i,2)*48;leaf.fillStyle=['#376c26','#548e2c','#78ae32','#a1c740','#275c30'][i%5];leaf.fillRect(x,y,3+noise(i,3)*4,3+noise(i,4)*5);leaf.fillStyle='#b3d34c55';leaf.fillRect(x,y,2,2);}
function draw(){ctx.drawImage(ground,0,0);
 for(let r=0;r<N;r++)for(let c=0;c<N;c++){const v=game.grid[r][c],x=c*TILE,y=r*TILE;
 if(v===1){ctx.fillStyle='#63371e';ctx.fillRect(x,y,24,24);for(let row=0;row<4;row++)for(let col=-1;col<3;col++){const bx=x+col*12+(row%2)*6,by=y+row*6;const left=Math.max(x,bx+1),right=Math.min(x+24,bx+11);if(right<=left)continue;ctx.fillStyle=['#c47936','#d0873d','#b9672d'][(r+c+row+col+3)%3];ctx.fillRect(left,by+1,right-left,5);ctx.fillStyle='#efac5966';ctx.fillRect(left,by+1,right-left,1);ctx.fillStyle='#8e492c';ctx.fillRect(left,by+5,right-left,1);}}
 if(v===2){ctx.fillStyle='#526d77';ctx.fillRect(x,y,24,24);ctx.fillStyle='#77949e';ctx.fillRect(x+1,y+1,22,1);ctx.fillRect(x+1,y+1,1,22);ctx.fillStyle='#344c59';ctx.fillRect(x+23,y,1,24);ctx.fillRect(x,y+23,24,1);ctx.fillStyle='#a6b5ae';ctx.fillRect(x+3,y+3,2,2);ctx.fillRect(x+19,y+19,2,2);}
 if(v===3){ctx.fillStyle='#087d8e';ctx.fillRect(x,y,24,24);ctx.save();ctx.beginPath();ctx.rect(x,y,24,24);ctx.clip();for(let i=0;i<4;i++){const phase=game.time*.8;ctx.beginPath();for(let py=-4;py<=28;py+=3){const px=x+i*9-4+Math.sin(py*.2+phase+r*.8+i)*4;py===-4?ctx.moveTo(px,y+py):ctx.lineTo(px,y+py);}ctx.strokeStyle=i%2?'#7be4ddbb':'#24bdcbbb';ctx.lineWidth=i%2?1:2;ctx.stroke();}ctx.fillStyle='#c8fff44d';ctx.fillRect(x+noise(c,r)*20,y+noise(r,c)*20,3,2);ctx.restore();}}
 const bx=312,by=600;ctx.save();ctx.translate(bx,by);ctx.fillStyle='#183f48';ctx.strokeStyle=game.baseAlive?'#e4b84e':'#725c41';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#54c2d5';ctx.lineWidth=1;ctx.strokeRect(-21,-21,42,42);ctx.fillStyle=game.baseAlive?'#f3c851':'#796b51';ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(5,-3);ctx.lineTo(13,-8);ctx.lineTo(10,5);ctx.lineTo(0,13);ctx.lineTo(-10,5);ctx.lineTo(-13,-8);ctx.lineTo(-5,-3);ctx.closePath();ctx.fill();ctx.fillStyle='#325651';ctx.fillRect(-2,-3,4,10);ctx.restore();
 drawTank(game.player);game.enemies.forEach(drawTank);
 for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(game.grid[r][c]===4)ctx.drawImage(leaves,(c%2)*24,(r%2)*24,24,24,c*TILE,r*TILE,24,24);
 // Pickups render above foliage so a safe grass drop is always visible.
 for(const item of game.items){
  const power=POWERUPS[item.type];ctx.save();
  ctx.globalAlpha=item.life<3?.55+Math.sin(game.time*14)*.4:1;
  ctx.fillStyle='#111d30';ctx.fillRect(item.x-3,item.y-3,26,26);
  ctx.strokeStyle=power.color;ctx.lineWidth=2;ctx.strokeRect(item.x-3,item.y-3,26,26);
  ctx.fillStyle=power.color;ctx.font='bold 16px Arial';ctx.textAlign='center';ctx.fillText(power.icon,item.x+10,item.y+15);
  ctx.fillRect(item.x-3,item.y+26,26*item.life/DROP_TTL,2);ctx.restore();
 }
 if(game.effects.shield>0){ctx.save();ctx.strokeStyle='#c3a0ff';ctx.fillStyle='#9874ff22';ctx.lineWidth=3;ctx.beginPath();ctx.arc(312,600,30+Math.sin(game.time*4)*2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
 if(game.effects.river>0){ctx.strokeStyle='#63e6f3';ctx.lineWidth=2;ctx.strokeRect(game.player.x-3,game.player.y-3,26,26);}
 for(const e of game.explosions){const phase=1-e.life/e.maxLife;ctx.save();ctx.globalAlpha=1-phase;ctx.strokeStyle='#ffd583';ctx.fillStyle='#ff98582b';ctx.lineWidth=5*(1-phase)+1;ctx.beginPath();ctx.arc(e.x,e.y,e.radius*phase,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
 ctx.fillStyle='#fff2ac';for(const b of game.bullets){ctx.fillStyle=b.damage===2?'#ffae42':'#fff2ac';ctx.fillRect(b.x-2,b.y-2,b.damage===2?7:5,b.damage===2?7:5);}for(const p of game.particles){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4);}ctx.globalAlpha=1;
}
function sync(){
 const active=Object.entries(game.effects).filter(([,time])=>time>0);
 const effectHtml=active.length?active.map(([type,time])=>`<div class="effect" style="--effect-color:${POWERUPS[type].color}"><span>${POWERUPS[type].icon} ${POWERUPS[type].name}</span><b>${Math.ceil(time)}s</b><i style="width:${time/POWERUPS[type].duration*100}%"></i></div>`).join(''):'<span class="no-effect">暂无强化 · 碰到道具自动生效</span>';
 if($('effects').innerHTML!==effectHtml)$('effects').innerHTML=effectHtml;
 $('pickup-notice').textContent=game.noticeTime>0?game.notice:'';
 $('pickup-notice').classList.toggle('visible',game.noticeTime>0);
 const level=maps[game.level-1];$('map-label').textContent=`0${game.level} / ${level.name}`;$('score').textContent=String(game.score).padStart(6,'0');$('best').textContent=String(game.best).padStart(6,'0');$('lives').textContent='♥ '.repeat(Math.max(0,game.lives))||'—';$('remaining').textContent=String(game.total-game.kills).padStart(2,'0');$('base-status').textContent=game.baseAlive?(game.effects.shield>0?'◇ 护盾 '+Math.ceil(game.effects.shield)+'s':'● 安全'):'● 已摧毁';$('base-status').style.color=game.baseAlive?'':'#df8b74';$('progress').style.width=`${game.kills/game.total*100}%`;$('status').textContent={ready:'等待部署',playing:'战斗进行中',paused:'战斗已暂停',won:'战区已肃清',lost:'任务失败'}[game.state];$('pause').textContent=game.state==='paused'?'▶ 继续':'Ⅱ 暂停';document.querySelectorAll('.level').forEach((b,i)=>{b.classList.toggle('selected',i===game.level-1);b.setAttribute('aria-pressed',String(i===game.level-1));});
 if(previousState!==game.state){previousState=game.state;$('overlay').classList.toggle('hidden',game.state==='playing');$('overlay').classList.toggle('preview',game.state==='ready');const data={ready:['OPERATION: IRON LINE','准备好上战场了吗？','驾驶坦克，击退敌军，保护你的基地。<br>摧毁所有敌方坦克，即可进入下一关。','开始战斗 ↗'],paused:['TAKE A BREATHER','战斗已暂停','防线仍在，整装待发。','继续战斗 ↗'],won:['MISSION COMPLETE',game.level===5?'五关通关，防线屹立！':'战区已肃清！',game.level===5?`最终得分 ${game.score} · 你守住了最后的基地。`:'下一关补充 1 条生命，保留本次得分。',''+(game.level===5?'重新开始 ↗':'进入下一关 ↗')],lost:['MISSION FAILED','防线失守',game.baseAlive?'坦克已全部损失，再试一次吧。':'基地被摧毁。留意敌方的进攻路线。','重试本关 ↗']}[game.state];if(data){$('overlay-tag').textContent=data[0];$('overlay-title').textContent=data[1];$('overlay-text').innerHTML=data[2];$('start').textContent=data[3];}if(['won','lost'].includes(game.state))try{localStorage.setItem('tank-best',String(game.best));}catch{}}
}
function clearKeys(){for(const k of Object.keys(keys))delete keys[k];}
function pause(){if(game.state==='playing'){game.state='paused';clearKeys();}else if(game.state==='paused')game.state='playing';sync();}
$('levels').innerHTML=maps.map((m,i)=>`<button class="level" data-level="${i+1}" aria-label="第 ${i+1} 关 ${m.name}"><span class="num">0${i+1}</span><span><strong>${m.name}</strong><small>${m.en}</small></span><span class="difficulty">${'▮'.repeat(i+1)}</span></button>`).join('');
$('levels').onclick=e=>{const b=e.target.closest('button');if(b){clearKeys();game.load(Number(b.dataset.level));previousState='';sync();draw();}};
$('start').onclick=()=>{$('start').blur();if(game.state==='won'){game.load(game.level===5?1:game.level+1,game.level<5);}else if(game.state==='lost')game.load(game.level);game.state='playing';clearKeys();sync();};$('pause').onclick=()=>{$('pause').blur();pause();};$('restart').onclick=()=>{$('restart').blur();clearKeys();game.load(game.level);game.state='playing';sync();};$('sound').onclick=()=>{sound=!sound;$('sound').textContent=`音效 ${sound?'ON':'OFF'}`;$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');beep('shoot');};
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&e.target.tagName!=='BUTTON')e.preventDefault();if(e.code==='KeyP'&&!e.repeat)pause();if(e.code==='Space'&&e.target.tagName==='BUTTON')return;keys[e.code]=true;});window.addEventListener('keyup',e=>delete keys[e.code]);window.addEventListener('blur',()=>{clearKeys();if(game.state==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state==='playing')pause();});
for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys[b.dataset.key]=true;};const release=()=>delete keys[b.dataset.key];b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;}
function frame(now){const dt=last?Math.min((now-last)/1000,.04):0;last=now;game.update(dt,keys);draw();sync();requestAnimationFrame(frame);}sync();draw();requestAnimationFrame(frame);
})();
