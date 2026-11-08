"use strict";
// Ricochet Song: rules, the play screen, drawing and sound.
// Art and sound come from assets.js (window.RS_ASSETS), the built-in boards from levels.js
// (window.RS_LEVELS) and the colours from themes.js. studio.js (courses and the board editor) loads
// after this file and builds on what is here.
// NATIVE is the bridge the Android app injects (MainActivity.Bridge). It is absent in a desktop browser,
// where the game still runs and saves to localStorage, which is how tools/playtest.js exercises it.
const A=window.RS_ASSETS, LEVELS=window.RS_LEVELS;
const NATIVE=window.Android||null;
const VERSION=(()=>{try{return NATIVE&&NATIVE.version?String(NATIVE.version()||''):''}catch(e){return ''}})();
const $=s=>document.querySelector(s);
const el=(t,a={},...k)=>{const e=document.createElement(t);for(const x in a){if(x==='class')e.className=a[x];else if(x==='text')e.textContent=a[x];else if(x==='style')e.style.cssText=a[x];else if(x==='html')e.innerHTML=a[x];else if(x.startsWith('on'))e.addEventListener(x.slice(2),a[x]);else if(a[x]!=null&&a[x]!==false)e.setAttribute(x,a[x])}for(const c of k)if(c!=null)e.append(c);return e};
const svg=d=>'<svg viewBox="0 0 24 24">'+d+'</svg>';
const ICON={play:'<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',edit:'<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',dots:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',share:'<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',inbox:'<path d="M12 4v11M8 11l4 4 4-4M5 19h14"/>',watch:'<circle cx="12" cy="13" r="7"/><path d="M12 13V9M10 3h4"/>',
  trash:'<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>',grid:'<path d="M4 4h16v16H4zM4 12h16M12 4v16"/>',copy:'<path d="M8 8h11v12H8zM5 16V4h10"/>',file:'<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',down:'<path d="M12 5v14M6 13l6 6 6-6"/>',turn:'<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>',dup:'<path d="M9 9h11v11H9zM4 15V4h11"/>',paste:'<path d="M9 4h6v3H9zM7 5H5v15h14V5h-2M9 12h6M9 16h6"/>'};

// ---------- notes ----------
// 25 notes: every semitone from low C to high C. The eight recorded notes are the upper octave and keep
// the ids the built-in boards use (C D E F G A B, and C2 for the top C). The octave below is written
// with a 0 and a sharp with #, so "F#0" is the low F sharp. A note the pack has no recording for is the
// nearest recording played slower or faster.
const NAT=[0,2,4,5,7,9,11],PCL=['C','C','D','D','E','F','F','G','G','A','A','B'];
const NOTES=['C','D','E','F','G','A','B','C2'];          // the recordings; also the row of keys on the home screen
const SEMI={C:0,D:2,E:4,F:5,G:7,A:9,B:11,C2:12};
const BASECOL={C:'#de3b30',D:'#ee7f2c',E:'#f6c832',F:'#5fb040',G:'#62b6ea',A:'#9370c0',B:'#ee84a2'};
const WALLCOL={C:'red',D:'orange',E:'yellow',F:'green',G:'blue',A:'purple',B:'pink'};
const NOTE={},NOTE_IDS=[];
for(let s=-12;s<=12;s++){const pc=(s+12)%12,letter=PCL[pc],sharp=!NAT.includes(pc),oct=s<0?0:s===12?2:1,id=letter+(sharp?'#':'')+(oct===0?'0':oct===2?'2':'');
  let smp='C';for(const k in SEMI)if(Math.abs(s-SEMI[k])<Math.abs(s-SEMI[smp]))smp=k;
  NOTE_IDS.push(id);NOTE[id]={id,s,oct,sharp,letter,label:letter+(sharp?'♯':'')+(oct===2?'’':''),say:(oct===0?'low ':oct===2?'high ':'')+letter+(sharp?' sharp':''),
    col:oct===2?'#eceef4':BASECOL[letter],wall:oct===2?'white':WALLCOL[letter],smp,rate:Math.pow(2,(s-SEMI[smp])/12)}}
const SETS=[['Warm-up','Tap blue paddles to turn them. Timing counts as well as order.'],['Crossings','Routes double back over themselves. Brown paddles are bolted down.'],['Switches','A purple button flips every purple paddle each time the ball rolls over it.'],['Conducting','Some paddles must be turned while the ball is rolling.'],['Finale','Duets, portals, switches and live turns together.']];
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
const FL={'/':'\\','\\':'/'};
const TICK=185,SPEEDS=[260,220,185,150,120];   // milliseconds per step; a Studio tune can pick one of the five
const MAXT=300,MAXTUNE=256;                    // the engine gives up after MAXT steps; a Studio tune must finish within MAXTUNE

/* ---------- save ---------- */
// Two stores, each kept in the app's SharedPreferences (through NATIVE) with a copy in localStorage:
// "save" is progress and settings, "studio" is the courses (studio.js).
const SAVE_KEY='ricochet-song-2';
let save={stars:[],ear:[],sound:true,earMode:false,cs:{},runs:{},look:{mode:'dark',color:'midnight'},by:''};
(function(){let raw='';
  try{if(NATIVE&&NATIVE.load)raw=NATIVE.load()||''}catch(e){}
  if(!raw){try{raw=localStorage.getItem(SAVE_KEY)||''}catch(e){}}
  try{const s=JSON.parse(raw);if(s&&Array.isArray(s.stars))save=Object.assign(save,s)}catch(e){}
  if(!Array.isArray(save.ear))save.ear=[];if(!Array.isArray(save.stars))save.stars=[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(!obj(save.cs))save.cs={};if(!obj(save.runs))save.runs={};if(typeof save.by!=='string')save.by='';
  if(!obj(save.look)||!LOOKS[save.look.color]||!MODES.some(m=>m[0]===save.look.mode))save.look={mode:'dark',color:'midnight'}})();
const persist=()=>{const j=JSON.stringify(save);try{localStorage.setItem(SAVE_KEY,j)}catch(e){}try{if(NATIVE&&NATIVE.save)NATIVE.save(j)}catch(e){}};
function loadKey(k){let raw='';try{if(NATIVE&&NATIVE.loadKey)raw=NATIVE.loadKey(k)||''}catch(e){}if(!raw){try{raw=localStorage.getItem('ricochet-song-'+k)||''}catch(e){}}return raw}
function saveKey(k,j){try{localStorage.setItem('ricochet-song-'+k,j)}catch(e){}try{if(NATIVE&&NATIVE.saveKey)NATIVE.saveKey(k,j)}catch(e){}}

/* ---------- images ---------- */
const IMG={};for(const k in A.img){const i=new Image();i.src=A.img[k];IMG[k]=i}
const tintCache={};
function tinted(k,color,mode,a){const id=k+color+(mode||'')+(a||'');if(tintCache[id])return tintCache[id];const i=IMG[k];if(!i.complete||!i.naturalWidth)return i;
  const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);x.globalCompositeOperation=mode||'source-in';x.globalAlpha=a||1;x.fillStyle=color;x.fillRect(0,0,c.width,c.height);return tintCache[id]=c}

