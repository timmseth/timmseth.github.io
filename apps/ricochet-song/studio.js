"use strict";
// Ricochet Song Studio: courses, the board editor, share codes, files and import.
// Loads after game.js and uses its engine (simulate), its play screen (openTune, launch) and its piece
// drawers (D). A course is {id, name, by, tunes}. A tune is a board in the same shape the built-in
// boards use (see "rules engine" in game.js), plus:
//   id     stable name for stars and for recognising a tune that is imported twice
//   pads   each has o (how it faces on the solved board) and, for a blue one, s (how the player finds it)
//   half   a portal that has no twin yet, [x,y] (only while a tune is being built)
//   auto   true while the game, not the author, chooses how the blue paddles start
//   tip    optional opening line for the player
// judge() works out the rest from the solved board: the tune it plays, which blue paddles are on the
// route (sol), and whether it is finished (ok) or why not (why).
const MINW=3,MAXW=9,MINH=3,MAXH=12,MAXBALLS=4,MAXPORTS=4,MAXCLOCKS=4,MAXDELAY=64,MAXREST=16,MAXPERIOD=32,MAXTUNES=50,MAXTIP=120;
ICON.shuffle='<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/>';
const CW={N:'E',E:'S',S:'W',W:'N'};
const uid=()=>{let s='';while(s.length<10)s+=Math.random().toString(36).slice(2);return s.slice(0,10)};
const btn=(label,icon,fn,cls)=>el('button',{class:'btn'+(cls?' '+cls:''),'data-act':label.toLowerCase().replace(/[^a-z]+/g,'-'),html:icon?svg(icon):'',onclick:()=>{sfx('click');fn()}},label);
const ib=(label,icon,fn)=>el('button',{class:'ib','aria-label':label,html:svg(icon),onclick:e=>{e.stopPropagation();sfx('click');fn()}});
const plural=(n,w)=>n+' '+w+(n===1?'':'s');

/* ---------- reading and checking a tune ---------- */
// Everything that comes from storage, a code or a file goes through cleanTune/cleanCourse, which build a
// fresh object from known fields only and throw on anything out of range. Names are only ever shown as text.
const isInt=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function cleanText(v,max,dflt){if(typeof v!=='string')return dflt;v=v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g,' ').replace(/\s+/g,' ').trim().slice(0,max).trim();return v||dflt}
function cleanTune(r){const bad=()=>{throw new Error('bad')};
  if(!r||typeof r!=='object'||!isInt(r.w,MINW,MAXW)||!isInt(r.h,MINH,MAXH))bad();
  const w=r.w,h=r.h,T={id:typeof r.id==='string'&&/^[a-z0-9]{6,20}$/.test(r.id)?r.id:uid(),name:cleanText(r.name,40,'Untitled'),w,h,tick:SPEEDS.includes(r.tick)?r.tick:TICK,
    balls:[],chimes:{},pads:[],portals:[],half:null,traps:[],goals:[],switches:[],rests:{},clocks:[],flips:[],auto:r.auto===true,tip:cleanText(r.tip,MAXTIP,'')};
  const used=new Set(),cell=(x,y)=>{if(!isInt(x,0,w-1)||!isInt(y,0,h-1))bad();const k=x+','+y;if(used.has(k))bad();used.add(k);return k};
  const arr=v=>v==null?[]:Array.isArray(v)?v:bad(),map=v=>v==null?{}:typeof v==='object'&&!Array.isArray(v)?v:bad();
  const key=k=>{const m=/^(\d{1,2}),(\d{1,2})$/.exec(k);if(!m)bad();return cell(+m[1],+m[2])},ori=v=>v==='/'||v==='\\'?v:null;
  for(const b of arr(r.balls)){if(!Array.isArray(b)||typeof b[2]!=='string'||!own(DX,b[2]))bad();cell(b[0],b[1]);T.balls.push([b[0],b[1],b[2],isInt(b[3],0,MAXDELAY)?b[3]:0])}
  for(const k in map(r.chimes)){const n=r.chimes[k];if(typeof n!=='string'||!own(NOTE,n))bad();T.chimes[key(k)]=n}
  for(const p of arr(r.pads)){if(!p||typeof p!=='object'||(p.t!=='b'&&p.t!=='f'&&p.t!=='p'))bad();cell(p.x,p.y);const o=ori(p.o)||ori(p.sol)||ori(p.s);if(!o)bad();T.pads.push({x:p.x,y:p.y,t:p.t,o,s:p.t==='b'?(ori(p.s)||o):o})}
  for(const p of arr(r.portals)){if(!Array.isArray(p))bad();cell(p[0],p[1]);cell(p[2],p[3]);T.portals.push([p[0],p[1],p[2],p[3]])}
  if(r.half!=null){if(!Array.isArray(r.half))bad();cell(r.half[0],r.half[1]);T.half=[r.half[0],r.half[1]]}
  for(const k of ['traps','goals','switches'])for(const q of arr(r[k])){if(!Array.isArray(q))bad();cell(q[0],q[1]);T[k].push([q[0],q[1]])}
  for(const k in map(r.rests)){if(!isInt(r.rests[k],1,MAXREST))bad();T.rests[key(k)]=r.rests[k]}
  for(const q of arr(r.clocks)){if(!Array.isArray(q)||!isInt(q[2],1,MAXPERIOD))bad();cell(q[0],q[1]);T.clocks.push([q[0],q[1],q[2]])}
  if(T.balls.length>MAXBALLS||T.portals.length>MAXPORTS||T.clocks.length>MAXCLOCKS)bad();
  const blue=new Set(T.pads.filter(p=>p.t==='b').map(p=>p.x+','+p.y)),fl=arr(r.flips);
  if(fl.length<=200&&fl.every(f=>Array.isArray(f)&&isInt(f[0],1,MAXTUNE)&&blue.has(f[1]+','+f[2])))T.flips=fl.map(f=>[f[0],f[1],f[2]]).sort((a,b)=>a[0]-b[0]);
  return T}
// Works out everything that follows from the solved board. Returns the route of each ball for the editor.
function judge(T){PREP.delete(T);const st={},rec={};for(const p of T.pads)st[p.x+','+p.y]=p.o;
  const blue=new Set(T.pads.filter(p=>p.t==='b').map(p=>p.x+','+p.y));T.flips=T.flips.filter(f=>blue.has(f[1]+','+f[2]));
  const r=T.balls.length?simulate(T,st,T.flips,rec):{notes:[],ends:[],steps:0};
  for(const p of T.pads){if(p.t==='b'){p.sol=rec.hit&&rec.hit.has(p.x+','+p.y)?p.o:null;if(p.s!=='/'&&p.s!=='\\')p.s=p.o}else{p.s=p.o;p.sol=p.o}}
  T.tune=r.notes.map(n=>n.note);T.steps=r.steps;
  const lost=r.ends.findIndex(e=>e!=='goal'),who=T.balls.length>1?'Ball '+(lost+1):'The ball';let why='';
  if(!T.balls.length)why='Add a launcher. It is where a ball starts.';
  else if(T.half)why='A portal has no twin yet. Place a second one.';
  else if(lost>=0)why=who+(r.ends[lost]==='off'?' rolls off the board.':r.ends[lost]==='trap'?' hits a trap.':' never reaches a flag.');
  else if(!T.tune.length)why='No pad rings yet. Put a pad on the route.';
  else if(r.steps>MAXTUNE)why='The tune runs longer than '+MAXTUNE+' steps.';
  T.why=why;T.ok=!why;
  T.box=T.ok&&!T.flips.length&&T.pads.every(p=>p.t!=='b'||!p.sol||p.s===p.sol);   // already solved at the start: a music box
  return rec}
// The part of a tune that is stored and shared: no derived fields, no empty lists.
function slim(T){const o={id:T.id,name:T.name,w:T.w,h:T.h};if(T.tick&&T.tick!==TICK)o.tick=T.tick;
  o.balls=T.balls.map(b=>b[3]?[b[0],b[1],b[2],b[3]]:[b[0],b[1],b[2]]);o.chimes=T.chimes;
  o.pads=T.pads.map(p=>p.t==='b'?{x:p.x,y:p.y,t:'b',o:p.o,s:p.s}:{x:p.x,y:p.y,t:p.t,o:p.o});o.goals=T.goals;
  for(const k of ['portals','traps','switches','clocks','flips'])if(T[k].length)o[k]=T[k];
  if(Object.keys(T.rests).length)o.rests=T.rests;if(T.half)o.half=T.half;if(T.auto)o.auto=true;if(T.tip)o.tip=T.tip;return o}
