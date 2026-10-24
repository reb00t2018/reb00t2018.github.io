'use strict';
const SERVER=(window.LEGEND_SERVER||'').replace(/\/$/,'');
const ASSET_BASE=(window.LEGEND_ASSET_BASE||'').replace(/\/$/,'');
const ASSET_CDN=(window.LEGEND_ASSET_CDN||'').replace(/\/$/,'');
const ASSET_WEBP=!!window.LEGEND_ASSET_WEBP;
const ASSET_MANIFEST=!!window.LEGEND_ASSET_MANIFEST;
const serverURL=p=>SERVER&&typeof p==='string'&&p.startsWith('/')?SERVER+p:p;
const localAssetURL=p=>ASSET_BASE&&typeof p==='string'&&p.startsWith('/')?ASSET_BASE+p:p;
const assetURL=p=>{
 if(typeof p!=='string'||!p.startsWith('/'))return p;
 if(ASSET_CDN)return ASSET_CDN+p;
 return localAssetURL(p);
};
const imageURL=p=>ASSET_WEBP?assetURL(p).replace(/\.png$/,'.webp'):assetURL(p);
function setImage(im,path,onerror){
 const local=localAssetURL(path);
 im.onerror=()=>{if(ASSET_CDN&&im.src!==new URL(local,location.href).href){im.src=local;im.onerror=null}else{if(onerror)onerror();else status('图片读取失败，请刷新重试')}};
 im.src=imageURL(path);
}
async function fetchAsset(path){
 const remote=assetURL(path);
 try{const r=await fetch(remote);if(!r.ok)throw Error('asset '+r.status);return r}
 catch(e){const local=localAssetURL(path);if(remote!==local)return fetch(local);throw e}
}
const tokenKey='legend_profile_token';
const profileToken=()=>localStorage.getItem(tokenKey)||'';
const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init={}){
 let target=input;
 if(typeof input==='string'&&/^\/api\//.test(input))target=SERVER+input;
 else if(typeof input==='string'&&/^\/(assets|audio)\//.test(input))target=assetURL(input);
 const api=typeof target==='string'&&target.includes('/api/');
 let opts=init;
 if(api){const headers=new Headers(init.headers||{});const t=profileToken();if(t)headers.set('X-Legend-Profile',t);opts={...init,headers,credentials:'include'}}
 const res=await nativeFetch(target,opts);
 if(api){try{const d=await res.clone().json();if(d&&d.profile)localStorage.setItem(tokenKey,d.profile)}catch{}}
 return res;
};
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const TW=48,TH=32,classes={warrior:'战士',wizard:'法师',taoist:'道士'};
let bagMulti=false,bagPending='',discardIds=[];const bagSelection=new Set();
let growthTab="quest",selectedSkillId=null;
let portals=[],activeNPC=null,bagRepairNPC=null,bagRepairMessage='';
let merchantMode='buy',merchantPage=0,merchantSelected='',merchantPending=false,merchantVisible=true,merchantMessage='';
let ws=null,me=null,chatOpen=false,roles=[],selectedRole=null,selectedItem='cloth',npcs=[],npcHits=[],drawing=false,equipPending=false,inviteBound=false,inviteChecked=false,accountBound=false,accountChecked=false,loginMode='invite';
let classicScale=1,currentScene={id:0,name:'银杏山谷',province:'比奇省',music:'/audio/field2.wav'},sceneEpoch=0;
for(const id of ['chat','chat-form','hint','game-actions'])$('classic-panel').appendChild($(id));
$('attack-btn').textContent='攻击';$('talk-btn').textContent='交谈';$('switch-btn').textContent='选角';
const players=new Map(),mapCache=new Map(),regionCache=new Set(),spriteCache=new Map();
function status(text=''){$('status').textContent=text}
function redraw(){if(!drawing){drawing=true;requestAnimationFrame(()=>{drawing=false;draw();if(me)redraw()})}}
function log(name,text){const d=document.createElement('div');d.textContent=`[${name}] ${text}`;$('chat').appendChild(d);while($('chat').children.length>100)$('chat').firstChild.remove();$('chat').scrollTop=$('chat').scrollHeight}
function send(op,extra={}){if(ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify({op,...extra}));return true}return false}
function portrait(c){return {warrior:40,wizard:120,taoist:200}[c.class]+(c.gender==='female'?40:0)}
function renderRoles(){
 for(let i=0;i<2;i++){const c=roles[i],button=$(`role-${i}`),im=$(`portrait-${i}`),stats=$(`stats-${i}`);button.classList.toggle('active',!!c&&c.id===selectedRole);button.setAttribute('aria-pressed',String(!!c&&c.id===selectedRole));stats.replaceChildren();
  if(c){setImage(im,`/assets/ChrSel/${portrait(c)}.png`);im.alt=`${c.name}，${classes[c.class]}`;$(`empty-${i}`).hidden=true;for(const text of [c.name,String(c.level||1),classes[c.class]]){const d=document.createElement('div');d.textContent=text;stats.appendChild(d)}button.setAttribute('aria-label',`选择${c.name}，${classes[c.class]}，${c.gender==='female'?'女':'男'}`)}
  else{im.removeAttribute('src');im.alt='';$(`empty-${i}`).hidden=false;button.setAttribute('aria-label',`创建第${i+1}个角色`)}
 }
 const c=roles.find(c=>c.id===selectedRole);$('selection-name').textContent=c?`${c.name} · ${classes[c.class]}`:'请选择或创建角色';$('login-btn').disabled=!c||(ws&&ws.readyState<2);$('create-btn').disabled=roles.length>=2;
}
function showLoginPane(mode){
 loginMode=mode;
 $('invite-form').hidden=mode!=='invite';$('bind-form').hidden=mode!=='bind';$('email-form').hidden=mode!=='email';
 $('login-tabs').hidden=mode==='bind';
 document.querySelectorAll('#login-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.loginMode===mode));
 $('invite-error').textContent='';$('bind-error').textContent='';$('login-error').textContent='';
 if(!$('login-dialog').open)$('login-dialog').showModal();
 if(mode==='invite')$('invite-code').focus();else if(mode==='bind')$('bind-email').focus();else $('login-email').focus();
}
function openLogin(mode='invite'){showLoginPane(mode)}
async function checkInvite(){try{const r=await fetch('/api/invite',{cache:'no-store'});if(!r.ok)throw Error('邀请码状态读取失败');const d=await r.json();inviteBound=!!d.bound;inviteChecked=true;return inviteBound}catch(e){status(e.message);return false}}
async function checkAccount(){try{const r=await fetch('/api/account',{cache:'no-store'});if(!r.ok)throw Error('邮箱绑定状态读取失败');const d=await r.json();accountBound=!!d.bound;accountChecked=true;return accountBound}catch(e){status(e.message);return false}}
async function loadRoles(){
 if(!inviteChecked)await checkInvite();
 if(!accountChecked)await checkAccount();
 if(!inviteBound||!accountBound){if($('stage').classList.contains('select'))openLogin(!inviteBound?'invite':'bind');return}
 try{const r=await fetch('/api/characters',{cache:'no-store'});if(r.status===403){const d=await r.json().catch(()=>({}));if(d.invite_required){inviteBound=false;openLogin('invite');return}if(d.account_required){accountBound=false;openLogin(inviteBound?'bind':'invite');return}}if(!r.ok)throw Error('角色读取失败，请刷新重试');roles=await r.json();if(!roles.some(c=>c.id===selectedRole))selectedRole=roles[0]?.id||null;renderRoles()}catch(e){status(e.message)}
}
function openCreate(){if(roles.length>=2){status('两个角色槽已满，请选择已有角色');return}$('create-error').textContent='';$('create-dialog').showModal();$('character-name').focus()}
for(let i=0;i<2;i++)$(`role-${i}`).onclick=()=>{playMusic();if(roles[i]){selectedRole=roles[i].id;renderRoles()}else openCreate()};
$('create-btn').onclick=openCreate;$('cancel-create').onclick=()=>$('create-dialog').close();
$('create-form').onsubmit=async e=>{e.preventDefault();$('confirm-create').disabled=true;try{const r=await fetch('/api/characters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('character-name').value.trim(),class:$('character-class').value,gender:$('character-gender').value})});const data=await r.json();if(!r.ok)throw Error(data.error||'角色创建失败');selectedRole=data.id;await loadRoles();$('create-dialog').close();$('character-name').value='';status('角色已创建，点击开始游戏')}catch(e){$('create-error').textContent=e.message}finally{$('confirm-create').disabled=false}};
document.querySelectorAll('#login-tabs button').forEach(b=>b.onclick=()=>showLoginPane(b.dataset.loginMode));
$('login-dialog').addEventListener('cancel',e=>{e.preventDefault();$('login-dialog').close();$('stage').classList.remove('select')});
document.querySelectorAll('.login-cancel').forEach(b=>b.onclick=()=>{$('login-dialog').close();$('stage').classList.remove('select')});
$('invite-form').onsubmit=async e=>{e.preventDefault();const code=$('invite-code').value.trim();if(!code)return;$('invite-submit').disabled=true;$('invite-error').textContent='';try{const r=await fetch('/api/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'邀请码无效');inviteBound=true;inviteChecked=true;$('invite-code').value='';if(accountBound){$('login-dialog').close();await loadRoles()}else{showLoginPane('bind')}}catch(err){$('invite-error').textContent=err.message}finally{$('invite-submit').disabled=false}};
$('bind-form').onsubmit=async e=>{e.preventDefault();const email=$('bind-email').value.trim();$('bind-submit').disabled=true;$('bind-error').textContent='';try{const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'绑定失败');accountBound=true;accountChecked=true;$('login-dialog').close();$('bind-email').value='';status('邮箱绑定成功，可用于找回角色');await loadRoles()}catch(err){$('bind-error').textContent=err.message}finally{$('bind-submit').disabled=false}};
$('email-form').onsubmit=async e=>{e.preventDefault();const email=$('login-email').value.trim();$('email-submit').disabled=true;$('login-error').textContent='';try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'登录失败');inviteBound=true;inviteChecked=true;accountBound=true;accountChecked=true;$('login-dialog').close();$('stage').classList.add('select');setMusic('/audio/main_theme.wav');playMusic();status('邮箱登录成功');await loadRoles()}catch(err){$('login-error').textContent=err.message}finally{$('email-submit').disabled=false}};
$('gate-btn').onclick=()=>{$('stage').classList.add('select');setMusic('/audio/main_theme.wav');playMusic();loadRoles()};$('back-btn').onclick=()=>{$('stage').classList.remove('select');setMusic('/audio/log-in-long2.wav')};
$('login-btn').onclick=()=>{if(!selectedRole||(ws&&ws.readyState<2))return;playMusic();$('login-btn').disabled=true;status('正在进入银杏山谷…');const wsBase=SERVER||location.origin,wsProto=wsBase.startsWith('https')?'wss':'ws',wsHost=wsBase.replace(/^https?:\/\//,''),wsToken=profileToken();ws=new WebSocket(`${wsProto}://${wsHost}/ws?profile=${encodeURIComponent(wsToken)}`);
 ws.onopen=()=>send('login_character',{character_id:selectedRole});
 ws.onclose=()=>{cancelQuestRoute();setMusic('/audio/main_theme.wav');stopMonsterSounds();me=null;$('classic-hud').hidden=true;document.body.classList.remove('in-game');resetControls();chatOpen=false;$('chat-input').value='';$('chat-input').blur();$('chat').replaceChildren();chatBubbles.clear();players.clear();npcs=[];for(const d of document.querySelectorAll('dialog[open]'))d.close();$('game-actions').hidden=true;$('game-screen').style.display='none';$('login-screen').style.display='grid';$('stage').classList.add('select');equipPending=false;loadRoles();status('已返回选角，可以选择角色再次进入')};
 ws.onerror=()=>status('连接失败，请检查服务是否运行');ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}
  if(m.op==='growth'){const old=me;applyPlayer(m.data);if(m.data.id===me?.id){equipPending=false;renderGrowth();if($('inventory-dialog').open)renderBag();if($('npc-dialog').open)renderServices();if(old&&m.data.hp>old.hp)damageLabels.push({x:m.data.x,y:m.data.y,text:'+'+(m.data.hp-old.hp),start:performance.now(),color:'#8cffa6'});$('growth-feedback').textContent='角色成长已保存'}}
  if(m.op==='portals'){portals=m.data||[];updateGate()}
  if(m.op==='traded'){merchantPending=false;merchantMessage='交易完成，物品已放入背包。';applyPlayer(m.data);equipPending=false;renderBag();renderServices();renderGrowth();status('交易／用药完成，背包与金币已保存')}
  if(m.op==='repaired'){bagRepairMessage='修理完成，所选物品的持久已恢复。';merchantPending=false;merchantMessage='修理完成，持久已恢复。';applyPlayer(m.data);renderBag();renderServices();renderGrowth();status('修理完成，耐久已恢复，金币已扣除并保存')}
  if(m.op==='scene')changeScene(m.data);if(m.op==='relocated'){if(me&&m.data.id===me.id){motions.clear();players.delete(me.id);stopActions();me=m.data;regionCache.clear();loadRegion();applyPlayer(m.data,false);hud();status('已到达'+currentScene.name)}}
  if(m.op==='drops')updateDrops(m.data);
  if(m.op==='picked_up'){applyPlayer(m.data.player);pickupTarget=null;if(m.data.item_id)selectedItem=m.data.item_id;renderBag();status('拾取了'+m.data.name);log('拾取',m.data.name+(m.data.gold?'已存入金币':'已放入背包'))}
  if(m.op==='guard_hit'||m.op==='player_hit'){const c=m.data;if(c.attacker)applyPlayer(c.attacker);applyPlayer(c.player);damageLabels.push({x:c.player.x,y:c.player.y,text:'−'+c.damage,start:performance.now(),color:'#ff6254'});if(m.op==='guard_hit')guardArrows.push({x:c.from_x,y:c.from_y,tx:c.player.x,ty:c.player.y,start:performance.now()});if(c.player.id===me?.id){playSfx('hit');log('受伤',c.attacker_name+'造成 '+c.damage+' 点伤害')}else if(c.attacker?.id===me?.id)playSfx('swing')}
  if(m.op==='monster_hit')receiveMonsterHit(m.data);
  if(m.op==='vitals')applyPlayer(m.data);
  if(m.op==='revived'){motions.delete(m.data.id);players.delete(m.data.id);if(m.data.id===me?.id){me=m.data;stopActions();if($('death-dialog').open)$('death-dialog').close();loadRegion()}applyPlayer(m.data,false);hud();if(m.data.id===me?.id)status('已回到安全区，生命与魔法恢复')}
  if(m.op==='welcome'){me=m.data;$('classic-hud').hidden=false;document.body.classList.add('in-game');players.set(me.id,me);$('game-screen').style.display='block';$('login-screen').style.display='none';$('game-actions').hidden=false;status();loadRegion();hud();updateMapMusic();log('系统',`${me.name}来到${currentScene.name}。打开背包，准备好衣服与木剑。`)}
  if(m.op==='players'){for(const p of m.data)applyPlayer(p,false)}
  if(m.op==='monsters')updateMonsters(m.data);
  if(m.op==='combat')receiveCombat(m.data);if(m.op==='rankings')receiveRankings(m.data);if(m.op==='skill_effect'){const p=m.data.player;addSkillEffect('heal',p.x,p.y,p.x,p.y)}
  if(m.op==='npcs'){npcs=m.data;hud()}
  if(m.op==='join')applyPlayer(m.data,false);
  if(m.op==='move'||m.op==='inventory'){applyPlayer(m.data);if(m.data.id===me?.id){if(m.op==='inventory'){equipPending=false;if(bagPending){status(bagPending==='sort'?'背包已按类别整理并保存':'所选物品已销毁');bagPending='';bagSelection.clear();discardIds=[];bagMulti=false;}renderBag();if($('growth-dialog').open)renderGrowth();status('背包与装备已保存')}}}
  if(m.op==='leave'){players.delete(m.id);motions.delete(m.id)}
  if(m.op==='chat')receiveChat(m.data);
  if(m.op==='dialogue'){showDialogue(m.data);status()}
  if(m.op==='error'){if(bagRepairNPC)bagRepairMessage=m.msg;merchantPending=false;merchantMessage=m.msg;bagPending='';$('growth-feedback').textContent=m.msg;status(m.msg);log('提示',m.msg);equipPending=false;renderBag();renderServices();if($('growth-dialog').open)renderGrowth();if(!me)ws.close()}
  redraw();
 };
};
$('switch-btn').onclick=()=>ws?.close();
addEventListener('pagehide',()=>ws?.close());
function hud(){if(!me)return;growthHUD();updateLocation();$('hud-name').textContent=`${me.name} · ${classes[me.class]||'新手'}`;$('hp-fill').style.width=100*me.hp/me.max_hp+'%';$('mp-fill').style.width=100*me.mp/me.max_mp+'%';$('hud-stats').textContent=`Lv.${me.level}  攻击 ${me.attack_min??me.attack}–${me.attack}  防御 ${me.defense}`;$('exp-fill').style.width=(me.next_exp>0?Math.min(1,(me.exp||0)/me.next_exp)*100:0)+'%';$('exp-text').textContent=`经验 ${me.exp||0} / ${me.next_exp>0?me.next_exp:'后续等级待校准'}`;$('hud-pos').textContent=`(${me.x}, ${me.y}) ${currentScene.province} · ${currentScene.name}`;$('talk-btn').disabled=!nearestNPC();updateVitals();$('equipment-stats').textContent=`${me.name}  |  攻击 ${me.attack_min??me.attack}–${me.attack} · 防御 ${me.defense}`}
function bagItems(){return (me?.inventory||[]).filter(item=>!item.equipped)}
function openBag(){if(!me||me.dead)return;renderBag();if(!$('inventory-dialog').open)$('inventory-dialog').show()}
$('bag-btn').onclick=openBag;$('close-bag').onclick=()=>$('inventory-dialog').close();
function renderBag(){if(!me)return;for(const id of bagSelection){if(!me.inventory.some(i=>i.id===id&&canDiscard(i)))bagSelection.delete(id)}const items=bagItems();if(!items.some(item=>item.id===selectedItem))selectedItem='';const grid=$('bag-grid');grid.replaceChildren();for(let i=0;i<40;i++){const item=items[i],b=document.createElement('button');b.type='button';b.className='bag-cell';if(item){b.dataset.itemId=item.id;b.classList.toggle('selected',item.id===selectedItem&&!bagMulti);b.classList.toggle('marked',bagSelection.has(item.id));b.classList.toggle('protected',bagMulti&&!canDiscard(item));if(bagMulti){b.setAttribute('aria-pressed',String(bagSelection.has(item.id)));}b.setAttribute('aria-label',item.name+(item.equipped?'，已装备':'，未装备'));const im=document.createElement('img');setImage(im,`/assets/Items/${item.icon}.png`);im.alt=item.name;b.appendChild(im);if(item.equipped){const t=document.createElement('span');t.className='badge';t.textContent='✓';b.appendChild(t)}b.title=item.name+' · '+item.description+(item.equipped?'（已装备）':'');b.onclick=()=>{if(bagRepairNPC&&merchantPending)return;selectedItem=item.id;bagRepairMessage='';if(bagMulti&&canDiscard(item)&&!equipPending){if(bagSelection.has(item.id))bagSelection.delete(item.id);else bagSelection.add(item.id)}renderBag()};b.ondblclick=()=>{if(bagMulti||bagRepairNPC)return;selectedItem=item.id;$('equip-btn').click()}}else{b.disabled=true;b.setAttribute('aria-label','空背包格')}grid.appendChild(b)}
 const slots=$('equipment-slots');slots.replaceChildren();for(const [slot,label]of [['armor','衣服'],['weapon','武器']]){const item=me.inventory.find(i=>i.slot===slot&&i.equipped);const d=document.createElement('div');d.className='equipment-slot';d.textContent=`${label}：${item?.name||'未装备'}`;slots.appendChild(d)}
 const item=me.inventory.find(i=>i.id===selectedItem);if($('equip-side'))$('equip-side').hidden=!['ring','bracelet'].includes(item?.slot);const discard=$('discard-item');if(discard){discard.hidden=bagMulti||!canDiscard(item);discard.disabled=equipPending||!canDiscard(item)}$('item-name').textContent=item?.name||'选择物品';$('item-description').title=item?.description||'';$('item-description').textContent=item?(item.description+(['book','consumable'].includes(item.slot)?'':' · 持久 '+item.durability+'/'+item.max_durability)+' · '+(item.slot==='book'?'双击或USE学习':item.slot==='consumable'?'双击或USE用药':item.equipped?'已装备，USE卸下':'双击或USE穿戴')):'';$('bag-gold').textContent='金币 '+Number(me.gold||0).toLocaleString('zh-CN');$('equip-btn').disabled=bagMulti||!item||equipPending||(!item.equipped&&(me.level<(item.required_level||0)||(item.required_class&&item.required_class!==me.class)));$('equip-btn').textContent=equipPending?'保存中…':item?.slot==='book'?'学习':item?.slot==='consumable'?'用药':item&&!item.equipped&&(me.level<(item.required_level||0)||(item.required_class&&item.required_class!==me.class))?(item.required_class&&item.required_class!==me.class?'职业不符':'等级不足'):item?.equipped?'卸下':item?.slot==='weapon'?'装备':'穿戴';renderBagActions();renderBagRepair();hud();
}
const sideSelect=document.createElement('select');sideSelect.id='equip-side';sideSelect.setAttribute('aria-label','首饰佩戴位置');sideSelect.innerHTML='<option value="">自动选择空位</option><option value="left">左侧</option><option value="right">右侧</option>';$('bag-actions').appendChild(sideSelect);
$('equip-btn').onclick=()=>{if(bagRepairNPC){confirmBagRepair();return}const item=bagItems().find(i=>i.id===selectedItem);if(!item||equipPending)return;if(item.slot==='consumable'){equipPending=true;send('use_item',{item_id:item.id});renderBag();return}if(item.slot==='book'){send('learn',{skill_id:item.id.slice(5)});return}equipPending=true;if(!send(item.equipped?'unequip':'equip',{item_id:item.id,equip_slot:['ring','bracelet'].includes(item.slot)&&sideSelect.value?item.slot+'_'+sideSelect.value:''})){equipPending=false;status('连接已断开')}renderBag()};
function nearestNPC(){if(!me)return null;return npcs.filter(n=>Math.max(Math.abs(n.x-me.x),Math.abs(n.y-me.y))<=6).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0]||null}
$('talk-btn').onclick=()=>{const n=nearestNPC();if(n)send('talk',{npc_id:n.id})};
function fitMerchant(){const scale=Math.min(1.35,(innerWidth-32)/416,(innerHeight-48)/456),height=merchantVisible?456:176;$('npc-stage').style.zoom=String(scale);$('npc-dialog').style.width=416*scale+'px';$('npc-dialog').style.height=height*scale+'px';$('npc-dialog').style.left=Math.max(8,Math.min(24,(innerWidth-416*scale)/2))+'px'}
addEventListener('resize',fitMerchant);
function showDialogue(d){bagRepairNPC=null;bagRepairMessage='';if($('inventory-dialog').open)renderBag();activeNPC=d;merchantMode=d.products?.length?'buy':'repair';merchantPage=0;merchantSelected='';merchantPending=false;merchantMessage='';merchantVisible=!!d.products?.length;renderServices();$('npc-name').textContent=d.name;$('npc-lines').replaceChildren();for(const line of d.lines){const p=document.createElement('p');p.textContent=line;$('npc-lines').appendChild(p)}fitMerchant();if(!$('npc-dialog').open)$('npc-dialog').showModal()}

for(const id of ['close-npc','npc-goodbye'])$(id).onclick=()=>$('npc-dialog').close();$('npc-bag').onclick=()=>{$('npc-dialog').close();openBag()};
const bgm=$('bgm');let musicAllowed=localStorage.getItem('legend_music')!=='off';bgm.volume=Number(localStorage.getItem('legend_volume')||.3);$('volume').value=bgm.volume*100;
function musicLabel(){$('music-btn').textContent=!bgm.getAttribute('src')?'♫ 当前场景无配乐':bgm.paused?'♫ 开启音乐':'♫ 音乐播放中';$('music-btn').setAttribute('aria-pressed',String(!bgm.paused&&!!bgm.getAttribute('src')))}
function setMusic(original){const local=localAssetURL(original),path=assetURL(original);if(!path){if(bgm.getAttribute('src')){bgm.pause();bgm.removeAttribute('src');bgm.load()}musicLabel();return}const next=new URL(path,location.href).href;if(bgm.src!==next){bgm.pause();bgm.src=path;bgm.dataset.local=local;bgm.onerror=()=>{if(path!==local&&bgm.getAttribute('src')!==local){bgm.src=local;bgm.load()}else status('音乐读取失败，请刷新重试')};bgm.load()}playMusic();musicLabel()}
function playMusic(){if(musicAllowed&&bgm.getAttribute('src'))bgm.play().then(musicLabel).catch(()=>{musicLabel()})}
$('music-btn').onclick=()=>{musicAllowed=bgm.paused;if(musicAllowed)playMusic();else bgm.pause();localStorage.setItem('legend_music',musicAllowed?'on':'off');musicLabel()};$('volume').oninput=()=>{bgm.volume=Number($('volume').value)/100;localStorage.setItem('legend_volume',String(bgm.volume))};bgm.onplay=musicLabel;bgm.onpause=musicLabel;bgm.onerror=()=>status('音乐读取失败，请刷新重试');musicLabel();
async function loadRegion(){if(!me)return;const epoch=sceneEpoch,mapID=me.map_id;const x=Math.max(0,Math.floor((me.x-24)/16)*16),y=Math.max(0,Math.floor((me.y-24)/16)*16),key=x+','+y;if(regionCache.has(key))return;regionCache.add(key);try{const r=await fetch(`/api/map?map_id=${mapID}&x=${x}&y=${y}&w=64&h=64`);if(!r.ok)throw Error('地图读取失败');const d=await r.json();if(epoch!==sceneEpoch)return;for(const c of d.cells)mapCache.set(`${c.x},${c.y}`,c);redraw()}catch(e){status(e.message+'，刷新重试')}}
const libMeta=new Map();
function metaFor(lib){if(!libMeta.has(lib))libMeta.set(lib,fetchAsset(`/assets/${lib}/meta.json`).then(r=>{if(!r.ok)throw Error();return r.json()}));return libMeta.get(lib)}
function sprite(lib,index){if(index<0)return null;const key=`${lib}/${index}`;if(spriteCache.has(key))return spriteCache.get(key);const f={ready:false};spriteCache.set(key,f);
 const meta=ASSET_MANIFEST?metaFor(lib).then(m=>{const v=m[index];if(!v)throw Error('metadata missing');return v}):fetchAsset(`/assets/${key}.json`).then(r=>{if(!r.ok)throw Error();return r.json()});
 Promise.all([meta,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);setImage(im,`/assets/${key}.png`,reject)})]).then(([m,im])=>{Object.assign(f,m,{im,ready:true});redraw()}).catch(()=>{f.failed=true});return f;
}
function draw(){
 ctx.fillStyle='#10130d';ctx.fillRect(0,0,canvas.width,canvas.height);if(!me)return;
 const now=performance.now(),camera=positionOf(me,motions.get(me.id),now),cx=Math.floor(camera.x*TW-canvas.width/2),cy=Math.floor(camera.y*TH-gameCenterY());npcHits=[];monsterHits=[];playerHits=[];dropHits=[];updateGate();
 const sx=Math.floor(cx/TW)-3,sy=Math.floor(cy/TH)-10,ex=Math.ceil((cx+canvas.width)/TW)+3,ey=Math.ceil((cy+canvas.height)/TH)+10;
 function tile(c,layer){if(c[layer]<0)return;const f=sprite(c[layer+'Library'],c[layer]);if(f?.ready)ctx.drawImage(f.im,c.x*TW-cx,layer==='back'?c.y*TH-cy:c.y*TH-cy+TH-f.height)}
 function actor(lib,index,x,y,fallback){let f=sprite(lib,index);if(!f?.ready&&fallback!==undefined)f=sprite(lib,fallback);if(f?.ready)ctx.drawImage(f.im,Math.round(x+f.offsetX),Math.round(y+f.offsetY));return f}
 function label(text,x,y,color){ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillStyle=color;ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText(text,x,y);ctx.shadowBlur=0}
 function frameFor(table,motion,dir,seed=0){const moving=motion&&now-motion.start<motion.duration,action=moving?motion.action:'idle',a=table[action]||table.idle;const frame=moving?Math.min(a.count-1,Math.floor((now-motion.start)/motion.duration*a.count)):Math.floor((now+seed*53)/220)%a.count;return {index:a.offset+dir*a.stride+frame,a}}
 for(let y=sy;y<=ey;y++)for(let x=sx;x<=ex;x++){const c=mapCache.get(`${x},${y}`);if(!c)continue;if(x%2===0&&y%2===0)tile(c,'back');tile(c,'middle')}
 for(const d of groundDrops.values()){
  const x=d.x*TW-cx+24,y=d.y*TH-cy+12;if(x<0||x>canvas.width||y<0||y>canvas.height)continue;
  ctx.fillStyle='#e6be5855';ctx.beginPath();ctx.ellipse(x,y+8,17,7,0,0,Math.PI*2);ctx.fill();
  const f=sprite('Items',d.icon);if(f?.ready)ctx.drawImage(f.im,x-f.width/2,y-f.height/2);
  label(d.name+(d.required_level?' · Lv.'+d.required_level:''),x,y-22,d.required_level>=5?'#a9d6ff':'#f9dd79');dropHits.push({d,x:x-28,y:y-36,w:56,h:55});
 }
 for(const g of portals){const x=g.x*TW-cx+24,y=g.y*TH-cy+16;if(x<-100||x>canvas.width+100||y<-100||y>canvas.height+100)continue;ctx.strokeStyle='#d6bc6c';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,22,10,0,0,Math.PI*2);ctx.stroke();label(g.name+' · 走入',x,y-18,'#ffe5a1')}
 const entities=[];for(const n of npcs)entities.push({kind:'npc',p:n,pos:n});
 for(const m of monsters.values())if(m.hp>0)entities.push({kind:'monster',p:m,pos:positionOf(m,monsterMotions.get(m.id),now)});
 for(const p of players.values())entities.push({kind:'player',p,pos:positionOf(p,motions.get(p.id),now)});
 entities.sort((a,b)=>a.pos.y-b.pos.y);let ei=0;
 function drawEntity(e){const p=e.p,x=e.pos.x*TW-cx,py=e.pos.y*TH-cy;if(x < -200||x>canvas.width+200||py < -200||py>canvas.height+200)return;
  if(e.kind==='npc'){const f=actor(p.library||'npc',p.frame+(p.guard?Math.floor(now/250)%4:0),x,py);label(p.name,x+24,py-65,'#d4f1a6');if(f?.ready)npcHits.push({n:p,x:x+f.offsetX-8,y:py+f.offsetY-18,w:f.width+16,h:f.height+24});return}
  if(e.kind==='monster'){
   const af=frameFor(monsterAnimations,monsterMotions.get(p.id),p.dir,p.id),index=(p.base||0)+af.index;
   const f=actor(p.library||'Mon1',index,x,py,(p.base||0)+p.dir*monsterAnimations.idle.stride);
   const top=f?.ready?py+f.offsetY-20:py-35;
   if(p.id===attackTarget){ctx.strokeStyle='#edb260';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x+24,py+20,24,12,0,0,Math.PI*2);ctx.stroke()}
   label(p.name+' Lv.'+(p.level||1),x+24,top,'#ffdf9f');ctx.fillStyle='#21100e';ctx.fillRect(x+3,top+5,42,4);ctx.fillStyle='#bd4940';ctx.fillRect(x+3,top+5,42*p.hp/p.max_hp,4);ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.strokeRect(x+2.5,top+4.5,43,5);ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillStyle='#e6cf9a';ctx.fillText('防'+(p.defense??0),x+49,top+10);
   if(f?.ready)monsterHits.push({m:p,x:x+f.offsetX-8,y:py+f.offsetY-18,w:f.width+16,h:f.height+24});return;
  }
  const g=p.gender==='female'?600:0,base=(p.armor_base??(p.armor?1200:0))+g,af=frameFor(playerAnimations,motions.get(p.id),p.dir,p.id),body=base+af.index,weapon=(p.weapon_base||1200)+g+af.index;
  for(let i=0;i<af.a.count;i++){sprite('Hum',base+af.a.offset+p.dir*af.a.stride+i);if(p.weapon)sprite('Weapon',(p.weapon_base||1200)+g+af.a.offset+p.dir*af.a.stride+i)}
  if(p.weapon&&[0,1,7].includes(p.dir))actor('Weapon',weapon,x,py);
  const bodyFrame=actor('Hum',body,x,py,base+p.dir*8);if(p.id!==me.id&&bodyFrame?.ready)playerHits.push({p,x:x+bodyFrame.offsetX-6,y:py+bodyFrame.offsetY-10,w:bodyFrame.width+12,h:bodyFrame.height+20});
  if(p.weapon&&![0,1,7].includes(p.dir))actor('Weapon',weapon,x,py);
  label(p.name,x+24,py-55,p.red_name?'#ff4141':'#fff1be');const bubble=chatBubbles.get(p.id);if(bubble&&bubble.until>now)label(bubble.text,x+24,py-80,'#fff5cd');
 }
 for(let y=sy;y<=ey;y++){
  for(let x=sx;x<=ex;x++){const c=mapCache.get(`${x},${y}`);if(c)tile(c,'front')}
  while(ei<entities.length&&Math.floor(entities[ei].pos.y)<=y)drawEntity(entities[ei++]);
 }
 for(let i=damageLabels.length-1;i>=0;i--){const d=damageLabels[i],age=now-d.start;if(age>1000){damageLabels.splice(i,1);continue}ctx.globalAlpha=1-age/1100;ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.fillStyle=d.color;ctx.fillText(d.text,d.x*TW-cx+24,d.y*TH-cy-35-age/25);ctx.globalAlpha=1}
 for(let i=guardArrows.length-1;i>=0;i--){const a=guardArrows[i],t=(now-a.start)/300;if(t>1){guardArrows.splice(i,1);continue}const dx=(a.tx-a.x)*TW,dy=(a.ty-a.y)*TH,x=a.x*TW-cx+24+dx*t,y=a.y*TH-cy-40+dy*t;ctx.strokeStyle='#ffe7ab';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-dx*.12,y-dy*.12);ctx.lineTo(x,y);ctx.stroke()}
 drawSkillEffects(now,cx,cy);
 if(destination){const x=destination.x*TW-cx+24,y=destination.y*TH-cy+16;ctx.strokeStyle='#e4c27a';ctx.beginPath();ctx.ellipse(x,y,16,8,0,0,Math.PI*2);ctx.stroke()}
}
function gameCenterY(){return (canvas.height-190*classicScale)/2}
function resize(){classicScale=Math.min(1,innerWidth/800);document.documentElement.style.setProperty('--classic-scale',classicScale);canvas.width=innerWidth;canvas.height=innerHeight;ctx.imageSmoothingEnabled=false;$('stage').style.transform=`scale(${Math.min(1,innerWidth/800,innerHeight/650)})`;redraw()}
window.addEventListener('resize',resize);resize();loadRoles();
const keyDir={ArrowUp:0,w:0,ArrowRight:2,d:2,ArrowDown:4,s:4,ArrowLeft:6,a:6,q:7,e:1,z:5,c:3};
// Animation timing is driven by accepted server actions; rendering interpolates between tiles.
const motions=new Map(),monsters=new Map(),monsterMotions=new Map(),damageLabels=[];
const groundDrops=new Map();let dropHits=[],pickupTarget=null;
let playerHits=[],guardArrows=[];const skillEffects=[];let pkMode=false,questRoute=null,questRequest=0,rankingData=null,rankingTab='level';
let monsterHits=[],attackTarget=null,destination=null,runMode=false,heldDirection=null,shiftHeld=false,nextInputAt=0;
const heldKeys=new Map();
const playerAnimations={idle:{offset:0,stride:8,count:4},walk:{offset:64,stride:8,count:6},run:{offset:128,stride:8,count:6},attack:{offset:192,stride:8,count:6}};
const monsterAnimations={idle:{offset:0,stride:10,count:4},walk:{offset:80,stride:10,count:6},attack:{offset:160,stride:10,count:6}};
function positionOf(p,motion,now=performance.now()){
 if(!motion)return {x:p.x,y:p.y};
 const t=Math.min(1,Math.max(0,(now-motion.start)/motion.duration));
 return {x:motion.x+(p.x-motion.x)*t,y:motion.y+(p.y-motion.y)*t};
}
function applyPlayer(p,animate=true){
 const old=players.get(p.id),prior=motions.get(p.id),now=performance.now();
 if(animate&&old&&p.action_seq!==old.action_seq){
  const from=positionOf(old,prior,now),action=p.action||'idle';
  const motion={x:from.x,y:from.y,start:now,duration:p.duration_ms||360,action,seq:p.action_seq};motions.set(p.id,motion);
  if(p.id===me?.id&&(action==='walk'||action==='run')){
   playSfx('step');setTimeout(()=>{if(me?.id===p.id&&motions.get(p.id)===motion)playSfx('step')},motion.duration/2);
  }
 }
 players.set(p.id,p);
 if(me?.id===p.id){
  const inventoryChanged=JSON.stringify(old?.inventory)!==JSON.stringify(p.inventory);
  const attributesChanged=JSON.stringify(old?.attributes)!==JSON.stringify(p.attributes)||old?.hp!==p.hp||old?.mp!==p.mp;
  me=p;loadRegion();hud();updateMapMusic();
  if(inventoryChanged){if($('inventory-dialog').open)renderBag();if($('npc-dialog').open)renderServices()}
  if($('growth-dialog').open&&growthTab==='attributes'&&(inventoryChanged||attributesChanged))renderGrowth();
 }
}
function updateMonsters(rows){
 const ids=new Set(rows.map(m=>m.id));
 for(const [id,m]of monsters)if(!ids.has(id)){monsters.delete(id);monsterMotions.delete(id)}
 for(const m of rows)applyMonster(m);
 if(attackTarget&&!monsters.get(attackTarget)?.hp)attackTarget=null;
 updateTarget();
}
function updateTarget(){
 const m=monsters.get(attackTarget);
 $('target-name').textContent=m?`${m.name} Lv.${m.level||1}  ${m.hp}/${m.max_hp}`:'点击怪物攻击 · 空格寻找附近目标';
 $('target-stats').textContent=m?`攻击 ${m.attack_min}-${m.attack_max} · 防御 ${m.defense} · 魔御 ${m.magic_defense} · 经验 ${m.exp}`:'';
 $('target-panel').classList.toggle('selected',!!m);
 $('monster-count').textContent=`附近生物 ${[...monsters.values()].filter(m=>m.hp>0&&me&&Math.max(Math.abs(m.x-me.x),Math.abs(m.y-me.y))<=16).length}`
}
function receiveCombat(c){if(c.skill_id==='fireball'||c.skill_id==='big_fireball'){const p=players.get(c.attacker_id)||me;if(p)addSkillEffect(c.skill_id,p.x,p.y,c.target_x,c.target_y)}else if(c.skill_name){const p=players.get(c.attacker_id);if(p)addSkillEffect('slash',p.x,p.y,c.target_x,c.target_y)}if(c.skill_name&&c.attacker_id===me?.id)log('技能',c.skill_name);
 const m=monsters.get(c.target_id);if(m||c.target_x!==undefined)damageLabels.push({x:m?.x??c.target_x,y:m?.y??c.target_y,text:`−${c.damage}`,start:performance.now(),color:'#ffb76f'});
 if(c.player)applyPlayer(c.player);
 const attacker=players.get(c.attacker_id);if(attacker&&me&&Math.max(Math.abs(attacker.x-me.x),Math.abs(attacker.y-me.y))<16){playSfx('swing');playMonsterSound(c.killed?c.sound_death:c.sound_hit,{x:c.target_x,y:c.target_y})}
 if(c.attacker_id===me?.id){
  if(c.killed){attackTarget=null;if(c.drop)log('掉落',c.drop.name+'落在地上，点击或按 F 拾取');status(`击败${m?.name||c.target_name||'怪物'}，获得 ${c.exp||0} 点经验`);log('战斗',`击败${m?.name||c.target_name||'怪物'}，经验 +${c.exp||0}`)}
  if(c.leveled){playSfx('level');$('level-toast').textContent=`等级提升 · Lv.${me.level}`;$('level-toast').classList.add('show');setTimeout(()=>$('level-toast').classList.remove('show'),2600);log('成长',`升到 ${me.level} 级！生命和攻击提升。`)}
 }
}
function resetControls(){questRoute=null;skillEffects.length=0;pkMode=false;$('pk-btn').textContent='和平模式';$('pk-btn').setAttribute('aria-pressed','false');$('cancel-route').hidden=true;bagRepairNPC=null;bagRepairMessage='';bagSelection.clear();bagMulti=false;bagPending='';discardIds=[];groundDrops.clear();guardArrows=[];pickupTarget=null;heldKeys.clear();heldDirection=null;shiftHeld=false;destination=null;attackTarget=null;nextInputAt=0;motions.clear();monsters.clear();monsterMotions.clear();damageLabels.length=0;updateTarget()}
function toggleRun(){runMode=!runMode;$('run-btn').textContent=runMode?'奔跑':'行走';$('run-btn').setAttribute('aria-pressed',String(runMode))}
$('run-btn').textContent='行走';$('run-btn').onclick=toggleRun;
function chooseAttack(id){if(!me)return;const m=monsters.get(id);if(!m||m.hp<=0)return;pickupTarget=null;attackTarget=id;destination=null;heldKeys.clear();heldDirection=null;nextInputAt=0;updateTarget();status(`目标：${m.name}，靠近后自动攻击；Esc 取消`)}
function attackNearest(){if(!me)return;const candidates=[...monsters.values()].filter(m=>m.hp>0).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y));if(candidates.length)chooseAttack(candidates[0].id);else status('附近没有怪物，稍后会重新刷新')}
$('attack-btn').onclick=attackNearest;
const deltas=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
function canStep(x,y,dir){const [dx,dy]=deltas[dir],cell=mapCache.get(`${x+dx},${y+dy}`);return !!cell&&!cell.blocked&&(!dx||!dy||(!mapCache.get(`${x+dx},${y}`)?.blocked&&!mapCache.get(`${x},${y+dy}`)?.blocked))}
function canMelee(from,to){const dx=to.x-from.x,dy=to.y-from.y;if(Math.max(Math.abs(dx),Math.abs(dy))>1)return false;if(!dx&&!dy)return true;const dir=deltas.findIndex(d=>d[0]===dx&&d[1]===dy);return dir>=0&&canStep(from.x,from.y,dir)}
function pathDirection(target,adjacent=false){
 const start={x:me.x,y:me.y,first:null},queue=[start],seen=new Set([`${me.x},${me.y}`]);
 for(let i=0;i<queue.length&&i<6000;i++){
  const p=queue[i],distance=Math.max(Math.abs(p.x-target.x),Math.abs(p.y-target.y));
  if(adjacent?canMelee(p,target):distance===0)return p.first;
  const order=deltas.map((d,dir)=>({dir,score:Math.hypot(p.x+d[0]-target.x,p.y+d[1]-target.y)})).sort((a,b)=>a.score-b.score);
  for(const {dir}of order){if(!canStep(p.x,p.y,dir))continue;const [dx,dy]=deltas[dir],x=p.x+dx,y=p.y+dy,key=`${x},${y}`;if(seen.has(key))continue;seen.add(key);queue.push({x,y,first:p.first??dir})}
 }
 return null;
}
function requestMove(dir,running){const [dx,dy]=deltas[dir];if(running&&!canStep(me.x+dx,me.y+dy,dir))running=false;if(send('move',{dir,run:running}))nextInputAt=performance.now()+(running?(me.run_ms||260):(me.walk_ms||360))+20}
function inputTick(){
 if(!me||me.dead||chatOpen||document.querySelector('dialog[open]')||performance.now()<nextInputAt)return;
 const held=heldDirection??[...heldKeys.values()].at(-1);
 if(held!==undefined&&held!==null){cancelQuestRoute();pickupTarget=null;destination=null;attackTarget=null;requestMove(held,runMode||shiftHeld);return}
 if(questRoute){tickQuestRoute();return}
 if(pickupTarget){const d=groundDrops.get(pickupTarget);if(!d){pickupTarget=null;return}
  if(canMelee(me,d)){send('pickup',{drop_id:d.id});pickupTarget=null;nextInputAt=performance.now()+300;return}
  const dir=pathDirection(d,true);if(dir!==null)requestMove(dir,false);else{pickupTarget=null;status('无法到达掉落物')}return;
 }
 if(attackTarget){const m=monsters.get(attackTarget);if(!m||m.hp<=0){attackTarget=null;updateTarget();return}
  if(canMelee(me,m)){send('attack',{target_id:m.id});nextInputAt=performance.now()+(me.attack_ms||550)+20;return}
  const dir=pathDirection(m,true);if(dir!==null)requestMove(dir,false);else{status('目标暂时无法到达，请换个位置');attackTarget=null;updateTarget()}return;
 }
 if(destination){if(me.x===destination.x&&me.y===destination.y){destination=null;return}const dir=pathDirection(destination);if(dir===null){status('该位置无法到达');destination=null;return}const distance=Math.max(Math.abs(destination.x-me.x),Math.abs(destination.y-me.y));requestMove(dir,destination.run&&distance>=2)}
}
setInterval(inputTick,40);
document.addEventListener('keydown',e=>{
 if(!me||e.isComposing)return;
 if(e.target.closest?.('#chat-form')){if(e.key==='Escape'){e.preventDefault();e.target.blur();chatOpen=false}return}
 if((e.key==='m'||e.key==='M'||e.key==='Tab')&&$('map-dialog').open){e.preventDefault();$('map-dialog').close();return}
 if(['q','k','c'].includes(e.key.toLowerCase())&&$('growth-dialog').open){e.preventDefault();openGrowth({q:'quest',k:'skills',c:'attributes'}[e.key.toLowerCase()]);return}
 if(e.key==='b'&&$('inventory-dialog').open){e.preventDefault();$('inventory-dialog').close();return}
 if(document.querySelector('dialog[open]'))return;
 if(e.key==='Enter'){e.preventDefault();stopActions();$('chat-input').focus();return}
 if(me.dead)return;if(e.key==='Shift'){shiftHeld=true;return}
 if(e.key==='Escape'){stopActions();$('chat-input').blur();chatOpen=false;status('已停止');return}
 if(chatOpen)return;const key=e.key.toLowerCase();
 if(['q','k','c'].includes(key)){e.preventDefault();openGrowth({q:'quest',k:'skills',c:'attributes'}[key]);return}
 if(/^f[1-8]$/.test(key)||/^[1-8]$/.test(key)){e.preventDefault();if(e.repeat)return;const sk=activeSkills()[Number(key.replace('f',''))-1];if(sk)castSkill(sk.id);return}
 if(key==='e'&&!e.repeat){e.preventDefault();enterGate();return}
 if(key==='f'&&!e.repeat){e.preventDefault();pickupNearest();return}
 if((key==='m'||key==='tab')&&!e.repeat){e.preventDefault();openMap();return}
 if(key==='b'){e.preventDefault();heldKeys.clear();openBag();return}
 if(key==='r'&&!e.repeat){e.preventDefault();toggleRun();return}
 if(e.code==='Space'){e.preventDefault();if(!e.repeat)attackNearest();return}
 const dir=keyDir[e.key]??keyDir[key];if(dir!==undefined){e.preventDefault();heldKeys.set(e.code,dir);destination=null;attackTarget=null;updateTarget();inputTick()}
});
document.addEventListener('keyup',e=>{heldKeys.delete(e.code);if(e.key==='Shift')shiftHeld=false});
window.addEventListener('blur',()=>{cancelQuestRoute();heldKeys.clear();heldDirection=null;shiftHeld=false;destination=null;attackTarget=null;updateTarget()});
document.querySelectorAll('[data-dir]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);heldDirection=Number(b.dataset.dir);destination=null;attackTarget=null;inputTick()};b.onpointerup=b.onpointercancel=()=>heldDirection=null});
function canvasTarget(e,running=false){
 if(!me||me.dead||chatOpen)return;cancelQuestRoute();
 if((e.ctrlKey||pkMode)&&!running){const h=playerHits.find(h=>e.clientX>=h.x&&e.clientX<=h.x+h.w&&e.clientY>=h.y&&e.clientY<=h.y+h.h);if(h){stopActions();send('attack_player',{target_id:h.p.id});return}}
 const loot=dropHits.find(h=>e.clientX>=h.x&&e.clientX<=h.x+h.w&&e.clientY>=h.y&&e.clientY<=h.y+h.h);if(loot&&!running){choosePickup(loot.d.id);return}
 pickupTarget=null;
 const hit=[...npcHits,...monsterHits].filter(h=>e.clientX>=h.x&&e.clientX<=h.x+h.w&&e.clientY>=h.y&&e.clientY<=h.y+h.h).sort((a,b)=>(b.n||b.m).y-(a.n||a.m).y)[0];
 if(hit&&!running){if(hit.m)chooseAttack(hit.m.id);else{destination=null;attackTarget=null;send('talk',{npc_id:hit.n.id})}return}
 const p=positionOf(me,motions.get(me.id)),x=Math.floor((e.clientX+p.x*TW-canvas.width/2)/TW),y=Math.floor((e.clientY+p.y*TH-gameCenterY())/TH),cell=mapCache.get(`${x},${y}`);
 if(!cell||cell.blocked){status('这里无法通行');return}attackTarget=null;destination={x,y,run:running||runMode};nextInputAt=0;updateTarget();inputTick();
}
canvas.onclick=e=>canvasTarget(e);canvas.oncontextmenu=e=>{e.preventDefault();canvasTarget(e,true)};
// Independent effects volume: music may be paused while game sounds remain enabled.
let soundContext=null,sfxEnabled=localStorage.getItem('legend_sfx')!=='off';const soundBuffers=new Map(),sfxStats={};
const soundFiles={step:'step.wav',swing:'swing.wav',hit:'hit.wav',death:'death.wav',level:'level.wav'};
function soundLabel(){$('sfx-btn').textContent=sfxEnabled?'音效：开':'音效：关';$('sfx-btn').setAttribute('aria-pressed',String(sfxEnabled))}soundLabel();
async function unlockSound(){
 if(!soundContext){soundContext=new AudioContext();for(const [kind,file]of Object.entries(soundFiles)){fetch(`/audio/sfx/${file}`).then(r=>{if(!r.ok)throw Error();return r.arrayBuffer()}).then(b=>soundContext.decodeAudioData(b)).then(b=>soundBuffers.set(kind,b)).catch(()=>{})}}
 if(soundContext.state==='suspended')await soundContext.resume();
}
document.addEventListener('pointerdown',unlockSound);document.addEventListener('keydown',unlockSound);
function playSfx(kind){if(!sfxEnabled||soundContext?.state!=='running'||!soundBuffers.has(kind))return;const source=soundContext.createBufferSource(),gain=soundContext.createGain();source.buffer=soundBuffers.get(kind);gain.gain.value=(kind==='step'?.22:.5)*Number($('sfx-volume').value)/100;source.connect(gain);gain.connect(soundContext.destination);source.start();sfxStats[kind]=(sfxStats[kind]||0)+1}
$('sfx-btn').onclick=()=>{sfxEnabled=!sfxEnabled;localStorage.setItem('legend_sfx',sfxEnabled?'on':'off');soundLabel();unlockSound()};
$('sfx-volume').value=localStorage.getItem('legend_sfx_volume')||70;$('sfx-volume').oninput=()=>localStorage.setItem('legend_sfx_volume',$('sfx-volume').value);

function stopActions(){questRoute=null;$('cancel-route').hidden=true;pickupTarget=null;heldKeys.clear();heldDirection=null;shiftHeld=false;destination=null;attackTarget=null;nextInputAt=0;updateTarget()}
function updateVitals(){
 if(!me)return;const hp=Math.max(0,Math.min(1,me.hp/me.max_hp)),mp=Math.max(0,Math.min(1,me.mp/me.max_mp));
 $('classic-hp').style.clipPath=`inset(${(1-hp)*100}% 50% 0 0)`;$('classic-mp').style.clipPath=`inset(${(1-mp)*100}% 0 0 50%)`;
 for(const [id,v,max,label]of [['hp-value',me.hp,me.max_hp,'HP'],['mp-value',me.mp,me.max_mp,'MP']]){const e=$(id);e.textContent=`${label} ${v}/${max}`;e.setAttribute('aria-valuenow',v);e.setAttribute('aria-valuemin',0);e.setAttribute('aria-valuemax',max)}
 $('classic-name').textContent=`${me.name} · ${classes[me.class]} · ${currentScene.name}`;$('classic-level').textContent=`${me.level} 级`;$('classic-exp').textContent=`${me.exp} / ${me.next_exp>0?me.next_exp:'待校准'}`;$('classic-gold').textContent=String(me.gold);
 const spawn=currentScene.spawn||(me.map_id===3?{x:330,y:270}:{x:632,y:617});$('safe-text').textContent=me.dead?'已倒下':Math.max(Math.abs(me.x-spawn.x),Math.abs(me.y-spawn.y))<=2?'安全区':'野外 · 留意怪物';
 if(me.dead){stopActions();for(const d of document.querySelectorAll('dialog[open]'))if(d.id!=='death-dialog')d.close();if(!$('death-dialog').open)$('death-dialog').showModal()}
}
function applyMonster(m){for(const url of [m.sound_attack,m.sound_hit,m.sound_death])loadMonsterSound(url);const old=monsters.get(m.id);if(old&&m.action_seq!==old.action_seq){const p=positionOf(old,monsterMotions.get(m.id));monsterMotions.set(m.id,{x:p.x,y:p.y,start:performance.now(),duration:m.duration_ms||600,action:m.action||'idle'})}monsters.set(m.id,m)}
function receiveMonsterHit(c){
 applyMonster(c.monster);playMonsterSound(c.monster.sound_attack,c.monster);applyPlayer(c.player);if(c.ranged)guardArrows.push({x:c.monster.x,y:c.monster.y,tx:c.target_x,ty:c.target_y,start:performance.now()});
 damageLabels.push({x:c.target_x,y:c.target_y,text:`−${c.damage}`,start:performance.now(),color:'#ff6254'});
 if(c.target_id===me?.id){playSfx('hit');document.body.classList.add('hurt');setTimeout(()=>document.body.classList.remove('hurt'),200);log('受伤',`${c.attacker_name}造成 ${c.damage} 点伤害${c.killed?'，你已倒下。':'。'}`)}
}
function changeScene(scene){
 sceneEpoch++;portals=[];activeNPC=null;for(const d of document.querySelectorAll('dialog[open]'))d.close();stopMonsterSounds();currentScene=scene;me=null;mapCache.clear();regionCache.clear();players.clear();resetControls();npcs=[];
 for(const d of document.querySelectorAll('dialog[open]'))d.close();
 $('scene').querySelector('h2').textContent=scene.name;$('scene').querySelector('p').textContent=scene.province;
 document.querySelector('.scene-note').innerHTML='初入'+scene.name+'<br>① 出生点附近为安全区<br>② 走出村落，留意主动怪物<br>③ 点击掉落装备或按 F 拾取<br>④ 底部传送可切换地图';
 if(scene.dungeon)document.querySelector('.scene-note').innerHTML='建议等级 '+scene.recommended_level+'–'+scene.max_level+'<br>① 骷髅／僵尸会主动追击<br>② 点击地面物品或按 F 拾取<br>③ M 查看出口，走入入口自动切图<br>④ 入口附近安全，注意持久与药品';
 $('death-dialog').querySelector('p').textContent=scene.dungeon?'回到本层入口恢复生命与魔法，等级和装备保留。':'回到村中恢复生命与魔法，等级和装备会保留。';
 $('revive-btn').textContent=scene.dungeon?'返回本层入口':'回村复活';
 setMusic(scene.music||null);
}
function updateMapMusic(){if(!me)return;const city=me.map_id===0&&Math.abs(me.x-343)+Math.abs(me.y-245)<=145;const town=me.map_id===3;const room=[102,103,108,109].includes(me.map_id);setMusic(city||town||room?null:('music' in currentScene?currentScene.music:'/audio/field2.wav'))}
$('death-dialog').oncancel=e=>e.preventDefault();$('revive-btn').onclick=()=>send('revive');
$('travel-btn').onclick=()=>{if(!me||me.dead)return;stopActions();for(const b of document.querySelectorAll('[data-map]'))b.disabled=Number(b.dataset.map)===me.map_id;$('travel-dialog').showModal()};
$('close-travel').onclick=()=>$('travel-dialog').close();document.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{if(send('travel',{map_id:Number(b.dataset.map)})){$('travel-dialog').close();status('正在传送…')}});

