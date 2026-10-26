(() => {
  'use strict';
  const canvas = document.querySelector('#ink');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const scenes = [
    { title: 'Where the<br>rain settles.', verse: 'Some days, the world asks<br>only that we stand still.', medium: 'Water, pigment, a passing thought.', label: 'Rain', description: 'A rain-soaked courtyard painted in charcoal ink, with a small vermilion sun and a figure beneath an umbrella.' },
    { title: 'A little room<br>for the sky.', verse: 'The branches never hurry.<br>They find the light anyway.', medium: 'A branching world. One open sky.', label: 'Canopy', description: 'The view upward through six branching ink trees, framing a pale sky with a vermilion sun.' },
    { title: 'Let the line<br>come home.', verse: 'Leave a little room<br>for what comes next.', medium: 'One breath, left unfinished.', label: 'Circle', description: 'An open brush circle in dark charcoal, with dry bristle edges, pale ink blooms and a small red maker’s seal.' },
  ];
  const N = 2400;
  const model = {
    selected: 0, playing: false, elapsed: 0, time: 0,
    weights: [1, 0, 0], velocities: [0, 0, 0],
    visible: true, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  let frame = 0, last = 0, width = 0, height = 0, paints = 0;
  const random = (seed) => () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const ink = [215, 220, 209], pale = [146, 163, 149], red = [164, 54, 39];
  const stroke = (a, x, y, ex, ey, w, alpha, color = ink) => a.push({ x, y, ex, ey, w, alpha, color });
  // Different paper loads and broken bristles are generated once, never randomized in the frame loop.
  function rain() {
    const a = [], rng = random(811);
    for (let i = 0; i < 440; i++) {
      const y = 76 + rng() * 485, edge = Math.sin(y * .065) * 5 + rng() * 9;
      stroke(a, 521 + edge, y, 870 - edge, y + rng() * 7, 3 + rng() * 10, .018 + rng() * .016, pale);
    }
    const blocks = [[532,105,47,366],[586,58,56,397],[648,124,32,285],[749,92,50,337],[810,44,52,433]];
    blocks.forEach(([x,y,w,h]) => {
      for (let i = 0; i < 75; i++) {
        const xx = x + rng() * w;
        stroke(a,xx,y + rng()*30,xx + rng()*8-4,y+h+rng()*18,1+rng()*6,.025+rng()*.07);
      }
      for(let j=0;j<9;j++) for(let k=0;k<3;k++) {
        const xx=x+8+k*13, yy=y+30+j*32;
        stroke(a,xx,yy,xx,yy+11,2,.15, [70,87,77]);
      }
    });
    // The reflected city is broken by horizontal water lines.
    for(let i=0;i<240;i++) {
      const x=527+rng()*338,y=437+rng()*135;
      stroke(a,x,y,x+rng()*4,y+6+rng()*28,.5+rng()*4,.025+rng()*.05);
    }
    for(let i=0;i<160;i++) {
      const y=455+rng()*122,x=517+rng()*355;
      stroke(a,x,y,x+8+rng()*49,y, .5+rng(), .12, [110,129,116]);
    }
    // Umbrella, a single small witness, and its reflection.
    for(let i=0;i<95;i++) {
      const t=rng()*Math.PI;
      const x=698+Math.cos(t)*31;
      stroke(a,698,341,x,341-Math.sin(t)*17,1+rng()*2,.35);
    }
    for(let i=0;i<48;i++) {
      const x=692+rng()*12;
      stroke(a,x,358,x+(x-698)*.6,407,1+rng()*2,.4);
    }
    for(let i=0;i<22;i++) {
      const x=694+rng()*9;
      stroke(a,x,405,x+(x>698?2:-2),429,1,.5);
      stroke(a,x,444,x,481+rng()*20,1,.09);
    }
    stroke(a,699,342,699,369,1,.85);
    for(let i=0;i<45;i++) {
      const t=rng()*Math.PI*2, rr=Math.sqrt(rng())*7;
      stroke(a,698+Math.cos(t)*rr,352+Math.sin(t)*rr,698+Math.cos(t)*rr+1,353+Math.sin(t)*rr,2,.5);
    }
    // Sparse reeds and wash drips keep the edge visibly handmade.
    for(let i=0;i<70;i++) {
      const x=520+rng()*354,y=550+rng()*18;
      stroke(a,x,y,x+rng()*3,y+4+rng()*31,.4+rng(),.08);
    }
    for(let i=0;i<280;i++) {
      const x=522+rng()*350,y=76+rng()*490;
      stroke(a,x,y,x-3,y+12+rng()*23,.4,.08,[164,181,164]);
    }
    return finish(a, rng);
  }
  function canopy() {
    const a=[],rng=random(277),cx=692,cy=279;
    // Branch recursion uses the same projected point of light, but each tree has its own reach.
    const roots=[[415,650],[560,710],[944,651],[1000,468],[399,-5],[940,-45]];
    roots.forEach(([x,y],i)=>{
      const queue=[{x,y,angle:Math.atan2(cy-y,cx-x),len:169+(i%3)*20,w:24+(i%2)*9,depth:5}];
      while(queue.length){
        const b=queue.shift(),endx=b.x+Math.cos(b.angle)*b.len,endy=b.y+Math.sin(b.angle)*b.len;
        const bend=(rng()-.5)*b.w*.8, nx=-Math.sin(b.angle), ny=Math.cos(b.angle);
        for(let part=0;part<4;part++){
          const t=part/4,u=(part+1)/4;
          const px=b.x+(endx-b.x)*t+nx*Math.sin(t*Math.PI)*bend;
          const py=b.y+(endy-b.y)*t+ny*Math.sin(t*Math.PI)*bend;
          const qx=b.x+(endx-b.x)*u+nx*Math.sin(u*Math.PI)*bend;
          const qy=b.y+(endy-b.y)*u+ny*Math.sin(u*Math.PI)*bend;
          stroke(a,px,py,qx,qy,b.w*(1-.5*(t+u)/2),1);
        }
        if(b.depth<1)continue;
        queue.push({x:endx,y:endy,angle:b.angle+(rng()-.5)*.32,len:b.len*(.64+rng()*.10),w:b.w*.55,depth:b.depth-1});
        queue.push({x:endx,y:endy,angle:b.angle+(rng()>.5?1:-1)*(.4+rng()*.49),len:b.len*(.5+rng()*.17),w:b.w*.43,depth:b.depth-1});
      }
    });
    // A few diluted floating leaves; most of the sky remains untouched paper.
    while(a.length<1700){
      const t=rng()*Math.PI*2,r=180+rng()*210,x=cx+Math.cos(t)*r,y=cy+Math.sin(t)*r;
      stroke(a,x,y,x+3+rng()*8,y+2+rng()*5,1+rng()*4,.06+rng()*.08,pale);
    }
    return finish(a,rng);
  }
  function circle() {
    const a=[],rng=random(981);
    // Hundreds of frayed strands form a single incomplete gesture, rather than a perfect stroked arc.
    for(let i=0;i<2210;i++) {
      const t=-1.32+rng()*5.9;
      const pressure=.45+.55*Math.sin((t+1.32)/5.9*Math.PI);
      const radius=197+(rng()-.5)*(9+15*pressure)+Math.sin(t*9)*1.6;
      const x=691+Math.cos(t)*radius,y=330+Math.sin(t)*radius;
      const end=t+.025+rng()*.067;
      const color=rng()>.84?pale:ink;
      stroke(a,x,y,691+Math.cos(end)*radius,330+Math.sin(end)*radius,.5+rng()*2.5,.3+rng()*.45,color);
    }
    // Dilute blooms record where the water reached before the pigment.
    for(let i=0;i<105;i++) {
      const t=rng()*6.28,r=208+rng()*10;
      stroke(a,691+Math.cos(t)*r,330+Math.sin(t)*r,691+Math.cos(t+.03)*r,330+Math.sin(t+.03)*r,2+rng()*5,.018,pale);
    }
    return finish(a,rng);
  }
  function finish(a,rng) {
    if(a.length>N)a.length=N;
    while(a.length<N)stroke(a,620+rng()*100,240+rng()*140,620+rng()*100,240+rng()*140,.3,0);
    // Stable shuffled identities distribute the transformation throughout the image.
    for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  }
  const art=[rain(),canopy(),circle()];
  const paper=document.createElement('canvas');paper.width=1000;paper.height=700;
  const p=paper.getContext('2d'),noise=random(554),image=p.createImageData(1000,700);
  for(let i=0;i<image.data.length;i+=4){const c=25+noise()*50;image.data[i]=c;image.data[i+1]=c;image.data[i+2]=c-15;image.data[i+3]=noise()*12;}
  p.putImageData(image,0,0);
  p.strokeStyle='rgba(159,179,143,.035)';p.lineWidth=.5;
  for(let i=0;i<1200;i++){const x=noise()*1000,y=noise()*700;p.beginPath();p.moveTo(x,y);p.lineTo(x+noise()*2,y+5+noise()*20);p.stroke();}

  function draw() {
    paints++;
    const dpr=Math.min(devicePixelRatio||1,2);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ctx.drawImage(paper,0,0,width,height);
    const mobile=matchMedia('(max-width:800px)').matches;
    const scale=mobile?Math.min(width/575,height/650):Math.min(width*.66/610,height/660);
    const ox=(mobile?width*.5:width*.69)-690*scale;
    const oy=mobile?0:height*.5-330*scale;
    ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.lineCap='round';
    const [wa,wb,wc]=model.weights;
    for(let i=0;i<N;i++){
      const a=art[0][i],b=art[1][i],c=art[2][i];
      const alpha=Math.max(0,Math.min(1,a.alpha*wa+b.alpha*wb+c.alpha*wc));
      if(alpha<.003)continue;
      const breeze=Math.sin(model.time*.25)*1.6*wb;
      const x=a.x*wa+b.x*wb+c.x*wc+breeze,y=a.y*wa+b.y*wb+c.y*wc;
      const ex=a.ex*wa+b.ex*wb+c.ex*wc+breeze,ey=a.ey*wa+b.ey*wb+c.ey*wc;
      const color=a.color.map((v,j)=>Math.round(v*wa+b.color[j]*wb+c.color[j]*wc));
      ctx.strokeStyle=`rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
      ctx.lineWidth=Math.max(.15,a.w*wa+b.w*wb+c.w*wc);
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
    }
    // Pigment accents belong to the same clock and scene weights.
    ctx.globalAlpha=Math.max(0,wa);ctx.fillStyle='#ad4031';ctx.beginPath();ctx.arc(578,111,17,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=Math.max(0,wb);ctx.fillStyle='#b6573e';ctx.beginPath();ctx.arc(748,214,23,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=Math.max(0,wc);ctx.strokeStyle='#aa4936';ctx.lineWidth=1;ctx.strokeRect(905,461,25,28);
    ctx.fillStyle='#aa4936';ctx.font='19px Georgia';ctx.fillText('今',908,483);
    ctx.globalAlpha=1;
    if(wa>.01){
      ctx.lineWidth=.65;ctx.strokeStyle=`rgba(210,211,193,${.29*wa})`;
      for(let i=0;i<90;i++){
        const x=529+((i*173.13)%341), y=80+((i*59.97+model.time*43)%485);
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2,y+13);ctx.stroke();
      }
    }
    canvas.dataset.frames=String(paints);
    canvas.dataset.time=model.time.toFixed(3);
    canvas.dataset.weights=model.weights.map(v=>v.toFixed(4)).join(',');
  }
  function moving(){return model.weights.some((w,i)=>Math.abs(w-(i===model.selected?1:0))>.0001)||model.velocities.some(v=>Math.abs(v)>.0001);}
  function allowed(){return model.visible&&!document.hidden&&!model.reduced;}
  function wake(){if(!frame&&allowed()&&(model.playing||moving())){last=0;frame=requestAnimationFrame(tick);}}
  function tick(now){
    frame=0;if(!allowed()){last=0;return;}
    const dt=last?Math.min((now-last)/1000,.05):0;last=now;
    if(model.playing){
      model.time+=dt;model.elapsed+=dt;
      if(model.elapsed>=9){if(model.selected<2)select(model.selected+1);else{model.playing=false;model.elapsed=0;sync();}}
    }
    // Exact critically damped integration: no accumulated fixed-step drift, and no velocity reset on retarget.
    const omega=5.8,decay=Math.exp(-omega*dt);
    for(let i=0;i<3;i++){
      const target=i===model.selected?1:0,d=model.weights[i]-target,v=model.velocities[i],h=v+omega*d;
      model.weights[i]=target+(d+h*dt)*decay;
      model.velocities[i]=(v-omega*h*dt)*decay;
    }
    if(!moving()){model.weights=model.weights.map((_,i)=>i===model.selected?1:0);model.velocities=[0,0,0];}
    draw();if(model.playing||moving())frame=requestAnimationFrame(tick);else last=0;
  }
  function sync(){
    const scene=scenes[model.selected];
    $('title').innerHTML=scene.title;$('verse').innerHTML=scene.verse;$('medium').textContent=scene.medium;
    $('chapter').textContent=`0${model.selected+1}`;
    canvas.setAttribute('aria-label',scene.description);
    document.querySelectorAll('[data-scene]').forEach((button,i)=>{if(i===model.selected)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});
    $('play-label').textContent=model.reduced?'Still mode':model.playing?'Pause story':'Play story';
    $('play-icon').textContent=model.playing?'Ⅱ':'▷';
    $('play').disabled=model.reduced;
    $('play').setAttribute('aria-pressed',String(model.playing));
    $('status').textContent=model.reduced?`${scene.label}. Reduced motion: a complete still.`:model.playing?`${scene.label}. Taking the long way through three landscapes.`:`${scene.label}. Still for a moment. Press play to wander.`;
  }
  function select(index){
    model.selected=(index+3)%3;model.elapsed=0;
    if(model.reduced){model.weights=model.weights.map((_,i)=>i===model.selected?1:0);model.velocities=[0,0,0];}
    sync();draw();wake();
  }
  document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>select(Number(button.dataset.scene))));
  $('previous').addEventListener('click',()=>select(model.selected-1));
  $('next').addEventListener('click',()=>select(model.selected+1));
  $('play').addEventListener('click',()=>{if(model.reduced)return;model.playing=!model.playing;sync();wake();});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change',event=>{
    model.reduced=event.matches;
    if(model.reduced){model.playing=false;cancelAnimationFrame(frame);frame=0;last=0;model.weights=model.weights.map((_,i)=>i===model.selected?1:0);model.velocities=[0,0,0];}
    sync();draw();wake();
  });
  function suspend(){cancelAnimationFrame(frame);frame=0;last=0;wake();}
  document.addEventListener('visibilitychange',suspend);
  const intersection=new IntersectionObserver(entries=>{model.visible=entries[entries.length-1].isIntersecting;suspend();},{threshold:0});intersection.observe(canvas);
  const resize=new ResizeObserver(()=>{
    const box=canvas.getBoundingClientRect();width=box.width;height=box.height;
    const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);draw();
  });resize.observe(canvas);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;intersection.disconnect();resize.disconnect();});
  window.addEventListener('pageshow',event=>{if(event.persisted){intersection.observe(canvas);resize.observe(canvas);wake();}});
  sync();
})();