const packCourse=c=>({id:c.id,name:c.name,by:c.by,tunes:c.tunes.map(slim)});
function cleanCourse(r,out){if(!r||typeof r!=='object'||(r.tunes!=null&&!Array.isArray(r.tunes)))throw new Error('bad');
  const c={id:typeof r.id==='string'&&/^[a-z0-9]{6,20}$/.test(r.id)?r.id:uid(),name:cleanText(r.name,40,'Untitled course'),by:cleanText(r.by,24,''),tunes:[]},seen=new Set();
  for(const t of r.tunes||[]){if(c.tunes.length>=MAXTUNES){if(out)out.skipped++;continue}
    try{const T=cleanTune(t);if(seen.has(T.id))T.id=uid();seen.add(T.id);judge(T);c.tunes.push(T)}catch(e){if(out)out.skipped++}}
  return c}
function blankTune(name){const T=cleanTune({name,w:6,h:8,balls:[[0,3,'E']],goals:[[5,3]],auto:true});judge(T);return T}

/* ---------- the store ---------- */
// bad: anything in storage that no longer passes the checks is kept as it was rather than thrown away.
const ST={courses:[],seeded:false,bad:[]};
(function(){try{const s=JSON.parse(loadKey('studio'));if(!s||!Array.isArray(s.courses))return;ST.seeded=!!s.seeded;if(Array.isArray(s.bad))ST.bad=s.bad;
  for(const c of s.courses){try{ST.courses.push(cleanCourse(c))}catch(e){ST.bad.push(c)}}}catch(e){}})();
let saveT=0;
function saveStudio(now){clearTimeout(saveT);saveT=0;const go=()=>{saveT=0;saveKey('studio',JSON.stringify({v:1,seeded:ST.seeded,courses:ST.courses.map(packCourse),bad:ST.bad}))};if(now)go();else saveT=setTimeout(go,500)}
window.__flush=()=>{if(saveT)saveStudio(true)};
const tuneStars=(T,ear)=>((save.cs[T.id]||[])[ear?1:0]||0);
const courseStars=c=>c.tunes.reduce((n,T)=>n+tuneStars(T,save.earMode),0);
function courseTip(T){if(T.tip)return T.tip;
  if(Object.keys(T.rests).length)return 'A dashed ring holds the ball for the number of steps it shows.';
  if(T.clocks.length)return 'The clock flips every purple paddle each time its count comes round.';
  if(T.balls.some(b=>b[3]))return 'A launcher with a number holds its ball for that many steps.';
  return plainTip(T)}
function playlist(c){return {id:'c:'+c.id,tunes:c.tunes,label:(i,ear)=>c.name+', '+(i+1)+' of '+c.tunes.length+(ear?', by ear':''),tip:i=>courseTip(c.tunes[i]),playable:i=>!!c.tunes[i].ok,
  setStars(i,ear,n){const id=c.tunes[i].id,r=save.cs[id]||(save.cs[id]=[0,0]);r[ear?1:0]=Math.max(r[ear?1:0]||0,n);persist()},
  best:ear=>(save.runs[c.id]||[])[ear?1:0]||0,setBest(ear,ms){const r=save.runs[c.id]||(save.runs[c.id]=[0,0]);r[ear?1:0]=ms;persist()},
  exit:()=>showCourse(c),endLabel:'Back to the course'}}
// Changing a course makes its old stars and best time meaningless, so they go.
function touched(c,T){let ch=false;if(T&&save.cs[T.id]){delete save.cs[T.id];ch=true}if(save.runs[c.id]){delete save.runs[c.id];ch=true}if(ch)persist()}

/* ---------- lists: courses on the home screen, the Studio, one course ---------- */
function courseRow(c,from){const done=c.tunes.filter(t=>t.ok).length;
  return el('button',{class:'lv','data-course':c.id,onclick:()=>{sfx('click');if(!$('#home').hidden)homeY=$('#home').scrollTop;showCourse(c,from)}},el('b',{text:String(c.tunes.length)}),
    el('span',{style:'min-width:0'},el('span',{class:'nm',text:c.name}),el('span',{class:'by',text:(c.by?'by '+c.by+' · ':'')+plural(c.tunes.length,'tune')+(done<c.tunes.length?', '+(c.tunes.length-done)+' unfinished':'')})),
    el('span',{class:'count'},el('img',{src:A.img.star,alt:''}),courseStars(c)+' of '+done*3))}
window.coursesOnHome=function(host){host.textContent='';if(!ST.courses.length)return;
  const sec=el('div',{class:'set'},el('h2',{text:'Courses'}),el('p',{text:'Made in the Studio, or imported from someone else.'}));for(const c of ST.courses)sec.append(courseRow(c,'home'));host.append(sec)};
function showStudio(){
  if(!ST.seeded){ST.seeded=true;ST.courses.push(exampleCourse());saveStudio(true)}
  show('studio');const b=$('#stBody');b.textContent='';
  b.append(el('div',{class:'row'},btn('New course',ICON.plus,newCourse,'pri'),btn('Import',ICON.inbox,importSheet)));
  b.append(el('p',{class:'note',text:ST.courses.length?'A course is a set of tunes you build yourself. Open one to play it, change it or share it.':'No courses yet. Start one, or import a course someone sent you.'}));
  const list=el('div',{});for(const c of ST.courses)list.append(courseRow(c,'studio'));b.append(list);
  if(ST.courses.length)b.append(el('button',{class:'link',text:'Export everything to one file',onclick:()=>{sfx('click');exportAll()}}));
  if(!ST.courses.some(c=>c.id===EX_ID))b.append(el('button',{class:'link',text:'Bring back the example course',onclick:()=>{sfx('click');ST.courses.push(exampleCourse());saveStudio(true);showStudio()}}))}
$('#studioBtn').onclick=()=>{sfx('click');homeY=$('#home').scrollTop;showStudio()};
$('#stBack').onclick=()=>{sfx('click');showHome()};
let CO=null,coFrom='studio';
function leaveCourse(){CO=null;if(coFrom==='home')showHome();else showStudio()}
$('#coBack').onclick=()=>{sfx('click');leaveCourse()};
window.studioBack=function(){if(!$('#course').hidden){leaveCourse();return true}if(!$('#studio').hidden){showHome();return true}return false};
function showCourse(c,from){CO=c;if(from)coFrom=from;show('course');const ear=save.earMode,list=playlist(c),ready=c.tunes.filter(t=>t.ok).length;
  $('#coName').textContent=c.name;$('#coBy').textContent=(c.by?'by '+c.by+' · ':'')+plural(c.tunes.length,'tune')+(ear?' · ear mode':'');
  const b=$('#coBody');b.textContent='';
  const run=btn('Timed run',ICON.watch,()=>startRun(list)),share=btn('Share',ICON.share,()=>shareSheet(c));if(!ready)run.disabled=true;if(!c.tunes.length)share.disabled=true;
  b.append(el('div',{class:'row'},run,share));
  const best=list.best(ear);b.append(el('div',{class:'best'},best?el('span',{},'Best timed run'+(ear?' by ear':'')+': ',el('b',{text:fmtTime(best)})):el('span',{text:ready?'A timed run plays every finished tune back to back against the clock.':'Add a tune to get started.'})));
  const rows=el('div',{});
  c.tunes.forEach((T,i)=>{const open=()=>{sfx('click');if(T.ok)openTune(list,i);else openEditor(c,i)};
    rows.append(el('div',{class:'tr'},
      el('button',{class:'lv',onclick:open},el('b',{text:String(i+1)}),el('span',{style:'min-width:0'},el('span',{class:'nm',text:T.name}),T.ok?dotRow(T.tune,ear):el('span',{class:'draft',text:'Unfinished: '+T.why})),T.ok?starRow(tuneStars(T,ear)):el('span',{})),
      ib('Edit '+T.name,ICON.edit,()=>openEditor(c,i)),ib('More for '+T.name,ICON.dots,()=>tuneMenu(c,i))))});
  b.append(rows);
  const add=btn('Add a tune',ICON.plus,()=>{if(c.tunes.length>=MAXTUNES){toast('A course holds up to '+MAXTUNES+' tunes.');return}c.tunes.push(blankTune('Tune '+(c.tunes.length+1)));touched(c);saveStudio(true);openEditor(c,c.tunes.length-1)},'pri');
  b.append(el('div',{class:'row'},add))}
$('#coMenu').onclick=()=>{sfx('click');if(CO)courseMenu(CO)};
function nameFields(c,done){const n=el('input',{type:'text',maxlength:40,value:c?c.name:'',placeholder:'Course name',enterkeyhint:'done'}),by=el('input',{type:'text',maxlength:24,value:c?c.by:save.by,placeholder:'Your name (optional)',enterkeyhint:'done'});
  const go=()=>done(cleanText(n.value,40,'My course'),cleanText(by.value,24,''));for(const i of [n,by])i.addEventListener('keydown',e=>{if(e.key==='Enter')i.blur()});
  return [el('label',{},'Name',n),el('label',{},'Made by',by),el('div',{class:'row'},btn(c?'Save':'Create',null,go,'pri'))]}
