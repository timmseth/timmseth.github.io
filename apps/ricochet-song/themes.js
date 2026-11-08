"use strict";
// Ricochet Song: looks (colour themes).
// A look is a background hue and an accent colour. palette() works out every colour for dark and for
// light mode from those two, so adding a look is one line in LOOKS. applyLook() (in game.js, once the
// saved settings are loaded) puts the result into the CSS variables index.html uses and into TH, which
// the canvas drawing code reads. Note colours, and the blue, brown and purple of the paddles, are not
// part of a look: those colours carry meaning in the game.
const LOOKS={
  midnight:{name:'Midnight',h:226,s:60,a:[45,93,57]},   // the original navy and gold
  ember:{name:'Ember',h:14,s:42,a:[22,96,58]},
  forest:{name:'Forest',h:152,s:40,a:[74,78,54]},
  grape:{name:'Grape',h:274,s:44,a:[326,92,68]},
  ocean:{name:'Ocean',h:196,s:58,a:[10,92,66]},
  mono:{name:'Mono',h:0,s:0,a:[52,100,54]}              // black and white, high contrast
};
const MODES=[['dark','Dark'],['light','Light'],['auto','Match phone']];

// hue 0-360, saturation and lightness 0-100, optional alpha 0-1 -> "#rrggbb" or "#rrggbbaa"
function hx(h,s,l,a){s=Math.max(0,Math.min(100,s))/100;l=Math.max(0,Math.min(100,l))/100;
  const k=n=>(n+h/30)%12,f=n=>{const v=l-s*Math.min(l,1-l)*Math.max(-1,Math.min(k(n)-3,9-k(n),1));return Math.round(v*255).toString(16).padStart(2,'0')};
  return '#'+f(0)+f(8)+f(4)+(a==null?'':Math.round(a*255).toString(16).padStart(2,'0'))}
// WCAG relative luminance and contrast ratio of two "#rrggbb" colours
function lum(c){const v=[1,3,5].map(i=>{const x=parseInt(c.substr(i,2),16)/255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)});return .2126*v[0]+.7152*v[1]+.0722*v[2]}
function contrast(a,b){const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
// Move a colour's lightness away from the background until text in it is readable on that background.
function readable(h,s,l,bg,min){const dir=lum(bg)>.4?-1:1;let c=hx(h,s,l);for(let i=0;i<60&&contrast(c,bg)<min;i++){l+=dir;c=hx(h,s,l)}return c}

function palette(id,dark){
  const K=LOOKS[id]||LOOKS.midnight,h=K.h,s=K.s,mono=id==='mono',ah=K.a[0],as=K.a[1],al=K.a[2];
  const c=(sm,l,a)=>hx(h,s*sm,l,a);
  let css,th;
  if(dark){
    const d=mono?-8:0;                                   // Mono dark is true black
    css={deep:c(1,8+d),night:c(1,12+d),glow:c(1,26+d*1.5),panel:c(1,20+d),panel2:c(1,28+d),line:c(.82,37),text:c(1.6,96),mute:c(.78,74),faint:c(.55,53),
      strip:c(1,11+d,.8),scrim:c(1,Math.max(0,7+d),.85),hearOn:hx(ah,60,15),
      accent:hx(ah,as,al),accentHi:hx(ah,as+7,al+9),accentLo:hx(ah,as,al-6),accentShadow:hx(ah,100,27),accentInk:hx(ah,100,8),accentText:hx(ah,as,al),titleShadow:hx(ah,100,24),
      sky:'#66bdf0',rose:'#f06a80',mint:'#6fd694',off:'grayscale(1) brightness(.45)'};
    th={light:false,board:c(1.1,12+d),boardLine:c(.85,35),dot:c(.88,28),grid:c(.85,20),route:'#ffffff',trail:'#ffffff',hot:'#ffffff',rollLine:c(.88,28),rollText:c(.55,53),
      accent:css.accent,ear:'#aab6de',earPad:'#8f9cc8',halo:'#66bdf0',rim:null,good:'#6fd694',bad:'#f06a80'};
    if(id==='midnight'){                                 // exactly the colours of v1.0.0
      Object.assign(css,{deep:'#080d22',night:'#0b1330',glow:'#1a2c6b',panel:'#152352',panel2:'#1e3170',line:'#30468c',text:'#edf2ff',mute:'#9fb0dc',faint:'#5f72ad',strip:'#0a1230cc',scrim:'#060a1cd9',hearOn:'#3a3410',
        accent:'#f7c12e',accentHi:'#ffd451',accentLo:'#f1ae10',accentShadow:'#8a5a00',accentInk:'#2a1d00',accentText:'#f7c12e',titleShadow:'#7a4a00'});
      Object.assign(th,{board:'#0a1232',boardLine:'#2b3f85',dot:'#22336f',grid:'#182454',rollLine:'#22336f',rollText:'#5f72ad',accent:'#f7c12e'})}
  }else{
    css={deep:c(.5,86),night:c(.55,92),glow:c(.6,98),panel:c(.5,99),panel2:c(.55,89),line:c(.4,72),text:c(.7,13),mute:c(.35,35),faint:c(.3,48),
      strip:c(.5,98,.85),scrim:c(.5,18,.55),hearOn:hx(ah,90,86),
      accent:hx(ah,as,al),accentHi:hx(ah,as+7,al+9),accentLo:hx(ah,as,al-6),accentShadow:hx(ah,100,27),accentInk:hx(ah,100,8),accentText:'',titleShadow:hx(ah,70,80),
      sky:'#1f7fc0',rose:'#b3203c',mint:'#146233',off:'grayscale(1) opacity(.3)'};
    th={light:true,board:c(.5,96),boardLine:c(.4,68),dot:c(.4,80),grid:c(.4,87),route:c(.5,30),trail:c(.4,36),hot:'#111111',rollLine:c(.4,80),rollText:c(.3,48),
      accent:hx(ah,as,Math.min(al,46)),ear:'#8792b4',earPad:'#8f9cc8',halo:'#2f8fd8',rim:c(.5,28,.7),good:'#146233',bad:'#b3203c'};
    if(mono){Object.assign(css,{accent:'#161616',accentHi:'#3d3d3d',accentLo:'#000000',accentShadow:'#8c8c8c',accentInk:'#ffffff',titleShadow:'#cccccc',hearOn:'#dddddd'});th.accent='#111111'}
    css.accentText=mono?'#000000':readable(ah,Math.max(as,80),30,css.night,4.6);
  }
  // Text must stay readable on the hardest background it sits on, the raised panel. Greens and teals are
  // brighter than blues at the same lightness, so their panel is pulled down a little, and the secondary
  // text is moved away from it until it passes.
  if(dark&&id!=='midnight')for(let l=28+(mono?-8:0);l>12&&contrast(css.text,css.panel2)<7.4;l--)css.panel2=c(1,l);
  if(contrast(css.mute,css.panel2)<4.8)css.mute=readable(h,s*(dark?.78:.35),dark?74:35,css.panel2,4.8);
  return {css,th};
}
const TH={};   // the canvas colours of the look in use; filled by applyLook()