function updateDrops(rows){groundDrops.clear();for(const d of rows)groundDrops.set(d.id,d);if(pickupTarget&&!groundDrops.has(pickupTarget))pickupTarget=null}
function choosePickup(id){if(!me||me.dead)return;stopActions();pickupTarget=id;nextInputAt=0;status('前往拾取物品');inputTick()}
function pickupNearest(){if(!me)return;const d=[...groundDrops.values()].filter(d=>Math.max(Math.abs(d.x-me.x),Math.abs(d.y-me.y))<=10).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0];if(d)choosePickup(d.id);else status('附近没有掉落物')}
const monsterBuffers=new Map(),monsterVoices=new Set(),monsterSoundStats={};
function loadMonsterSound(url){
 if(!url||!soundContext||!/^\/audio\/monsters\/[0-9]+-[0-9]+\.wav$/.test(url))return Promise.resolve(null);
 if(!monsterBuffers.has(url))monsterBuffers.set(url,fetch(url).catch(()=>fetch(localAssetURL(url))).then(r=>{if(!r.ok)throw Error('sound missing');return r.arrayBuffer()}).then(b=>soundContext.decodeAudioData(b)).catch(()=>null));return monsterBuffers.get(url);
}
async function playMonsterSound(url,p){
 const epoch=sceneEpoch;if(!me||!sfxEnabled||soundContext?.state!=='running')return;
 const distance=Math.hypot(p.x-me.x,p.y-me.y);if(distance>14||monsterVoices.size>=8)return;
 const buffer=await loadMonsterSound(url);if(!buffer||epoch!==sceneEpoch||!me||!sfxEnabled||monsterVoices.size>=8)return;
 const source=soundContext.createBufferSource(),gain=soundContext.createGain(),pan=soundContext.createStereoPanner();source.buffer=buffer;gain.gain.value=.5*(1-distance/16)*Number($('sfx-volume').value)/100;pan.pan.value=Math.max(-1,Math.min(1,(p.x-me.x)/10));source.connect(gain);gain.connect(pan);pan.connect(soundContext.destination);monsterVoices.add(source);source.onended=()=>{monsterVoices.delete(source);source.disconnect();gain.disconnect();pan.disconnect()};source.start();monsterSoundStats[url]=(monsterSoundStats[url]||0)+1;
}
function stopMonsterSounds(){for(const s of monsterVoices){try{s.stop()}catch{}}monsterVoices.clear()}
$('sfx-btn').addEventListener('click',()=>{if(!sfxEnabled)stopMonsterSounds()});