function newCourse(){sheet('New course',nameFields(null,(name,by)=>{const c={id:uid(),name,by,tunes:[]};save.by=by;persist();ST.courses.push(c);saveStudio(true);closeSheet();showCourse(c,'studio')}),{up:true})}
function confirmSheet(title,text,yes,fn){sheet(title,[el('p',{class:'note',text}),el('div',{class:'row'},btn('Cancel',null,closeSheet),btn(yes,null,()=>{closeSheet();fn()},'bad'))])}
function courseMenu(c){sheet(c.name,[el('div',{class:'menu'},
  btn('Rename',ICON.edit,()=>sheet('Rename',nameFields(c,(name,by)=>{c.name=name;c.by=by;save.by=by;persist();saveStudio(true);closeSheet();showCourse(c)}),{up:true})),
  btn('Share',ICON.share,()=>shareSheet(c)),
  btn('Duplicate',ICON.dup,()=>{const d=cleanCourse(packCourse(c));d.id=uid();d.name=cleanText(c.name+' copy',40,c.name);for(const T of d.tunes)T.id=uid();ST.courses.push(d);saveStudio(true);closeSheet();showCourse(d)}),
  btn('Delete course',ICON.trash,()=>confirmSheet('Delete '+c.name+'?','The course and its '+plural(c.tunes.length,'tune')+' will be removed from this phone. Export it first if you want a copy.','Delete',()=>{ST.courses=ST.courses.filter(x=>x!==c);touched(c);saveStudio(true);coFrom='studio';leaveCourse()}),'bad'))])}
function tuneMenu(c,i){const T=c.tunes[i],move=d=>{const j=i+d;if(j<0||j>=c.tunes.length)return;c.tunes.splice(i,1);c.tunes.splice(j,0,T);touched(c);saveStudio(true);closeSheet();showCourse(c)};
  const up=btn('Move up',ICON.up,()=>move(-1)),down=btn('Move down',ICON.down,()=>move(1));up.disabled=i===0;down.disabled=i===c.tunes.length-1;
  sheet(T.name,[el('div',{class:'menu'},btn('Edit',ICON.edit,()=>{closeSheet();openEditor(c,i)}),
    btn('Duplicate',ICON.dup,()=>{if(c.tunes.length>=MAXTUNES){toast('A course holds up to '+MAXTUNES+' tunes.');return}const d=cleanTune(slim(T));d.id=uid();d.name=cleanText(T.name+' copy',40,T.name);judge(d);c.tunes.splice(i+1,0,d);touched(c);saveStudio(true);closeSheet();showCourse(c)}),
    up,down,btn('Share this tune',ICON.share,()=>shareSheet(c,T)),
    btn('Delete tune',ICON.trash,()=>confirmSheet('Delete '+T.name+'?','This tune will be removed from the course.','Delete',()=>{c.tunes.splice(i,1);touched(c,T);saveStudio(true);showCourse(c)}),'bad'))])}

/* ---------- editor: the pieces of a tune ---------- */
const inBoard=(T,c)=>c.x>=0&&c.y>=0&&c.x<T.w&&c.y<T.h;
function pieceAt(T,x,y){const k=x+','+y,at=a=>a.findIndex(q=>q[0]===x&&q[1]===y);let i;
  if((i=at(T.balls))>=0)return {kind:'ball',i};
  if((i=T.pads.findIndex(p=>p.x===x&&p.y===y))>=0)return {kind:'pad',i};
  if(own(T.chimes,k))return {kind:'chime'};
  if(own(T.rests,k))return {kind:'rest'};
  if((i=at(T.goals))>=0)return {kind:'goal',i};
  if((i=at(T.traps))>=0)return {kind:'trap',i};
  if((i=at(T.switches))>=0)return {kind:'sw',i};
  if((i=at(T.clocks))>=0)return {kind:'clock',i};
  for(i=0;i<T.portals.length;i++){const p=T.portals[i];if(p[0]===x&&p[1]===y)return {kind:'portal',i,end:0};if(p[2]===x&&p[3]===y)return {kind:'portal',i,end:2}}
  if(T.half&&T.half[0]===x&&T.half[1]===y)return {kind:'portal',i:-1};
  return null}
const LIST={ball:'balls',goal:'goals',trap:'traps',sw:'switches',clock:'clocks'};
function removeAt(T,x,y){const p=pieceAt(T,x,y),k=x+','+y;if(!p)return;
  if(p.kind==='pad')T.pads.splice(p.i,1);else if(p.kind==='chime')delete T.chimes[k];else if(p.kind==='rest')delete T.rests[k];
  else if(p.kind==='portal'){if(p.i<0)T.half=null;else{const q=T.portals.splice(p.i,1)[0],other=[q[2-p.end],q[3-p.end]];if(T.half){T.portals.push([other[0],other[1],T.half[0],T.half[1]]);T.half=null}else T.half=other}}
  else T[LIST[p.kind]].splice(p.i,1)}
// moves the piece at (x,y) to an empty cell (nx,ny); (-1,-1) is used as a parking place while swapping
function moveTo(T,x,y,nx,ny){const p=pieceAt(T,x,y),k=x+','+y,nk=nx+','+ny;if(!p)return;
  if(p.kind==='pad'){T.pads[p.i].x=nx;T.pads[p.i].y=ny}
  else if(p.kind==='chime'){T.chimes[nk]=T.chimes[k];delete T.chimes[k]}
  else if(p.kind==='rest'){T.rests[nk]=T.rests[k];delete T.rests[k]}
  else if(p.kind==='portal'){const q=p.i<0?T.half:T.portals[p.i],e=p.i<0?0:p.end;q[e]=nx;q[e+1]=ny}
  else{const q=T[LIST[p.kind]][p.i];q[0]=nx;q[1]=ny}}
// false (with a message for the status line) if the board already has as many of that piece as it may
function canPlace(T,kind){
  if(kind==='ball'&&T.balls.length>=MAXBALLS)return say('Four balls is the limit.','bad');
  if(kind==='clock'&&T.clocks.length>=MAXCLOCKS)return say('Four clocks is the limit.','bad');
  if(kind==='portal'&&!T.half&&T.portals.length>=MAXPORTS)return say('Four pairs of portals is the limit.','bad');
  return true}
function placeNew(T,kind,x,y){const k=x+','+y;
  if(kind==='ball')T.balls.push([x,y,x>=T.w-1?'W':'E',0]);
  else if(kind==='pad')T.pads.push({x,y,t:E.padT,o:'/',s:Math.random()<.5?'/':'\\'});
  else if(kind==='chime')T.chimes[k]=E.note;
  else if(kind==='rest')T.rests[k]=2;
  else if(kind==='clock')T.clocks.push([x,y,8]);
  else if(kind==='portal'){if(T.half){T.portals.push([T.half[0],T.half[1],x,y]);T.half=null}else T.half=[x,y]}
  else T[LIST[kind]].push([x,y])}
// puts a new piece on a cell, replacing whatever is there; leaves the board alone if the piece is not allowed
function dropNew(T,kind,x,y){const snap=JSON.stringify(slim(T));if(pieceAt(T,x,y))removeAt(T,x,y);if(!canPlace(T,kind)){setTune(snap);return}placeNew(T,kind,x,y)}
function resizeBoard(T,w,h){let gone=0;for(let y=0;y<T.h;y++)for(let x=0;x<T.w;x++)if((x>=w||y>=h)&&pieceAt(T,x,y)){removeAt(T,x,y);gone++}
  T.w=w;T.h=h;if(T.half&&(T.half[0]>=w||T.half[1]>=h))T.half=null;if(gone)E.note2=plural(gone,'piece')+' did not fit and '+(gone===1?'was':'were')+' removed. Undo brings '+(gone===1?'it':'them')+' back.'}
// what to draw for the piece at a cell, or for a new piece of a kind (for the palette and the drag ghost)
function lookOf(T,x,y,kind){const p=T&&x!=null?pieceAt(T,x,y):null,k=x+','+y;
  if(!p)return kind==='pad'?{kind,t:E?E.padT:'b',o:'/'}:kind==='chime'?{kind,note:E?E.note:'C'}:kind==='ball'?{kind,d:'E',bi:E?Math.min(3,E.T.balls.length):0}:kind==='rest'?{kind,n:2}:kind==='clock'?{kind,p:8}:kind==='portal'?{kind,pi:E?E.T.portals.length:0}:{kind};
  if(p.kind==='pad')return {kind:'pad',t:T.pads[p.i].t,o:E&&E.view==='start'?T.pads[p.i].s:T.pads[p.i].o};
  if(p.kind==='chime')return {kind:'chime',note:T.chimes[k]};
  if(p.kind==='ball')return {kind:'ball',d:T.balls[p.i][2],bi:p.i,delay:T.balls[p.i][3]};
  if(p.kind==='rest')return {kind:'rest',n:T.rests[k]};
  if(p.kind==='clock')return {kind:'clock',p:T.clocks[p.i][2]};
  if(p.kind==='portal')return {kind:'portal',pi:p.i<0?T.portals.length:p.i,half:p.i<0};
  return {kind:p.kind}}
