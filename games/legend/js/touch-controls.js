// Touch targeting is a client aid; the server still validates every cast.
let touchAim=null,touchSkillReadyAt=0;
function touchLayout(){return matchMedia('(max-width:820px), (pointer:coarse) and (max-width:1024px)').matches}
function touchCandidate(skill,dx=0,dy=0,directional=false){
 if(!me)return null;
 const norm=Math.hypot(dx,dy),selected=monsters.get(attackTarget);
 const candidates=[...monsters.values()].filter(m=>m.hp>0&&Math.max(Math.abs(m.x-me.x),Math.abs(m.y-me.y))<=skill.range);
 const visible=m=>{const x=viewportWidth/2+24+(m.x-me.x)*TW,y=gameCenterY()+(m.y-me.y)*TH;return x>=0&&x<=viewportWidth&&y>=20&&y<=viewportHeight-20};
 const score=m=>{const x=(m.x-me.x)*TW,y=(m.y-me.y)*TH,n=Math.hypot(x,y);return n&&norm?(x*dx+y*dy)/(n*norm):1};
 if(directional)return candidates.filter(m=>visible(m)&&score(m)>=.72).sort((a,b)=>score(b)-score(a)||Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0]||null;
 if(selected&&candidates.includes(selected)&&visible(selected))return selected;
 return candidates.filter(visible).sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0]||null;
}
function cancelTouchAim(){
 const old=touchAim;touchAim=null;
 old?.button.classList.remove('aiming');
 const cancel=$('touch-cancel'),hint=$('touch-aim-hint');
 if(cancel){cancel.hidden=true;cancel.classList.remove('cancelling')}
 if(hint)hint.hidden=true;
 if(me)redraw();
}
function updateTouchAim(e){
 const a=touchAim;if(!a||e.pointerId!==a.pointer)return;
 a.dx=e.clientX-a.x;a.dy=e.clientY-a.y;a.dragged=Math.hypot(a.dx,a.dy)>14;
 const r=$('touch-cancel').getBoundingClientRect();
 a.cancelled=e.clientX>=r.left-12&&e.clientX<=r.right+12&&e.clientY>=r.top-12&&e.clientY<=r.bottom+12;
 a.target=a.skill.kind==='damage'?touchCandidate(a.skill,a.dx,a.dy,a.dragged):null;
 $('touch-cancel').classList.toggle('cancelling',a.cancelled);
 $('touch-cancel').textContent=a.cancelled?'松手取消':'拖到这里取消';
 $('touch-aim-hint').textContent=a.cancelled?'松手取消施法':a.skill.name+' · '+(a.skill.kind!=='damage'?'松手释放':a.target?'目标：'+a.target.name+' · 松手释放':'该方向没有可攻击目标');
 redraw();
}
function bindTouchSkill(button,skill){
 button.dataset.skillId=skill.id;button.style.touchAction='none';
 button.addEventListener('pointerdown',e=>{
  if(!touchLayout()||e.button>0||touchAim||!me||me.dead||blockingDialog())return;
  e.preventDefault();e.stopPropagation();
  if(performance.now()<touchSkillReadyAt){status('技能冷却中');return}
  if(me.mp<skill.mp){status('魔法不足');return}
  touchAim={pointer:e.pointerId,button,skill,x:e.clientX,y:e.clientY,dx:0,dy:0,dragged:false,cancelled:false,target:null};
  try{button.setPointerCapture(e.pointerId)}catch{}
  button.classList.add('aiming');$('touch-cancel').hidden=false;$('touch-aim-hint').hidden=false;
  updateTouchAim(e);
 });
 button.addEventListener('pointermove',e=>{if(touchAim?.pointer===e.pointerId){e.preventDefault();updateTouchAim(e)}});
 button.addEventListener('pointerup',e=>{
  if(touchAim?.pointer!==e.pointerId)return;
  e.preventDefault();e.stopPropagation();updateTouchAim(e);
  const a=touchAim;cancelTouchAim();
  if(a.cancelled)return;
  if(a.skill.kind==='damage'&&!a.target){status('施法范围和瞄准方向内没有目标');return}
  if(castSkill(a.skill.id,{target:a.target,strictTarget:true,keepMoving:true})){
   touchSkillReadyAt=performance.now()+2000;updateTouchCooldowns();
  }
 });
 for(const name of ['pointercancel','lostpointercapture'])button.addEventListener(name,e=>{if(touchAim?.pointer===e.pointerId)cancelTouchAim()});
 button.onclick=e=>{e.preventDefault();if(e.detail===0)castSkill(skill.id)};
}
function clearTouchCooldown(){touchSkillReadyAt=0;cancelTouchAim();updateTouchCooldowns()}
function updateTouchCooldowns(){
 if(!touchLayout())return;
 if(me?.dead&&touchAim)cancelTouchAim();
 const remain=Math.max(0,touchSkillReadyAt-performance.now());
 for(const button of $('skill-hotbar').querySelectorAll('button')){
  const skill=me?.skills?.find(s=>s.id===button.dataset.skillId),low=skill&&me.mp<skill.mp;
  button.classList.toggle('cooling',remain>0);button.classList.toggle('low-mana',!!low);
  button.setAttribute('aria-disabled',String(remain>0||!!low||!!me?.dead));
  const meta=button.querySelector('small');if(meta&&skill)meta.textContent=remain>0?Math.ceil(remain/1000)+'秒':skill.mp+'蓝';
 }
}
function drawTouchAim(cx,cy){
 const a=touchAim;if(!a||!me)return;
 const x=me.x*TW-cx+24,y=me.y*TH-cy,range=a.skill.kind==='damage'?a.skill.range:1;
 ctx.save();ctx.strokeStyle=a.cancelled?'#ff7777':'#73dcff';ctx.fillStyle=a.cancelled?'#e9555510':'#53c6ff0c';ctx.lineWidth=2;
 ctx.beginPath();ctx.ellipse(x,y,range*TW,range*TH,0,0,Math.PI*2);ctx.fill();ctx.setLineDash([8,6]);ctx.stroke();ctx.setLineDash([]);
 if(a.target){const tx=a.target.x*TW-cx+24,ty=a.target.y*TH-cy;ctx.strokeStyle='#ffdf77';ctx.beginPath();ctx.ellipse(tx,ty,27,18,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke()}
 else if(a.dragged&&a.skill.kind==='damage'){
  const n=Math.hypot(a.dx,a.dy),length=Math.min(range*TH,170),tx=x+a.dx/n*length,ty=y+a.dy/n*length;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();
 }
 ctx.restore();
}
setInterval(updateTouchCooldowns,100);
window.addEventListener('blur',cancelTouchAim);
window.addEventListener('resize',cancelTouchAim);
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelTouchAim();joystickPointer=null;resetJoystick()}});
window.addEventListener('resize',()=>{skillHotbarSig='';if(me)growthHUD()});
skillHotbarSig='';if(me)growthHUD();