/* ---------- sound ---------- */
let ac=null;const bufs={};
function unlock(){if(ac)return;try{ac=new (window.AudioContext||window.webkitAudioContext)();for(const n in A.snd){const bin=atob(A.snd[n]),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);ac.decodeAudioData(u.buffer,b=>{bufs[n]=b},()=>{})}}catch(e){}}
function sfx(n,vol=1,rate=1){if(!save.sound||!ac||document.hidden)return;try{if(ac.state==='suspended')ac.resume();const b=bufs[n];if(!b)return;const s=ac.createBufferSource(),g=ac.createGain();s.buffer=b;s.playbackRate.value=rate;g.gain.value=vol;s.connect(g);g.connect(ac.destination);s.start()}catch(e){}}
const ring=(note,vol=.95)=>{const N=NOTE[note];if(N)sfx(N.smp,vol,N.rate)};   // any of the 25 notes
// The app allows audio without a tap, so decode everything up front; a browser will hold the context
// suspended until the first gesture, which the two listeners below take care of.
const wake=()=>{unlock();try{if(ac&&ac.state==='suspended'&&save.sound&&!document.hidden)ac.resume()}catch(e){}};
addEventListener('pointerdown',wake,{capture:true});addEventListener('keydown',wake,{capture:true});
window.__pause=function(){try{if(ac&&ac.state==='running')ac.suspend()}catch(e){}trHold();if(window.__flush)window.__flush()};
window.__resume=function(){try{if(ac&&ac.state==='suspended'&&save.sound)ac.resume()}catch(e){}if(TR&&G&&!G.won&&!$('#play').hidden)trGo()};
document.addEventListener('visibilitychange',()=>{if(document.hidden)window.__pause();else window.__resume()});
const SND_ON='<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',SND_OFF='<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>';
function drawSnd(){for(const b of [$('#snd1'),$('#snd2')]){b.innerHTML=save.sound?SND_ON:SND_OFF;b.setAttribute('aria-pressed',save.sound)}}
for(const id of ['#snd1','#snd2'])$(id).onclick=()=>{save.sound=!save.sound;persist();drawSnd();if(save.sound){window.__resume();sfx('click')}else{try{if(ac&&ac.state==='running')ac.suspend()}catch(e){}}};

/* ---------- look (themes.js has the colours) ---------- */
let sysDark=(()=>{try{if(NATIVE&&NATIVE.systemDark)return !!NATIVE.systemDark()}catch(e){}try{return matchMedia('(prefers-color-scheme:dark)').matches}catch(e){return true}})();
const isDark=()=>save.look.mode==='dark'||(save.look.mode==='auto'&&sysDark);
function applyLook(){const dark=isDark(),P=palette(save.look.color,dark),r=document.documentElement;
  for(const k in P.css)r.style.setProperty('--'+k,P.css[k]);r.style.colorScheme=dark?'dark':'light';
  for(const k in TH)delete TH[k];Object.assign(TH,P.th);
  try{localStorage.setItem('ricochet-song-bg',P.css.deep)}catch(e){}
  try{if(NATIVE&&NATIVE.setChrome)NATIVE.setChrome(P.css.deep)}catch(e){}
  r.classList.add('ready');if(G)G.idle=false;if(window.__look)window.__look()}
// The app calls this when the phone switches between light and dark; a browser reports it itself.
window.__system=function(d){sysDark=!!d;if(save.look.mode==='auto')applyLook()};
try{matchMedia('(prefers-color-scheme:dark)').addEventListener('change',e=>{if(!(NATIVE&&NATIVE.systemDark))window.__system(e.matches)})}catch(e){}

/* ---------- sheets (panels that slide over the screen) and the toast line ---------- */
let sheetClose=null;
function sheet(title,nodes,o={}){const s=$('#sheet'),b=$('#shB');$('#shT').textContent=title;b.textContent='';for(const n of nodes)if(n)b.append(n);
  s.classList.toggle('up',!!o.up);s.hidden=false;sheetClose=o.onClose||null;$('#sheet .box').scrollTop=0}
function closeSheet(){const s=$('#sheet');if(s.hidden)return false;const a=document.activeElement;if(a&&a.blur&&s.contains(a))a.blur();s.hidden=true;const f=sheetClose;sheetClose=null;if(f)f();
  try{if(NATIVE&&NATIVE.immersive)NATIVE.immersive()}catch(e){}return true}
$('#shX').onclick=()=>{sfx('click');closeSheet()};
$('#sheet').addEventListener('pointerdown',e=>{if(e.target===$('#sheet'))closeSheet()});
// when the keyboard goes away, ask the app to hide the system bars again
document.addEventListener('focusout',e=>{const t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'){try{if(NATIVE&&NATIVE.immersive)NATIVE.immersive()}catch(_){}}});
let toastT=0;function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{e.hidden=true},2400)}
function lookSheet(){const mode=el('div',{class:'seg'}),grid=el('div',{class:'looks'});
  const draw=()=>{mode.textContent='';for(const m of MODES)mode.append(el('button',{'aria-pressed':save.look.mode===m[0],onclick:()=>{save.look.mode=m[0];persist();sfx('click');applyLook();draw()},text:m[1]}));
    grid.textContent='';for(const k in LOOKS){const P=palette(k,isDark()).css;grid.append(el('button',{'data-look':k,'aria-pressed':save.look.color===k,onclick:()=>{save.look.color=k;persist();sfx('click');applyLook();draw()}},el('i',{style:`background:linear-gradient(135deg,${P.night} 0 52%,${P.panel2} 52% 74%,${P.accent} 74%)`}),LOOKS[k].name))}};
  draw();sheet('Look',[mode,grid,el('p',{class:'note',text:'Pads and paddles keep their colours in every look, because the colours tell you what they are.'})])}
$('#lookBtn').onclick=()=>{sfx('click');lookSheet()};

/* ---------- rules engine (the same rules the level solver used, plus the Studio's timing pieces) ---------- */
// A board: w, h, balls [[x,y,dir,delay?]], chimes {"x,y":note}, pads [{x,y,t,s,sol}] (t: b blue, f brown,
// p purple; s: how it starts; sol: how it must be, null for a decoy), portals [[x1,y1,x2,y2]], traps,
// goals, switches [[x,y]], flips [[step,x,y]] (the live turns of the solution), and from the Studio
// rests {"x,y":steps}, clocks [[x,y,period]] and tick (ms per step).
const DX={N:0,S:0,E:1,W:-1},DY={N:-1,S:1,E:0,W:0};
const TURN={'/':{E:'N',N:'E',W:'S',S:'W'},'\\':{E:'S',S:'E',W:'N',N:'W'}};
const PREP=new WeakMap();   // lookups per board; the Studio drops an entry when it edits the board
function prep(L){let P=PREP.get(L);if(P)return P;const port={};(L.portals||[]).forEach((p,i)=>{port[p[0]+','+p[1]]=[p[2],p[3],i];port[p[2]+','+p[3]]=[p[0],p[1],i]});
  P={port,traps:new Set((L.traps||[]).map(t=>t.join())),goals:new Set((L.goals||[]).map(g=>g.join())),sw:new Set((L.switches||[]).map(g=>g.join())),
    purple:L.pads.filter(p=>p.t==='p').map(p=>p.x+','+p.y),rest:L.rests||{},clocks:L.clocks||[]};
  PREP.set(L,P);return P}
// one ball arrives at the cell it was heading for. st: key -> '/' or '\'. Returns the events, mutates ball and st.
function arrive(L,st,b,t){const P=prep(L),ev=[];let x=b.x+DX[b.d],y=b.y+DY[b.d];
  if(x<0||y<0||x>=L.w||y>=L.h){b.end='off';return ev}
  let k=x+','+y;if(P.port[k]){ev.push({type:'portal',k});x=P.port[k][0];y=P.port[k][1];k=x+','+y}
  b.x=x;b.y=y;
  if(L.chimes[k])ev.push({type:'chime',note:L.chimes[k],k,t});
  if(st[k]){b.d=TURN[st[k]][b.d];ev.push({type:'pad',k})}
  if(P.sw.has(k)){for(const q of P.purple)st[q]=FL[st[q]];ev.push({type:'switch',k})}
  if(P.rest[k]){b.wait=P.rest[k];ev.push({type:'rest',k})}
  if(P.traps.has(k)){b.end='trap';ev.push({type:'trap',k})}else if(P.goals.has(k)){b.end='goal';ev.push({type:'goal',k})}
  return ev}