function drawPiece(c,L,x,y,cs,time){const k=L.kind;
  if(k==='ball'){D.emit(c,x,y,cs,L.d,time,L.delay||0);D.ball(c,x,y,cs,L.bi||0)}
  else if(k==='pad')D.paddle(c,x,y,cs,L.t,L.o==='/'?-45:45);
  else if(k==='chime')D.chime(c,x,y,cs,L.note,0,false);
  else if(k==='goal')D.goal(c,x,y,cs,0);else if(k==='trap')D.trap(c,x,y,cs,0);
  else if(k==='portal')D.portal(c,x,y,cs,L.pi||0,0,L.half);else if(k==='sw')D.sw(c,x,y,cs,0);
  else if(k==='rest')D.rest(c,x,y,cs,L.n,0);else if(k==='clock')D.clock(c,x,y,cs,L.p,0,0);
  else if(k==='erase'){c.save();c.translate(x,y);c.rotate(-.6);c.fillStyle=TH.light?'#c9d2ea':'#d7def5';rr(c,-cs*.3,-cs*.17,cs*.6,cs*.34,cs*.07);c.fill();c.fillStyle='#f06a80';rr(c,-cs*.3,-cs*.17,cs*.24,cs*.34,cs*.07);c.fill();c.restore()}}
const NAMES={ball:'Launcher',pad:'Paddle',chime:'Pad',goal:'Flag',trap:'Trap',portal:'Portal',sw:'Switch',rest:'Rest',clock:'Clock',erase:'Eraser'};
const ABOUT={ball:'Launcher: a ball starts here and rolls the way the arrows point.',pad:'Paddle: turns the ball. Blue ones are the player’s to turn.',chime:'Pad: rings its note when a ball rolls over it.',goal:'Flag: every ball has to end on one.',trap:'Trap: stops a ball dead.',
  portal:'Portal: a ball going in comes out of its twin. Place them in pairs.',sw:'Switch: flips every purple paddle when a ball rolls over it.',rest:'Rest: holds the ball for a number of steps.',clock:'Clock: flips every purple paddle each time its count comes round.',erase:'Eraser: tap a piece to remove it.'};

/* ---------- editor: state and edits ---------- */
// E: course c, tune T (index i), view 'solved' or 'start', sel (selected cell), tool (armed palette piece),
// note and padT (what the next pad or paddle will be), undo/redo (stacks of JSON), drag, path (ball routes).
let E=null;
function say(t,k){E.msg=[t,k||''];return false}
function status(){const T=E.T;if(E.msg){tip(E.msg[0],E.msg[1]);E.msg=null;return}
  if(E.note2){tip(E.note2);E.note2='';return}
  if(!T.ok)return tip(T.why,'bad');
  const route=T.pads.filter(p=>p.t==='b'&&p.sol),wrong=route.filter(p=>p.s!==p.sol).length;
  if(E.view==='start')return tip(T.box?'Nothing to solve yet: the board starts solved. Tap a blue paddle or press Scramble.':(wrong?plural(wrong,'paddle')+' of '+route.length+' on the route '+(wrong===1?'starts':'start')+' turned the wrong way':'Every route paddle starts right')+(T.flips.length?', and '+plural(T.flips.length,'live turn')+' '+(T.flips.length===1?'is':'are')+' needed.':'.'));
  tip('Plays '+plural(T.tune.length,'note')+' in '+plural(T.steps,'step')+(T.flips.length?', with '+plural(T.flips.length,'live turn'):'')+'.','good')}
// Applies a change to the tune. Returns false if nothing changed. keep: the change does not disturb
// recorded live turns. merge: quick repeats with the same merge name share one undo step.
function edit(fn,keep,merge){const T=E.T,before=JSON.stringify(slim(T));fn(T);const after=JSON.stringify(slim(T));
  if(after===before){if(E.msg)status();return false}
  if(!keep&&T.flips.length){T.flips=[];if(!E.note2)E.note2='That change cleared the live turns. Run Test to record them again.'}
  const now=performance.now();if(!(merge&&merge===E.merge&&now-E.mergeT<1500)){E.undo.push(before);if(E.undo.length>80)E.undo.shift()}E.merge=merge||'';E.mergeT=now;E.redo=[];
  touched(E.c,T);refresh();return true}
function setTune(json){const T=E.T,N=cleanTune(JSON.parse(json));for(const k in T)delete T[k];Object.assign(T,N)}
function undo(redo){const from=redo?E.redo:E.undo,to=redo?E.undo:E.redo;if(!from.length||G.run)return;sfx('click');to.push(JSON.stringify(slim(E.T)));setTune(from.pop());E.sel=null;E.merge='';touched(E.c,E.T);refresh()}
$('#undo').onclick=()=>{if(E&&G&&G.edit)undo(false)};$('#redo').onclick=()=>{if(E&&G&&G.edit)undo(true)};
function refresh(){const T=E.T,old={};if(G)for(const p of G.pads)old[p.k]=p.ang;
  E.path=judge(T).path||[];G.L=T;loadPads(E.view);for(const p of G.pads)if(old[p.k]!=null)p.ang=old[p.k];
  if(E.sel&&!pieceAt(T,E.sel.x,E.sel.y))E.sel=null;
  $('#lvName').textContent=T.name;$('#lvNo').textContent='Editing · '+E.c.name;const sb=$('#sizeBtn');sb.innerHTML=svg(ICON.grid);sb.append(T.w+'×'+T.h);
  drawPal();if(!E.hold)drawOpts();E.ctl();status();resize();saveStudio()}
function openEditor(c,i,keep){const T=c.tunes[i];
  if(!keep)E={c,i,T,view:'solved',sel:null,tool:null,note:'C',padT:'b',undo:[],redo:[],drag:null,ptr:null,path:[],msg:null,note2:'',merge:'',mergeT:0,pianoX:null,hold:false,
    down:edDown,tested:edTested,under:edUnder,over:edOver,live:p=>p.t==='b',busy:()=>!!E.drag,ctl:edCtl,back:edBack};
  G=buildG(T,{edit:E,i});G.L=T;show('play');$('#play').classList.add('edit');$('#ed').hidden=false;$('#card').hidden=true;$('#clock').hidden=true;$('#sizeBtn').hidden=false;
  buildPal();refresh();
  if(!T.ok&&!E.undo.length&&!Object.keys(T.chimes).length)tip('Drag a piece from the row below onto the board, or tap one and then tap cells. Start with a pad on the ball’s path.')}
function edBack(){if(G.run){G.run=null;restore()}cancelDrag();const T=E.T,c=E.c;
  if(T.auto&&T.box&&T.ok&&T.pads.some(p=>p.t==='b'&&p.sol)){scrambleTune(T);judge(T)}
  saveStudio(true);E=null;G=null;$('#play').classList.remove('edit');$('#ed').hidden=true;$('#sizeBtn').hidden=true;$('#ghost').hidden=true;showCourse(c)}
function edCtl(){const run=!!G.run,start=E.view==='start';$('#testTxt').textContent=run?'STOP':start?'PLAY IT':'TEST';$('#test').classList.toggle('run',run);
  $('#undo').disabled=run||!E.undo.length;$('#redo').disabled=run||!E.redo.length;$('#viewBtn').disabled=run;$('#viewLab').textContent=start?'Solved':'Start';$('#ed').classList.toggle('start',start);$('#ed').classList.toggle('busy',run)}
function scrambleTune(T){const route=T.pads.filter(p=>p.t==='b'&&p.sol);
  for(let n=0;n<20;n++){for(const p of T.pads)if(p.t==='b')p.s=Math.random()<.5?'/':'\\';if(route.some(p=>p.s!==p.o))break}
  if(route.length&&route.every(p=>p.s===p.o))route[0].s=FL[route[0].o]}
$('#viewBtn').onclick=()=>{if(!E||!G||!G.edit||G.run)return;sfx('click');cancelDrag();E.view=E.view==='solved'?'start':'solved';E.sel=null;E.tool=null;
  if(E.view==='start'&&E.T.auto&&E.T.box&&E.T.pads.some(p=>p.t==='b'&&p.sol)){edit(T=>scrambleTune(T),true);return}refresh()};