function canDiscard(item){return !!item&&!item.equipped&&(item.id.startsWith('loot_')||item.slot==='book')}
const discardButton=document.createElement('button');discardButton.id='discard-item';discardButton.textContent='销毁';$('equip-btn').after(discardButton);
discardButton.onclick=()=>{const item=me?.inventory.find(i=>i.id===selectedItem);if(canDiscard(item))confirmDiscard([item.id])};
function renderBagActions(){
 $('bag-sort').disabled=equipPending;$('bag-multi').disabled=equipPending;$('bag-multi').textContent=bagMulti?'结束多选':'多选销毁';$('bag-multi').setAttribute('aria-pressed',String(bagMulti));
 $('bag-select-all').hidden=!bagMulti;$('bag-destroy').hidden=!bagMulti;$('bag-select-all').disabled=equipPending;$('bag-destroy').disabled=equipPending||!bagSelection.size;$('bag-destroy').textContent='销毁所选 ('+bagSelection.size+')';
}
$('bag-sort').onclick=()=>{if(!me||equipPending)return;if(send('sort_inventory')){equipPending=true;bagPending='sort';renderBag()}};
$('bag-multi').onclick=()=>{bagMulti=!bagMulti;bagSelection.clear();renderBag()};
$('bag-select-all').onclick=()=>{const valid=me.inventory.filter(canDiscard);const all=valid.every(i=>bagSelection.has(i.id));bagSelection.clear();if(!all)for(const i of valid)bagSelection.add(i.id);renderBag()};
$('bag-destroy').onclick=()=>confirmDiscard([...bagSelection]);
function confirmDiscard(ids){
 if(!me||equipPending)return;discardIds=ids.filter(id=>me.inventory.some(i=>i.id===id&&canDiscard(i)));if(!discardIds.length)return;
 $('destroy-count').textContent='确定销毁这 '+discardIds.length+' 件物品？销毁后无法找回。';$('destroy-list').replaceChildren();for(const id of discardIds){const item=me.inventory.find(i=>i.id===id),li=document.createElement('li');li.textContent=item.name+(item.max_durability?' · 持久 '+item.durability+'/'+item.max_durability:'');$('destroy-list').appendChild(li)}$('destroy-dialog').showModal();
}
$('cancel-destroy').onclick=()=>{$('destroy-dialog').close();discardIds=[]};
$('confirm-destroy').onclick=()=>{if(!discardIds.length||equipPending)return;if(send('discard_batch',{item_ids:discardIds})){equipPending=true;bagPending='destroy';$('destroy-dialog').close();renderBag()}};