// One step of the whole board: clocks flip the purple paddles first, then each ball moves, in launcher
// order. A ball still held by its launcher's delay, or sitting out a rest, stays where it is.
function step(L,st,balls,t,on){const P=prep(L);
  for(const c of P.clocks)if(t%c[2]===0){for(const q of P.purple)st[q]=FL[st[q]];on({type:'clock',k:c[0]+','+c[1]},null,-1)}
  for(let i=0;i<balls.length;i++){const b=balls[i];if(b.end||t<=b.delay)continue;if(b.wait>0){b.wait--;continue}
    for(const e of arrive(L,st,b,t))on(e,b,i)}}
const newBalls=L=>L.balls.map(b=>({x:b[0],y:b[1],d:b[2],delay:b[3]||0,wait:0,end:null}));
// Plays a board through without drawing it. init: paddle states at launch; flips: live turns [[step,x,y]].
// rec, if given, is filled with the paddles that were hit and the route of each ball (for the Studio).
function simulate(L,init,flips,rec){const st=Object.assign({},init),balls=newBalls(L),notes=[];let steps=0;
  if(rec){rec.hit=new Set();rec.path=balls.map(b=>[[b.x,b.y]])}
  for(let t=1;t<=MAXT;t++){if(balls.every(b=>b.end))break;steps=t;
    for(const f of flips||[])if(f[0]===t){const k=f[1]+','+f[2];if(st[k])st[k]=FL[st[k]]}
    step(L,st,balls,t,(e,b,i)=>{if(e.type==='chime')notes.push({t,note:e.note});
      if(rec&&b){if(e.type==='pad')rec.hit.add(e.k);if(e.type==='portal'){const q=e.k.split(',').map(Number);rec.path[i].push(q,[b.x,b.y,1])}}});
    if(rec)balls.forEach((b,i)=>{const p=rec.path[i],q=p[p.length-1];if(b.end==='off'&&!b.gone){b.gone=1;p.push([b.x+DX[b.d],b.y+DY[b.d]])}else if(q[0]!==b.x||q[1]!==b.y)p.push([b.x,b.y])})}
  return {notes,ends:balls.map(b=>b.end||'loop'),steps}}
const sameTune=(a,b)=>a.length===b.length&&a.every((e,i)=>e.t===b[i].t&&e.note===b[i].note);

/* ---------- screens ---------- */
function show(id){for(const s of ['home','studio','course','play'])$('#'+s).hidden=s!==id}
let homeY=0;
function showHome(){show('home');drawHome();$('#home').scrollTop=homeY}
const starImg=on=>el('img',{src:A.img.star,alt:'',class:on?'':'off'});
const starRow=n=>{const s=el('span',{class:'stars'});for(let k=0;k<3;k++)s.append(starImg(k<n));return s};
const dotRow=(tune,ear)=>{const d=el('span',{class:'dots'});for(const n of tune.slice(0,40))d.append(el('i',{style:'background:'+(ear?TH.ear:(NOTE[n]||NOTE.C).col)}));return d};
function drawHome(){
  const host=$('#sets');host.textContent='';let tot=0;const rec=save.earMode?save.ear:save.stars;
  SETS.forEach((s,si)=>{const sec=el('div',{class:'set'},el('h2',{text:s[0]}),el('p',{text:s[1]}));
    LEVELS.forEach((L,i)=>{if(L.set!==si)return;const st=rec[i]||0;tot+=st;
      sec.append(el('button',{class:'lv',onclick:()=>{sfx('click');openLevel(i)}},el('b',{text:String(i+1)}),el('span',{style:'min-width:0'},el('span',{class:'nm',text:L.name}),dotRow(L.tune,save.earMode)),starRow(st)))});
    host.append(sec)});
  const t=$('#total');t.textContent='';t.append(el('img',{src:A.img.star,alt:''}),tot+' of '+LEVELS.length*3);
  $('#ver').textContent=VERSION?'Ricochet Song v'+VERSION:'';
  const e=$('#ear');e.setAttribute('aria-pressed',save.earMode);$('#earSub').textContent=save.earMode?'On. Pads are blank and the tune is only heard. Stars are kept separately.':'Off. Turn it on to hide every colour and letter and play by ear.';
  if(window.coursesOnHome)window.coursesOnHome($("#hc"));
}
$('#ear').onclick=()=>{save.earMode=!save.earMode;persist();sfx('click');drawHome()};
const keys=$('#keys');NOTES.forEach(n=>{keys.append(el('button',{'aria-label':'Play note '+NOTE[n].letter,style:`background-image:url(${A.img['wall_'+NOTE[n].wall]})`,onpointerdown:()=>{unlock();setTimeout(()=>ring(n,1),ac&&bufs[n]?0:160)}},el('span',{text:NOTE[n].letter})))});

/* ---------- play state ---------- */
// A playlist is what the play screen walks through: the built-in tunes (MAIN) or one course (studio.js).
const MAIN={id:'main',tunes:LEVELS,label:(i,ear)=>'Tune '+(i+1)+' of '+LEVELS.length+(ear?', by ear':''),tip:i=>firstTip(i),playable:()=>true,
  setStars(i,ear,n){const r=ear?save.ear:save.stars;r[i]=Math.max(r[i]||0,n);persist()},exit:showHome,endLabel:'All tunes'};
let G=null;
function buildG(L,o){return {i:o.i||0,list:o.list||null,L,ear:!!o.ear,edit:o.edit||null,tick:L.tick||TICK,pads:[],padAt:{},launches:0,hints:0,run:null,hearing:null,played:[],pulse:{},parts:[],trail:[],shake:0,t0:performance.now(),won:false,swPulse:{},ckPulse:{},liveHint:false,rollX:0,rollMax:0,idle:false,lastDraw:0,rec:[],replay:null}}
// Sets the paddles out for 'start' (what a player is given) or 'solved' (the Studio's solved board), and
// works out the target tune from the solved board.
function loadPads(view){const L=G.L,solved=p=>p.o||p.sol||p.s;
  G.pads=L.pads.map(p=>{const s=view==='solved'?solved(p):p.s;return {x:p.x,y:p.y,t:p.t,sol:p.sol,k:p.x+','+p.y,s,s0:s,base:s,ang:s==='/'?-45:45,lock:false,wob:0}});
  G.padAt={};G.pads.forEach(p=>G.padAt[p.k]=p);
  const sol={};L.pads.forEach(p=>sol[p.x+','+p.y]=solved(p));
  const r=simulate(L,sol,L.flips);G.target=r.notes;G.endT=r.steps;G.span=r.notes.length?Math.max(...r.notes.map(e=>e.t))+1:8;
  G.liveKeys=new Set((L.flips||[]).map(f=>f[1]+','+f[2]));G.tick=L.tick||TICK}