$('#test').onclick=()=>{if(!E||!G||!G.edit)return;sfx('click');const T=E.T;
  if(G.run){G.run=null;restore();G.played=[];G.trail=[];say('Stopped.');status();edCtl();drawOpts();return}
  if(E.view==='start'){if(!T.ok){say('Finish the tune first: '+T.why,'bad');status();return}saveStudio(true);const keep=E;
    openTune({id:'try',tunes:[T],label:()=>'Trying your tune',tip:()=>courseTip(T),playable:()=>true,setStars(){},exit:()=>{E=keep;openEditor(keep.c,keep.i,true)},endLabel:'Back to the editor'},0);return}
  if(!T.balls.length){say('Add a launcher first.','bad');status();return}
  cancelDrag();E.sel=null;G.rec=[];G.replay=T.flips.length?T.flips.map(f=>f.slice()):null;G.played=[];launch();drawOpts();
  tip(G.replay?'Rolling, with the live turns you recorded. Tap a blue paddle to record new ones instead.':'Rolling. Tap a blue paddle now to record a live turn.')};
function edTested(ends,played,rec){const T=E.T,pl=k=>k===1?'':'s';
  if(ends.every(e=>e==='goal')&&played.length){
    if(JSON.stringify(rec)!==JSON.stringify(T.flips))edit(t=>{t.flips=rec.map(f=>f.slice())},true);
    say('That roll is the tune: '+plural(played.length,'note')+(rec.length?', with '+plural(rec.length,'live turn'):'')+'.','good')}
  else{const i=ends.findIndex(e=>e!=='goal'),who=ends.length>1&&i>=0?'Ball '+(i+1):'The ball';
    say((i<0?'No pad rang on that roll.':who+(ends[i]==='off'?' rolled off the board.':ends[i]==='trap'?' hit a trap.':' did not reach a flag in '+MAXTUNE+' step'+pl(MAXTUNE)+'.'))+(T.flips.length?' The live turns recorded before are kept.':''),'bad')}
  status();edCtl();drawOpts()}


/* ---------- editor: pointer, drag and drop ---------- */
// A drag starts on a palette button (a new piece) or on a piece on the board (move, swap, or drop it
// off the board to remove it). The piece is drawn a little above a finger so it can be seen; the cell
// that will take it is the one under the finger, and it is ringed. A tap that does not move is edTap().
const LIFT=34;
function startDrag(d,e){E.drag=d;E.sel=null;const g=$('#ghost'),dpr=Math.min(3,window.devicePixelRatio||1);g.width=g.height=64*dpr;const c=g.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,64,64);
  drawPiece(c,d.look,d.look.kind==='ball'?24:32,32,Math.max(38,Math.min(56,geo.cs)),.25);g.hidden=false;moveDrag(e);drawOpts()}
function moveDrag(e){const d=E.drag,a=$('#app').getBoundingClientRect(),g=$('#ghost'),c=cellAt(e),inside=inBoard(E.T,c);
  g.style.transform=`translate(${e.clientX-a.left-32}px,${e.clientY-a.top-32-(d.touch?LIFT:0)}px)`;d.over=inside?c:null;d.out=!inside;g.style.opacity=d.from&&d.out?'.4':'';G.idle=false}
function cancelDrag(){if(E){E.drag=null;E.ptr=null}$('#ghost').hidden=true}
function endDrag(){const d=E.drag,o=d&&d.over;E.drag=null;$('#ghost').hidden=true;G.idle=false;if(!d)return;
  if(d.from){const f=d.from;
    if(o&&(o.x!==f.x||o.y!==f.y)){edit(T=>{if(pieceAt(T,o.x,o.y)){moveTo(T,o.x,o.y,-1,-1);moveTo(T,f.x,f.y,o.x,o.y);moveTo(T,-1,-1,f.x,f.y)}else moveTo(T,f.x,f.y,o.x,o.y)});E.sel={x:o.x,y:o.y};sfx('turn',.5)}
    else if(d.out){edit(T=>removeAt(T,f.x,f.y));E.sel=null;sfx('deny',.4)}
    else E.sel={x:f.x,y:f.y}}
  else if(o&&edit(T=>dropNew(T,d.kind,o.x,o.y))){E.sel={x:o.x,y:o.y};sfx('click');if(d.kind==='chime')ring(E.note,.8)}
  drawOpts()}
function edDown(e){const c=cellAt(e);
  if(G.run){const p=G.padAt[c.x+','+c.y];   // test roll: a tap on a blue paddle is a live turn, and is recorded
    if(p&&p.t==='b'){p.s=FL[p.s];p.wob=1;sfx('turn',.7,p.s==='/'?1.12:.94);G.replay=null;G.rec.push([G.run.n+1,c.x,c.y])}return}
  E.ptr={id:e.pointerId,x:e.clientX,y:e.clientY,cell:c,moved:false,touch:e.pointerType==='touch'};try{cv.setPointerCapture(e.pointerId)}catch(_){}}
cv.addEventListener('pointermove',e=>{if(!E||!G||!G.edit||!E.ptr||e.pointerId!==E.ptr.id)return;const P=E.ptr;
  if(!P.moved){if(Math.hypot(e.clientX-P.x,e.clientY-P.y)<10)return;P.moved=true;
    if(E.view==='solved'&&inBoard(E.T,P.cell)&&pieceAt(E.T,P.cell.x,P.cell.y))startDrag({from:P.cell,look:lookOf(E.T,P.cell.x,P.cell.y),touch:P.touch},e)}
  else if(E.drag)moveDrag(e)});
cv.addEventListener('pointerup',e=>{if(!E||!G||!G.edit||!E.ptr||e.pointerId!==E.ptr.id)return;const P=E.ptr;E.ptr=null;if(E.drag)endDrag();else if(!P.moved)edTap(P.cell)});
cv.addEventListener('pointercancel',()=>{if(E&&G&&G.edit)cancelDrag()});
function edTap(c){const T=E.T;if(!inBoard(T,c)){E.sel=null;drawOpts();return}
  const p=pieceAt(T,c.x,c.y),k=c.x+','+c.y;
  if(E.view==='start'){
    if(p&&p.kind==='pad'&&T.pads[p.i].t==='b'){sfx('turn',.7);edit(t=>{const q=t.pads[p.i];q.s=FL[q.s];t.auto=false},true)}
    else if(p&&p.kind==='pad'){sfx('deny',.5);say('Only blue paddles can start turned. Brown and purple ones are part of the board.');status()}
    return}
  if(E.tool==='erase'){if(p){sfx('deny',.4);edit(t=>removeAt(t,c.x,c.y))}return}
  if(p){E.sel={x:c.x,y:c.y};
    if(p.kind==='pad'){sfx('turn',.7,T.pads[p.i].o==='/'?.94:1.12);if(!edit(t=>{const q=t.pads[p.i];q.o=FL[q.o];if(q.t!=='b')q.s=q.o}))drawOpts()}
    else if(p.kind==='ball'){sfx('turn',.6);edit(t=>{const b=t.balls[p.i];b[2]=CW[b[2]]})}
    else{if(p.kind==='chime'){E.note=T.chimes[k];ring(E.note,.8);G.pulse[k]=1}else sfx('click',.6);drawOpts()}
    return}
  if(E.tool){if(edit(t=>dropNew(t,E.tool,c.x,c.y))){E.sel={x:c.x,y:c.y};if(E.tool==='chime')ring(E.note,.8);else sfx('click')}drawOpts();return}
  E.sel=null;drawOpts()}
function edUnder(c,cs){const T=E.T;c.save();c.strokeStyle=TH.grid;c.lineWidth=1;c.beginPath();
  for(let x=1;x<T.w;x++){c.moveTo(x*cs+.5,4);c.lineTo(x*cs+.5,T.h*cs-4)}for(let y=1;y<T.h;y++){c.moveTo(4,y*cs+.5);c.lineTo(T.w*cs-4,y*cs+.5)}c.stroke();
  if(E.view==='solved'&&!G.run){c.lineCap='round';c.lineJoin='round';c.lineWidth=Math.max(2,cs*.07);c.globalAlpha=TH.light?.34:.28;   // the route each ball takes on the solved board
    E.path.forEach((path,bi)=>{const off=(bi-(E.path.length-1)/2)*cs*.08;c.strokeStyle=bi?BALLC[bi]:TH.route;c.beginPath();
      path.forEach((q,j)=>{const x=(q[0]+.5)*cs+off,y=(q[1]+.5)*cs+off;if(j===0||q[2])c.moveTo(x,y);else c.lineTo(x,y)});c.stroke()})}
  c.restore()}