// Chat uses authenticated server broadcasts; never render message text as HTML.
const chatBubbles=new Map(),channelNames={nearby:'附近',map:'地图',private:'私聊',world:'世界'};
function receiveChat(m){
 const row=document.createElement('div');row.className='chat-'+(channelNames[m.channel]?m.channel:'map');
 const prefix=document.createTextNode('['+(channelNames[m.channel]||'地图')+'] ');row.appendChild(prefix);
 const sender=document.createElement('button');sender.type='button';sender.className='chat-sender';sender.textContent=m.name;sender.title='点击私聊';sender.onclick=()=>{$('chat-channel').value='private';$('chat-recipient').hidden=false;$('chat-recipient').value=m.name;stopActions();$('chat-input').focus()};row.appendChild(sender);
 row.appendChild(document.createTextNode((m.channel==='private'?' → '+m.recipient:'')+'：'+m.text));$('chat').appendChild(row);while($('chat').children.length>100)$('chat').firstChild.remove();$('chat').scrollTop=$('chat').scrollHeight;
 if(m.channel==='nearby'&&m.map_id===me?.map_id)chatBubbles.set(m.sender_id,{text:[...m.text].slice(0,24).join('')+([...m.text].length>24?'…':''),until:performance.now()+5000});
}
$('chat-channel').onchange=()=>{$('chat-recipient').hidden=$('chat-channel').value!=='private';if(!$('chat-recipient').hidden)$('chat-recipient').focus();else $('chat-input').focus()};
$('chat-form').addEventListener('focusin',()=>{chatOpen=true;stopActions()});
$('chat-form').addEventListener('focusout',()=>requestAnimationFrame(()=>{chatOpen=$('chat-form').contains(document.activeElement)}));
$('chat-form').onsubmit=e=>{e.preventDefault();const text=$('chat-input').value.trim();if(!text)return;if($('chat-channel').value==='private'&&!$('chat-recipient').value.trim()){status('请输入私聊玩家名字');$('chat-recipient').focus();return}if(send('chat',{text,channel:$('chat-channel').value,recipient:$('chat-recipient').value.trim()})){$('chat-input').value='';$('chat-input').blur();chatOpen=false}};