function openTune(list,i){
  const L=list.tunes[i];if(!$('#home').hidden)homeY=$('#home').scrollTop;
  G=buildG(L,{list,i,ear:save.earMode});loadPads('start');
  $('#lvNo').textContent=list.label(i,G.ear);$('#lvName').textContent=L.name;
  show('play');$('#play').classList.remove('edit');$('#ed').hidden=true;$('#sizeBtn').hidden=true;$('#card').hidden=true;$('#clock').hidden=!TR;
  tip(list.tip(i));updCtl();resize();
}
const openLevel=i=>openTune(MAIN,i);
const feat=(l,f)=>f==='live'?l.flips.length>0:f==='switch'?l.switches.length>0:f==='fixed'?l.pads.some(p=>p.t==='f'):f==='trap'?l.traps.length>0:f==='portal'?l.portals.length>0:l.balls.length>1;
function firstTip(i){const L=LEVELS[i],before=LEVELS.slice(0,i);
  for(const [f,txt] of [['live','This route passes one paddle twice. Turn it while the ball is rolling so it faces the other way the second time.'],['duet','Two balls launch at once and share the tune between them.'],['switch','Each time the ball rolls over the purple button, every purple paddle flips.'],['portal','A ball that rolls into a swirl comes out of its twin, heading the same way.'],['trap','Spiked traps stop the ball dead.'],['fixed','Brown paddles are bolted down. Only the blue ones turn.']])if(feat(L,f)&&!before.some(l=>feat(l,f)))return txt;
  if(i===0)return 'Tap a blue paddle to turn it, then launch. Ring the pads in the order shown above.';
  if(i===1)return 'Each note must land on its beat. A long gap in the tune is a long roll on the board.';
  return plainTip(L)}
function plainTip(L){if(L.flips&&L.flips.length)return L.flips.length===1?'One paddle needs a turn while the ball is rolling.':L.flips.length+' turns are needed while the ball is rolling.';
  return G&&G.ear?'Tap a pad to hear it. Press Tune to hear what you are aiming for.':'Press Tune to listen, then set the paddles and launch.'}
function tip(t,k){const e=$('#tip');e.textContent=t;e.className=k||''}
function updCtl(){if(!G)return;if(G.edit)return G.edit.ctl();$('#tries').textContent=G.launches?'×'+G.launches:'';$('#goTxt').textContent=G.run?(G.run.speed>1?'NORMAL':'FASTER'):'LAUNCH';$('#go').classList.toggle('run',!!G.run);$('#resetLab').textContent=G.run?'Stop':'Reset'}

/* ---------- timed run (a course against the clock) ---------- */
// TR: {list, order (the playable tunes), pos, acc (ms banked), t0 (running since, or 0), pen (seconds of hint penalty), ear}
let TR=null,clockT=0;
const trNow=()=>TR?TR.acc+(TR.t0?performance.now()-TR.t0:0)+TR.pen*1000:0;
function trGo(){if(TR&&!TR.t0)TR.t0=performance.now()}
function trHold(){if(TR&&TR.t0){TR.acc+=performance.now()-TR.t0;TR.t0=0}}
function fmtTime(ms){const t=Math.round(ms/100),m=Math.floor(t/600),s=t%600;return m+':'+(s<100?'0':'')+(s/10).toFixed(1)}
function startRun(list){const order=list.tunes.map((t,i)=>i).filter(i=>list.playable(i));if(!order.length)return;
  TR={list,order,pos:0,acc:0,t0:0,pen:0,ear:save.earMode};openTune(list,order[0]);tip('Timed run: '+order.length+(order.length===1?' tune':' tunes')+' against the clock. A hint costs 20 seconds.');trGo()}
function clockText(ms){const c=$('#clock');c.innerHTML=svg(ICON.watch);c.append(fmtTime(ms))}
function drawClock(now){if(now-clockT<90)return;clockT=now;clockText(trNow())}

/* ---------- input ---------- */
const cv=$('#board'),cx=cv.getContext('2d'),rv=$('#roll'),rx=rv.getContext('2d');
let geo={cs:40,ox:0,oy:0,w:0,h:0,dpr:1};
function resize(){if(!G)return;const dpr=Math.min(3,window.devicePixelRatio||1);
  for(const c of [cv,rv]){const r=c.getBoundingClientRect();c.width=Math.max(1,Math.round(r.width*dpr));c.height=Math.max(1,Math.round(r.height*dpr))}
  const r=cv.getBoundingClientRect(),cs=Math.floor(Math.min(r.width/G.L.w,r.height/G.L.h));
  geo={cs,ox:(r.width-cs*G.L.w)/2,oy:(r.height-cs*G.L.h)/2,w:r.width,h:r.height,dpr};G.idle=false}
addEventListener('resize',resize);if(window.ResizeObserver)new ResizeObserver(resize).observe($('#boardWrap'));
// the board cell under a pointer event (it may lie outside the board)
function cellAt(e){const r=cv.getBoundingClientRect();return {x:Math.floor((e.clientX-r.left-geo.ox)/geo.cs),y:Math.floor((e.clientY-r.top-geo.oy)/geo.cs)}}
cv.addEventListener('pointerdown',e=>{if(!G||G.won)return;if(G.edit)return G.edit.down(e);const {x,y}=cellAt(e),p=G.padAt[x+','+y];
  if(p&&p.t==='b'&&!(p.lock&&!G.run)){p.s=FL[p.s];sfx('turn',.7,p.s==='/'?1.12:.94);p.wob=1;if(!G.run)p.s0=p.s}
  else if(p){sfx('deny',.5);p.wob=1;if(!G.run)tip(p.lock?'That paddle is set by a hint. You can still turn it during the roll.':p.t==='p'?'Purple paddles only move when the ball rolls over the purple button'+(G.L.clocks&&G.L.clocks.length?' or the clock ticks over.':'.'):'Brown paddles are bolted down.')}
  else if(G.L.chimes[x+','+y]&&!G.run){const n=G.L.chimes[x+','+y];ring(n,.8);G.pulse[x+','+y]=1}});
// a tune too long for the strip scrolls: it follows the ball, and can be dragged when nothing is playing
let rollDrag=null;
rv.addEventListener('pointerdown',e=>{if(!G||!G.rollMax||G.run||G.hearing)return;rollDrag={x:e.clientX,at:G.rollX};try{rv.setPointerCapture(e.pointerId)}catch(_){}});
rv.addEventListener('pointermove',e=>{if(!rollDrag||!G)return;G.rollX=Math.max(0,Math.min(G.rollMax,rollDrag.at-(e.clientX-rollDrag.x)));G.idle=false});
for(const t of ['pointerup','pointercancel'])rv.addEventListener(t,()=>{rollDrag=null});
function leavePlay(){const list=G&&G.list;if(TR){TR=null;toast('Timed run stopped.')}$('#clock').hidden=true;G=null;$('#card').hidden=true;(list&&list.exit?list.exit:showHome)()}
const goHome=leavePlay;
// Android back button or gesture: close whatever is on top; from the tune list, tell the app to close.
window.__back=function(){
  if(closeSheet())return true;
  if(!$('#play').hidden){sfx('click');if(G&&G.edit)G.edit.back();else leavePlay();return true}
  if(window.studioBack&&window.studioBack()){sfx('click');return true}
  return false};
$('#back').onclick=()=>{sfx('click');if(G&&G.edit)G.edit.back();else leavePlay()};
function restore(){G.pads.forEach(p=>{p.s=p.t==='b'?p.s0:p.base})}
$('#reset').onclick=()=>{if(!G||G.won)return;sfx('click');
  if(G.run){G.run=null;restore();G.played=[];G.trail=[];tip('Stopped. The paddles are back as you set them.');updCtl();return}
  G.pads.forEach(p=>{if(!p.lock&&p.t==='b'){p.s=p.s0=p.base;p.wob=1}});G.played=[];tip('Paddles are back where they started.')};