function edOver(c,cs){const d=E.drag;c.save();
  if(E.sel&&!G.run&&!d){c.strokeStyle=TH.accent;c.lineWidth=2.5;rr(c,E.sel.x*cs+2,E.sel.y*cs+2,cs-4,cs-4,cs*.18);c.stroke()}
  if(d){if(d.from){c.globalAlpha=.6;c.fillStyle=TH.board;c.fillRect(d.from.x*cs+1,d.from.y*cs+1,cs-2,cs-2);c.globalAlpha=1}
    if(d.over){rr(c,d.over.x*cs+2,d.over.y*cs+2,cs-4,cs-4,cs*.18);c.fillStyle=TH.accent;c.globalAlpha=.25;c.fill();c.globalAlpha=1;c.strokeStyle=TH.accent;c.lineWidth=2.5;c.setLineDash([cs*.13,cs*.09]);c.stroke()}}
  c.restore()}

/* ---------- editor: palette and the options row ---------- */
const PAL=['ball','pad','chime','goal','trap','portal','sw','rest','clock','erase'];
function buildPal(){const host=$('#pal');host.textContent='';
  for(const kind of PAL){const b=el('button',{'data-kind':kind,'aria-label':NAMES[kind]},el('canvas',{}));let P=null;
    b.addEventListener('pointerdown',e=>{if(!E||!G||!G.edit||G.run||E.view!=='solved')return;P={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,touch:e.pointerType==='touch'};try{b.setPointerCapture(e.pointerId)}catch(_){}});
    b.addEventListener('pointermove',e=>{if(!P||e.pointerId!==P.id||!E)return;
      if(!P.moved){if(kind==='erase'||Math.hypot(e.clientX-P.x,e.clientY-P.y)<10)return;P.moved=true;startDrag({from:null,kind,look:lookOf(null,null,null,kind),touch:P.touch},e)}else if(E.drag)moveDrag(e)});
    b.addEventListener('pointerup',e=>{if(!P||e.pointerId!==P.id)return;const moved=P.moved;P=null;if(!E||!G||!G.edit)return;
      if(moved){if(E.drag)endDrag();return}
      sfx('click');E.tool=E.tool===kind?null:kind;E.sel=null;drawPal();drawOpts();if(E.tool)tip(ABOUT[kind]+(kind==='erase'?'':' Tap empty cells to place it, or drag it on.'));else status()});
    b.addEventListener('pointercancel',()=>{P=null;cancelDrag()});
    host.append(b)}}
function drawPal(){const dpr=Math.min(3,window.devicePixelRatio||1);
  for(const b of $('#pal').children){const kind=b.dataset.kind,cvs=b.firstChild;cvs.width=cvs.height=32*dpr;const c=cvs.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,32,32);
    drawPiece(c,lookOf(null,null,null,kind),kind==='ball'?10:16,16,kind==='pad'?31:kind==='ball'?30:36,.25);b.classList.toggle('on',E.tool===kind)}}
// a number with - and + that repeat while held; set(v) is called for each change
function stepper(val,min,max,set){const out=el('b',{text:String(val)}),mk=(d,t)=>{const bt=el('button',{'aria-label':d<0?'Less':'More',text:t});let iv=0,to=0;
    const go=()=>{const v=Math.max(min,Math.min(max,val+d));if(v===val)return;val=v;out.textContent=String(v);set(v)},stop=()=>{clearTimeout(to);clearInterval(iv);to=iv=0};
    bt.addEventListener('pointerdown',e=>{e.preventDefault();stop();sfx('click');go();to=setTimeout(()=>{iv=setInterval(go,90)},420)});for(const t of ['pointerup','pointercancel','pointerleave'])bt.addEventListener(t,stop);return bt};
  return el('span',{class:'step'},mk(-1,'−'),out,mk(1,'+'))}
// an edit made from a control that shows its own value: the options row is left as it is
function optEdit(fn,keep,merge){E.hold=true;try{return edit(fn,keep,merge)}finally{E.hold=false}}
// two octaves of keys; pick(id) is called with the note tapped
function piano(cur,pick){const wrap=el('div',{class:'pianoWrap'}),p=el('div',{class:'piano'}),KW=36;let wi=0,at=0;
  for(const id of NOTE_IDS){const N=NOTE[id],on=id===cur?' on':'';if(id===cur)at=wi*KW;
    const b=N.sharp?el('button',{class:'k'+on,'data-note':id,'aria-label':N.say,style:`left:${wi*KW-13}px;width:26px;border-top:5px solid ${N.col}`,text:'♯'})
      :el('button',{class:'w'+on,'data-note':id,'aria-label':N.say,style:`left:${wi*KW}px;width:${KW}px;background:${N.oct===0?'linear-gradient(transparent 0 72%,#00000090 72%),':''}${N.col}`,text:N.letter+(N.oct===2?'’':'')});
    b.onclick=()=>pick(id);p.append(b);if(!N.sharp)wi++}
  p.style.width=wi*KW+'px';wrap.append(p);wrap.addEventListener('scroll',()=>{if(E)E.pianoX=wrap.scrollLeft});
  wrap.place=()=>{const w=wrap.clientWidth;let x=E.pianoX;if(x==null||at<x+KW||at>x+w-KW*2)x=at-w/2+KW/2;wrap.scrollLeft=Math.max(0,x);E.pianoX=wrap.scrollLeft};return wrap}
function drawOpts(){if(!E||!G||!G.edit)return;const o=$('#opts'),T=E.T;o.textContent='';
  const text=t=>el('span',{class:'t',text:t}),word=t=>el('span',{text:t}),gap=()=>el('span',{class:'grow'});
  if(G.run){o.append(text('Tap a blue paddle while the ball rolls to record a live turn.'));return}
  if(E.drag){o.append(text(E.drag.from?'Drop it on a cell to move it, on another piece to swap them, or off the board to remove it.':'Drop it on a cell.'));return}
  if(E.view==='start'){o.append(text('How the player finds the board. Tap blue paddles to change how they start.'),btn('Scramble',ICON.shuffle,()=>{if(!edit(t=>{scrambleTune(t);t.auto=false},true)){say('There are no blue paddles to scramble.');status()}}));return}
  const s=E.sel,p=s&&pieceAt(T,s.x,s.y),k=s?s.x+','+s.y:'';
  const del=()=>ib('Remove this piece',ICON.trash,()=>{edit(t=>removeAt(t,s.x,s.y));E.sel=null;drawOpts()});
  const tSeg=(cur,pick)=>{const seg=el('div',{class:'seg'});for(const [t,n] of [['b','Blue'],['f','Brown'],['p','Purple']])seg.append(el('button',{'aria-pressed':cur===t,'data-t':t,text:n,onclick:()=>{sfx('click');pick(t)}}));return seg};
  if(p&&p.kind==='pad')o.append(tSeg(T.pads[p.i].t,t=>{E.padT=t;if(!edit(tt=>{const q=tt.pads[p.i];q.t=t;if(t!=='b')q.s=q.o}))drawOpts()}),gap(),ib('Turn it',ICON.turn,()=>edit(tt=>{const q=tt.pads[p.i];q.o=FL[q.o];if(q.t!=='b')q.s=q.o})),del());
  else if(p&&p.kind==='chime'){E.note=T.chimes[k];const pn=piano(E.note,id=>{E.note=id;ring(id,.8);G.pulse[k]=1;if(!edit(tt=>{tt.chimes[k]=id}))drawOpts()});o.append(pn,del());pn.place()}
  else if(p&&p.kind==='ball')o.append(ib('Turn the launcher',ICON.turn,()=>edit(tt=>{const b=tt.balls[p.i];b[2]=CW[b[2]]})),word('Waits'),stepper(T.balls[p.i][3]||0,0,MAXDELAY,v=>optEdit(tt=>{tt.balls[p.i][3]=v},false,'d'+k)),word('steps'),gap(),del());
  else if(p&&p.kind==='rest')o.append(word('Holds the ball'),stepper(T.rests[k],1,MAXREST,v=>optEdit(tt=>{tt.rests[k]=v},false,'r'+k)),word('steps'),gap(),del());
  else if(p&&p.kind==='clock')o.append(word('Flips purple every'),stepper(T.clocks[p.i][2],1,MAXPERIOD,v=>optEdit(tt=>{tt.clocks[p.i][2]=v},false,'c'+k)),word('steps'),gap(),del());
  else if(p)o.append(text(ABOUT[p.kind]),del());
  else if(E.tool==='chime'){const pn=piano(E.note,id=>{E.note=id;ring(id,.8);drawPal();drawOpts()});o.append(pn);pn.place()}
  else if(E.tool==='pad')o.append(tSeg(E.padT,t=>{E.padT=t;drawPal();drawOpts()}),text('The colour of the next paddle.'));
  else if(E.tool)o.append(text(ABOUT[E.tool]));
  else{o.append(text('Tap a piece on the board to change it. Drag it to move it, or off the board to remove it.'));
    if(T.flips.length)o.append(btn('Clear live turns',null,()=>edit(t=>{t.flips=[]},true)))}}