function updateLocation(){
 if(!me)return;let name=currentScene.name;
 if(me.map_id===0){name=me.x>=280&&me.x<=420&&me.y>=175&&me.y<=320?'比奇城':me.x>=600&&me.y>=580?'银杏山谷':me.x>=270&&me.x<=320&&me.y>=590?'边界村':'比奇野外'}
 currentScene.name=name;document.querySelector('.scene-note').firstChild.textContent='当前区域：'+name;$('scene').querySelector('h2').textContent=name;$('scene').querySelector('p').textContent=`${currentScene.province} · ${me.x}, ${me.y}`;
}

document.querySelectorAll('[data-waypoint]').forEach(b=>b.onclick=()=>{if(send('travel',{map_id:0,destination:b.dataset.waypoint}))$('travel-dialog').close()});

const mapImages=new Map();let mapFocus=null,mapWhole=true,mapSelected=null;
function overviewImage(){if(!me)return null;const id=me.map_id;if(!mapImages.has(id)){const im=new Image();im.src=serverURL('/api/minimap.png?map_id='+id);mapImages.set(id,im)}return mapImages.get(id)}
function drawOverview(canvas,small){if(!me)return;const im=overviewImage(),c=canvas.getContext('2d');c.fillStyle='#11150e';c.fillRect(0,0,canvas.width,canvas.height);if(!im?.complete||!im.naturalWidth)return;
 const whole=!small&&mapWhole,focus=small?me:(mapFocus||me),sw=whole?im.naturalWidth:(small?80:140),sh=whole?im.naturalHeight:sw*1.5*canvas.height/canvas.width;
 const left=whole?0:focus.x-sw/2,top=whole?0:focus.y-sh/2;
 const scale=Math.min(canvas.width/(sw*1.5),canvas.height/sh),dw=sw*1.5*scale,dh=sh*scale,ox=(canvas.width-dw)/2,oy=(canvas.height-dh)/2;
 c.imageSmoothingEnabled=false;c.drawImage(im,left,top,sw,sh,ox,oy,dw,dh);
 const point=(p,color,size)=>{const x=ox+(p.x-left)/sw*dw,y=oy+(p.y-top)/sh*dh;if(x<0||y<0||x>canvas.width||y>canvas.height)return;c.fillStyle=color;c.strokeStyle='#10100a';c.beginPath();c.arc(x,y,size,0,Math.PI*2);c.fill();c.stroke();return {x,y}};
 for(const m of monsters.values())if(m.hp>0)point(m,'#ff3838',small?2.5:3);
 for(const g of portals)point(g,'#79c9ed',small?2:4);
 for(const n of npcs){const p=point(n,n.id===mapSelected?'#f8e899':'#9bd47c',small?2:3);if(p&&!small&&n.id===mapSelected){c.font='14px sans-serif';c.textAlign='center';c.fillStyle='#fff0bd';c.fillText(n.name,p.x,p.y-10)}}
 const p=Math.floor(performance.now()/400)%2===0?point(me,'#ffffff',small?3:4):null;if(p){c.strokeStyle='#ffffff';c.strokeRect(p.x-6,p.y-6,12,12)}
}
function mapList(){if(!me)return;const box=$('map-npcs');box.replaceChildren();for(const n of [...npcs,...portals].sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))){const b=document.createElement('button');b.textContent=n.name+' ('+n.x+','+n.y+')';b.classList.toggle('active',n.id===mapSelected);b.onclick=()=>{mapFocus=n;mapSelected=n.id;mapWhole=false;$('map-selection').textContent=n.name+' · 坐标 '+n.x+', '+n.y;mapList();drawOverview($('large-map'),false)};box.appendChild(b)}}
function openMap(){if(!me)return;stopActions();mapFocus=null;mapSelected=null;mapWhole=true;$('map-selection').textContent='白点：你 · 绿点：NPC · 红点：怪物（含鸡鹿）';mapList();if(!$('map-dialog').open)$('map-dialog').showModal();drawOverview($('large-map'),false)}
$('minimap-toggle').onclick=openMap;$('close-map').onclick=()=>$('map-dialog').close();$('map-all').onclick=()=>{mapWhole=true;mapFocus=null};$('map-near').onclick=()=>{mapWhole=false;mapFocus=null;mapSelected=null;mapList()};
setInterval(()=>{if(!me)return;drawOverview($('minimap'),true);if($('map-dialog').open){$('map-position').textContent=currentScene.name+' · '+me.x+', '+me.y;drawOverview($('large-map'),false)}},200);

