/* Home → Cards → Section. Owns navigation, history and all view transitions.
   Runs after site.js (both deferred, in order). The page never scrolls; sections open as panels. */
(()=>{'use strict';
const $=s=>document.querySelector(s);
const nav=$('#section-navigation'),toggle=$('.menu-toggle'),main=$('main'),body=document.body;
if(!nav||!toggle||!main)return;
const cards=[...nav.querySelectorAll(':scope>a')],n=cards.length;
if(!n)return;
const ids=cards.map(c=>c.getAttribute('href').slice(1));
const panels=ids.map(id=>document.getElementById(id));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const pad=v=>String(v).padStart(2,'0');
const nameOf=c=>c.querySelector('strong').textContent;
let view='home',current=null,focus=0,busy=false,lastPointer='mouse',focusAtDown=0,settleT=0,wheelLock=0;

/* ── Deck furniture ─────────────────────────────────────── */
cards.forEach((c,i)=>{
  c.classList.add('deck-card');c.style.setProperty('--i',i);
  const no=document.createElement('em');no.className='deck-num';no.setAttribute('aria-hidden','true');no.textContent=pad(i+1);c.insertBefore(no,c.firstChild);
});
const title=document.createElement('div');title.className='deck-title';title.setAttribute('aria-hidden','true');nav.insertBefore(title,nav.firstChild);
const footer=nav.querySelector('.nav-panel-footer');
footer.innerHTML='<span class="deck-count"><b></b><span class="deck-name"></span></span><span class="deck-keys"><kbd>←</kbd><kbd>→</kbd> BROWSE <kbd>ENTER</kbd> OPEN <kbd>ESC</kbd> HOME</span><span class="deck-hint">SWIPE · TAP TO OPEN</span>';
const countNo=footer.querySelector('.deck-count b'),countName=footer.querySelector('.deck-name');

/* ── Panel bar ──────────────────────────────────────────── */
const bar=document.createElement('div');bar.className='panel-bar';
bar.innerHTML='<button type="button" class="pb-back"><span aria-hidden="true">←</span> ALL CARDS <kbd>ESC</kbd></button><span class="pb-count" aria-live="polite"></span><span class="pb-arrows"><button type="button" class="pb-prev" aria-label="Previous section">←</button><button type="button" class="pb-next" aria-label="Next section">→</button></span>';
body.appendChild(bar);
const pbCount=bar.querySelector('.pb-count');
panels.forEach(p=>{p.setAttribute('tabindex','-1');p.setAttribute('aria-hidden','true')});

function setFocus(i,{moveDom=false}={}){
  i=Math.max(0,Math.min(n-1,i));const changed=i!==focus;focus=i;
  cards.forEach((c,j)=>{
    const o=j-i,a=Math.abs(o);
    c.style.setProperty('--o',o);c.style.setProperty('--a',a);
    c.classList.toggle('is-focus',o===0);c.classList.toggle('far',a>=5);
    if(o===0)c.setAttribute('aria-current','true');else c.removeAttribute('aria-current');
  });
  const name=nameOf(cards[i]);
  countNo.textContent=`${pad(i+1)} / ${pad(n)}`;countName.textContent=name.toUpperCase();
  if(changed||!title.textContent){title.textContent=name;title.classList.remove('swap');void title.offsetWidth;title.classList.add('swap')}
  if(moveDom)cards[i].focus({preventScroll:true});
}

/* ── Chrome (top bar label, body state) ─────────────────── */
function chrome(v){
  view=v;body.dataset.view=v;body.classList.toggle('nav-open',v==='cards');
  toggle.querySelector('.menu-toggle-label').textContent={home:'EXPLORE',cards:'HOME',section:'CARDS'}[v];
  toggle.setAttribute('aria-label',{home:'Open section cards',cards:'Back to home',section:'Back to section cards'}[v]);
  toggle.setAttribute('aria-expanded',String(v==='cards'));
  nav.setAttribute('aria-hidden',String(v!=='cards'));
}

/* ── Deck open / close ──────────────────────────────────── */
function openDeck(){
  clearTimeout(settleT);nav.classList.remove('flying','settled');resetCards();
  const i=current?ids.indexOf(current):focus;title.textContent='';setFocus(i>=0?i:0);
  nav.classList.add('open');settleT=setTimeout(()=>nav.classList.add('settled'),800);
  requestAnimationFrame(()=>cards[focus].focus({preventScroll:true}));
}
function closeDeck(){clearTimeout(settleT);nav.classList.remove('open','settled')}
function resetCards(){cards.forEach(c=>{c.classList.remove('is-selected');c.style.transform='';c.style.transformOrigin=''})}

/* ── Panels ─────────────────────────────────────────────── */
function hidePanels(except){panels.forEach(p=>{if(p!==except){p.classList.remove('panel-open','leaving');p.setAttribute('aria-hidden','true')}})}
function openPanelEl(){return panels.find(p=>p.classList.contains('panel-open'))}
function showPanel(id,enter='fade'){
  const p=document.getElementById(id);hidePanels(p);
  p.classList.remove('panel-open','leaving');void p.offsetWidth;
  p.dataset.enter=enter;p.classList.add('panel-open');p.removeAttribute('aria-hidden');p.scrollTop=0;
  current=id;const i=ids.indexOf(id);setFocus(i);
  pbCount.innerHTML=`<b>${pad(i+1)} / ${pad(n)}</b><span>${nameOf(cards[i]).toUpperCase()}</span>`;
  if(view!=='cards')requestAnimationFrame(()=>p.focus({preventScroll:true}));
}

/* ── Router ─────────────────────────────────────────────── */
function go(t,{push=true}={}){
  if(busy)return;
  const to=(t==='home'||t==='cards')?t:(ids.includes(t)?'section':'home');
  if(to==='section'&&view==='section'&&t===current)return;
  if(to===view&&to!=='section')return;
  if(push)history.pushState(null,'','#'+t);
  const from=view;
  if(to==='home'){
    const p=openPanelEl();
    if(p&&!reduced.matches){p.classList.add('leaving');setTimeout(()=>{if(view==='home')hidePanels()},300)}else hidePanels();
    closeDeck();chrome('home');
  }else if(to==='cards'){
    chrome('cards');openDeck();
    if(from==='section')setTimeout(()=>{if(view==='cards')hidePanels()},430);   // deck fades in over the panel first
  }else{
    const dir=from==='section'?(ids.indexOf(t)>ids.indexOf(current)?'next':'prev'):'fade';
    showPanel(t,dir);closeDeck();chrome('section');
  }
}
const fromHash=()=>{const h=location.hash.slice(1);return h==='cards'?'cards':ids.includes(h)?h:'home'};
window.addEventListener('popstate',()=>go(fromHash(),{push:false}));
chrome('home');
const start=fromHash();if(start!=='home')setTimeout(()=>go(start,{push:false}),1700);
history.replaceState(null,'',location.hash||'#home');

document.addEventListener('click',e=>{
  const a=e.target.closest&&e.target.closest('a[href^="#"]');if(!a||a.closest('.main-nav'))return;
  const id=a.getAttribute('href').slice(1);
  if(id==='home'||id==='cards'||ids.includes(id)){e.preventDefault();go(id)}
},true);
toggle.addEventListener('click',()=>go(view==='home'?'cards':view==='cards'?'home':'cards'));
const step=d=>go(ids[(ids.indexOf(current)+d+n)%n]);
bar.querySelector('.pb-back').addEventListener('click',()=>go('cards'));
bar.querySelector('.pb-prev').addEventListener('click',()=>step(-1));
bar.querySelector('.pb-next').addEventListener('click',()=>step(1));

/* ── Selecting a card: it flies out of the deck and becomes the section ── */
function select(card){
  if(busy)return;busy=true;
  const id=card.getAttribute('href').slice(1);
  const finish=()=>{
    history.pushState(null,'','#'+id);
    showPanel(id,'fade');chrome('section');
    nav.classList.remove('open','settled');            // deck fades out and reveals the panel beneath
    setTimeout(()=>{nav.classList.remove('flying');resetCards();busy=false;if(pendingEsc){pendingEsc=false;escape_()}},430);
  };
  if(reduced.matches){finish();return}
  const nr=nav.getBoundingClientRect(),cr=card.getBoundingClientRect();
  const w=card.offsetWidth,h=card.offsetHeight;
  const dx=nr.left+nr.width/2-(cr.left+cr.width/2),dy=nr.top+nr.height/2-(cr.top+cr.height/2);
  const s=Math.max(nr.width/w,nr.height/h)*1.05;
  card.classList.add('is-selected');nav.classList.add('flying');
  card.style.transformOrigin='50% 50%';
  card.style.transform=`translate3d(${dx}px,${dy}px,0) scale(${s})`;
  setTimeout(finish,540);
}
nav.addEventListener('pointerdown',e=>{lastPointer=e.pointerType;focusAtDown=focus},{passive:true});
cards.forEach((c,j)=>{
  c.setAttribute('draggable','false');
  c.addEventListener('focus',()=>{if(!busy&&j!==focus)setFocus(j)});
});
nav.addEventListener('click',e=>{
  if(e.target===nav||e.target===title){go('home');return}
  const card=e.target.closest('a.deck-card');if(!card)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(swiped){swiped=false;return}
  const j=cards.indexOf(card);
  if(j!==focusAtDown&&e.detail!==0){setFocus(j);return}   // first click/tap on a side card brings it forward, the next one opens it
  select(card);
},true);

/* ── Keyboard ───────────────────────────────────────────── */
let pendingEsc=false;
const isEsc=k=>k==='Escape'||k==='Esc';
function escape_(){
  if(busy){pendingEsc=true;return}                                   // never drop an Esc pressed mid-transition
  if(view==='cards')go('home');else if(view==='section')go('cards');
}
document.addEventListener('keydown',e=>{
  if(e.isComposing||e.metaKey||e.ctrlKey||e.altKey)return;
  const k=e.key,typing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName||'')||e.target.isContentEditable;
  if(isEsc(k)){
    if(body.classList.contains('has-overlay'))return;                  // a zoom/lightbox owns this Esc and closes first
    e.preventDefault();
    if(typing&&e.target.blur)e.target.blur();                          // the draft stays in the form; Esc still leaves the card
    escape_();return;
  }
  if(busy||typing||body.classList.contains('has-overlay'))return;
  if(view==='cards'){
    if(k==='ArrowRight'||k==='ArrowDown'){e.preventDefault();setFocus(focus+1,{moveDom:true})}
    else if(k==='ArrowLeft'||k==='ArrowUp'){e.preventDefault();setFocus(focus-1,{moveDom:true})}
    else if(k==='Home'){e.preventDefault();setFocus(0,{moveDom:true})}
    else if(k==='End'){e.preventDefault();setFocus(n-1,{moveDom:true})}
  }else if(view==='section'){
    if(e.target.closest&&e.target.closest('[data-own-arrows]'))return;   // widgets that use the arrow keys themselves (Journey rail)
    if(k==='ArrowRight'){e.preventDefault();step(1)}
    else if(k==='ArrowLeft'){e.preventDefault();step(-1)}
  }else if(view==='home'&&(k==='ArrowDown'||k==='PageDown')&&main.scrollTop+main.clientHeight>=main.scrollHeight-4){go('cards')}
});

/* ── Wheel: browse the deck; scrolling past the opening screen opens it ── */
let wAcc=0,wLast=0,wDone=false;
nav.addEventListener('wheel',e=>{
  e.preventDefault();if(busy)return;
  const now=performance.now();
  if(now-wLast>160){wAcc=0;wDone=false}                              // a pause of 160ms starts a new gesture
  wLast=now;if(wDone)return;                                         // one card per gesture: trackpad inertia can't skip ahead
  wAcc+=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*(e.deltaMode===1?16:1);
  if(Math.abs(wAcc)>=70){const dir=wAcc>0?1:-1;wDone=true;wAcc=0;setFocus(focus+dir,{moveDom:true})}
},{passive:false});
main.addEventListener('wheel',e=>{
  if(view!=='home'||busy||e.deltaY<25)return;
  if(main.scrollTop+main.clientHeight>=main.scrollHeight-4)go('cards');
},{passive:true});

/* ── Touch swipe on the deck ────────────────────────────── */
let sx=0,sy=0,sid=null,swiped=false,swipeT=0;
nav.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;sid=e.pointerId;sx=e.clientX;sy=e.clientY;swiped=false});
nav.addEventListener('pointerup',e=>{
  if(e.pointerId!==sid)return;sid=null;
  const dx=e.clientX-sx,dy=e.clientY-sy;
  if(!busy&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){
    swiped=true;clearTimeout(swipeT);swipeT=setTimeout(()=>{swiped=false},400);   // swallow the click the browser fires after a swipe
    setFocus(focus+(dx<0?1:-1));
  }
});
nav.addEventListener('pointercancel',()=>{sid=null});
})();