function boardSheet(){if(!E||!G||!G.edit||G.run)return;sfx('click');const T=E.T;
  const name=el('input',{type:'text',maxlength:40,value:T.name,enterkeyhint:'done'}),line=el('input',{type:'text',maxlength:MAXTIP,value:T.tip,placeholder:'Shown when the tune opens',enterkeyhint:'done'});
  name.addEventListener('input',()=>optEdit(t=>{t.name=cleanText(name.value,40,'Untitled')},true,'name'));
  line.addEventListener('input',()=>optEdit(t=>{t.tip=cleanText(line.value,MAXTIP,'')},true,'tip'));
  for(const i of [name,line])i.addEventListener('keydown',e=>{if(e.key==='Enter')i.blur()});
  const speed=el('div',{class:'seg'}),drawSpeed=()=>{speed.textContent='';SPEEDS.forEach((ms,j)=>speed.append(el('button',{'aria-pressed':(T.tick||TICK)===ms,text:['Slowest','Slow','Normal','Fast','Fastest'][j],onclick:()=>{sfx('click');optEdit(t=>{t.tick=ms},true);drawSpeed()}})))};drawSpeed();
  // The two text boxes come first: on Android 8 to 10 the keyboard covers the lower part of the screen.
  sheet('Board',[el('label',{},'Name',name),el('label',{},'Opening line for the player (optional)',line),
    el('div',{class:'line'},'Width',stepper(T.w,MINW,MAXW,v=>optEdit(t=>resizeBoard(t,v,t.h)))),
    el('div',{class:'line'},'Height',stepper(T.h,MINH,MAXH,v=>optEdit(t=>resizeBoard(t,t.w,v)))),
    el('div',{class:'fld'},'Speed',speed)],{up:true,onClose:()=>{if(E&&G&&G.edit)drawOpts()}})}
$('#sizeBtn').onclick=boardSheet;$('#ttl').onclick=()=>{if(E&&G&&G.edit)boardSheet()};

/* ---------- share codes ---------- */
// A code is "RS1" + the course as JSON, deflated, then written in letters and digits only so that no
// messaging app treats part of it as formatting. Sixty-one of the 64 six-bit values get one character;
// "9" followed by A, B or C spells the other three. "RS0" is the same without the deflate step, for a
// WebView too old to compress.
const B61='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz012345678';
function enc(bytes){let out='',acc=0,bits=0;const put=v=>{out+=v<61?B61[v]:'9'+'ABC'[v-61]};
  for(const b of bytes){acc=acc<<8|b;bits+=8;while(bits>=6){bits-=6;put(acc>>bits&63)}acc&=(1<<bits)-1}
  if(bits)put(acc<<(6-bits)&63);return out}
function dec(s){const out=[];let acc=0,bits=0;
  for(let i=0;i<s.length;i++){let v=s[i]==='9'?'ABC'.indexOf(s[++i])+61:B61.indexOf(s[i]);if(v<0||v===60&&s[i-1]==='9'||Number.isNaN(v))throw new Error('damaged');
    acc=acc<<6|v;bits+=6;if(bits>=8){bits-=8;out.push(acc>>bits&255)}acc&=(1<<bits)-1}
  return new Uint8Array(out)}
const MAXIN=600000,MAXOUT=3000000;   // the most text an import will read, and the most a code may unpack to
async function pump(bytes,stream,limit){const rd=new Blob([bytes]).stream().pipeThrough(stream).getReader(),parts=[];let n=0;
  for(;;){const {done,value}=await rd.read();if(done)break;n+=value.length;if(n>limit){try{rd.cancel()}catch(e){}throw new Error('big')}parts.push(value)}
  const out=new Uint8Array(n);let o=0;for(const q of parts){out.set(q,o);o+=q.length}return out}
async function makeCode(obj){const raw=new TextEncoder().encode(JSON.stringify(obj));
  try{if(window.CompressionStream)return 'RS1'+enc(await pump(raw,new CompressionStream('deflate'),MAXOUT))}catch(e){}
  return 'RS0'+enc(raw)}
async function readCode(code){let raw;try{raw=dec(code.slice(3))}catch(e){throw new Error('damaged')}
  if(code[2]==='1'){if(!window.DecompressionStream)throw new Error('old');try{raw=await pump(raw,new DecompressionStream('deflate'),MAXOUT)}catch(e){throw new Error(e.message==='big'?'big':'damaged')}}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch(e){throw new Error('damaged')}}

/* ---------- sending and receiving (the app's bridge, with browser stand-ins) ---------- */
function shareText(title,text){try{if(NATIVE&&NATIVE.shareText){NATIVE.shareText(title,text);return}}catch(e){}
  if(navigator.share){navigator.share({title,text}).catch(()=>{});return}copyText(text,'Copied, ready to paste into a message.')}
function copyText(text,done){try{if(NATIVE&&NATIVE.copy){NATIVE.copy(text);toast(done);return}}catch(e){}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(()=>toast(done),()=>toast('Could not copy it.'));else toast('Could not copy it.')}
function pasteText(){try{if(NATIVE&&NATIVE.paste)return Promise.resolve(String(NATIVE.paste()||''))}catch(e){}
  if(navigator.clipboard&&navigator.clipboard.readText)return navigator.clipboard.readText().catch(()=>'');return Promise.resolve('')}
function saveFile(name,text){try{if(NATIVE&&NATIVE.saveFile){NATIVE.saveFile(name,text);return}}catch(e){}
  const a=el('a',{href:URL.createObjectURL(new Blob([text],{type:'application/octet-stream'})),download:name});document.body.append(a);a.click();a.remove();toast('Saved '+name+'.')}
function shareFile(name,text,title){try{if(NATIVE&&NATIVE.shareFile){NATIVE.shareFile(name,text,title);return}}catch(e){}saveFile(name,text)}
function openFile(){try{if(NATIVE&&NATIVE.openFile){NATIVE.openFile();return}}catch(e){}
  const i=el('input',{type:'file',style:'display:none'});i.onchange=()=>{const f=i.files&&i.files[0];i.remove();if(!f)return;if(f.size>MAXIN){importFail(new Error('big'));return}const r=new FileReader();r.onload=()=>gotImport(String(r.result));r.onerror=()=>importFail(new Error('damaged'));r.readAsText(f)};document.body.append(i);i.click()}
// The app calls this with the text of the file picked on its open-file screen. (It reports how a save
// went, and a file it could not read, through toast() itself.)
window.__opened=text=>{if(typeof text==='string')gotImport(text)};
// the app, when another app hands over a code or a .ricochet file (a tap on a file, or Share)
window.__incoming=function(text){if(typeof text!=='string'||!text)return;closeSheet();if(G&&G.edit)edBack();else if(!$('#play').hidden)leavePlay();coFrom='studio';showStudio();gotImport(text)};
const fileName=s=>(s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'ricochet-song')+'.ricochet';
const FILE_HEAD={app:'ricochetSong',format:1};
function shareSheet(c,T){const data=T?Object.assign({},FILE_HEAD,{tune:slim(T),from:c.name,by:c.by}):Object.assign({},FILE_HEAD,{courses:[packCourse(c)]});
  const what=T?'tune':'course',name=T?T.name:c.name,drafts=T?(T.ok?0:1):c.tunes.filter(t=>!t.ok).length,title='Ricochet Song '+what+': '+name;
  const intro='Ricochet Song '+what+' “'+name+'”'+(c.by?' by '+c.by:'')+(T?'':' ('+plural(c.tunes.length,'tune')+')')+'.\nTo play it: copy this whole message, open Ricochet Song, tap Studio, then Import, then Paste.\n';
  const info=el('p',{class:'note',text:'Working out the code…'}),file=()=>JSON.stringify(data,null,1);let code='';
  makeCode(data).then(s=>{code=s;info.textContent='The code is '+s.length+' letters and digits. Whoever gets it opens Studio, taps Import, then Paste.'+(drafts?' '+(T?'This tune is unfinished and goes as a draft.':plural(drafts,'unfinished tune')+' go along as drafts.'):'')});
  sheet('Share '+name,[info,el('div',{class:'menu'},
    btn('Send the code',ICON.share,()=>{if(code)shareText(title,intro+code)}),btn('Copy the code',ICON.copy,()=>{if(code)copyText(code,'Code copied.')}),
    btn('Send as a file',ICON.file,()=>shareFile(fileName(name),file(),title)),btn('Save as a file',ICON.inbox,()=>saveFile(fileName(name),file())))])}
function exportAll(){const text=JSON.stringify(Object.assign({},FILE_HEAD,{courses:ST.courses.map(packCourse)}),null,1),name='ricochet-song-courses.ricochet';
  sheet('Export everything',[el('p',{class:'note',text:'All '+plural(ST.courses.length,'course')+' in one file. Import it on any phone to get them back.'}),el('div',{class:'menu'},btn('Save as a file',ICON.inbox,()=>saveFile(name,text)),btn('Send as a file',ICON.file,()=>shareFile(name,text,'Ricochet Song courses')))])}

