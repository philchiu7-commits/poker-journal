/* Read Lab v1 — derived trial results only. Never writes opponent reads. */
const ReadLab = (() => {
  const AGG = new Set(['bet','raise','3bet','4bet','5bet','jam','open','limp-raise']);
  const ST = ['pre','flop','turn','river'], N = {flop:3,turn:4,river:5};
  const rank = c => '23456789TJQKA'.indexOf(c[0]) + 2;
  const rules = [];
  const add = (id, section, label, definition, test, config = {}) => rules.push({id,section,label,definition,test,min:3,mode:'cap',...config});
  const countOop = (n, strict=false) => strict ? n<=4?1:2 : n===3?1:n<=5?2:3;
  const position = (F,s,strict=false,custom=false) => {
    const a=F.st[s].alive;
    const ring=['SB','BB','STD','U9','U8','U7','U6','HJ','CO','BN'];
    const sorted=a.slice().sort((x,y)=>ring.indexOf(F.pos(x))-ring.indexOf(F.pos(y)));
    if (!sorted.includes(F.me) || a.some(x=>!ring.includes(F.pos(x)))) return null;
    return sorted.indexOf(F.me) < (a.length===2?1:custom?countOop(a.length,strict):a.length-1) ? 'OOP':'IP';
  };
  function facts(h,id) {
    const idx=(h.villains||[]).findIndex(v=>v.opponentId===id); if(idx<0)return null;
    const F={h,idx,me:'v'+idx,st:{},squid:h.villains[idx].squid};
    F.pos=a=>a==='hero'?h.heroPos:h.villains?.[Number(a.slice(1))]?.pos;
    const posted=straddlePosts(h), u=h.blinds?.bb>0&&h.blinds.bb<1?1000:1;
    F.forced={SB:(h.blinds?.sb||0)*u,BB:(h.blinds?.bb||0)*u,...Object.fromEntries(posted.map(p=>[p.pos,p.amount*u]))};
    F.price=Math.max(h.blinds?.bb*u||0,...posted.map(p=>p.amount*u));
    const source=actsAsPlayed(h); let lv=0, price=F.price;
    const A=source.map(a=>{
      if(a.street!=='pre')return {...a,src:a.src||a};
      const b={...a,src:a.src||a,levelBefore:lv};
      if(AGG.has(a.act)) {
        const amount=sizeAmount(a.size)??sizeMult(a.size,price);
        if(a.act==='jam' && amount!=null && amount<=price)return {...b,act:'call',allInCall:true,levelAfter:lv};
        lv=Math.max(lv+1,({'3bet':2,'4bet':3,'5bet':4})[a.act]||0);
        b.act=lv===1?'raise':lv===2?'3bet':lv===3?'4bet':'5bet';
        if(amount!=null)price=Math.max(price,amount);
      }
      b.levelAfter=lv; return b;
    });
    const pre=A.filter(a=>a.street==='pre'); F.pre=pre;F.preAgg=pre.filter(a=>AGG.has(a.act)).at(-1)?.actor;
    F.pfr=F.preAgg===F.me;F.pfc=!F.pfr&&pre.some(a=>a.actor===F.me&&a.act==='call');F.limped=lv===0;
    F.first=pre.find(a=>a.actor===F.me);F.openLimp=F.first&&F.first.levelBefore===0&&['limp','call'].includes(F.first.act)&&(F.forced[F.pos(F.me)]||0)<F.price;
    const actors=[...new Set(pre.map(a=>a.actor))],folded=new Set(),allin=new Set();let prevAgg=F.preAgg,init=F.preAgg;
    for(const st of ST){
      const acts=A.filter(a=>a.street===st),alive=actors.filter(x=>!folded.has(x)),my=acts.filter(a=>a.actor===F.me),first=my[0];
      const firstI=acts.findIndex(a=>a.actor===F.me),before=firstI<0?[]:acts.slice(0,firstI),bets=acts.filter(a=>AGG.has(a.act));
      const can=st!=='pre'&&first&&!allin.has(F.me)&&alive.some(x=>x!==F.me&&!allin.has(x))&&!before.some(a=>AGG.has(a.act))&&['check',...AGG].includes(first.act);
      const bet=can&&AGG.has(first.act), prior=prevAgg||init;
      const current={acts,my,first,alive,can:!!can,bet:!!bet,firstI,bets,prevAgg,init,board:(h.board||[]).slice(0,N[st]||0)};
      current.through=acts.length>0&&acts.every(a=>a.act==='check')&&alive.filter(x=>!allin.has(x)).every(x=>acts.some(a=>a.actor===x));
      current.leadChance=!!(can&&prevAgg&&prevAgg!==F.me&&alive.includes(prevAgg)&&!allin.has(prevAgg)&&!before.some(a=>a.actor===prevAgg));
      current.lead=!!(bet&&prevAgg&&prevAgg!==F.me&&alive.includes(prevAgg)&&!allin.has(prevAgg)&&!before.some(a=>a.actor===prevAgg));
      current.bxt=!!(bet&&prior&&prior!==F.me&&before.some(a=>a.actor===prior&&a.act==='check')&&alive.includes(prior));
      const checkAt=acts.findIndex(a=>a.actor===F.me&&a.act==='check');
      current.xr=checkAt>=0&&acts.slice(checkAt+1).some((a,j,rest)=>AGG.has(a.act)&&a.actor!==F.me&&rest.slice(j+1).some(b=>b.actor===F.me&&AGG.has(b.act)));
      const facedI=acts.findIndex((a,j)=>a.actor!==F.me&&AGG.has(a.act)&&acts.slice(j+1).some(b=>b.actor===F.me));
      current.faced=facedI>=0?acts[facedI]:null;
      current.response=facedI>=0?acts.slice(facedI+1).find(a=>a.actor===F.me):null;
      current.xrChance=checkAt>=0&&facedI>checkAt&&current.response!=null;
      current.raise=my.some(a=>AGG.has(a.act)&&acts.slice(0,acts.indexOf(a)).some(b=>b.actor!==F.me&&AGG.has(b.act)));
      F.st[st]=current;
      for(const a of acts){if(a.act==='fold')folded.add(a.actor);if(a.act==='jam'||a.src?.act==='jam'||a.size==='Jam'||a.allInCall)allin.add(a.actor);}
      prevAgg=bets.at(-1)?.actor||null;if(prevAgg)init=prevAgg;
    }
    F.cards=(h.villains[idx].cards||[]).filter(Boolean);return F;
  }
  function holding(F,st){
    const cache=F.holdings||(F.holdings={});
    if(Object.prototype.hasOwnProperty.call(cache,st))return cache[st];
    return cache[st]=computeHolding(F,st);
  }
  function computeHolding(F,st){
    const board=F.st[st].board,hole=F.cards;
    if(hole.length!==2||board.length!==N[st]||![...hole,...board].every(c=>/^[2-9TJQKA][cdhs]$/.test(c))||new Set([...hole,...board]).size!==hole.length+board.length)return null;
    if(board.length===5&&best7(board)[0]>=4&&cmpScore(best7([...hole,...board]),best7(board))===0)return null;
    const raw=readEstimates.tier(hole,board,true),draw=readEstimates.draws(hole,board);
    const br=[...new Set(board.map(rank))],hr=hole.map(rank),pairRanks=hr.filter(r=>hr.filter(v=>v===r).length===2||br.includes(r));
    const pair=pairRanks.length>0,pairRank=pair?Math.max(...pairRanks):null,above=pair?br.filter(r=>r>pairRank).length:null;
    const suit={};board.forEach(c=>suit[c[1]]=(suit[c[1]]||0)+1);
    const fourFlush=Object.values(suit).some(n=>n>=4),rs=new Set(br.flatMap(r=>r===14?[14,1]:[r]));
    let fourStraight=false;for(let lo=1;lo<=10;lo++)if([...rs].filter(r=>r>=lo&&r<lo+5).length>=4)fourStraight=true;
    const texture=fourFlush||fourStraight,ignored=texture&&raw.t===4&&raw.cat<4;
    const strong=texture?raw.cat>=(fourFlush?5:4):raw.t>=2;
    const hasDraw=!!(draw.fd||draw.oesd||draw.gut),kind=ignored?null:strong?'strong':hasDraw?'draw':pair?(texture?'bluff':'pair'):'air';
    const riverBluff=!ignored&&!strong&&(texture?raw.t<4:(!pair||above>=4));
    const ownSuited=hole.filter(c=>board.filter(b=>b[1]===c[1]).length+hole.filter(b=>b[1]===c[1]).length===4);
    const topPair=raw.name==='top pair',kicker=pair?Math.max(...hr.filter(r=>r!==pairRank),0):0;
    const kickers=Array.from({length:13},(_,i)=>14-i).filter(r=>!br.includes(r));
    const protective=strong&&(raw.t>=3||topPair&&kicker>=(kickers[1]||13));
    return {raw,draw,pair,above,pairRank,strong,ignored,kind,hasDraw,riverBluff,topPair,kicker,protective,
      two:raw.t===4,fd:!!draw.fd,oesd:!!draw.oesd,gut:!!draw.gut,air:!pair&&!hasDraw&&raw.t<4,
      wfd:!!draw.fd&&ownSuited.length>0&&Math.max(...ownSuited.map(rank))<=11,
      weakTop:topPair&&kicker<=9&&!hasDraw,
      bluff:!ignored&&!strong&&(texture?raw.t<4:(!pair||above>=2))&&!hasDraw,
      flush:raw.cat===5||raw.cat===8,
      why:raw.name+(texture?' · '+(fourFlush?'four-flush':'four-straight')+' board':'')+(hasDraw?' + '+[draw.fd&&'FD',draw.oesd&&'OESD',draw.gut&&'gutshot'].filter(Boolean).join('/'):'')};
  }
  function texture(F,st){
    const i=st==='turn'?3:4,b=F.st[st].board;if(b.length!==i+1)return {};
    return hqBoardCard(b,i);
  }
  const eq=(ok,why)=>({ok:!!ok,why});
  const eligibleBet=(F,s)=>F.st[s].can;
  const known=(F,s,gate,pred)=>{if(!gate)return null;const H=holding(F,s);if(!H){F.skippedCards=true;return null;}if(H.ignored){F.skippedTexture=true;return null;}return eq(pred(H,F),H.why);};
  const frequency=(id,sec,label,def,test,threshold,more=true,extra={})=>add(id,sec,label,def,test,{mode:'freq',threshold,more,...extra});
  const cap=(id,sec,label,def,test,extra={})=>add(id,sec,label,def,test,extra);
  const cat=(id,sec,label,st,gate,pred,extra={})=>cap(id,sec,label,'3 distinct qualifying hands. Known holdings only; ignored textures do not enter the sample.',F=>known(F,st,gate(F),pred),extra);
  const squidState=F=>F.squid==null||F.squid===''||!Number.isFinite(Number(F.squid))?null:Number(F.squid)>0?'have':'none';
  const quiet=(F,s)=>F.st[s].through;
  const pfrCbet=F=>F.pfr&&eligibleBet(F,'flop');
  const cbetCalled=F=>F.st.flop.bet&&F.st.flop.acts.slice(F.st.flop.firstI+1).some(a=>a.actor!==F.me&&a.act==='call')&&F.st.flop.bets.length===1;
  const delay=F=>F.pfr&&quiet(F,'flop')&&F.st.turn.can;
  const barrel=F=>F.pfr&&cbetCalled(F)&&F.st.turn.can;
  const probe=F=>F.pfc&&quiet(F,'flop')&&F.st.turn.can&&F.st.turn.alive.includes(F.preAgg)&&F.st.turn.acts.some(a=>a.actor===F.preAgg)&&F.st.turn.firstI<F.st.turn.acts.findIndex(a=>a.actor===F.preAgg);
  const low=F=>F.st.flop.board.length===3&&F.st.flop.board.every(c=>/^[2-9TJQKA][cdhs]$/.test(c))&&Math.max(...F.st.flop.board.map(rank))<=9;
  const limpMw=F=>F.limped&&F.st.flop.alive.length>=3;
  const oopLimp=F=>limpMw(F)&&position(F,'flop',false,true)==='OOP'&&F.st.flop.can;
  const ipLimp=F=>limpMw(F)&&position(F,'flop',false,true)==='IP'&&F.st.flop.can;
  const post=F=>!F.limped;
  const bands=(id,sec,label,def,test,lo,hi,extra={})=>add(id,sec,label,def,test,{mode:'bands',low:lo,high:hi,...extra});
  for(const sq of ['have','none']){
    const lab=sq==='have'?'wS':'nS';
    const lrr=F=>{
      if(!F.openLimp)return null;const a=F.pre.find(a=>a.actor===F.me&&a.levelBefore>=1&&AGG.has(a.act));if(!a||F.cards.length!==2||!F.cards.every(c=>/^[2-9TJQKA][cdhs]$/.test(c)))return null;
      const r=F.cards.map(rank).sort((a,b)=>b-a),[x,y]=r;if(x===y&&x>=6&&x<=8||x===14&&[10,11].includes(y))return null;
      return {value:x===y&&x>=9||x===14&&y>=12,why:F.cards.join(' ')};
    };
    for(const [name,v] of [['LrrV',true],['LrrB',false]])cap('lrr-'+name+'-'+sq,'Squid',lab+' · '+name,'AQ/AK and 99+ = value. Ignore AJ/AT and 66–88; other known holdings = bluff. 3 examples.',F=>{const a=lrr(F);return a?eq(a.value===v,a.why):null;},{squid:sq});
    const chance=F=>F.first&&F.first.levelBefore===0&&(F.forced[F.pos(F.me)]||0)<F.price;
    bands('limp-'+sq,'Preflop','Limps '+lab,'Limp or overlimp / genuine unraised-pot entry opportunities. Free checks excluded.',F=>chance(F)?eq(['limp','call'].includes(F.first.act),'First response: '+F.first.act):null,sq==='have'?35:40,sq==='have'?45:55,{squid:sq});
    bands('open-'+sq,'Preflop','Open '+lab,'Open + isolation raises / genuine unraised-pot entry opportunities.',F=>chance(F)?eq(AGG.has(F.first.act),'First response: '+F.first.act):null,sq==='have'?19:17,sq==='have'?24:23,{squid:sq});
  }
  bands('threebet','Preflop','3bet','3bets including squeezes and all-in reraises / chances facing the first raise. Limp-reraises excluded. Combined squid.',F=>{
    if(F.openLimp)return null;const a=F.pre.find(a=>a.actor===F.me&&a.levelBefore===1);return a?eq(AGG.has(a.act)&&a.levelAfter===2,'Response: '+a.act):null;
  },8.5,14,{highInclusive:true,combined:true});
  for(const pos of ['IP','OOP']) add('fold3-'+pos,'Preflop','Fold to 3bet · '+pos,'First answer after an opening or isolation raise; intervening 4bets excluded. Strong Yes ≥65; Yes ≥58; No ≥50; Hard No <50.',F=>{
    if(F.openLimp)return null;const open=F.pre.findIndex(a=>a.actor===F.me&&a.levelAfter===1&&AGG.has(a.act));if(open<0||F.pre[open].src?.act==='jam'||F.pre[open].size==='Jam')return null;
    const i=F.pre.findIndex((a,j)=>j>open&&a.actor!==F.me&&AGG.has(a.act)&&a.levelAfter===2);if(i<0)return null;
    const next=F.pre.slice(i+1),r=next.find(a=>a.actor===F.me);if(!r||next.slice(0,next.indexOf(r)).some(a=>AGG.has(a.act)))return null;
    const ring=['SB','BB','STD','U9','U8','U7','U6','HJ','CO','BN'];const x=ring.indexOf(F.pos(F.me)),y=ring.indexOf(F.pos(F.pre[i].actor));if(x<0||y<0||(x>y?'IP':'OOP')!==pos)return null;
    return eq(r.act==='fold','First answer to 3bet: '+r.act);
  },{mode:'fold3',threshold:58,strong:65,hard:50});
  cap('fourlight','Preflop','Can 4bet light','3 genuine 4bets with unpaired holdings below AJ; AJ/AQ/AK and all pocket pairs do not support. Combined squid.',F=>{
    const a=F.pre.find(a=>a.actor===F.me&&AGG.has(a.act)&&a.levelAfter===3);if(!a||F.cards.length!==2||!F.cards.every(c=>/^[2-9TJQKA][cdhs]$/.test(c)))return null;
    const [x,y]=F.cards.map(rank).sort((a,b)=>b-a);return eq(x!==y&&!(x===14&&y>=11),F.cards.join(' '));
  },{combined:true});
  frequency('range-x','MWP Limp','Probe OOP F · Range X','Whole checking range: ≥95% checks. Strict OOP: first1 in 3–4 way, first2 in 5–9 way. Cards not required.',F=>limpMw(F)&&position(F,'flop',true,true)==='OOP'&&F.st.flop.can?eq(!F.st.flop.bet,'First action: '+F.st.flop.first.act):null,95);
  const comp=[['Draw',H=>H.kind==='draw'],['Merge',H=>H.kind==='pair'],['WKtp',H=>H.weakTop],['TopP+',H=>H.strong]];
  for(const [label,pred] of comp)cat('limp-oop-'+label,'MWP Limp','Probe OOP F · '+label,'flop',F=>oopLimp(F)&&F.st.flop.bet,pred);
  for(const [label,pred] of [['Air',H=>H.air],['Draw',H=>H.kind==='draw'],['BottomP / 2ndP',H=>H.kind==='pair'],['Strong',H=>H.strong],['Bluff',H=>H.bluff]])cat('limp-xr-'+label,'MWP Limp','xR · '+label,'flop',F=>limpMw(F)&&F.st.flop.xr,pred);
  for(const [label,pred] of [['Air',H=>H.air],['Merge',H=>H.kind==='pair'],['Strong',H=>H.strong]])cat('limp-ip-'+label,'MWP Limp','IP Stab · '+label,'flop',F=>ipLimp(F)&&F.st.flop.bet,pred);
  const afterRaise=(F,s)=>{
    const S=F.st[s];if(!S.bet)return null;const j=S.acts.findIndex((a,i)=>i>S.firstI&&a.actor!==F.me&&AGG.has(a.act));if(j<0)return null;
    if(!S.acts.slice(0,S.firstI).some(a=>a.actor===S.acts[j].actor&&a.act==='check'))return null;
    const after=S.acts.slice(j+1),r=after.find(a=>a.actor===F.me);if(!r||after.slice(0,after.indexOf(r)).some(a=>AGG.has(a.act)))return null;return r;
  };
  frequency('limp-fxr','MWP Limp','IP Stab · FxR','First response to a check-raise after an IP stab: fold / genuine responses. >60% Yes.',F=>{const r=ipLimp(F)?afterRaise(F,'flop'):null;return r?eq(r.act==='fold','Response: '+r.act):null;},60,true,{strict:true});
  for(const field of ['HU','MW'])for(const pos of ['OOP','IP'])frequency('cbet-'+field+'-'+pos,'Flop · PFR','Cbet '+field+' · '+pos,'Cbet / flop betting opportunities as last preflop aggressor. Wide at cutoff or higher; Tight below.',F=>pfrCbet(F)&&(F.st.flop.alive.length===2?'HU':'MW')===field&&position(F,'flop',false,true)===pos?eq(F.st.flop.bet,'First flop action: '+F.st.flop.first.act):null,field==='HU'?(pos==='OOP'?45:65):(pos==='OOP'?35:50),true,{wide:true});
  frequency('flop-fxr','Flop · PFR','Fold to xR','Cbet, then face a raise; first response. >60% folds Yes.',F=>{const r=F.pfr?afterRaise(F,'flop'):null;return r?eq(r.act==='fold','Response: '+r.act):null;},60,true,{strict:true});
  cat('b3b','Flop · PFR','B3b Nut','flop',F=>F.pfr&&F.st.flop.bet&&F.st.flop.my.filter(a=>AGG.has(a.act)).length>=2,H=>H.two);
  frequency('low-wide','Flop · PFR','Low Board · Too wide','Highest flop card ≤9. >50% cbets / opportunities.',F=>low(F)&&pfrCbet(F)?eq(F.st.flop.bet,'First action: '+F.st.flop.first.act):null,50,true,{strict:true});
  frequency('low-abc','Flop · PFR','Low Board · ABC','Known bad hands below top pair without FD/OESD or gutshot+2overs: check-fold ≥80% of responses to a bet, ≥3 opportunities.',F=>{
    if(!F.pfr||!low(F)||!F.st.flop.can)return null;const H=holding(F,'flop'),S=F.st.flop;if(!H||H.strong||H.fd||H.oesd||H.gut&&F.cards.every(c=>rank(c)>Math.max(...S.board.map(rank))))return null;
    if(!S.first||AGG.has(S.first.act))return eq(false,H.why+'; bet instead of check-fold');
    if(!S.response)return null;return eq(S.first.act==='check'&&S.response.act==='fold',H.why+'; '+S.response.act);
  },80,true,{minOpp:3});
  cat('low-protect','Flop · PFR','Low Board · Protective','flop',F=>F.pfr&&low(F)&&F.st.flop.can&&!F.st.flop.bet,H=>H.protective);
  cat('oop-protect','Flop · PFR','OOP Protective','flop',F=>F.pfr&&position(F,'flop')==='OOP'&&F.st.flop.can&&!F.st.flop.bet,H=>H.protective);
  for(const [label,pred] of [['Air',H=>H.air],['Draw',H=>H.kind==='draw'],['BottomP / 2ndP',H=>H.kind==='pair'],['Strong',H=>H.strong]])cat('pfr-xr-'+label,'Flop · PFR','xR · '+label,'flop',F=>F.pfr&&post(F)&&F.st.flop.xr,pred);
  for(const [label,pred] of [['Air',H=>H.air],['Equity',H=>H.kind==='draw'],['BottomP / 2ndP',H=>H.kind==='pair'],['Strong',H=>H.strong]])cat('pfc-xr-'+label,'Flop · PFC','xR or R · '+label,'flop',F=>F.pfc&&post(F)&&F.st.flop.raise,pred);
  for(const s of ['flop','turn']){
    const section=s==='flop'?'Flop · PFC':'Turn · PFC';
    const bxt=F=>F.pfc&&post(F)&&F.st[s].bxt;
    const share=F=>known(F,s,bxt(F),H=>H.bluff||H.kind==='draw');
    frequency('bxt-over-'+s,section,'BXT · Overbluff','Bluffs+draws / all classifiable BXT bets ≥60%, at least3 supporting hands.',share,60,true,{minHits:3});
    add('bxt-normal-'+s,section,'BXT · Normal','Bluffs+draws share ≥40% and <60% of classifiable BXT bets.',share,{mode:'interval',low:40,high:60,minOpp:3});
    cat('bxt-merged-'+s,section,'BXT · Merged',s,bxt,H=>H.kind==='pair');
    cat('bxt-air-'+s,section,'BXT · Air',s,bxt,H=>H.air);
  }
  const categories=[['Draw',H=>H.kind==='draw'],['Merge',H=>H.kind==='pair'],['Strong',H=>H.strong],['Bluff',H=>H.bluff]];
  for(const s of ['flop','turn','river']){
    const section=s==='flop'?'Flop · PFC':s==='turn'?'Turn · PFC':'River · PFC';
    const lead=F=>F.pfc&&post(F)&&F.st[s].lead;
    cap('lead-have-'+s,section,'Lead · Have','One confirmed lead before previous aggressor acts. Cards not required; aggressor must still be in hand. Raised pots only.',F=>F.pfc&&post(F)&&F.st[s].leadChance?eq(F.st[s].bet,F.st[s].bet?'Led before previous aggressor':'Checked instead of leading'):null,{min:1});
    for(const [label,pred] of categories.filter(([l])=>s!=='river'||!['Draw','Merge'].includes(l)))cat('lead-'+label+'-'+s,section,'Lead · '+label,s,lead,H=>s==='river'&&label==='Bluff'?H.riverBluff:pred(H));
    if(s!=='flop')cat('lead-flush-'+s,section,'Lead · Flush',s,lead,(H,F)=>{const prev=holding(F,s==='turn'?'flop':'turn');return prev&&!prev.flush&&H.flush;});
    if(s==='river')cat('lead-blankstrong',section,'Lead · BlankStrong',s,F=>lead(F)&&texture(F,s).blank,H=>H.two&&H.strong);
  }
  frequency('one-done','Turn · PFR','One and Done?','Turn check / opportunities after flop cbet called without raise. >60% Yes.',F=>barrel(F)?eq(!F.st.turn.bet,'Turn: '+F.st.turn.first.act):null,60,true,{strict:true});
  cat('delay-bluff','Turn · PFR','Delay Bluff','turn',F=>delay(F)&&F.st.turn.bet,H=>H.bluff||H.kind==='draw');
  for(const [label,pred] of [['Air',H=>H.air],['EquityBased',H=>H.kind==='draw'],['Mergy',H=>H.kind==='pair'],['Strong',H=>H.strong]])cat('barrel-'+label,'Turn · PFR','Barrel · '+label,'turn',F=>barrel(F)&&F.st.turn.bet,pred);
  const types=[['4Str','4str'],['3Flush','flush'],['4Flush','4flush'],['Overcards','over'],['Blank','blank']];
  for(const [label,key] of types)cat('bluff-turn-'+key,'Turn · PFR','Bluff Turn · '+label,'turn',F=>(barrel(F)||delay(F))&&F.st.turn.bet&&texture(F,'turn')[key],H=>H.bluff||H.kind==='draw');
  add('turn-low','Turn · PFR','Low Boards · Passive / Aggro','Turn highest card ≤9; unpaired holdings without FD/OESD. Gutshots allowed. Bet ≥50% Aggro; below Passive.',F=>{
    const H=holding(F,'turn');if(!F.pfr||!F.st.turn.can||!H||H.pair||H.two||H.fd||H.oesd||Math.max(...F.st.turn.board.map(rank))>9)return null;return eq(F.st.turn.bet,H.why+'; '+F.st.turn.first.act);
  },{mode:'activity',threshold:50});
  cat('protect-flush','Turn · PFR','Protect T Flush','turn',F=>F.pfr&&F.st.turn.can&&!F.st.turn.bet,(H,F)=>{const prev=holding(F,'flop');return prev&&!prev.flush&&H.flush;},{min:1});
  for(const p of ['OOP','IP'])cat('float-'+p,'Turn · PFC','Float/Wide F · '+p,'flop',F=>F.pfc&&post(F)&&position(F,'flop')===p&&F.st.flop.response?.act==='call'&&F.st.flop.faced?.actor===F.preAgg,(H,F)=>H.air&&F.cards.every(c=>rank(c)<=12));
  for(const [label,pred] of [['FD',H=>H.fd],['OESD',H=>H.oesd],['GS',H=>H.gut],['TopP+',H=>H.strong]])cat('checkback-'+label,'Turn · PFC','Check back F · '+label,'flop',F=>F.pfc&&post(F)&&F.st.flop.through&&F.st.flop.acts.at(-1)?.actor===F.me,pred);
  bands('probe-turn','Turn · PFC','Probe Turn','Probe / chances to bet before the preflop aggressor after a checked-through flop. Combined squid.',F=>probe(F)?eq(F.st.turn.bet,'Turn: '+F.st.turn.first.act):null,35,45,{combined:true});
  const riverChance=F=>F.pfr&&F.st.river.can;
  const airRiver=F=>{const H=holding(F,'river');return H&&H.air;};
  frequency('river-over','River · PFR','Frequency · Overbluff','Bet / genuine river opportunities WHILE HOLDING AIR, >37%. Not air share among bets.',F=>riverChance(F)&&airRiver(F)?eq(F.st.river.bet,'Air; '+F.st.river.first.act):null,37,true,{strict:true});
  frequency('river-under','River · PFR','Frequency · Underbluff','Bet / genuine river opportunities WHILE HOLDING AIR, <31%.',F=>riverChance(F)&&airRiver(F)?eq(F.st.river.bet,'Air; '+F.st.river.first.act):null,31,false,{strict:true});
  const cleanBet=(F,s)=>F.st[s].bet&&F.st[s].bets.length===1&&F.st[s].acts.some(a=>a.actor!==F.me&&a.act==='call');
  const rvbet=F=>F.pfr&&F.st.river.bet;
  const lines={BBB:F=>cleanBet(F,'flop')&&cleanBet(F,'turn'),BXB:F=>cleanBet(F,'flop')&&quiet(F,'turn'),XBB:F=>quiet(F,'flop')&&cleanBet(F,'turn'),XXB:F=>quiet(F,'flop')&&quiet(F,'turn'),xCXB:F=>F.st.flop.first?.act==='check'&&F.st.flop.response?.act==='call'&&F.st.flop.bets.length===1&&quiet(F,'turn'),MWP:F=>F.st.river.alive.length>=3};
  for(const [name,gate] of Object.entries(lines))cat('line-'+name,'River · PFR','Bluff Lines · '+name,'river',F=>(name==='XXB'?post(F)&&F.st.river.bet:rvbet(F))&&gate(F),H=>H.riverBluff);
  const hands={FD:(F,H)=>holding(F,'turn')?.fd&&!H.flush,SD:(F,H)=>{const T=holding(F,'turn');return T&&(T.oesd||T.gut)&&H.raw.cat<4;},HL:F=>Math.max(...F.cards.map(rank))>=12&&Math.min(...F.cards.map(rank))<=7,SPEW:F=>F.cards.every(c=>rank(c)<=8)&&holding(F,'flop')?.air&&holding(F,'turn')?.air,'A-High':(F,H)=>F.cards.some(c=>rank(c)===14)&&H.air};
  for(const [name,pred] of Object.entries(hands))cat('river-hand-'+name,'River · PFR','Bluff hands · '+name,'river',rvbet,H=>true,{custom:(F,H)=>H.riverBluff&&pred(F,H)});
  for(const [name,key] of [['3Flush','flush'],['4Flush','4flush'],['4Str','4str'],['Blanks','blank'],['OverCards','over']])cat('river-card-'+key,'River · PFR','Rivers · '+name,'river',F=>rvbet(F)&&texture(F,'river')[key],H=>H.riverBluff);
  for(const hit of [true,false]){
    const gate=F=>{const T=holding(F,'turn'),b=F.st.turn.board;if(!T||b.length!==4)return false;
      const counts={};b.forEach(c=>counts[c[1]]=(counts[c[1]]||0)+1);const r=new Set(b.map(rank));let straight=false;
      for(let lo=1;lo<=10;lo++)if([...r].filter(v=>v>=lo&&v<lo+5).length>=2)straight=true;
      const possible=Object.values(counts).some(n=>n>=2)||straight;
      const tex=texture(F,'river'),complete=!!(tex.flush||tex['4flush']||tex.straight||tex['4str']);return possible&&complete===hit;
    };
    cap('river-type-'+hit,'River · PFR','Bluff Type · '+(hit?'DrawsHit':'DrawsMiss'),'3 qualifying river bluffs on this board type. Stat: bets / genuine opportunities while holding a qualifying bluff. DrawsHit takes priority.',F=>{
      if(!riverChance(F)||!gate(F))return null;const H=holding(F,'river');if(!H||!H.riverBluff)return null;return eq(F.st.river.bet,H.why+'; '+F.st.river.first.act);
    });
  }
  frequency('force-nonsd','River · PFR','Force Bluff · NonSD','Bet / genuine river betting chances holding K-high or worse. >34% Yes.',F=>{const H=holding(F,'river');return riverChance(F)&&H&&H.air&&!F.cards.some(c=>rank(c)===14)?eq(F.st.river.bet,H.why):null;},34,true,{strict:true});
  cat('trap','River · PFR','Can Trap','river',F=>F.pfr&&F.st.river.can&&!F.st.river.bet,H=>H.two&&H.strong);
  cap('bsti','River · PFC','BSTI','3 bluff raises vs a river bet ≤⅓ pot; known qualifying bluff holding. All-in raises included.',F=>{
    if(!F.pfc||F.limped)return null;const S=F.st.river,H=holding(F,'river');if(!H||H.ignored||!S.faced||!S.response)return null;
    const rg=handRungs(F.h).get(S.faced.src||S.faced); // copied actions use src set in facts below
    const priced=betsVsPot(F.h).find(b=>b.a===(S.faced.src||S.faced));
    const ratio=rg?.ratio??(priced?.pot?priced.bet/priced.pot:null);if(ratio==null||ratio>1/3)return null;
    return eq(AGG.has(S.response.act)&&H.riverBluff,H.why+'; response '+S.response.act);
  });
  frequency('river-xt','River · PFC','Bluff XT','Bet / checked-to river opportunities while holding a qualifying bluff. ≥35%.',F=>{
    if(!F.pfc||F.limped||!F.st.river.can)return null;const S=F.st.river,prior=S.prevAgg||S.init;
    if(!prior||prior===F.me||!S.acts.slice(0,S.firstI).some(a=>a.actor===prior&&a.act==='check'))return null;
    const H=holding(F,'river');return H?.riverBluff?eq(S.bet,H.why):null;
  },35);
  cat('river-raise','River · PFC','Can Raise · Bluff','river',F=>F.pfc&&post(F)&&F.st.river.raise,H=>H.riverBluff);
  for(const [label,pred] of [['2ndP',H=>H.pair&&H.above===1],['SD',H=>H.oesd||H.gut],['wFD',H=>H.wfd],['3rdP or worse',H=>!H.strong&&(!H.pair||H.above>=2)]])cat('turn-call-'+label,'River · PFC','T call range · '+label,'turn',F=>F.pfc&&post(F)&&F.st.turn.response?.act==='call',pred);
  const manual={
    'Preflop':['3bet · Linear','3bet · Polar'],
    'Flop · PFR':['Adv Board · WeakCheck','Punching Bag'],
    'Flop · PFC':['Bet Volume · High / Low','Attack · Adv. Brd. / Dis. Adv.'],
    'Turn · PFR':['Barrel · SDV','Punching Bag'],
    'Turn · PFC':['Bet Volume · High / Low','Let me Realize','Turn Call · AbsV / Playability / Wide','Probe Turn · Merge / Polar'],
    'River · PFR':['Marginal hands · ThinV / TurnBluffcatcher','Turn hand to Bluff','Force Squid'],
    'River · PFC':['Bet Vol · High / Low','Frequency · Overfold / Underfold','Bluffcatch · DrawsHit / DrawsMiss','Sizing · Elastic / Inelastic','Can Raise · Thin','Call range · Wide / Tight'],
    'Physical Tells':['Timing Long · Strong / Weak','Timing Fast · Strong / Weak','Chatty = Strong','Acting']
  };
  let i=0;for(const [section,labels] of Object.entries(manual))for(const label of labels)add('manual-'+(++i),section,label,'Manual only — never assigned automatically.',null,{mode:'manual'});
  const common = 'Holding is evaluated on this street. Strong = top pair+; Draw = FD/OESD/gutshot unless Strong; Merge = own-card second pair or worse without draw; Air = no own pair or draw. On four-flush/four-straight boards, one pair is not Strong; two pair/sets/trips are ignored. ';
  for(const r of rules) {
    if(r.definition.startsWith('3 distinct qualifying'))r.definition = common + '3 distinct supporting hands for this category.';
    if(r.id.startsWith('float-'))r.definition = 'Call a flop cbet as preflop caller with Air, neither hole card A or K. No own pair, FD, OESD or gutshot; backdoors allowed. 3 calls in this position.';
    if(r.id.startsWith('lead-flush-'))r.definition = 'Lead with a flush newly completed by this street’s card; a previously made flush does not count. Previous aggressor must still be in and waiting to act. 3 examples.';
    if(r.id==='protect-flush')r.definition = 'As preflop aggressor, check a flush completed by the turn card, when able to bet. One example establishes Yes.';
    if(r.id==='b3b')r.definition = 'As PFR, bet flop, face a raise, reraise with two pair or better. 3 examples; weaker examples do not cancel Yes.';
    if(r.id==='trap')r.definition = 'As PFR, check river with two pair+ when able to bet. Check-throughs count. Apply texture exclusions; 3 examples.';
    if(r.id==='lead-blankstrong')r.definition = 'Lead a blank river with two pair or better. Previous aggressor still in and waiting. Apply texture exclusions; 3 examples.';
    if(r.id==='low-protect'||r.id==='oop-protect')r.definition = 'Check with top pair/second-best kicker or better, including stronger hands. 3 examples.' + (r.id==='low-protect'?' Flop high card 9 or lower.':' OOP, all flop textures.');
    if(r.id.includes('WKtp'))r.definition = 'OOP first flop bet in a limped multiway pot: top pair with kicker 9 or lower, without FD/OESD/gutshot. Original OOP grouping. 3 examples.';
    if(r.id.startsWith('line-')||r.id.startsWith('river-hand-')||r.id.startsWith('river-card-')||r.id==='river-raise')r.definition += ' River bluff = fifth pair or worse on ordinary boards; any one pair or worse on four-flush/four-straight boards. Ignore two pair/sets/trips on those texture boards.';
    if(r.id==='turn-call-wFD')r.definition = 'Call turn with FD: highest own card of draw suit J or lower. Pair+draw may also support another chip. 3 calls.';
    if(r.id==='turn-call-3rdP or worse')r.definition = 'Call turn with third pair or worse, including unpaired holdings. Ignore ambiguous/texture-excluded hands. 3 calls.';
    if(r.id==='turn-call-2ndP')r.definition = 'Call turn with second pair made using own cards. Draw overlap allowed. 3 calls.';
    if(r.id==='turn-call-SD')r.definition = 'Call turn with an OESD or gutshot. 3 calls.';
  }
  function evaluate(id,hands,{squid='all',overrides={}}={}){
    const distinct=[...new Map(hands.filter(h=>h&&h.id).map(h=>[h.id,h])).values()];
    const Fs=distinct.filter(h=>(h.villainIds||[]).includes(id)||(h.villains||[]).some(v=>v.opponentId===id)).map(h=>{try{return facts(h,id);}catch(e){return null;}}).filter(Boolean);
    return rules.map(base=>{
      const safe={};
      for(const key of ['min','low','high','threshold','strong','hard','minOpp','minHits']) {
        const v=overrides[base.id]?.[key];
        if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&(key==='min'||key==='minOpp'||key==='minHits'?Number.isInteger(v)&&v>=1:v<=100))safe[key]=v;
      }
      const cfg={...base,...safe},ev=[],unclassified=[];let ignored=0;
      if(base.mode==='manual')return {...base,state:'Manual',k:0,n:0,ev:[]};
      for(const F of Fs){
        if(base.mode!=="cap"&&!F.h.imported)continue;
        const sq=squidState(F);if(base.squid&&sq!==base.squid||!base.combined&&squid!=='all'&&sq!==squid)continue;
        F.skippedCards=false;F.skippedTexture=false;
        let r;try{r=base.test(F);if(r&&base.custom){const H=holding(F,'river');r=H?eq(base.custom(F,H),H.why):null;}}catch(e){ignored++;continue;}
        if(r)ev.push({id:F.h.id,h:F.h,ok:r.ok,why:r.why});
        else if(F.skippedCards||F.skippedTexture)unclassified.push({id:F.h.id,h:F.h,why:F.skippedTexture?"Two pair/set/trips ignored on four-flush/four-straight board":"Missing, invalid or ambiguous cards"});
      }
      const k=ev.filter(e=>e.ok).length,n=ev.length,pct=n?100*k/n:null;
      let state='Not established';
      if(n){
        if(cfg.mode==='cap')state=k>=cfg.min?'Yes':'Not established';
        else if(n>=(cfg.minOpp||0)){
          if(cfg.mode==='bands')state=pct<cfg.low?'Tight':(cfg.highInclusive?pct>=cfg.high:pct>cfg.high)?'Wide':'Normal';
          else if(cfg.mode==='activity')state=pct>=cfg.threshold?'Aggro':'Passive';
          else if(cfg.mode==='fold3')state=pct>=cfg.strong?'Strong Yes':pct>=cfg.threshold?'Yes':pct<cfg.hard?'Hard No':'No';
          else if(cfg.mode==='interval')state=pct>=cfg.low&&pct<cfg.high?'Yes':'No';
          else {const yes=cfg.more?(cfg.strict?pct>cfg.threshold:pct>=cfg.threshold):(cfg.strict?pct<cfg.threshold:pct<=cfg.threshold);state=yes&&k<(cfg.minHits||0)?'Not established':cfg.wide?(yes?'Wide':'Tight'):(yes?'Yes':'No');}
        }
      }
      if(ignored)state="Review data";
      return {...cfg,state,k,n,pct,ev,ignored,unclassified};
    });
  }
  return {rules,evaluate,facts,holding,position,texture};
})();