$('#hint').onclick=()=>{if(!G||G.run||G.won)return;const cost=()=>{G.hints++;if(TR)TR.pen+=20},wrong=G.pads.filter(p=>p.sol&&p.t==='b'&&!p.lock&&p.s!==p.sol);
  if(wrong.length){const p=wrong[Math.floor(Math.random()*wrong.length)];p.s=p.s0=p.sol;p.lock=true;p.wob=1;cost();sfx('hint',.8);burst(p.x+.5,p.y+.5,'#f7c12e',10,'twinkle');tip('One paddle is now set for the launch. Hints cost '+(TR?'20 seconds.':'a star.'));return}
  if(G.liveKeys.size&&!G.liveHint){G.liveHint=true;cost();sfx('hint',.8);tip('The ringed paddle'+(G.liveKeys.size>1?'s need':' needs')+' a turn while the ball is rolling, after its first pass.');return}
  tip(G.liveKeys.size?'The starting positions are right. Turn the ringed paddles after the ball first passes them.':'Every paddle on the route is already right. Launch it.','good')};
$('#hear').onclick=()=>{if(!G||G.run||G.won||!G.target.length)return;G.hearing={t:-G.tick*.5,i:0};$('#hear').classList.add('on')};
$('#go').onclick=()=>{if(!G||G.won||G.edit)return;if(G.run){if(G.run.time<400)return;G.run.speed=G.run.speed>1?1:2.2;updCtl();return}launch()};
addEventListener('keydown',e=>{const tag=e.target.tagName;if(!G||G.edit||!$('#sheet').hidden||tag==='INPUT'||tag==='TEXTAREA'||tag==='BUTTON'&&e.key===' ')return;if(e.key===' '){e.preventDefault();$('#go').click()}else if(e.key==='h')$('#hear').click()});
function launch(){if(!G||G.run||!$('#card').hidden)return;G.hearing=null;$('#hear').classList.remove('on');restore();
  G.launches++;G.played=[];G.trail=[];
  G.run={time:0,n:0,speed:1,over:false,endAt:0,balls:newBalls(G.L).map(b=>{const go=b.delay<1;return Object.assign(b,{fx:b.x,fy:b.y,tx:b.x+(go?DX[b.d]:0),ty:b.y+(go?DY[b.d]:0),endT:0,done:false})})};
  sfx('launch',.8);if(!G.edit)tip(G.liveKeys.size?'Rolling. Paddles can be turned now.':'');updCtl()}

/* ---------- particles ---------- */
function burst(x,y,color,n,kind){if(reduce)n=Math.min(n,3);for(let i=0;i<n;i++){const a=Math.random()*6.283,v=.8+Math.random()*2.2;
  G.parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-(kind==='confetti'?1.5:0),g:kind==='confetti'?5:0,life:1,dec:.9+Math.random()*.9,size:(kind==='confetti'?.2:.24)+Math.random()*.2,rot:Math.random()*6.283,vr:(Math.random()-.5)*8,img:kind||(Math.random()<.5?'music_1':'star_1'),color})}}

/* ---------- run logic ---------- */
function boundary(){const R=G.run,L=G.L;R.n++;
  // the Studio's test roll plays back the live turns already recorded, until the author takes over
  if(G.edit&&G.replay)for(const f of G.replay)if(f[0]===R.n){const p=G.padAt[f[1]+','+f[2]];if(p){p.s=FL[p.s];p.wob=1;sfx('turn',.5,p.s==='/'?1.12:.94);G.rec.push(f.slice())}}
  const st={};G.pads.forEach(p=>st[p.k]=p.s);
  step(L,st,R.balls,R.n,(e,b)=>{
    if(e.type==='chime'){const T=G.target[G.played.length],ok=!!T&&T.note===e.note&&T.t===R.n;G.played.push({t:R.n,note:e.note,ok});ring(e.note);G.pulse[e.k]=1;const [x,y]=e.k.split(',').map(Number),c=G.ear?(ok?TH.good:TH.bad):NOTE[e.note].col;burst(x+.5,y+.5,c,6);G.parts.push({ring:1,x:x+.5,y:y+.5,life:1,dec:2.2,color:c})}
    else if(e.type==='pad'){G.padAt[e.k].wob=1;sfx('tick',.35,1+Math.random()*.1)}
    else if(e.type==='portal'){sfx('portal',.5);b.warp=1}
    else if(e.type==='switch'){G.swPulse[e.k]=1;sfx('switch',.7)}
    else if(e.type==='clock'){G.ckPulse[e.k]=1;sfx('tick',.3,.7)}
    else if(e.type==='rest'){G.pulse[e.k]=1;sfx('tick',.3,.55)}
    else if(e.type==='trap'){sfx('deny',.9);G.shake=1}
    else if(e.type==='goal'){sfx('tick',.6,1.5)}});
  G.pads.forEach(p=>{if(p.s!==st[p.k]){p.s=st[p.k];p.wob=1}});
  for(const b of R.balls){
    if(b.end){if(!b.done){b.done=true;b.endT=R.time;if(b.end==='off'){b.fx=b.tx;b.fy=b.ty}}}
    else{const go=R.n+1>b.delay&&b.wait<1;b.fx=b.x;b.fy=b.y;b.tx=b.x+(go?DX[b.d]:0);b.ty=b.y+(go?DY[b.d]:0);b.out=b.warp;b.warp=0}}
  if(R.n>=(G.edit?MAXTUNE+1:G.endT+30))for(const b of R.balls)if(!b.end){b.end='loop';b.done=true;b.endT=R.time}
  if(R.balls.every(b=>b.end)&&!R.endAt)R.endAt=R.time+380}
function finish(){const R=G.run,ends=R.balls.map(b=>b.end),P=G.played,T=G.target;G.run=null;
  if(G.edit){const rec=G.rec;restore();return G.edit.tested(ends,P,rec,R.n)}
  restore();updCtl();
  if(sameTune(P,T)&&ends.every(e=>e==='goal'))return win();
  sfx('fail',.7);G.shake=Math.max(G.shake,.6);G.word={k:'word_miss',life:1};
  const n=P.length,pl=k=>k===1?'':'s',home=ends.every(e=>e==='goal');
  const i=P.findIndex((e,j)=>!T[j]||e.note!==T[j].note||e.t!==T[j].t);
  if(i>=0&&!T[i])tip('It rang extra notes after the tune was finished.','bad');
  else if(i>=0&&P[i].note===T[i].note){const d=Math.abs(P[i].t-T[i].t);tip(`Note ${i+1} rang ${d} step${pl(d)} too ${P[i].t>T[i].t?'late':'early'}. The route to it is the wrong length.`,'bad')}
  else if(i>=0)tip(G.ear?`Note ${i+1} was the wrong note.`:`Note ${i+1} should be ${NOTE[T[i].note].say}, and it rang ${NOTE[P[i].note].say}.`,'bad');
  else if(ends.includes('trap'))tip(n?`A trap caught the ball after ${n} right note${pl(n)}.`:'A trap caught the ball before it rang a pad.','bad');
  else if(ends.includes('loop'))tip('The ball kept rolling long after the tune should have ended.','bad');
  else if(!home)tip(n?`The ball rolled off the board after ${n} right note${pl(n)}.`:'The ball rolled off the board before it rang a pad.','bad');
  else tip(`It reached the flag ${T.length-n} note${pl(T.length-n)} short.`,'bad')}