/* ---------- import ---------- */
const IMPORT_ID='importedtunes';
function importSheet(){const ta=el('textarea',{placeholder:'…or paste a code here',spellcheck:'false',autocapitalize:'off',autocomplete:'off'});
  sheet('Import',[el('p',{class:'note',text:'Bring in a course or a tune someone shared, from a code or a .ricochet file.'}),
    el('div',{class:'row'},btn('Paste',ICON.paste,()=>pasteText().then(t=>{if(t&&t.trim())gotImport(t);else toast('There is no text on the clipboard.')}),'pri'),btn('Open a file',ICON.file,openFile)),
    ta,el('div',{class:'row'},btn('Read the code',null,()=>{if(ta.value.trim())gotImport(ta.value);else toast('Paste a code into the box first.')}))],{up:true})}
function importFail(e){const m=e&&e.message;sheet('Could not import',[el('p',{class:'note',text:
  m==='none'?'That is not a Ricochet Song code or file. A code starts with RS1.':m==='big'?'That is too big to be a Ricochet Song course.':m==='old'?'This phone’s Android System WebView is too old to read this code. Update it in the Play Store, or ask for the course as a file.':
  'That code or file is damaged. It may have been cut off when it was copied; copy the whole message and try again.'}),el('div',{class:'row'},btn('OK',null,closeSheet,'pri'))])}
// Text from the clipboard, a file or another app -> a checked bundle, shown for confirmation.
async function gotImport(text){let found;
  try{text=String(text);if(text.length>MAXIN)throw new Error('big');const t=text.replace(/[\u200b-\u200d\ufeff]/g,'').trim();let obj;
    if(t[0]==='{'){try{obj=JSON.parse(t)}catch(e){throw new Error('damaged')}}
    else{const all=t.match(/RS[01][A-Za-z0-9]{12,}/g)||[],bare=t.replace(/\s+/g,'');if(/^RS[01][A-Za-z0-9]{12,}$/.test(bare))all.push(bare);
      if(!all.length)throw new Error('none');obj=await readCode(all.sort((a,b)=>b.length-a.length)[0])}
    found=readBundle(obj)}catch(e){return importFail(e)}
  previewImport(found)}
function readBundle(o){if(!o||typeof o!=='object'||Array.isArray(o)||o.app!=='ricochetSong')throw new Error('none');
  const out={courses:[],tune:null,from:'',by:'',skipped:0,newer:typeof o.format==='number'&&o.format>1};
  if(o.tune!=null){try{out.tune=cleanTune(o.tune);judge(out.tune)}catch(e){out.skipped++}out.from=cleanText(o.from,40,'');out.by=cleanText(o.by,24,'')}
  if(o.courses!=null){if(!Array.isArray(o.courses))throw new Error('damaged');for(const c of o.courses.slice(0,200)){try{out.courses.push(cleanCourse(c,out))}catch(e){out.skipped++}}}
  if(!out.tune&&!out.courses.length)throw new Error(out.skipped?'damaged':'none');return out}
function previewImport(f){const rows=[],clash=f.courses.filter(c=>ST.courses.some(x=>x.id===c.id));
  for(const c of f.courses)rows.push(el('div',{class:'found'},el('b',{text:c.name}),el('span',{text:(c.by?'by '+c.by+' · ':'')+plural(c.tunes.length,'tune')+(clash.includes(c)?' · already on this phone':'')})));
  if(f.tune)rows.push(el('div',{class:'found'},el('b',{text:f.tune.name}),el('span',{text:'One tune'+(f.from?' from “'+f.from+'”':'')+(f.by?' by '+f.by:'')+'. It goes into the course “Imported tunes”.'})));
  const notes=[];if(f.skipped)notes.push(plural(f.skipped,'tune')+' could not be read and '+(f.skipped===1?'is':'are')+' left out.');if(f.newer)notes.push('This was made with a newer version of Ricochet Song, so some of it may be missing.');
  if(clash.length)notes.push('Replace swaps your copy for this one. Keep both adds this one as a separate course.');
  const add=keep=>{closeSheet();const c=applyImport(f,keep);toast('Added to your courses.');showCourse(c,'studio')};
  sheet('Found',[...rows,notes.length?el('p',{class:'note',text:notes.join(' ')}):null,
    el('div',{class:'row'},...(clash.length?[btn('Keep both',null,()=>add(true)),btn('Replace',null,()=>add(false),'pri')]:[btn('Add',ICON.plus,()=>add(false),'pri')]))])}
// Adds a checked bundle to the store and returns the course to show. keep: a course that is already
// here is added again under new ids instead of replacing the copy on the phone.
function applyImport(f,keep){let first=null;const same=(a,b)=>JSON.stringify(slim(a))===JSON.stringify(slim(b));
  for(const c of f.courses){const i=ST.courses.findIndex(x=>x.id===c.id);
    if(i>=0&&keep){c.id=uid();for(const T of c.tunes)T.id=uid();ST.courses.push(c)}
    else if(i>=0){for(const T of ST.courses[i].tunes)if(!c.tunes.some(n=>n.id===T.id&&same(n,T)))delete save.cs[T.id];delete save.runs[c.id];ST.courses[i]=c}   // stars survive only on tunes that did not change
    else ST.courses.push(c);
    first=first||c}
  if(f.tune){let box=ST.courses.find(x=>x.id===IMPORT_ID);if(!box){box={id:IMPORT_ID,name:'Imported tunes',by:'',tunes:[]};ST.courses.push(box)}
    const T=f.tune,j=box.tunes.findIndex(t=>t.id===T.id);
    if(j>=0&&!keep){if(!same(box.tunes[j],T))delete save.cs[T.id];box.tunes[j]=T}else{if(j>=0)T.id=uid();if(box.tunes.length>=MAXTUNES)box.tunes.shift();box.tunes.push(T)}
    delete save.runs[box.id];first=first||box}
  persist();saveStudio(true);return first}

/* ---------- the example course ---------- */
const EX_ID='timertricks';
// Three small tunes that show the timing pieces: a delayed launcher, a rest and a clock. They are written
// the way the editor stores a tune and go through the same checks as an import.
const EXAMPLES=[
  {"id":"extimer001","name":"Echo","w":7,"h":5,"tip":"The launcher marked 3 holds its ball for three steps, so it echoes the first.","balls":[[1,1,"E"],[0,1,"E",3]],"chimes":{"2,1":"C","3,1":"E","4,1":"G","5,1":"C2","5,3":"G","4,3":"E","3,3":"C"},"pads":[{"x":6,"y":1,"t":"b","o":"\\","s":"/"},{"x":6,"y":3,"t":"b","o":"/","s":"/"},{"x":1,"y":4,"t":"b","o":"/","s":"\\"}],"goals":[[1,3]]},
  {"id":"extimer002","name":"Fate knocks","w":5,"h":11,"tip":"The dashed ring holds the ball for the steps it shows. That is the pause in the tune.","balls":[[1,0,"E"]],"chimes":{"3,1":"G","3,2":"G","3,3":"G","3,4":"D#","3,6":"F","3,7":"F","3,8":"F","3,9":"D"},"pads":[{"x":3,"y":0,"t":"b","o":"\\","s":"/"},{"x":3,"y":10,"t":"b","o":"/","s":"\\"},{"x":1,"y":5,"t":"b","o":"/","s":"/"}],"rests":{"3,5":3},"goals":[[1,10]]},
  {"id":"extimer003","name":"Clockwork","w":5,"h":5,"tip":"The clock flips the purple paddle every 8 steps. That lets the ball into the loop, and later out of it.","balls":[[4,0,"W"]],"chimes":{"2,1":"A0","3,2":"C","2,3":"E","1,2":"A"},"pads":[{"x":1,"y":0,"t":"b","o":"/","s":"\\"},{"x":1,"y":1,"t":"p","o":"\\"},{"x":3,"y":1,"t":"f","o":"\\"},{"x":3,"y":3,"t":"f","o":"/"},{"x":1,"y":3,"t":"f","o":"\\"},{"x":4,"y":4,"t":"b","o":"\\","s":"/"}],"clocks":[[2,2,8]],"goals":[[0,1]]}];
function exampleCourse(){return cleanCourse({id:EX_ID,name:'Timer tricks',by:'Ricochet Song',tunes:EXAMPLES})}

/* ---------- boot ---------- */
window.__look=()=>{if(E&&G&&G.edit)drawPal()};
window.coursesOnHome($('#hc'));
try{const p=NATIVE&&NATIVE.pending?NATIVE.pending():'';if(p)setTimeout(()=>window.__incoming(String(p)),0)}catch(e){}
window.__booted=true; // from here on, errors go to the log only (see window.__fail in index.html)