function nearestGate(){if(!me||me.dead)return null;return portals.filter(g=>Math.max(Math.abs(g.x-me.x),Math.abs(g.y-me.y))<=4).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0]||null}
function updateGate(){const g=nearestGate();$('enter-gate').hidden=!g;if(g)$('enter-gate').textContent=g.name}
function enterGate(){const g=nearestGate();if(g){stopActions();send('gate',{gate_id:g.id})}}
$('enter-gate').onclick=enterGate;
function merchantRows(){return activeNPC?.products||[]}
function merchantBlockReason(p){
 if(merchantPending)return '正在交易，请稍候。';
 if(!p)return '请先选择要购买的物品。';
 if(me.dead)return '请先复活，再购买物品。';
 if(me.gold<p.price)return '金币不足：需要 '+p.price+'，现有 '+me.gold+'，还差 '+(p.price-me.gold)+' 金币。';
 if(bagItems().length>=40)return '背包已满，请先腾出一个空格。';
 const sk=p.id.startsWith('book_')?me.skills?.find(s=>'book_'+s.id===p.id):null;
 if(sk&&(sk.rank||sk.books))return '已经拥有或学会此技能，无需重复购买。';
 return '';
}
function merchantUnavailable(p){return !!merchantBlockReason(p)}
function selectMerchant(id){merchantSelected=id;merchantMessage='';renderMerchant()}
function renderMerchant(){const rows=merchantRows(),pages=Math.max(1,Math.ceil(rows.length/10));merchantPage=Math.max(0,Math.min(merchantPage,pages-1));const box=$('merchant-rows');box.replaceChildren();$('merchant-panel').hidden=!merchantVisible;$('merchant-page').hidden=!merchantVisible;
 for(const p of rows.slice(merchantPage*10,merchantPage*10+10)){const b=document.createElement('button');b.dataset.product=p.id;b.setAttribute('role','option');b.setAttribute('aria-selected',String(p.id===merchantSelected));b.classList.toggle('selected',p.id===merchantSelected);b.classList.toggle('unavailable',!!merchantUnavailable(p));for(const text of [p.name,p.price+' 金币',p.max_durability?(p.durability??p.max_durability)+'/'+p.max_durability:'—']){const span=document.createElement('span');span.textContent=text;b.appendChild(span)}b.title=p.description+(merchantBlockReason(p)?' · '+merchantBlockReason(p):'');b.onclick=()=>selectMerchant(p.id);b.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const idx=rows.indexOf(p)+(e.key==='ArrowDown'?1:-1),next=rows[Math.max(0,Math.min(rows.length-1,idx))];merchantPage=Math.floor(rows.indexOf(next)/10);selectMerchant(next.id);$('merchant-rows').querySelector('.selected')?.focus()}else if(e.key==='Enter'){e.preventDefault();selectMerchant(p.id);$('merchant-ok').click()}};box.appendChild(b)}
 const selected=rows.find(p=>p.id===merchantSelected),reason=merchantBlockReason(selected);
 $('merchant-detail').textContent=merchantMessage||(selected?selected.name+'：'+selected.description:'你想买点什么？选中物品后点击 OK。');
 $('merchant-wallet').textContent='金币 '+me.gold+' · 背包 '+bagItems().length+'/40';
 $('merchant-feedback').textContent=reason||(merchantMessage||('确认购买 '+selected.name+' · '+selected.price+' 金币'));
 $('merchant-feedback').classList.toggle('warning',!!reason&&!merchantPending);
 $('merchant-feedback').hidden=!merchantVisible;
 $('merchant-page').textContent='第 '+(merchantPage+1)+' / '+pages+' 页 · 共 '+rows.length+' 件'+(pages===1?' · 本店仅一页':'');
 $('merchant-prev').disabled=merchantPending||merchantPage===0;$('merchant-prev').title=merchantPage===0?'已经是第一页':'上一页';
 $('merchant-next').disabled=merchantPending||merchantPage+1===pages;$('merchant-next').title=merchantPage+1===pages?'已经是最后一页':'下一页';
 // Leave OK clickable when invalid so it can explain the reason without sending a purchase.
 $('merchant-ok').disabled=merchantPending;$('merchant-ok').setAttribute('aria-disabled',String(!!reason));$('merchant-ok').classList.toggle('unavailable',!!reason);$('merchant-ok').title=reason||'确认购买';$('merchant-ok').setAttribute('aria-label','确认购买');fitMerchant();

}
function openMerchant(mode){if(mode==='repair'){openBagRepair();return}merchantMode=mode;merchantPage=0;merchantSelected='';merchantVisible=true;merchantMessage='';renderServices()}
$('merchant-prev').onclick=()=>{merchantPage--;merchantSelected='';merchantMessage='';renderMerchant()};$('merchant-next').onclick=()=>{merchantPage++;merchantSelected='';merchantMessage='';renderMerchant()};$('merchant-close').onclick=()=>{merchantVisible=false;renderMerchant()};
$('merchant-ok').onclick=()=>{const selected=merchantRows().find(p=>p.id===merchantSelected),reason=merchantBlockReason(selected);if(reason){status(reason);renderMerchant();return}merchantPending=true;merchantMessage='正在购买…';if(!send('buy',{npc_id:activeNPC.id,item_id:selected.id})){merchantPending=false;merchantMessage='连接已断开，请重新进入游戏。'}renderMerchant()};
function renderServices(){const box=$('npc-services');box.replaceChildren();if(!activeNPC||!me)return;const id=activeNPC.id;
 const action=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=fn;box.appendChild(b)};
 if(activeNPC.products?.length)action('购买物品',()=>openMerchant('buy'));
 if(activeNPC.repair_slots?.length)action('修理装备',()=>openMerchant('repair'));
 if(me.journey?.npc_id===id)action(me.journey.ready?'交付主线 · '+me.journey.title:'查看主线 · '+me.journey.title,()=>{if(me.journey.ready)send('claim_quest');else{$('npc-dialog').close();openGrowth('quest')}});
 if(['guide','bicheng_trainer','bicheng_books'].includes(id))action('技能书与自动练功',()=>{$('npc-dialog').close();openGrowth('skills')});
 const external={bicheng_smith:'weapon_shop',bicheng_tailor:'cloth_shop',bicheng_healer:'drug_shop'};if(external[id])action('进入店内',()=>send('gate',{gate_id:external[id]}));
 renderMerchant();
}

