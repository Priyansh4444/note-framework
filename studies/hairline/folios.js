/** Folios: six cloth-bound notebooks in a rounded desktop tray.
 * Point along their resting top edges to draw one out; its neighbours lean
 * away with a distance-based stagger. Covers, fore-edges and a spine seam
 * distinguish the small books. The dots on the covers are binder marks.
 * Built with Hairline's unchanged kernel and bench.
 */
const { Cam, clamp, facing, fit, hull, open, poly, proj, rad, ringAt, rrect, run, seg,
  tdone, tset, tval, tween, disposer, mk, place, pointer, reflect, register } = HL;
const N = 6, W = 70, H = 52, GAP = 15, THICK = 5.5;
const REST = -12, BACK = -25, FRONT = 19, LIFT = 17;
const X0 = -5, X1 = W+5, Y0 = -10, Y1 = (N-1)*GAP+10, WALL = 17, BORDER = 2.4;
const leftToRight = points => points[0][0] <= points[points.length-1][0] ? points : points.slice().reverse();
function bookPose(P, i, angle, lift) {
  const a = rad(angle), s = Math.sin(a), c = Math.cos(a);
  const w = (u,v,d=0) => P(u,i*GAP+v*s-d*c,v*c+d*s+lift);
  const ring = rrect(0,0,W,H,3,6), inner = rrect(1.8,1.8,W-1.8,H-1.8,1.5,6);
  const points = (r,d) => r.map(q => w(q.u,q.v,d));
  return {
    sil:poly(hull(points(ring,0).concat(points(ring,THICK)))),
    crease:open(points(run(inner,q=>q.nu+q.nv>0),0)),
    pages:open([w(3,H-1,1.1),w(W-2,H-1,1.1),w(W-2,2,1.1)])+
      open([w(3,H-1,THICK-1),w(W-2,H-1,THICK-1),w(W-2,2,THICK-1)]),
    spine:seg(w(4,0),w(4,H)),
    dots:Array.from({length:3},(_,k)=>w(11+k*4,9)),
  };
}
function mount({stage,svg,read},value) {
  const bag = disposer(); let stagger = value, active = -1;
  const C = Cam(45,.5,1.82);
  fit(C,[[X0,Y0,-8],[X1,Y1,0],[X0,Y1,0],[X1,Y0,H+LIFT+5]],200,166);
  const P = proj(C), front = facing(C);
  const outer = rrect(X0,Y0,X1,Y1,6,6), inner = rrect(X0+BORDER,Y0+BORDER,X1-BORDER,Y1-BORDER,3.6,6);
  const root = mk('g',{},svg);
  reflect(svg,root,P,front,outer,0,12);
  mk('path',{d:poly(hull(ringAt(P,outer,0).concat(ringAt(P,outer,WALL)))),class:'sil'},root);
  mk('path',{d:poly(ringAt(P,inner,WALL)),class:'nf'},root);
  mk('path',{d:open(ringAt(P,run(inner,q=>!front(q)),2)),class:'nf lo'},root);
  const books=[];
  for(let i=0;i<N;i++) {
    const group=mk('g',{},root);
    const body=mk('path',{class:'sil'},group), crease=mk('path',{class:'nf lo'},group);
    const pages=mk('path',{class:'nf lo'},group), spine=mk('path',{class:'nf'},group);
    const dots=Array.from({length:3},()=>mk('circle',{r:.8,class:'dot m'},group));
    books.push({body,crease,pages,spine,dots,a:tween(REST),z:tween(0),lastA:NaN,lastZ:NaN});
  }
  const iF=leftToRight(ringAt(P,run(inner,front),WALL));
  const oT=leftToRight(ringAt(P,run(outer,front),WALL));
  const oB=leftToRight(ringAt(P,run(outer,front),0));
  mk('path',{d:poly([...iF,oT[oT.length-1],...oB.slice().reverse(),oT[0]]),class:'fo'},root);
  mk('path',{d:open(oT),class:'nf lo'},root);
  mk('path',{d:open(iF),class:'nf'},root);
  mk('path',{d:open([oT[0],...oB,oT[oT.length-1]]),class:'nf sil'},root);
  const pull = rrect(W/2-11,5,W/2+11,11,3,6).map(q=>P(q.u,Y1,q.v));
  mk('path',{d:poly(pull),class:'nf'},root);
  const top=i=>P(W/2,i*GAP+H*Math.sin(rad(REST)),H*Math.cos(rad(REST)));
  const c0=top(0),c1=top(1),d=[c1[0]-c0[0],c1[1]-c0[1]];
  const p0=P(0,0,0),p1=P(1,0,0),ex=[p1[0]-p0[0],p1[1]-p0[1]];
  const det=d[0]*ex[1]-d[1]*ex[0];
  function hit([x,y]) {
    const qx=x-c0[0],qy=y-c0[1],slot=(qx*ex[1]-qy*ex[0])/det;
    const across=(d[0]*qy-d[1]*qx)/det;
    return Math.abs(across)>W/2+5||slot<-.5||slot>N+.5 ? -1 : clamp(Math.round(slot),0,N-1);
  }
  function draw(i,a,z) {
    const b=books[i]; if(a===b.lastA&&z===b.lastZ)return;
    b.lastA=a;b.lastZ=z;
    const p=bookPose(P,i,a,z);
    b.body.setAttribute('d',p.sil);b.crease.setAttribute('d',p.crease);
    b.pages.setAttribute('d',p.pages);b.spine.setAttribute('d',p.spine);
    b.dots.forEach((dot,k)=>place(dot,p.dots[k]));
  }
  const loop=register(stage,(_dt,now)=>{
    let moving=false;
    books.forEach((b,i)=>{draw(i,tval(b.a,now),tval(b.z,now));if(!tdone(b.a,now)||!tdone(b.z,now))moving=true;});
    return moving;
  });
  bag.add(loop.unregister);
  function choose(index) {
    if(index===active)return;
    const from=index<0?active:index,now=performance.now();active=index;
    books.forEach((b,i)=>{
      const delay=Math.abs(i-from)*stagger;
      tset(b.a,index<0?REST:i<index?BACK:i>index?FRONT:0,now,delay);
      tset(b.z,index===i?LIFT:0,now,delay);
      b.body.classList.toggle('hi',index===i||(index<0&&i===2));
    });
    read.textContent=index<0?'rest':`folio ${String(index+1).padStart(2,'0')}`;
    loop.wake();
  }
  stage.tabIndex=0;
  stage.setAttribute('role','group');
  stage.setAttribute('aria-label','Six notebooks. Arrow keys choose a folio; Escape returns the books.');
  bag.on(stage,'keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Escape'].includes(event.key))return;
    event.preventDefault();
    const index=event.key==='Escape'?-1:event.key==='Home'?0:event.key==='End'?N-1:
      clamp((active<0?2:active)+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1),0,N-1);
    choose(index);
  });
  books[2].body.classList.add('hi');read.textContent='rest';
  bag.add(pointer(stage,{move:p=>choose(hit(p)),leave:()=>choose(-1)}));
  bag.add(()=>svg.replaceChildren());
  return {set:v=>{stagger=v;},destroy:bag.dispose};
}
hairline({name:'folios',means:'Six notebooks in a tray: point along their top edges to draw one out and let its neighbours make room.',rules:[1,2,4,8,9],range:[20,40,65],tour:[[243,97],[204,116],[165,135],null],mount});