function win(){G.won=true;trHold();const stars=G.hints>1?1:(G.launches<=3&&!G.hints?3:(G.launches<=8?2:1)),list=G.list;
  list.setStars(G.i,G.ear,stars);
  for(const g of G.L.goals)for(let k=0;k<3;k++)setTimeout(()=>G&&burst(g[0]+.5,g[1]+.5,Object.values(BASECOL)[Math.floor(Math.random()*7)],12,'confetti'),k*160);
  sfx('win',.8);
  setTimeout(()=>{if(!G||!G.won)return;
    $('#word').src=A.img['word_'+(stars===3?'perfect':stars===2?'great':'good')];
    $('#ch').textContent=G.L.name+(G.ear?', by ear':'');
    let line=stars===3?'Solved in '+(G.launches===1?'one launch':G.launches+' launches')+' with no hints.':stars===2?(G.hints?'Solved with a hint.':'Solved in '+G.launches+' launches. Three or fewer earns the third star.'):'Solved. Fewer launches and hints earn more stars.';
    const again=$('#again'),next=$('#next');again.hidden=false;again.textContent='Play again';G.again=()=>openTune(list,G.i);
    if(TR){TR.pos++;
      if(TR.pos<TR.order.length){again.hidden=true;next.textContent='Next tune';const j=TR.order[TR.pos];G.next=()=>{openTune(list,j);trGo()};line+=' Clock: '+fmtTime(trNow())+'.'}
      else{const total=Math.round(trNow()),best=list.best?list.best(TR.ear):0,record=!best||total<best;if(record&&list.setBest)list.setBest(TR.ear,total);
        line='Course finished in '+fmtTime(total)+(TR.pen?', with '+TR.pen+' seconds of hints':'')+'. '+(record?(best?'A new best; the old one was '+fmtTime(best)+'.':'That is the time to beat.'):'Your best is '+fmtTime(best)+'.');
        TR=null;clockText(total);again.textContent='Run again';G.again=()=>startRun(list);next.textContent='Done';G.next=leavePlay}}
    else{let j=-1;for(let k=G.i+1;k<list.tunes.length;k++)if(list.playable(k)){j=k;break}
      next.textContent=j<0?list.endLabel:'Next tune';G.next=j<0?leavePlay:()=>openTune(list,j)}
    $('#cp').textContent=line;
    const cs=$('#cstars');cs.textContent='';for(let k=0;k<3;k++){const im=el('img',{src:A.img.star,alt:''});cs.append(im);if(k<stars)setTimeout(()=>{im.classList.add('in');sfx('star'+(k+1),.8)},350+k*330);else im.classList.add('out')}
    $('#card').hidden=false},900)}
$('#again').onclick=()=>{sfx('click');if(G&&G.again)G.again()};
$('#next').onclick=()=>{sfx('click');if(G&&G.next)G.next()};

/* ---------- drawing ---------- */
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function spr(c,k,x,y,size,rot=0,alpha=1,im){const i=im||IMG[k];if(!i)return;const w=i.naturalWidth||i.width,h=i.naturalHeight||i.height;if(!w)return;const s=size/Math.max(w,h);
  c.save();c.translate(x,y);if(rot)c.rotate(rot);c.globalAlpha*=alpha;c.drawImage(i,-w*s/2,-h*s/2,w*s,h*s);c.restore()}
