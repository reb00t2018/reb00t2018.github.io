const assert=require('node:assert/strict');
const {Game,createMap,maps}=require('./game.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
function empty(g){g.grid=g.grid.map(row=>row.map(()=>0));g.spawned=g.total;g.state='playing';g.player.x=100;g.player.y=100;}
function advance(g,n=30,keys={}){for(let i=0;i<n;i++)g.update(1/60,keys);}
test('Five distinct maps with valid tiles and open spawn points',()=>{assert.equal(new Set(maps.map((_,i)=>JSON.stringify(createMap(i+1)))).size,5);for(let l=1;l<=5;l++){const g=new Game();g.load(l);assert.equal(g.grid.length,26);assert(g.grid.every(r=>r.length===26&&r.every(v=>v>=0&&v<=4)));assert(!g.blocked(216,576,g.player));for(const x of [24,302,580])assert(!g.blocked(x,4,{}));}});
test('Movement, walls, boundaries and paused simulation',()=>{const g=new Game();empty(g);advance(g,10,{KeyD:true});assert(g.player.x>100);g.player.x=0;advance(g,10,{KeyA:true});assert.equal(g.player.x,0);g.grid[4][1]=2;g.player.y=100;advance(g,30,{KeyD:true});assert(g.player.x+20<=24);g.state='paused';const x=g.player.x;advance(g,60,{KeyD:true});assert.equal(g.player.x,x);});
test('Bricks break, steel stops bullets, water permits bullets',()=>{for(const tile of [1,2,3]){const g=new Game();empty(g);g.grid[3][4]=tile;g.player.dir=0;g.fire(g.player);advance(g,12);assert.equal(g.grid[3][4],tile===1?0:tile);assert.equal(g.bullets.length,tile===3?1:0);}});
test('Enemy destruction awards score and clears final enemy',()=>{const g=new Game();empty(g);g.kills=g.total-1;g.enemies=[g.tank(100,60,true)];g.enemies[0].cooldown=99;g.enemies[0].turn=99;g.bullets=[{x:110,y:75,dx:0,dy:-1,w:5,h:5,enemy:false}];g.update(1/60);assert.equal(g.enemies.length,0);assert.equal(g.kills,g.total);assert.equal(g.score,100);assert.equal(g.state,'won');});
test('Player damage, respawn invulnerability and loss',()=>{const g=new Game();empty(g);const hit=()=>{g.bullets=[{x:g.player.x+10,y:g.player.y+10,dx:0,dy:1,w:5,h:5,enemy:true}];g.update(1/60);};g.player.shield=0;hit();assert.equal(g.lives,2);hit();assert.equal(g.lives,2);g.player.shield=0;hit();g.player.shield=0;hit();assert.equal(g.lives,0);assert.equal(g.state,'lost');});
test('Base destruction loses mission, friendly fire spares base',()=>{for(const enemy of [true,false]){const g=new Game();empty(g);g.bullets=[{x:310,y:590,dx:0,dy:1,w:5,h:5,enemy}];g.update(1/60);assert.equal(g.baseAlive,!enemy);assert.equal(g.state,enemy?'lost':'playing');}});
test('All five stages can finish, preserving score and granting life',()=>{const g=new Game();for(let l=1;l<=5;l++){if(l>1)g.load(l,true);assert.equal(g.level,l);empty(g);g.kills=g.total;g.score+=l*100;g.update(.016);assert.equal(g.state,'won');}assert.equal(g.score,1500);assert.equal(g.lives,5);g.load(1);assert.equal(g.score,0);assert.equal(g.lives,3);});
test('Every stage spawns its full enemy wave and stays numerically valid',()=>{for(let l=1;l<=5;l++){const g=new Game();g.load(l);g.state='playing';for(let i=0;i<3000&&g.spawned<g.total;i++){g.update(1/60);g.enemies=[];g.bullets=[];}assert.equal(g.spawned,g.total);assert(Number.isFinite(g.player.x));}});
test('New river maps have walkable routes from player to all enemy spawn lanes',()=>{
 for(let level=1;level<=5;level++){
  const grid=createMap(level),seen=new Set(['9,24']),queue=[[9,24]];
  for(let i=0;i<queue.length;i++){
   const [x,y]=queue[i];
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
    if(nx<0||ny<0||nx>=26||ny>=26||seen.has(key)||![0,4].includes(grid[ny][nx])||(nx>=12&&nx<=13&&ny>=24))continue;
    seen.add(key);queue.push([nx,ny]);
   }
  }
  for(const x of [1,12,24])assert(seen.has(`${x},0`),`Level ${level}: spawn ${x} is disconnected`);
  for(const tile of [1,2,3,4])assert(grid.flat().includes(tile),`Level ${level} missing terrain ${tile}`);
 }
});
console.log(`${passed} regression tests passed.`);