function growthHUD(){if(!me)return;const q=me.journey;$('quest-tracker').textContent=q?('主线 · '+q.title+'\n'+(q.target?q.kills+' / '+q.target+' · ':'')+(q.ready?'可交付 · 点击查看':q.stage>=4?'四章已完成':'点击查看目标与奖励')):'';$('stop-training').hidden=!me.training;$('stop-training').textContent=me.training?'练功中 · 停止':'停止练功';const box=$('skill-hotbar');box.replaceChildren();for(const [i,s]of activeSkills().entries()){const b=document.createElement('button');b.textContent='F'+(i+1)+' / '+(i+1)+' '+s.name+(s.rank?' Lv.'+s.rank:' 未学习');b.disabled=!s.rank||me.dead;b.onclick=()=>castSkill(s.id);box.appendChild(b)}}
function openGrowth(tab){if(!me)return;stopActions();const dialog=$('growth-dialog');if(dialog.open&&growthTab===tab){dialog.close();return}growthTab=tab;$('growth-feedback').textContent='';renderGrowth();if(!dialog.open)dialog.show()}
$('quest-btn').onclick=()=>openGrowth('quest');$('quest-tracker').onclick=()=>openGrowth('quest');$('skills-btn').onclick=()=>openGrowth('skills');$('attributes-btn').onclick=()=>openGrowth('attributes');$('skills-hud-btn').onclick=()=>openGrowth('skills');$('character-hud-btn').onclick=()=>openGrowth('attributes');$('close-growth').onclick=()=>$('growth-dialog').close();$('stop-training').onclick=()=>send('train',{skill_id:''});
function growthButton(label,action,disabled=false){const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=action;return b}
function renderGrowth(){if(!me)return;const dialog=$('growth-dialog'),box=$('growth-content');box.replaceChildren();dialog.classList.toggle('classic-skills',growthTab==='skills');dialog.classList.toggle('classic-character',growthTab==='attributes');$('growth-title').textContent={quest:'玛法主线',skills:'职业技能与练功',attributes:'人物属性'}[growthTab];
 if(growthTab==='quest'){const q=me.journey;if(!q)return;const card=document.createElement('section');card.className='growth-card';const title=document.createElement('h3');title.textContent=(q.stage<4?'第'+(q.stage+1)+'章 · ':'')+q.title;card.appendChild(title);for(const text of [q.goal,q.target?'进度：'+q.kills+' / '+q.target:'',q.reward_exp?'奖励：经验 '+q.reward_exp+' · 金币 '+q.reward_gold+(q.stage===0||q.stage===2?' · 本职业技能书':''):'']){if(!text)continue;const p=document.createElement('p');p.textContent=text;card.appendChild(p)}const actions=document.createElement('div');actions.className='actions';if(q.stage<4){actions.appendChild(growthButton('交付任务',()=>send('claim_quest'),!q.ready));actions.appendChild(growthButton('自动寻路（可跨图传送）',()=>startQuestRoute()));actions.appendChild(growthButton('查找交付 NPC',()=>{const n=npcs.find(n=>n.id===q.npc_id);if(!n){$('growth-feedback').textContent='该 NPC 在其他地图，请按任务说明前往。';return}$('growth-dialog').close();openMap();mapFocus=n;mapSelected=n.id;mapWhole=false;mapList()}))}card.appendChild(actions);box.appendChild(card);return}
 if(growthTab==='skills'){const all=me.skills||[],sk=all.find(v=>v.id===selectedSkillId)||all[0];if(!sk)return;selectedSkillId=sk.id;const panel=document.createElement('div');panel.className='skill-book-panel';const close=growthButton('关闭',()=>dialog.close());close.className='panel-close';close.setAttribute('aria-label','关闭技能书');panel.appendChild(close);const scroll=document.createElement('img');scroll.className='skill-scroll';setImage(scroll,'/assets/Items/261.png');scroll.alt='客户端卷轴素材';panel.appendChild(scroll);const tabs=document.createElement('div');tabs.className='skill-tabs';for(const row of all){const b=growthButton(row.name+' · '+(row.rank?'技能 '+row.rank+' 级':'未学习'),()=>{selectedSkillId=row.id;renderGrowth()});b.classList.toggle('selected',row.id===sk.id);tabs.appendChild(b)}panel.appendChild(tabs);const detail=document.createElement('div');detail.className='skill-detail';const title=document.createElement('strong');title.textContent=sk.name+' · '+(sk.rank?'熟练度 '+sk.practice+'/60':'技能书 '+sk.books+' 本');detail.appendChild(title);const info=document.createElement('p');info.textContent='要求 Lv.'+sk.required_level+' · '+(sk.passive?'被动生效':'消耗 '+sk.mp+' MP · '+(sk.range?'距离 '+sk.range:'自身治疗'));detail.appendChild(info);const actions=document.createElement('div');actions.className='actions';actions.appendChild(growthButton('购买技能书 · '+sk.price+' 金币',()=>send('buy_book',{skill_id:sk.id}),!!sk.rank||sk.books>0));actions.appendChild(growthButton('学习',()=>send('learn',{skill_id:sk.id}),!!sk.rank||!sk.books||me.level<sk.required_level));if(sk.rank){actions.appendChild(growthButton(me.training===sk.id?'停止练功':'自动练功',()=>send('train',{skill_id:me.training===sk.id?'':sk.id}),sk.rank>=3));if(!sk.passive)actions.appendChild(growthButton('施放',()=>{dialog.close();castSkill(sk.id)}))}detail.appendChild(actions);panel.appendChild(detail);box.appendChild(panel);const help=document.createElement('p');help.className='skill-book-help';help.textContent='靠近向导、武馆教头或书店可购买与练功。F1–F8 或数字 1–8 施放快捷栏中的主动技能；移动、战斗或离线会停止练功。';box.appendChild(help);return}
 renderCharacter(box);
}
function castSkill(id){if(!me||me.dead)return;const sk=me.skills?.find(s=>s.id===id);if(!sk?.rank||sk.passive){status('该技能未学习或为被动技能');return}let target=null;if(id!=='heal'){target=monsters.get(attackTarget)||[...monsters.values()].filter(m=>m.hp>0&&Math.max(Math.abs(m.x-me.x),Math.abs(m.y-me.y))<=sk.range).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0];if(!target){status('施法范围内没有目标');return}}stopActions();send('cast',{skill_id:id,target_id:target?.id||0})}

let characterTab='equipment',selectedEquipmentSlot='';
const equipmentLayout=[['weapon','武器',39,60,'weapon'],['armor','衣服',85,60,'armor'],['helmet','头盔',177,60,null],['necklace','项链',177,101,'necklace'],['charm','勋章',177,142,null],['bracelet_left','左手镯',39,183,'bracelet'],['bracelet_right','右手镯',177,183,'bracelet'],['ring_left','左戒指',39,224,'ring'],['ring_right','右戒指',177,224,'ring'],['stone','宝石',39,266,null],['belt','腰带',85,266,null],['boots','靴子',131,266,null],['seal','印记',177,266,null]];
function unequipToBag(id){
 if(equipPending||!me?.inventory.some(item=>item.id===id&&item.equipped))return;
 if(bagItems().length>=40){status('背包已满，请先腾出一个空格');return}
 equipPending=true;
 if(!send('unequip',{item_id:id})){equipPending=false;status('连接已断开，请重新进入游戏')}
 renderGrowth();
}
function wornInSlot(slot){return me.inventory.find(i=>i.equipped&&(i.equip_slot===slot||i.slot===slot&&['weapon','armor'].includes(slot)))}
function renderCharacter(box){
 const scale=Math.min(1.5,(innerHeight-32)/362,(innerWidth-32)/264),shell=document.createElement('div');shell.className='equipment-shell';shell.style.width=264*scale+'px';shell.style.height=362*scale+'px';
 const card=document.createElement('section');card.className='equipment-card';card.style.zoom=String(scale);shell.appendChild(card);
 const name=document.createElement('div');name.className='equipment-name';name.textContent=me.name;card.appendChild(name);
 const close=growthButton('关闭',()=>$('growth-dialog').close());close.className='equipment-close';close.setAttribute('aria-label','关闭人物穿戴');card.appendChild(close);
 const tabs=document.createElement('nav');tabs.className='equipment-tabs';tabs.setAttribute('aria-label','人物面板');
 for(const [id,label]of [['equipment','装备'],['status','状态'],['attributes','属性'],['skills','技能']]){const b=growthButton(label,()=>{if(id==='skills'){openGrowth('skills');return}characterTab=id;renderGrowth()});b.dataset.characterTab=id;b.classList.toggle('active',characterTab===id);b.setAttribute('aria-pressed',String(characterTab===id));tabs.appendChild(b)}card.appendChild(tabs);
 const interior=document.createElement('div');interior.className='equipment-interior';card.appendChild(interior);
 if(characterTab==='equipment'){
  const doll=document.createElement('div');doll.className='paperdoll';doll.setAttribute('aria-label',classes[me.class]+'当前穿戴');
  const base=document.createElement('img');base.src='/ui/paperdoll-'+(me.gender==='female'?'female':'male')+'.png';base.className='paperdoll-base';base.alt='';doll.appendChild(base);
  const armor=wornInSlot('armor'),weapon=wornInSlot('weapon');
  if(armor){const im=document.createElement('img');setImage(im,'/assets/stateitem/'+armor.icon+'.png');im.className='paperdoll-armor';im.alt=armor.name;im.dataset.itemId=armor.id;im.style.left=(me.gender==='female'?42:41)+'px';im.style.top='65px';doll.appendChild(im)}
  if(weapon){const im=document.createElement('img');setImage(im,'/assets/stateitem/'+weapon.icon+'.png');im.className='paperdoll-weapon';im.alt=weapon.name;im.dataset.itemId=weapon.id;const offset={wood_sword:[25,56],iron_sword:[23,49],bronze_sword:[15,55]}[weapon.kind]||[25,56];im.style.left=offset[0]+'px';im.style.top=offset[1]+'px';doll.appendChild(im)}
  interior.appendChild(doll);
  for(const [slot,label,x,y,kind]of equipmentLayout){const item=wornInSlot(slot),b=document.createElement('button');b.className='equipment-slot-button'+(['ring','bracelet','necklace'].includes(kind)?' jewelry-slot':'');b.dataset.slot=slot;b.style.left=x+'px';b.style.top=y+'px';b.classList.toggle('selected',selectedEquipmentSlot===slot);b.classList.toggle('broken',!!item&&item.durability===0);b.title=label+'：'+(item?item.name+' · '+item.description+' · 持久 '+item.durability+'/'+item.max_durability+(item.durability===0?' · 已损坏，属性失效':''):'未佩戴');b.setAttribute('aria-label',b.title);
   if(item){const im=document.createElement('img');setImage(im,'/assets/Items/'+item.icon+'.png');im.alt=item.name;b.appendChild(im)}else{const empty=document.createElement('span');empty.className='empty-equipment';empty.textContent=label;b.appendChild(empty)}
   b.onclick=()=>{selectedEquipmentSlot=slot;renderGrowth()};b.ondblclick=()=>{if(item){unequipToBag(item.id);return}selectedItem=bagItems().find(i=>i.slot===kind)?.id||'';$('growth-dialog').close();openBag()};card.appendChild(b)
  }
  const detail=document.createElement('div');detail.className='equipment-detail';const entry=equipmentLayout.find(e=>e[0]===selectedEquipmentSlot),it=entry?wornInSlot(entry[0]):null;
  if(it){const title=document.createElement('strong');title.textContent=it.name+' · 持久 '+it.durability+'/'+it.max_durability;detail.appendChild(title);const p=document.createElement('p');p.textContent=it.description+(it.durability===0?' · 已损坏，属性失效':'');detail.appendChild(p);detail.appendChild(growthButton('卸下到背包',()=>unequipToBag(it.id),equipPending||bagItems().length>=40));if(bagItems().length>=40){const note=document.createElement('p');note.textContent='背包已满，请先腾出一个空格。';detail.appendChild(note)}}
  else{const p=document.createElement('p');p.textContent=entry?entry[1]+' · 未佩戴':'点击装备查看属性与持久';detail.appendChild(p)}
  detail.appendChild(growthButton('背包选装',()=>{selectedItem=bagItems().find(i=>i.slot===entry?.[4])?.id||'';$('growth-dialog').close();openBag()}));card.appendChild(detail);
 }else{
  const a=me.attributes||{},stats=document.createElement('div');stats.className='equipment-stat-page';const title=document.createElement('h3');title.textContent=characterTab==='status'?'人物状态':'人物属性';stats.appendChild(title);
  const rows=characterTab==='status'?[['职业',classes[me.class]],['等级',me.level],['生命',me.hp+' / '+me.max_hp],['魔法',me.mp+' / '+me.max_mp],['经验',me.exp],['金币',me.gold]]:[['攻击',(a.attack_min??a.attack)+'–'+a.attack],['防御',a.defense],['魔法',a.magic],['道术',a.tao],['移动 / 普攻速度','+'+(a.speed||0)+'%']];
  for(const [label,value]of rows){const row=document.createElement('p'),n=document.createElement('span'),v=document.createElement('strong');n.textContent=label;v.textContent=value??'—';row.append(n,v);stats.appendChild(row)}
  if(characterTab==='attributes'){const p=document.createElement('p');p.textContent='可用属性点 '+a.points;stats.appendChild(p);for(const [key,label]of [['strength','力量'],['vitality','体质'],['spirit','精神']]){const row=document.createElement('p'),v=document.createElement('span');v.textContent=label+' '+a[key];row.appendChild(v);const b=growthButton('+',()=>send('allocate',{attribute:key}),!a.points||me.dead);b.dataset.attribute=key;row.appendChild(b);stats.appendChild(row)}}
  interior.appendChild(stats);const note=document.createElement('div');note.className='equipment-detail';note.textContent=characterTab==='attributes'?'穿戴装备后属性即时生效；持久耗尽则失效。':'生命与魔法随战斗实时更新。';card.appendChild(note);
 }
 box.appendChild(shell);
}
window.addEventListener('resize',()=>{if($('growth-dialog').open&&growthTab==='attributes')renderGrowth()});