let fontV='';const FONT=()=>fontV||(fontV=getComputedStyle(document.body).fontFamily);
function badge(c,x,y,cs,t,col){const r=Math.max(6.5,cs*.16);c.save();c.font=`700 ${Math.round(r*1.3)}px ${FONT()}`;const w=Math.max(r*2,c.measureText(t).width+r*.9);rr(c,x-w/2,y-r,w,r*2,r);c.fillStyle=col||'#1b2440';c.fill();c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.fillText(t,x,y+.5);c.restore()}
const BALLC=['#ffffff','#f7c12e','#f08ab0','#7fd69a'];           // trail colour per ball
const ballImg=bi=>bi===0?IMG.ball:bi===1?IMG.ball2:tinted('ball',bi===2?'#e8508c':'#35b468','source-atop',.62);
const PORTC=[null,'#b04ad0','#2fae6a','#e0822a'];                 // tint of the second, third and fourth portal pair
const DIRA={E:0,S:Math.PI/2,W:Math.PI,N:-Math.PI/2};
// Piece drawers, shared by the board, the Studio's palette and the piece being dragged.
// c: canvas context; (x,y): centre of the cell in px; cs: cell size in px.
const D={
  ball(c,x,y,cs,bi,sc=1,a=1){const r=cs*.23*sc;if(r<=0)return;if(TH.rim){c.save();c.globalAlpha*=a;c.fillStyle=TH.rim;c.beginPath();c.arc(x,y,r+Math.max(1.2,cs*.03),0,6.283);c.fill();c.restore()}spr(c,'ball',x,y,cs*.46*sc,0,a,ballImg(bi))},
  emit(c,x,y,cs,dir,time,delay){c.save();c.translate(x,y);c.rotate(DIRA[dir]);c.strokeStyle=TH.accent;c.lineWidth=cs*.07;c.lineCap='round';c.lineJoin='round';
    for(let k=0;k<2;k++){const ph=((time*1.6+k*.5)%1);c.globalAlpha=(1-ph)*.9;const px=cs*(.36+ph*.3);c.beginPath();c.moveTo(px-cs*.09,-cs*.13);c.lineTo(px,0);c.lineTo(px-cs*.09,cs*.13);c.stroke()}
    c.restore();if(delay>0)badge(c,x-cs*.29,y-cs*.29,cs,String(delay))},
  goal(c,x,y,cs,time){spr(c,'goal',x,y,cs*(.74+Math.sin(time*3)*.02))},
  trap(c,x,y,cs,time){const rot=reduce?0:time*.6;if(TH.rim)spr(c,'trap',x,y,cs*.86,rot,1,tinted('trap',TH.rim,'source-in'));spr(c,'trap',x,y,cs*.8,rot)},
  portal(c,x,y,cs,pi,time,half){spr(c,'portal',x,y,cs*.82,reduce?0:-time*2.2,half?.5:1,pi?tinted('portal',PORTC[pi%4]||PORTC[1],'source-atop',.55):IMG.portal);if(half)badge(c,x,y,cs,'?')},
  sw(c,x,y,cs,pu){const r=cs*(.3-pu*.04);c.fillStyle='#4a2f78';c.beginPath();c.arc(x,y+cs*.05,r,0,6.283);c.fill();c.fillStyle=pu>0?'#d9b8ff':'#a678e0';c.beginPath();c.arc(x,y+cs*.05*pu,r,0,6.283);c.fill();
    c.strokeStyle='#2a1a4a';c.lineWidth=cs*.045;c.lineCap='round';c.lineJoin='round';const a=cs*.12,yy=y+cs*.05*pu;
    c.beginPath();c.moveTo(x-a,yy-a*.45);c.lineTo(x+a,yy-a*.45);c.lineTo(x+a*.45,yy-a);c.moveTo(x+a,yy+a*.45);c.lineTo(x-a,yy+a*.45);c.lineTo(x-a*.45,yy+a);c.stroke()},
  // a pad: the colour of its letter, a dark band along the bottom for the low octave, a dark corner for a sharp
  chime(c,x,y,cs,n,pu,ear){const N=NOTE[n]||NOTE.C,s=cs*(.62+pu*.26),col=ear?TH.ear:N.col;
    if(pu>0){c.save();c.globalAlpha=pu*.5;c.fillStyle=col;rr(c,x-s*.68,y-s*.68,s*1.36,s*1.36,s*.3);c.fill();c.restore()}
    c.save();rr(c,x-s/2,y-s/2,s,s,s*.22);c.clip();const im=ear?tinted('wall_white',TH.earPad,'source-atop',.75):IMG['wall_'+N.wall];
    if(im.naturalWidth||im.width)c.drawImage(im,x-s/2,y-s/2,s,s);else{c.fillStyle=col;c.fillRect(x-s/2,y-s/2,s,s)}
    if(!ear){if(N.oct===0){c.fillStyle='#00000090';c.fillRect(x-s/2,y+s*.27,s,s*.23)}
      if(N.sharp){c.fillStyle='#000000b8';c.beginPath();c.moveTo(x+s*.5,y-s*.5);c.lineTo(x+s*.5,y-s*.12);c.lineTo(x+s*.12,y-s*.5);c.closePath();c.fill()}}
    c.restore();
    if(TH.rim){rr(c,x-s/2,y-s/2,s,s,s*.22);c.strokeStyle=TH.rim;c.lineWidth=1;c.stroke()}
    c.fillStyle='#0008';c.font=`700 ${Math.round(cs*.24)}px ${FONT()}`;c.textAlign='center';c.textBaseline='middle';c.fillText(ear?'♪':N.label,x-(N.sharp&&!ear?cs*.03:0),y+1)},
  // a rest: a dashed ring showing how many steps it holds the ball
  rest(c,x,y,cs,n,pu){const r=cs*(.3+pu*.05);c.save();c.fillStyle=TH.light?'#e6ebf8':'#16224e';c.globalAlpha=.92;c.beginPath();c.arc(x,y,r,0,6.283);c.fill();c.globalAlpha=1;
    c.lineWidth=cs*.055;c.strokeStyle=TH.light?'#5b6b93':'#93a6dc';c.setLineDash([cs*.1,cs*.075]);c.beginPath();c.arc(x,y,r,0,6.283);c.stroke();c.setLineDash([]);
    c.fillStyle=TH.light?'#33415f':'#dfe6ff';c.font=`700 ${Math.round(cs*.27)}px ${FONT()}`;c.textAlign='center';c.textBaseline='middle';c.fillText(String(n),x,y+1);c.restore()},
  // a clock: purple like the paddles it flips; ph is how far through its period it is (0 to 1)
  clock(c,x,y,cs,p,ph,pu){const r=cs*(.3+pu*.05);c.save();c.fillStyle='#4a2f78';c.beginPath();c.arc(x,y+cs*.04,r,0,6.283);c.fill();c.fillStyle=pu>0?'#d9b8ff':'#a678e0';c.beginPath();c.arc(x,y,r,0,6.283);c.fill();
    c.fillStyle='#2a1a4a';for(let k=0;k<4;k++){const a=k*Math.PI/2;c.beginPath();c.arc(x+Math.sin(a)*r*.8,y-Math.cos(a)*r*.8,cs*.024,0,6.283);c.fill()}
    c.strokeStyle='#2a1a4a';c.lineWidth=cs*.055;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.sin(ph*6.283)*r*.68,y-Math.cos(ph*6.283)*r*.68);c.stroke();
    c.beginPath();c.arc(x,y,cs*.045,0,6.283);c.fill();c.restore();badge(c,x+cs*.29,y+cs*.29,cs,String(p),'#4a2f78')},
  paddle(c,x,y,cs,t,ang,sc=1){spr(c,t==='f'?'pad_fixed':t==='p'?'pad_purple':'pad_turn',x,y,cs*.98*sc,ang*Math.PI/180)}
};
let lastT=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-lastT)/1000);lastT=now;if(TR)drawClock(now);if(!G||$('#play').hidden)return;
  if(G.idle&&!G.run&&!G.hearing&&now-G.lastDraw<32)return; // nothing moving: about 30 redraws a second is plenty
  if(G.run){const R=G.run;R.time+=dt*1000*R.speed;while(G.run&&!R.endAt&&R.time>=(R.n+1)*G.tick)boundary();
    if(R.endAt&&R.time>R.endAt&&!R.over){R.over=true;finish();if(!G)return}}
  if(G.hearing){const Hh=G.hearing;Hh.t+=dt*1000;while(Hh.i<G.target.length&&Hh.t>=G.target[Hh.i].t*G.tick-G.tick){ring(G.target[Hh.i].note);Hh.i++}
    if(Hh.t>G.span*G.tick){G.hearing=null;$('#hear').classList.remove('on')}}
  const c=cx,L=G.L,E=G.edit,R=G.run,{cs,ox,oy,dpr}=geo,time=(now-G.t0)/1000,P=prep(L);
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,geo.w,geo.h);
  G.shake=Math.max(0,G.shake-dt*3);const sh=reduce?0:G.shake*6;c.translate(ox+(Math.random()-.5)*sh,oy+(Math.random()-.5)*sh);
  rr(c,0,0,cs*L.w,cs*L.h,cs*.28);c.fillStyle=TH.board;c.fill();c.strokeStyle=TH.boardLine;c.lineWidth=1.5;c.stroke();
  if(E)E.under(c,cs,time);
  c.fillStyle=TH.dot;for(let x=0;x<L.w;x++)for(let y=0;y<L.h;y++){c.beginPath();c.arc((x+.5)*cs,(y+.5)*cs,1.6,0,6.283);c.fill()}
  L.balls.forEach((b,bi)=>{const bx=(b[0]+.5)*cs,by=(b[1]+.5)*cs;D.emit(c,bx,by,cs,b[2],time,Math.max(0,(b[3]||0)-(R?R.n:0)));if(!R)D.ball(c,bx,by,cs,bi)});
  for(const g of L.goals)D.goal(c,(g[0]+.5)*cs,(g[1]+.5)*cs,cs,time);
  for(const t of L.traps)D.trap(c,(t[0]+.5)*cs,(t[1]+.5)*cs,cs,time);
  L.portals.forEach((p,pi)=>{D.portal(c,(p[0]+.5)*cs,(p[1]+.5)*cs,cs,pi,time);D.portal(c,(p[2]+.5)*cs,(p[3]+.5)*cs,cs,pi,time)});
  if(L.half)D.portal(c,(L.half[0]+.5)*cs,(L.half[1]+.5)*cs,cs,L.portals.length,time,true);
  for(const s of L.switches){const k=s.join();G.swPulse[k]=Math.max(0,(G.swPulse[k]||0)-dt*3);D.sw(c,(s[0]+.5)*cs,(s[1]+.5)*cs,cs,G.swPulse[k])}
  for(const k in P.rest){const [x,y]=k.split(',').map(Number);G.pulse[k]=Math.max(0,(G.pulse[k]||0)-dt*3.2);D.rest(c,(x+.5)*cs,(y+.5)*cs,cs,P.rest[k],G.pulse[k])}
  for(const q of P.clocks){const k=q[0]+','+q[1];G.ckPulse[k]=Math.max(0,(G.ckPulse[k]||0)-dt*3);D.clock(c,(q[0]+.5)*cs,(q[1]+.5)*cs,cs,q[2],R?((R.time/G.tick)%q[2])/q[2]:0,G.ckPulse[k])}
  for(const k in L.chimes){const [x,y]=k.split(',').map(Number);G.pulse[k]=Math.max(0,(G.pulse[k]||0)-dt*3.2);D.chime(c,(x+.5)*cs,(y+.5)*cs,cs,L.chimes[k],G.pulse[k],G.ear)}
  for(const p of G.pads){const tgt=p.s==='/'?-45:45;p.ang+=(tgt-p.ang)*Math.min(1,dt*(reduce?99:18));p.wob=Math.max(0,p.wob-dt*4);
    const px=(p.x+.5)*cs,py=(p.y+.5)*cs,sc=1+Math.sin(p.wob*9)*p.wob*.12,live=E?E.live(p):p.t==='b'&&!(p.lock&&!R);
    if(live){c.save();c.globalAlpha=(TH.light?.2:.16)+.08*Math.sin(time*3+p.x+p.y);c.fillStyle=TH.halo;c.beginPath();c.arc(px,py,cs*.46,0,6.283);c.fill();c.restore()}
    if(p.lock&&!R){c.save();c.globalAlpha=.3;c.fillStyle=TH.accent;c.beginPath();c.arc(px,py,cs*.46,0,6.283);c.fill();c.restore()}
    if(G.liveHint&&G.liveKeys.has(p.k)){c.save();c.strokeStyle=TH.accent;c.lineWidth=cs*.05;c.setLineDash([cs*.14,cs*.1]);c.lineDashOffset=-time*cs*.5;c.beginPath();c.arc(px,py,cs*.47,0,6.283);c.stroke();c.restore()}
    D.paddle(c,px,py,cs,p.t,p.ang,sc)}
  // balls in flight
  if(R){const fr=Math.min(1,(R.time-R.n*G.tick)/G.tick);
    R.balls.forEach((b,bi)=>{let x,y,a=1,sc=1;
      if(!b.end){x=b.fx+(b.tx-b.fx)*fr;y=b.fy+(b.ty-b.fy)*fr;if(b.out&&fr<.35)sc=fr/.35;
        const tk=b.tx+','+b.ty;if(P.port[tk]&&(b.tx!==b.fx||b.ty!==b.fy)&&fr>.6)sc=1-(fr-.6)*2.2;
        if(b.tx<0||b.ty<0||b.tx>=L.w||b.ty>=L.h)a=1-fr*.9}
      else{if(b.end==='off')return;x=b.x;y=b.y;sc=Math.max(0,1-(R.time-b.endT)/300);if(sc<=0)return}
      if(b.tx!==b.fx||b.ty!==b.fy||b.end)G.trail.push({x,y,life:1,bi});D.ball(c,(x+.5)*cs,(y+.5)*cs,cs,bi,Math.max(0,sc),a);
      if(!b.end&&b.wait>0&&R.n>b.delay)badge(c,(x+.8)*cs,(y+.2)*cs,cs,String(b.wait))})}
  for(const t of G.trail){t.life-=dt*3.4;if(t.life>0){c.globalAlpha=t.life*(TH.light?.34:.28);c.fillStyle=t.bi?BALLC[t.bi]:TH.trail;c.beginPath();c.arc((t.x+.5)*cs,(t.y+.5)*cs,cs*.17*t.life,0,6.283);c.fill()}}
  c.globalAlpha=1;G.trail=G.trail.filter(t=>t.life>0);
  for(const p of G.parts){p.life-=dt*p.dec;if(p.life<=0)continue;
    if(p.ring){c.globalAlpha=p.life*.8;c.strokeStyle=p.color;c.lineWidth=cs*.06*p.life;c.beginPath();c.arc(p.x*cs,p.y*cs,cs*(.35+(1-p.life)*.7),0,6.283);c.stroke();c.globalAlpha=1;continue}
    p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;spr(c,p.img,p.x*cs,p.y*cs,cs*p.size,p.img.startsWith('music')?0:p.rot,Math.min(1,p.life*1.6),tinted(p.img,p.color))}
  G.parts=G.parts.filter(p=>p.life>0);
  if(E)E.over(c,cs,time);
  if(G.word){G.word.life-=dt*.9;const l=G.word.life;if(l>0){const up=1-l;spr(c,G.word.k,cs*L.w/2,cs*L.h*.42-up*cs*.6,Math.min(cs*L.w*.7,260)*(l>.85?1+(l-.85)*3:1),0,Math.min(1,l*2.2))}else G.word=null}
  drawRoll();
  G.lastDraw=now;
  const live=o=>Object.keys(o).some(k=>o[k]>0);
  G.idle=!(G.run||G.hearing||G.parts.length||G.trail.length||G.word||G.shake>0||G.pads.some(p=>p.wob>0||Math.abs((p.s==='/'?-45:45)-p.ang)>.4)||live(G.pulse)||live(G.swPulse)||live(G.ckPulse)||(E&&E.busy()));
}
// The tune strip: the target on the top row, what the last launch rang on the bottom row. Notes that
// ring on the same step are stacked. A tune too long to fit scrolls.
function drawRoll(){const dpr=geo.dpr,W=rv.width/dpr,Hh=rv.height/dpr;rx.setTransform(dpr,0,0,dpr,0,0);rx.clearRect(0,0,W,Hh);
  const pad=8,span=G.span,step=Math.max(7,Math.min(26,(W-pad*2)/span)),bw=Math.max(6,Math.min(20,step*1.7)),rowH=Hh/2,over=step*span+pad*2-W;
  const cursor=G.run?G.run.time/G.tick:(G.hearing?G.hearing.t/G.tick+1:-1);
  G.rollMax=over>1?over:0;if(G.rollMax&&cursor>0)G.rollX=(cursor-1)*step-W*.4;G.rollX=Math.max(0,Math.min(G.rollMax,G.rollX||0));
  const x0=G.rollMax?pad+step*.5-G.rollX:pad+(W-pad*2-step*span)/2+step*.5;
  rx.font='600 10px '+FONT();rx.textBaseline='middle';
  rx.strokeStyle=TH.rollLine;rx.lineWidth=1;rx.beginPath();rx.moveTo(0,rowH);rx.lineTo(W,rowH);rx.stroke();
  const row=(list,r,look)=>{for(let i=0;i<list.length;){let j=i;while(j<list.length&&list[j].t===list[i].t)j++;const n=j-i,h=n>1?Math.max(3.5,19/n):18;
      for(let q=i;q<j;q++){const e=list[q],N=NOTE[e.note],x=x0+(e.t-1)*step-bw/2,y=r*rowH+rowH/2-(n>1?9.5:9)+(q-i)*h,hh=n>1?h-1:h;if(x>W||x+bw<0)continue;const [st,col]=look(e);
        rr(rx,x,y,bw,hh,Math.min(5,bw/3,hh/2));rx.fillStyle=col||N.col;rx.fill();
        if(!G.ear){rx.save();rx.clip();if(N.oct===0){rx.fillStyle='#00000090';rx.fillRect(x,y+hh-Math.min(4,hh*.3),bw,4)}
          if(N.sharp){rx.fillStyle='#000000b8';const a=Math.min(bw,hh)*.55;rx.beginPath();rx.moveTo(x+bw,y);rx.lineTo(x+bw,y+a);rx.lineTo(x+bw-a,y);rx.closePath();rx.fill()}rx.restore();rr(rx,x,y,bw,hh,Math.min(5,bw/3,hh/2))}
        if(TH.rim&&!st){rx.strokeStyle=TH.rim;rx.lineWidth=1;rx.stroke()}
        if(st==='hot'){rx.strokeStyle=TH.hot;rx.lineWidth=2;rx.stroke()}
        if(st==='bad'){rx.strokeStyle=TH.bad;rx.lineWidth=2.5;rx.stroke()}
        if(!G.ear&&n===1&&bw>=11){rx.fillStyle='#0009';rx.textAlign='center';rx.fillText(N.letter,x+bw/2-(N.sharp?1.5:0),y+9.5)}}
      i=j}};
  row(G.target,0,e=>[G.hearing&&Math.abs(cursor-e.t)<.6?'hot':'',G.ear?TH.ear:null]);
  row(G.played,1,e=>[e.ok?'':'bad',G.ear?(e.ok?TH.good:TH.bad):null]);
  if(!G.played.length&&!G.run){rx.fillStyle=TH.rollText;rx.textAlign='center';rx.fillText(G.edit?(G.target.length?'the test roll appears here':'pads you add appear above'):'your notes appear here',W/2,rowH*1.5)}
  if(cursor>0&&cursor<span+1){const x=x0+(cursor-1)*step;rx.strokeStyle=TH.accent;rx.lineWidth=2;rx.beginPath();rx.moveTo(x,3);rx.lineTo(x,Hh-3);rx.stroke()}}

/* ---------- boot ---------- */
applyLook();unlock();drawSnd();drawHome();requestAnimationFrame(frame);
// studio.js loads next and sets window.__booted when it has finished.