function bagRepairQuote(item){
 if(!item||item.equipped)return {message:'请点击背包中需要修理的物品。',allowed:false};
 if(!bagRepairNPC?.repair_slots?.includes(item.slot)||!Number.isFinite(bagRepairNPC.repair_unit_price)||!item.max_durability)return {message:'此店不能修理这类物品。',allowed:false};
 const cost=Math.max(0,item.max_durability-item.durability)*bagRepairNPC.repair_unit_price;
 if(!cost)return {message:'持久已满，无需修理。',allowed:false};
 return {message:'修理费用 '+cost+' 金币'+(me.gold<cost?' · 金币不足':' · 点击「修理」确认'),allowed:me.gold>=cost&&!me.dead,cost};
}
function openBagRepair(){
 if(!activeNPC?.repair_slots?.length||!me||me.dead||merchantPending||equipPending)return;
 stopActions();bagRepairNPC=activeNPC;bagRepairMessage='';bagMulti=false;bagSelection.clear();selectedItem='';
 $('npc-dialog').close();openBag();
}
function renderBagRepair(){
 const repairing=!!bagRepairNPC,dialog=$('inventory-dialog');dialog.classList.toggle('repairing',repairing);dialog.setAttribute('aria-label',repairing?'背包修理':'背包');
 $('bag-actions').hidden=repairing;$('bag-repair').hidden=!repairing;
 if(!repairing){$('equip-btn').removeAttribute('aria-label');return;}
 const item=me.inventory.find(it=>it.id===selectedItem),quote=bagRepairQuote(item);
 $('equip-side').hidden=true;$('discard-item').hidden=true;
 $('repair-title').textContent=bagRepairNPC.name+' · 背包修理';
 $('repair-quote').textContent=bagRepairMessage||quote.message;
 $('repair-back').disabled=merchantPending;
 $('equip-btn').textContent=merchantPending?'修理中':'修理';$('equip-btn').disabled=merchantPending||!quote.allowed;$('equip-btn').setAttribute('aria-label','确认修理背包中选中的物品');
 $('item-description').textContent=item?item.description+(item.max_durability?' · 持久 '+item.durability+'/'+item.max_durability:''):'';
 for(const cell of $('bag-grid').children){const it=me.inventory.find(it=>it.id===cell.dataset.itemId);cell.classList.toggle('repair-ineligible',!!it&&!bagRepairNPC.repair_slots.includes(it.slot));if(merchantPending)cell.disabled=true;}
}
function confirmBagRepair(){
 const item=me?.inventory.find(it=>it.id===selectedItem);
 if(!bagRepairNPC||merchantPending||!bagRepairQuote(item).allowed)return;
 merchantPending=true;bagRepairMessage='正在修理 '+item.name+'…';
 if(!send('repair',{npc_id:bagRepairNPC.id,item_id:item.id})){merchantPending=false;bagRepairMessage='连接已断开，请重新进入游戏。'}
 renderBag();
}
$('repair-back').onclick=()=>{if(merchantPending)return;const npc=bagRepairNPC;bagRepairNPC=null;bagRepairMessage='';$('inventory-dialog').close();if(npc)showDialogue(npc)};
$('inventory-dialog').addEventListener('close',()=>{bagRepairNPC=null;bagRepairMessage='';$('equip-btn').removeAttribute('aria-label')});

function activeSkills(){return (me?.skills||[]).filter(s=>!s.passive).slice(0,8)}
function magicDir(dx,dy){let a=Math.atan2(dy,dx)+Math.PI/2;if(a<0)a+=Math.PI*2;return Math.round(a/(Math.PI/8))%16}
const fireImpact=[900,901,902,903,904,905,920,921,922,923,924,925,926,927,928,929,930,931,932,933,934,935],bigImpact=[400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,420,421,422,423,424,425,430,431,432,433,434,435];
function addSkillEffect(kind,x,y,tx,ty){
 const dir=magicDir(tx-x,ty-y),now=performance.now();
 const e={kind,x,y,tx,ty,dir,start:now};
 skillEffects.push(e);
 if(kind==='fireball'||kind==='big_fireball'){
  for(let i=0;i<6;i++)sprite('Magic',dir*10+i);
  for(const idx of (kind==='big_fireball'?bigImpact:fireImpact))sprite('Magic',idx);
 }else if(kind==='heal')for(let i=250;i<=269;i++)sprite('Magic',i);
}
function drawMagic(index,x,y,scale=1){
 const f=sprite('Magic',index);if(!f?.ready)return;
 ctx.drawImage(f.im,Math.round(x+f.offsetX*scale),Math.round(y+f.offsetY*scale),Math.round(f.width*scale),Math.round(f.height*scale));
}
function drawSkillEffects(now,cx,cy){
 for(let i=skillEffects.length-1;i>=0;i--){
  const e=skillEffects[i],duration=e.kind==='heal'?760:(e.kind==='big_fireball'?900:820),t=(now-e.start)/duration;
  if(t>=1){skillEffects.splice(i,1);continue}
  const sx=e.x*TW-cx+24,sy=e.y*TH-cy,tx=e.tx*TW-cx+24,ty=e.ty*TH-cy;
  if(e.kind==='heal'){
   const f=Math.min(19,Math.floor(t*20));
   drawMagic(250+f,sx,sy,1.05);
  }else if(e.kind==='fireball'||e.kind==='big_fireball'){
   const big=e.kind==='big_fireball',travel=big?420:360,split=travel/(travel+(big?480:360));
   if(t<split){
    const k=t/split,px=sx+(tx-sx)*k,py=sy+(ty-sy)*k,frame=e.dir*10+Math.min(5,Math.floor(k*6));
    drawMagic(frame,px,py,big?1.6:1);
   }else{
    const seq=big?bigImpact:fireImpact,k=(t-split)/(1-split),f=seq[Math.min(seq.length-1,Math.floor(k*seq.length))];
    drawMagic(f,tx,ty,big?1.8:1.35);
   }
  }else{
   const k=Math.min(1,t*2.2);ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle='#fff0a8';ctx.lineWidth=5*(1-t)+1;ctx.beginPath();ctx.arc(tx,ty,24+k*15,-2+k*2,1+k*2);ctx.stroke();ctx.restore();
  }
 }
}
$('pk-btn').onclick=()=>{if(me?.level<5){status('达到5级后开放自由PK');return}pkMode=!pkMode;$('pk-btn').textContent=pkMode?'自由PK：开':'和平模式';$('pk-btn').setAttribute('aria-pressed',String(pkMode));status(pkMode?'点击邻近玩家攻击；安全区、复活保护及5级以下玩家受保护':'已切回和平模式')};
function receiveRankings(data){rankingData=data;renderRankings()}
function renderRankings(){const box=$('rank-rows');box.replaceChildren();$('rank-formula').textContent=rankingData?.formula||'正在读取排行榜…';for(const [i,r]of (rankingData?.[rankingTab]||[]).entries()){const tr=document.createElement('tr');for(const v of [i+1,r.name,classes[r.class]||r.class,r.level,r.power]){const td=document.createElement('td');td.textContent=v;tr.appendChild(td)}box.appendChild(tr)}if(rankingData&&!box.children.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='暂无角色';tr.appendChild(td);box.appendChild(tr)}}
$('ranking-btn').onclick=()=>{stopActions();renderRankings();$('ranking-dialog').showModal();send('rankings')};$('close-ranking').onclick=()=>$('ranking-dialog').close();$('rank-level').onclick=()=>{rankingTab='level';renderRankings()};$('rank-power').onclick=()=>{rankingTab='power';renderRankings()};$('rank-refresh').onclick=()=>send('rankings');
function cancelQuestRoute(){questRequest++;questRoute=null;$('cancel-route').hidden=true}
$('cancel-route').onclick=()=>{cancelQuestRoute();stopActions();status('已停止寻路')};
async function startQuestRoute(){
 stopActions();const token=++questRequest,q=me?.journey;if(!q||q.stage>=4)return;const stage=q.stage,map=stage===3?1:0;const dest=stage===2?'bicheng':'village';$('growth-dialog').close();$('cancel-route').hidden=false;
 try{
  if(me.map_id!==map||(map===0&&((dest==='bicheng'&&me.y>500)||(dest==='village'&&me.y<500)))){send('travel',{map_id:map,destination:dest});let arrived=false;for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));if(token!==questRequest)return;if(me?.map_id===map&&(map!==0||(dest==='village'?me.y>500:me.y<500))){arrived=true;break}}if(!arrived)throw Error('跨图传送未完成，请稍后重试')}
  await loadRegion();if(token!==questRequest)return;
  let target=npcs.find(n=>n.id===q.npc_id),kind='npc';
  if(!q.ready&&(stage===1||stage===3)){kind='monster';const names=stage===1?['鸡','鹿']:['半兽人'];target=[...monsters.values()].filter(m=>m.hp>0&&names.includes(m.name)).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0]}
  if(!target)throw Error(kind==='monster'?'附近尚未刷新任务怪物，请稍后重试':'尚未找到任务NPC');
  const sx=Math.max(0,Math.min(me.x,target.x)-20),sy=Math.max(0,Math.min(me.y,target.y)-20),w=Math.abs(me.x-target.x)+41,h=Math.abs(me.y-target.y)+41;
  if(w*h>1000000)throw Error('目标区域过大，请先靠近目标地图');
  const chunks=[];for(let x=sx;x<sx+w;x+=160)for(let y=sy;y<sy+h;y+=160)chunks.push({x,y,w:Math.min(160,sx+w-x),h:Math.min(160,sy+h-y)});
  for(let i=0;i<chunks.length;i+=4){if(token!==questRequest||!me||me.map_id!==map)return;const batch=await Promise.all(chunks.slice(i,i+4).map(async c=>{const r=await fetch(`/api/map?map_id=${map}&x=${c.x}&y=${c.y}&w=${c.w}&h=${c.h}`);if(!r.ok)throw Error('寻路地图读取失败');return r.json()}));if(token!==questRequest||!me||me.map_id!==map)return;for(const d of batch)for(const c of d.cells)mapCache.set(c.x+','+c.y,c)}
  const path=questPath(target);if(!path)throw Error('目标附近没有可通行路线');questRoute={path,target,kind,map};$('cancel-route').hidden=false;status('正在前往'+target.name+'，方向键或停止按钮可取消');
 }catch(e){if(token===questRequest){cancelQuestRoute();status(e.message)}}
}
function questPath(target){const start=me.x+','+me.y,open=[{x:me.x,y:me.y,g:0}],best=new Map([[start,0]]),parent=new Map(),closed=new Set();let end=null;
 for(let n=0;open.length&&n<200000;n++){open.sort((a,b)=>(b.g+Math.max(Math.abs(b.x-target.x),Math.abs(b.y-target.y)))-(a.g+Math.max(Math.abs(a.x-target.x),Math.abs(a.y-target.y))));const p=open.pop(),key=p.x+','+p.y;if(closed.has(key))continue;closed.add(key);if(Math.max(Math.abs(p.x-target.x),Math.abs(p.y-target.y))<=1){end=key;break}for(let dir=0;dir<8;dir++){if(!canStep(p.x,p.y,dir))continue;const [dx,dy]=deltas[dir],x=p.x+dx,y=p.y+dy,k=x+','+y;if(portals.some(g=>g.x===x&&g.y===y)||npcs.some(g=>g.x===x&&g.y===y))continue;const g=p.g+1;if(g>=(best.get(k)??Infinity))continue;best.set(k,g);parent.set(k,key);open.push({x,y,g})}}
 if(end===null)return null;const path=[];for(let k=end;k!==start;k=parent.get(k)){if(!k)return null;path.push(k.split(',').map(Number))}return path.reverse();
}
function tickQuestRoute(){const q=questRoute;if(me.map_id!==q.map||me.dead){cancelQuestRoute();return}while(q.path.length&&q.path[0][0]===me.x&&q.path[0][1]===me.y)q.path.shift();if(!q.path.length){cancelQuestRoute();if(q.kind==='npc')send('talk',{npc_id:q.target.id});else status('已到达任务怪物附近，点击怪物或使用技能攻击');return}const [x,y]=q.path[0],dir=deltas.findIndex(([dx,dy])=>me.x+dx===x&&me.y+dy===y);if(dir<0||!canStep(me.x,me.y,dir)){cancelQuestRoute();status('路线发生变化，请重新寻路');return}requestMove(dir,(q.path.length>1||runMode)&&canStep(me.x,me.y,dir))}
document.addEventListener('keydown',e=>{if(e.key==='Escape'||['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key))cancelQuestRoute()});
