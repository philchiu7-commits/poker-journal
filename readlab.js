/* Read Lab v1 — derived trial results only. Never writes opponent reads. */
const ReadLab = (() => {
  const AGG = new Set(['bet','raise','3bet','4bet','5bet','jam','open','limp-raise']);
  const ST = ['pre','flop','turn','river'], N = {flop:3,turn:4,river:5};
  const rank = c => '23456789TJQKA'.indexOf(c[0]) + 2;
  const rules = [];
  const add = (id, section, label, definition, test, config = {}) => rules.push({id,section,label,definition,test,min:1,mode:'cap',...config});
  const countOop = (n, strict=false) => strict ? n<=4?1:2 : n===3?1:n<=5?2:3;
  const position = (F,s,strict=false,custom=false) => {
    const a=F.st[s].alive;
    const ring=['SB','BB','STD','U9','U8','U7','U6','HJ','CO','BN'];
    const sorted=a.slice().sort((x,y)=>ring.indexOf(F.pos(x))-ring.indexOf(F.pos(y)));
    if (!sorted.includes(F.me) || a.some(x=>!ring.includes(F.pos(x)))) return null;
    return sorted.indexOf(F.me) < (a.length===2?1:custom?countOop(a.length,strict):a.length-1) ? 'OOP':'IP';
  };
  const isAllInAction = a => a.act === 'jam' || a.src?.act === 'jam' || a.size === 'Jam' || a.allInCall;
  function facts(h,id) {
    const idx=(h.villains||[]).findIndex(v=>v.opponentId===id); if(idx<0)return null;
    const player=h.villains[idx];
    const F={h,idx,me:'v'+idx,st:{},squid:playerSquidState(player.squid,player.squidPresence)};
    F.pos=a=>a==='hero'?h.heroPos:h.villains?.[Number(a.slice(1))]?.pos;
    const { forced, price: entryPrice } = preflopEntryPosts(h);
    F.forced = forced;
    F.price = entryPrice;
    const source=actsAsPlayed(h);
    const pre=preflopActionsWithLevels(source.filter(a=>a.street==='pre'),entryPrice);
    F.pre=pre;F.preAgg=pre.filter(a=>AGG.has(a.act)).at(-1)?.actor;
    F.pfr=F.preAgg===F.me;F.pfc=!F.pfr&&pre.some(a=>a.actor===F.me&&a.act==='call');F.limped=!pre.at(-1)?.levelAfter;
    F.opened = openDecision(pre, F.me, F.pos(F.me), { forced, price: entryPrice });
    F.first=pre.find(a=>a.actor===F.me);F.openLimp=F.first&&F.first.levelBefore===0&&['limp','call'].includes(F.first.act)&&(F.forced[F.pos(F.me)]||0)<F.price;
    const actors=[...new Set(pre.map(a=>a.actor))],folded=new Set(),allin=new Set();let prevAgg=F.preAgg,init=F.preAgg;
    for(const st of ST){
      const acts=st==='pre'?pre:source.filter(a=>a.street===st).map(a=>({...a,src:a.src||a}));
      const alive=actors.filter(x=>!folded.has(x)),my=acts.filter(a=>a.actor===F.me),first=my[0];
      const firstI=acts.findIndex(a=>a.actor===F.me),before=firstI<0?[]:acts.slice(0,firstI),bets=acts.filter(a=>AGG.has(a.act));
      const can=st!=='pre'&&first&&!allin.has(F.me)&&alive.some(x=>x!==F.me&&!allin.has(x))&&!before.some(a=>AGG.has(a.act))&&['check',...AGG].includes(first.act);
      const bet=can&&AGG.has(first.act), prior=prevAgg||init;
      const active = alive.filter(actor => !allin.has(actor));
      const current={acts,my,first,alive,active,can:!!can,bet:!!bet,firstI,bets,prevAgg,init,board:(h.board||[]).slice(0,N[st]||0)};
      current.through = acts.length > 0 && acts.every(a => a.act === 'check') &&
        active.every(actor => acts.some(a => a.actor === actor));
      current.checkBackChance = !!can && active.every(actor =>
        actor === F.me || before.some(a => a.actor === actor && a.act === 'check'));
      current.leadChance = !!(can && prevAgg && prevAgg !== F.me && active.includes(prevAgg) &&
        !before.some(a => a.actor === prevAgg));
      current.bxtChance = !!(can && prior && prior !== F.me && active.includes(prior) &&
        before.some(a => a.actor === prior && a.act === 'check'));
      const facedI = acts.findIndex((a, j) => a.actor !== F.me && AGG.has(a.act) &&
        acts.slice(j + 1).some(b => b.actor === F.me));
      current.faced = facedI >= 0 ? acts[facedI] : null;
      current.response = facedI >= 0 ? acts.slice(facedI + 1).find(a => a.actor === F.me) : null;
      if (current.response && active.includes(F.me)) {
        const beforeResponse = acts.slice(0, acts.indexOf(current.response));
        const finished = new Set(beforeResponse.filter(a => a.act === 'fold' || isAllInAction(a)).map(a => a.actor));
        if (!finished.has(F.me)) {
          current.raiseChance = active.some(actor => actor !== F.me && !finished.has(actor));
          current.xrChance = current.raiseChance && acts.slice(0, facedI).some(a => a.actor === F.me && a.act === 'check');
        } else current.response = null;
      } else current.response = null;
      F.st[st]=current;
      for (const a of acts) {
        if (a.act === 'fold') folded.add(a.actor);
        if (isAllInAction(a)) allin.add(a.actor);
      }
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
    return {raw,draw,pair,above,pairRank,strong,ignored,kind,hasDraw,riverBluff,topPair,kicker,
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
  function classifiableHolding(F, street) {
    const H = holding(F, street);
    if (!H) { F.skippedCards = true; return null; }
    if (H.ignored) { F.skippedTexture = true; return null; }
    return H;
  }
  const frequency=(id,sec,label,def,test,threshold,more=true,extra={})=>add(id,sec,label,def,test,{mode:'freq',threshold,more,...extra});
  const cap=(id,sec,label,def,test,extra={})=>add(id,sec,label,def,test,extra);
  // A holding-specific rate uses decisions made with that holding as its sample.
  const holdingDefinition = 'Known holdings only; ignored textures do not enter the sample.';
  const holdingDecision = (F, street, decision, matches) => {
    if (!decision) return null;
    const H = classifiableHolding(F, street);
    return H && matches(H, F) ? eq(decision.ok, H.why + ' · ' + decision.why) : null;
  };
  const holdingCap = (id, section, label, street, decision, matches, action, options = {}) =>
    cap(id, section, label, holdingDefinition,
      F => holdingDecision(F, street, decision(F), matches), { ...options, action });
  const common = 'Holding is evaluated on this street. Strong = top pair+; Draw = FD/OESD/gutshot unless Strong; Merge = own-card second pair or worse without draw; Air = no own pair or draw. On four-flush/four-straight boards, one pair is not Strong; two pair/sets/trips are ignored. ';
  const raiseCriteria = 'Strong = top pair with either of the two best kickers, or a better made hand. Two pair on a paired board does not qualify as Strong.';
  const raiseHoldingDefinition = common.replace('Strong = top pair+;', raiseCriteria);
  const xrCapability = { min: 3, positiveOnly: true, definition: raiseHoldingDefinition + holdingDefinition };
  const raiseStrong = (H, F) => {
    if (!H.strong) return false;
    const boardRanks = new Set(F.st.flop.board.map(rank));
    if (H.raw.cat === 2 && boardRanks.size < F.st.flop.board.length) return false;
    if (!H.topPair) return true;
    const kickers = Array.from({ length: 13 }, (_, i) => 14 - i).filter(r => !boardRanks.has(r));
    return H.kicker >= kickers[1];
  };
  const raiseDraw = (H, F) => H.hasDraw && !raiseStrong(H, F);
  const flopRaiseBucket = F => {
    const H = holding(F, 'flop');
    if (!H || H.ignored) return 'unknown';
    return raiseStrong(H, F) ? 'value' : raiseDraw(H, F) ? 'draw' : H.bluff ? 'bluff' : 'other';
  };
  const betDecision = (F, street) => eq(F.st[street].bet, F.st[street].bet ? 'Bet' : 'Checked');
  const checkDecision = (F, street) => eq(!F.st[street].bet, F.st[street].bet ? 'Bet' : 'Checked');
  const responseDecision = (street, matches) => {
    const response = street.response;
    if (!response || !['call', 'fold'].includes(response.act) && !AGG.has(response.act)) return null;
    return eq(matches(response.act), 'Response: ' + response.act);
  };
  const raiseDecision = street => street.raiseChance &&
    !(street.response.act === 'call' && isAllInAction(street.response)) &&
    responseDecision(street, act => AGG.has(act));
  function riverRaiseDecision(F) {
    const river = F.st.river;
    const active = new Set(river.active);
    let facingWager = false, firstOpportunity = null;
    for (const action of river.acts) {
      const aggressive = AGG.has(action.act);
      if (action.actor === F.me && facingWager) {
        facingWager = false;
        if (active.has(F.me) && active.size > 1 &&
            (aggressive || !isAllInAction(action))) {
          if (aggressive) return eq(true, 'Response: ' + action.act);
          if (action.act === 'call' || action.act === 'fold')
            firstOpportunity ??= eq(false, 'Response: ' + action.act);
        }
      } else if (action.actor !== F.me && aggressive) {
        facingWager = true;
      }
      if (action.act === 'fold' || isAllInAction(action)) active.delete(action.actor);
    }
    return firstOpportunity;
  }
  const flopRaiseDecision = (F, kind) => {
    const flop = F.st.flop;
    if (kind !== 'all' && !!flop.xrChance !== (kind === 'xr')) return null;
    const decision = raiseDecision(flop);
    return decision?.ok ? { ...decision, bucket: flopRaiseBucket(F) } : decision;
  };
  const callDecision = street => responseDecision(street, act => act === 'call');
  const raised = ['Raised', 'Did not raise'];
  const checked = ['Checked', 'Bet'];
  const bet = ['Bet', 'Checked'];
  const called = ['Called', 'Did not call'];
  const rate = (id, section, label, definition, test, action) =>
    add(id, section, label, definition + ' Includes imported hands with unknown hole cards.', test, { mode: 'rate', action });
  for (const spec of FLOP_BOARD_SIZING)
    add(spec.id, 'Flop Sizing', `${spec.group} · ${spec.label}`,
      spec.definition + (spec.kind
        ? ' Shown cards only; unknown or unreadable holdings are not counted as Value or Bluff.'
        : ' Includes imported hands with unknown hole cards.'),
      F => {
        if (!Object.hasOwn(F, 'boardSizing')) F.boardSizing = flopBoardSizing(F.h, F.me);
        const b = F.boardSizing;
        return b && b.board === spec.board && b.pot === spec.pot && (!spec.kind || b.kind === spec.kind)
          ? eq(b.size === spec.size, b.why) : null;
      }, { mode: 'rate', action: ['This size', 'Other size'] });
  const validHole = cards => cards.length === 2 && cards[0] !== cards[1] &&
    cards.every(c => /^[2-9TJQKA][cdhs]$/.test(c));
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
      if (!F.openLimp || isAllInAction(F.first) || !validHole(F.cards)) return null;
      const a = F.pre.find(action => action.actor === F.me && action.levelBefore >= 1);
      if (!a) return null;
      const r=F.cards.map(rank).sort((a,b)=>b-a),[x,y]=r;if(x===y&&x>=6&&x<=8||x===14&&[10,11].includes(y))return null;
      return { value: x === y && x >= 9 || x === 14 && y >= 12,
        raised: AGG.has(a.act), why: F.cards.join(' ') + ' · Response: ' + a.act };
    };
    for(const [name,v] of [['LrrV',true],['LrrB',false]])cap('lrr-'+name+'-'+sq,'Squid',lab+' · '+name,'AQ/AK and 99+ = value. Ignore AJ/AT and 66–88; other known holdings = bluff.',F=>{const a=lrr(F);return a?.value === v ? eq(a.raised, a.why) : null;},{squid:sq, action: raised});
    const chance=F=>F.first&&F.first.levelBefore===0&&(F.forced[F.pos(F.me)]||0)<F.price;
    bands('limp-'+sq,'Preflop','Limps '+lab,'Limp or overlimp / genuine unraised-pot entry opportunities. Free checks excluded.',F=>chance(F)?eq(['limp','call'].includes(F.first.act),'First response: '+F.first.act):null,sq==='have'?35:40,sq==='have'?45:55,{squid:sq});
    bands('open-'+sq,'Preflop','Open '+lab,'Open + isolation raises / genuine unraised-pot entry opportunities.',F=>F.opened===null?null:eq(F.opened,'First response: '+F.first.act),sq==='have'?19:17,sq==='have'?24:23,{squid:sq});
  }
  bands('threebet','Preflop','3bet','3bets including squeezes and all-in reraises / chances facing the first raise. Limp-reraises excluded. Combined squid.',F=>{
    const a = F.first;
    return a?.levelBefore === 1 ? eq(AGG.has(a.act) && a.levelAfter === 2, 'Response: ' + a.act) : null;
  },8.5,14,{highInclusive:true,combined:true});
  for(const pos of ['IP','OOP']) add('fold3-'+pos,'Preflop','Fold to 3bet · '+pos,'First answer after an opening or isolation raise; intervening 4bets excluded. Strong Yes ≥65; Yes ≥58; No ≥50; Hard No <50.',F=>{
    if(F.openLimp)return null;
    const spot=foldToThreeBetSpot(F.pre,F.me);if(!spot)return null;
    const ring=['SB','BB','STD','U9','U8','U7','U6','HJ','CO','BN'];const x=ring.indexOf(F.pos(F.me)),y=ring.indexOf(F.pos(spot.three.actor));if(x<0||y<0||(x>y?'IP':'OOP')!==pos)return null;
    return eq(spot.response.act==='fold','First answer to 3bet: '+spot.response.act);
  },{mode:'fold3',threshold:58,strong:65,hard:50});
  cap('fourlight','Preflop','Can 4bet light','A genuine 4-bet with an unpaired holding below AJ; AJ/AQ/AK and all pocket pairs do not qualify. Combined squid.',F=>{
    const a = F.pre.find(a => a.actor === F.me && a.levelBefore === 2);
    if (!a || !validHole(F.cards)) return null;
    const [x, y] = F.cards.map(rank).sort((a,b) => b-a);
    if (x === y || x === 14 && y >= 11) return null;
    return eq(AGG.has(a.act) && a.levelAfter === 3, F.cards.join(' ') + ' · Response: ' + a.act);
  },{combined:true, action: ['4-bet', 'Did not 4-bet']});
  frequency('range-x','MWP Limp','Probe OOP F · Range X','Whole checking range: ≥95% checks. Strict OOP: first1 in 3–4 way, first2 in 5–9 way. Cards not required.',F=>limpMw(F)&&position(F,'flop',true,true)==='OOP'&&F.st.flop.can?eq(!F.st.flop.bet,'First action: '+F.st.flop.first.act):null,95);
  const comp=[['Draw',H=>H.kind==='draw'],['Merge',H=>H.kind==='pair'],['WKtp',H=>H.weakTop],['TopP+',H=>H.strong]];
  for (const [label, pred] of comp)
    holdingCap('limp-oop-' + label, 'MWP Limp', 'Probe OOP F · ' + label, 'flop',
      F => oopLimp(F) && betDecision(F, 'flop'), pred, ['Probed', 'Checked']);
  rate('limp-xr-rate', 'MWP Limp', 'xR · xR',
    'Flop check-raises out of chances to raise after checking in a multiway limped pot.',
    F => limpMw(F) && flopRaiseDecision(F, 'xr'), ['Check-raised', 'Did not raise']);
  for (const [label, pred] of [['Air', H => H.air], ['Draw', raiseDraw], ['BottomP / 2ndP', H => H.kind === 'pair'], ['Strong', raiseStrong], ['Bluff', H => H.bluff]])
    holdingCap('limp-xr-' + label, 'MWP Limp', 'xR · ' + label, 'flop',
      F => limpMw(F) && F.st.flop.xrChance && raiseDecision(F.st.flop), pred, ['Check-raised', 'Did not raise'], xrCapability);
  for (const [label, pred] of [['Air', H => H.air], ['Merge', H => H.kind === 'pair'], ['Strong', H => H.strong]])
    holdingCap('limp-ip-' + label, 'MWP Limp', 'IP Stab · ' + label, 'flop',
      F => ipLimp(F) && betDecision(F, 'flop'), pred, ['Stabbed', 'Checked']);
  const afterRaise=(F,s)=>{
    const S=F.st[s];if(!S.bet)return null;const j=S.acts.findIndex((a,i)=>i>S.firstI&&a.actor!==F.me&&AGG.has(a.act));if(j<0)return null;
    if(!S.acts.slice(0,S.firstI).some(a=>a.actor===S.acts[j].actor&&a.act==='check'))return null;
    const after=S.acts.slice(j+1),r=after.find(a=>a.actor===F.me);if(!r||after.slice(0,after.indexOf(r)).some(a=>AGG.has(a.act)))return null;return r;
  };
  frequency('limp-fxr','MWP Limp','IP Stab · FxR','First response to a check-raise after an IP stab: fold / genuine responses. >60% Yes.',F=>{const r=ipLimp(F)?afterRaise(F,'flop'):null;return r?eq(r.act==='fold','Response: '+r.act):null;},60,true,{strict:true});
  for(const field of ['HU','MW'])for(const pos of ['OOP','IP'])frequency('cbet-'+field+'-'+pos,'Flop · PFR','Cbet '+field+' · '+pos,'Cbet / flop betting opportunities as last preflop aggressor. Wide at cutoff or higher; Tight below.',F=>pfrCbet(F)&&(F.st.flop.alive.length===2?'HU':'MW')===field&&position(F,'flop',false,true)===pos?eq(F.st.flop.bet,'First flop action: '+F.st.flop.first.act):null,field==='HU'?(pos==='OOP'?45:65):(pos==='OOP'?35:50),true,{wide:true});
  frequency('flop-fxr','Flop · PFR','Fold to xR','Cbet, then face a raise; first response. >60% folds Yes.',F=>{const r=F.pfr?afterRaise(F,'flop'):null;return r?eq(r.act==='fold','Response: '+r.act):null;},60,true,{strict:true});
  holdingCap('b3b', 'Flop · PFR', 'B3b Nut', 'flop',
    F => F.pfr && F.st.flop.bet && raiseDecision(F.st.flop), H => H.two, raised);
  const lowCbetChance = F => low(F) && pfrCbet(F);
  frequency('low-wide', 'Flop · PFR', 'Low Board · Too wide',
    'On flops with a highest card of 9 or lower, measure c-bets with holdings below top pair. Draws below top pair qualify. More than 50% is Yes.',
    F => holdingDecision(F, 'flop', lowCbetChance(F) && betDecision(F, 'flop'), H => !H.strong),
    50, true, { strict: true, action: bet });
  frequency('low-abc','Flop · PFR','Low Board · ABC','Known bad hands below top pair without FD/OESD or gutshot+2overs: check-fold ≥80% of responses to a bet, ≥3 opportunities.',F=>{
    if(!F.pfr||!low(F)||!F.st.flop.can)return null;const H=holding(F,'flop'),S=F.st.flop;if(!H||H.strong||H.fd||H.oesd||H.gut&&F.cards.every(c=>rank(c)>Math.max(...S.board.map(rank))))return null;
    if(!S.first||AGG.has(S.first.act))return eq(false,H.why+'; bet instead of check-fold');
    if(!S.response)return null;return eq(S.first.act==='check'&&S.response.act==='fold',H.why+'; '+S.response.act);
  },80,true,{minOpp:3});
  holdingCap('low-protect', 'Flop · PFR', 'Low Board · Protective', 'flop',
    F => lowCbetChance(F) && checkDecision(F, 'flop'), H => H.strong, checked);
  holdingCap('oop-protect', 'Flop · PFR', 'OOP Protective', 'flop',
    F => F.pfr && position(F, 'flop') === 'OOP' && F.st.flop.can && checkDecision(F, 'flop'),
    H => H.strong || (H.pair && H.above === 1), checked);
  const flopAllRoles = 'Flop · All roles';
  const flopExploitXr = F => !limpMw(F) && flopRaiseDecision(F, 'xr');
  const flopXrHoldings = [
    ['Air', H => H.air], ['Draw', raiseDraw], ['BottomP / 2ndP', H => H.kind === 'pair'], ['Strong', raiseStrong],
  ];
  for (const [label, pred] of flopXrHoldings) {
    holdingCap('flop-xr-' + label, flopAllRoles, 'xR · ' + label, 'flop',
      flopExploitXr, pred, ['Check-raised', 'Did not raise'], xrCapability);
    holdingCap('pfr-xr-' + label, 'Flop · PFR', 'xR · ' + label, 'flop',
      F => F.pfr && post(F) && F.st.flop.xrChance && raiseDecision(F.st.flop),
      pred, ['Check-raised', 'Did not raise'], xrCapability);
  }
  for (const [label, pred] of [['Air', H => H.air], ['Equity', raiseDraw], ['BottomP / 2ndP', H => H.kind === 'pair'], ['Strong', raiseStrong]])
    holdingCap('pfc-xr-' + label, 'Flop · PFC', 'xR or R · ' + label, 'flop',
      F => F.pfc && post(F) && raiseDecision(F.st.flop), pred, raised, xrCapability);
  const raiseMixDefinition = raiseCriteria + ' The ratio uses recorded flop raises with known cards. ' +
    'Bluffs include draws below Strong and weaker-than-second-pair bluff holdings. Other holdings are listed separately.';
  function flopRaiseRate(id, section, label, role, kind) {
    const definition = kind === 'xr' ? 'Flop check-raises out of chances to raise after checking.' :
      kind === 'r' ? 'Flop raises out of chances to raise without first checking.' :
      'Flop raises and check-raises out of all chances to raise.';
    const scope = role === 'pfr' ? ' As the last preflop raiser, in raised pots only.' :
      role === 'pfc' ? ' As a preflop caller, in raised pots only.' : '';
    rate(id, section, label, definition + scope, F => (!role || F[role] && post(F)) && flopRaiseDecision(F, kind),
      kind === 'xr' ? ['Check-raised', 'Did not raise'] : raised);
  }
  function flopRaiseMix(id, section, label, eligible, kind) {
    add(id, section, label, raiseMixDefinition, F => {
      const flop = F.st.flop;
      if (!eligible(F) || !flopRaiseDecision(F, kind)?.ok) return null;
      const H = classifiableHolding(F, 'flop');
      if (!H) return null;
      const bucket = raiseStrong(H, F) ? 'value' : raiseDraw(H, F) ? 'draw' : H.bluff ? 'bluff' : 'other';
      return { ok: bucket === 'value', bucket, why: H.why + (flop.xrChance ? ' · Check-raised' : ' · Raised without checking') };
    }, { mode: 'mix' });
  }
  rate('flop-xr-rate', flopAllRoles, 'xR · xR',
    'Flop check-raises out of chances to raise after checking.', flopExploitXr,
    ['Check-raised', 'Did not raise']);
  flopRaiseRate('pfr-xr-rate', 'Flop · PFR', 'xR · xR% PFR', 'pfr', 'xr');
  flopRaiseRate('pfc-xrr-rate', 'Flop · PFC', 'xR or R · Combined', 'pfc', 'all');
  flopRaiseRate('pfc-xr-rate', 'Flop · PFC', 'xR or R · xR% PFC', 'pfc', 'xr');
  flopRaiseRate('pfc-r-rate', 'Flop · PFC', 'xR or R · R only', 'pfc', 'r');
  flopRaiseMix('flop-xr-mix', flopAllRoles, 'xR · Mix', F => !limpMw(F), 'xr');
  flopRaiseMix('limp-xr-mix', 'MWP Limp', 'xR · Mix', limpMw, 'xr');
  flopRaiseMix('pfr-xr-mix', 'Flop · PFR', 'xR · Mix', F => F.pfr && post(F), 'xr');
  const raisedPotCaller = F => F.pfc && post(F);
  flopRaiseMix('pfc-xrr-mix', 'Flop · PFC', 'xR or R · Combined', raisedPotCaller, 'all');
  flopRaiseMix('pfc-xr-mix', 'Flop · PFC', 'xR or R · xR only', raisedPotCaller, 'xr');
  flopRaiseMix('pfc-r-mix', 'Flop · PFC', 'xR or R · R only', raisedPotCaller, 'r');
  for (const s of ['flop', 'turn']) {
    const section = s === 'flop' ? 'Flop · PFC' : 'Turn · PFC';
    const bxtChance = F => F.pfc && post(F) && F.st[s].bxtChance;
    rate('bxt-rate-' + s, section, 'BXT · BXT%',
      'Bets out of opportunities after the prior aggressor checked on the ' + s + '.',
      F => bxtChance(F) && betDecision(F, s), bet);
    const bluffShare = F => {
      if (!bxtChance(F) || !F.st[s].bet) return null;
      const H = classifiableHolding(F, s);
      if (!H || H.strong) return null;
      return eq(H.bluff || H.kind === 'draw', H.why);
    };
    frequency('bxt-over-' + s, section, 'BXT · Overbluff',
      'Bluffs and draws as a share of bets when checked to with known holdings below Strong. Strong means top pair or better, subject to the four-flush and four-straight rules. Yes at 60% or higher with at least three supporting hands.',
      bluffShare, 60, true, { minHits: 3 });
    holdingCap('bxt-merged-' + s, section, 'BXT · Merged', s,
      F => bxtChance(F) && betDecision(F, s), H => H.kind === 'pair', bet);
    holdingCap('bxt-air-' + s, section, 'BXT · Air', s,
      F => bxtChance(F) && betDecision(F, s), H => H.air, bet);
  }
  const categories = [['Draw', H => H.kind === 'draw'], ['Merge', H => H.kind === 'pair'], ['Strong', H => H.strong], ['Bluff', H => H.bluff]];
  const led = ['Led', 'Checked'];
  const riverAllRoles = 'River · All roles';
  for (const s of ['flop', 'turn', 'river']) {
    const section = s === 'river' ? riverAllRoles : s[0].toUpperCase() + s.slice(1) + ' · PFC';
    const lead = F => (s === 'river' || F.pfc && post(F)) && F.st[s].leadChance && betDecision(F, s);
    cap('lead-have-' + s, section, 'Lead · Have',
      'One confirmed lead before the previous aggressor acts. Cards optional. The aggressor must still be in the hand.' +
      (s === 'river' ? '' : ' Raised pots only.'), lead);
    for (const [label, pred] of categories.filter(([l]) => s !== 'river' || !['Draw', 'Merge'].includes(l)))
      holdingCap('lead-' + label + '-' + s, section, 'Lead · ' + label, s, lead,
        s === 'river' && label === 'Bluff' ? H => H.riverBluff : pred, led);
    if (s !== 'flop') holdingCap('lead-flush-' + s, section, 'Lead · Flush', s, lead, (H, F) => {
      const prev = holding(F, s === 'turn' ? 'flop' : 'turn');
      return prev && !prev.flush && H.flush;
    }, led);
    if (s === 'river') holdingCap('lead-blankstrong', section, 'Lead · BlankStrong', s,
      F => texture(F, s).blank && lead(F), H => H.two && H.strong, led);
  }
  frequency('one-done', 'Turn · PFR', 'One and Done?', 'Turn check / opportunities after flop cbet called without raise. >60% Yes.', F => barrel(F) ? eq(!F.st.turn.bet, 'Turn: ' + F.st.turn.first.act) : null, 60, true, { strict: true });
  const bluffOrDraw = H => H.bluff || H.kind === 'draw';
  holdingCap('delay-bluff', 'Turn · PFR', 'Delay Bluff', 'turn',
    F => delay(F) && betDecision(F, 'turn'), bluffOrDraw, ['Delayed c-bet', 'Checked']);
  const barrelDecision = F => barrel(F) && betDecision(F, 'turn');
  const barrelAction = ['Barrelled', 'Checked'];
  rate('barrel-rate', 'Turn · PFR', 'Barrel · Frequency',
    'Turn bets out of chances to bet after a flop c-bet was called without a raise.', barrelDecision, barrelAction);
  for (const [label, pred] of [['Air', H => H.air], ['Mergy', H => H.kind === 'pair'], ['Strong', H => H.strong]])
    holdingCap('barrel-' + label, 'Turn · PFR', 'Barrel · ' + label, 'turn', barrelDecision, pred, barrelAction);
  const barrelDraws = [['GS', 'gutshot', H => H.gut], ['OESD', 'open-ended straight draw', H => H.oesd],
    ['FD', 'flush draw', H => H.fd]];
  for (const [label, name, hasDraw] of barrelDraws)
    holdingCap('barrel-' + label, 'Turn · PFR', 'Barrel · ' + label, 'turn', barrelDecision,
      H => H.kind === 'draw' && hasDraw(H), barrelAction, {
        definition: 'After a called flop c-bet, measure turn barrels with a ' + name +
          ' below top pair. A hand with a flush draw and a straight draw can count in both samples.',
      });
  holdingCap('t-barrel-sdv', 'Turn · PFR', 'Barrel · SDV', 'turn', barrelDecision,
    H => H.kind === 'pair' && H.above >= 2, barrelAction, {
      definition: 'After a called flop c-bet, measure turn barrels with third pair or weaker, including bottom pair and underpairs, without a qualifying draw.',
      legacyManual: true,
    });
  const types = [['4Str','4str'], ['3Flush','flush'], ['4Flush','4flush'], ['Overcards','over'], ['Blank','blank']];
  for (const [label, key] of types)
    holdingCap('bluff-turn-' + key, 'Turn · PFR', 'Bluff Turn · ' + label, 'turn', F => {
      if (!barrel(F) && !delay(F)) return null;
      const board = texture(F, 'turn');
      // Suit completion gets the hand when the same turn is also an overcard.
      if (key === 'over' && (board.flush || board['4flush'])) return null;
      return board[key] && betDecision(F, 'turn');
    }, H => (key !== 'over' || !H.pair) && bluffOrDraw(H), bet);
  add('turn-low','Turn · PFR','Low Boards · Passive / Aggro','Turn highest card ≤9; unpaired holdings without FD/OESD. Gutshots allowed. Bet ≥50% Aggro; below Passive.',F=>{
    const H=holding(F,'turn');if(!F.pfr||!F.st.turn.can||!H||H.pair||H.two||H.fd||H.oesd||Math.max(...F.st.turn.board.map(rank))>9)return null;return eq(F.st.turn.bet,H.why+'; '+F.st.turn.first.act);
  },{mode:'activity',threshold:50});
  holdingCap('protect-flush', 'Turn · PFR', 'Protect T Flush', 'turn',
    F => F.pfr && F.st.turn.can && checkDecision(F, 'turn'), (H, F) => {
      const prev = holding(F, 'flop');
      return prev && !prev.flush && H.flush;
    }, checked);
  for (const p of ['OOP', 'IP'])
    holdingCap('float-' + p, 'Turn · PFC', 'Float/Wide F · ' + p, 'flop',
      F => F.pfc && post(F) && position(F, 'flop') === p && F.st.flop.faced?.actor === F.preAgg && callDecision(F.st.flop),
      (H, F) => H.air && F.cards.every(c => rank(c) <= 12), called);
  for (const [label, pred] of [['FD', H => H.fd], ['OESD', H => H.oesd], ['GS', H => H.gut], ['TopP+', H => H.strong]])
    holdingCap('checkback-' + label, 'Turn · PFC', 'Check back F · ' + label, 'flop',
      F => F.pfc && post(F) && F.st.flop.checkBackChance && checkDecision(F, 'flop'), pred, checked);
  bands('probe-turn','Turn · PFC','Probe Turn','Probe / chances to bet before the preflop aggressor after a checked-through flop. Combined squid.',F=>probe(F)?eq(F.st.turn.bet,'Turn: '+F.st.turn.first.act):null,35,45,{combined:true});
  const riverChance=F=>F.pfr&&F.st.river.can;
  const airRiver=F=>{const H=holding(F,'river');return H&&H.air;};
  frequency('river-over','River · PFR','Frequency · Overbluff','Bet / genuine river opportunities WHILE HOLDING AIR, >37%. Not air share among bets.',F=>riverChance(F)&&airRiver(F)?eq(F.st.river.bet,'Air; '+F.st.river.first.act):null,37,true,{strict:true});
  frequency('river-under','River · PFR','Frequency · Underbluff','Bet / genuine river opportunities WHILE HOLDING AIR, <31%.',F=>riverChance(F)&&airRiver(F)?eq(F.st.river.bet,'Air; '+F.st.river.first.act):null,31,false,{strict:true});
  const cleanBet=(F,s)=>F.st[s].bet&&F.st[s].bets.length===1&&F.st[s].acts.some(a=>a.actor!==F.me&&a.act==='call');
  const riverBetDecision = F => riverChance(F) && betDecision(F, 'river');
  const checkCalled = S => S.first?.act === 'check' && S.response?.act === 'call';
  const riverBluffChance = F => F.st.river.can && !checkCalled(F.st.turn);
  const riverBluffDecision = F => riverBluffChance(F) && betDecision(F, 'river');
  const xcxb = F => checkCalled(F.st.flop) && F.st.flop.bets.length === 1 && quiet(F, 'turn');
  const lines={BBB:F=>cleanBet(F,'flop')&&cleanBet(F,'turn'),BXB:F=>cleanBet(F,'flop')&&quiet(F,'turn'),XBB:F=>quiet(F,'flop')&&cleanBet(F,'turn'),XXB:F=>quiet(F,'flop')&&quiet(F,'turn'),xCXB:xcxb,MWP:F=>F.st.river.alive.length>=3};
  for (const [name, gate] of Object.entries(lines))
    holdingCap('line-' + name, 'River · PFR', 'Bluff Lines · ' + name, 'river', F => {
      if (!gate(F)) return null;
      const river = name === 'XXB' ? post(F) && F.st.river.can && betDecision(F, 'river') : riverBetDecision(F);
      if (!river || name !== 'BBB') return river;
      const turn = classifiableHolding(F, 'turn');
      if (!turn || turn.strong || (turn.pair && turn.above < 2)) return null;
      return eq(river.ok, 'Turn: ' + turn.why + ' · River: ' + river.why);
    }, H => H.riverBluff && (name !== 'XXB' || !H.pair), bet);
  holdingCap('line-xCXB-pfc-limp', 'River · PFC', 'Bluff Lines · xCXB (PFC / Limp)', 'river',
    F => (F.limped ? F.openLimp : F.pfc) && xcxb(F) && F.st.river.can && betDecision(F, 'river'),
    H => H.riverBluff, bet, {
      definition: 'As a preflop caller in a raised pot or a limper in an unraised pot, check-call the flop without a raise, then see the turn check through.',
    });
  const missedFlushDraw = (F, H) => holding(F, 'turn')?.fd && !H.flush;
  const hands = {
    FD: (F, H) => missedFlushDraw(F, H) && holding(F, 'flop')?.fd,
    BDFD: (F, H) => missedFlushDraw(F, H) && holding(F, 'flop')?.fd === false,
    SD: (F, H) => { const T = holding(F, 'turn'); return T && (T.oesd || T.gut) && H.raw.cat < 4; },
    HL: F => Math.max(...F.cards.map(rank)) >= 12 && Math.min(...F.cards.map(rank)) <= 7,
    SPEW: F => F.cards.every(c => rank(c) <= 8) && holding(F, 'flop')?.air && holding(F, 'turn')?.air,
    'A-High': (F, H) => F.cards.some(c => rank(c) === 14) && H.air,
  };
  for (const [name, pred] of Object.entries(hands))
    holdingCap('river-hand-' + name, riverAllRoles, 'Bluff hands · ' + name, 'river',
      riverBluffDecision, (H, F) => H.riverBluff && pred(F, H), bet);
  for (const [name, key] of [['3Flush','flush'], ['4Flush','4flush'], ['4Str','4str'], ['Blanks','blank'], ['OverCards','over']])
    holdingCap('river-card-' + key, riverAllRoles, 'Rivers · ' + name, 'river',
      F => texture(F, 'river')[key] && riverBluffDecision(F), H => H.riverBluff, bet);
  for(const hit of [true,false]){
    const gate=F=>{const T=holding(F,'turn'),b=F.st.turn.board;if(!T||b.length!==4)return false;
      const counts={};b.forEach(c=>counts[c[1]]=(counts[c[1]]||0)+1);const r=new Set(b.map(rank));let straight=false;
      for(let lo=1;lo<=10;lo++)if([...r].filter(v=>v>=lo&&v<lo+5).length>=2)straight=true;
      const possible=Object.values(counts).some(n=>n>=2)||straight;
      const tex=texture(F,'river'),complete=!!(tex.flush||tex['4flush']||tex.straight||tex['4str']);return possible&&complete===hit;
    };
    cap('river-type-'+hit,'River · PFR','Bluff Type · '+(hit?'DrawsHit':'DrawsMiss'),'River bluff on this board type. Stat: bets / genuine opportunities while holding a qualifying bluff. DrawsHit takes priority.',F=>{
      if(!F.pfr||!riverBluffChance(F)||!gate(F))return null;const H=holding(F,'river');if(!H||!H.riverBluff)return null;return eq(F.st.river.bet,H.why+'; '+F.st.river.first.act);
    });
  }
  frequency('force-nonsd','River · PFR','Force Bluff · NonSD','Bet / genuine river betting chances holding K-high or worse. >34% Yes.',F=>{const H=holding(F,'river');return riverChance(F)&&H&&H.air&&!F.cards.some(c=>rank(c)===14)?eq(F.st.river.bet,H.why):null;},34,true,{strict:true});
  holdingCap('trap', 'River · PFR', 'Can Trap', 'river',
    F => F.pfr && F.st.river.can && checkDecision(F, 'river'), H => H.two && H.strong, checked);
  holdingCap('bsti', riverAllRoles, 'BSTI', 'river', F => {
    const S = F.st.river;
    if (!S.raiseChance || !S.faced) return null;
    const action = S.faced.src || S.faced;
    const rung = handRungs(F.h).get(action);
    const priced = betsVsPot(F.h).find(b => b.a === action);
    const ratio = rung?.ratio ?? (priced?.pot ? priced.bet / priced.pot : null);
    return ratio != null && ratio <= 1/3 && raiseDecision(S);
  }, H => H.riverBluff, raised);
  frequency('river-xt',riverAllRoles,'Bluff XT','Bet when the previous aggressor checks to the player on the river, while holding a qualifying bluff. ≥35%.',F=>{
    if(!F.st.river.can)return null;const S=F.st.river,prior=S.prevAgg||S.init;
    if(!prior||prior===F.me||!S.acts.slice(0,S.firstI).some(a=>a.actor===prior&&a.act==='check'))return null;
    const H=holding(F,'river');return H?.riverBluff?eq(S.bet,H.why):null;
  },35);
  holdingCap('river-raise', riverAllRoles, 'Can Raise · Bluff', 'river',
    riverRaiseDecision, H => H.riverBluff, raised);
  for (const [label, pred] of [['2ndP', H => H.pair && H.above === 1], ['SD', H => H.oesd || H.gut], ['wFD', H => H.wfd], ['3rdP or worse', H => !H.strong && (!H.pair || H.above >= 2)]])
    holdingCap('turn-call-' + label, 'River · PFC', 'T call range · ' + label, 'turn',
      F => F.pfc && post(F) && callDecision(F.st.turn), pred, called);
  const manual = {
    'Most Important': [
      ['nuts-flop', 'Nuts · Flop'], ['nuts-turn', 'Nuts · Turn'],
      ['bet-vol-high', 'Bet Volume · High'], ['bet-vol-low', 'Bet Volume · Low'],
      ['donks', 'Donks', { manualPair: true }], ['frontload', 'Frontload', { manualPair: true }],
    ],
    'Preflop': [
      ['3bet-linear', '3bet · Linear'], ['3bet-polar', '3bet · Polar'],
    ],
    'Flop · PFR': [
      ['f-adv-weak-check', 'Adv Board · WeakCheck'], ['punchbag-f-pfc', 'Punching Bag'],
    ],
    'Flop · PFC': [
      ['f-bet-vol-high', 'Bet Volume · High'], ['f-bet-vol-low', 'Bet Volume · Low'],
      ['f-attack-adv', 'Attack · Adv. Brd.'], ['f-attack-disadv', 'Attack · Dis. Adv'],
    ],
    'Turn · PFR': [
      ['punchbag-t-pfr', 'Punching Bag'],
    ],
    'Turn · PFC': [
      ['t-bet-vol-high', 'Bet Volume · High'], ['t-bet-vol-low', 'Bet Volume · Low'],
      ['let-realize-t', 'Let me Realize'], ['t-call-style-absv', 'Turn Call · AbsV'],
      ['t-call-style-play', 'Turn Call · Playability'], ['t-call-style-wide', 'Turn Call · Wide'],
      ['t-probe-merge', 'Probe Turn · Merge'], ['t-probe-polar', 'Probe Turn · Polar'],
    ],
    'River · PFR': [
      ['r-thin', 'Marginal hands · ThinV'], ['r-marg-bluffcatcher', 'Marginal hands · TurnBluffcatcher'],
      ['r-hand-to-bluff-pfr', 'Turn hand to Bluff'], ['force-squid', 'Force Squid'],
    ],
    'River · PFC': [
      ['r-bet-vol-high', 'Bet Vol · High'], ['r-bet-vol-low', 'Bet Vol · Low'],
      ['r-fold-bal-overfold', 'Frequency · Overfold'], ['r-fold-bal-underfold', 'Frequency · Underfold'],
      ['r-bc-drawshit', 'Bluffcatch · DrawsHit'], ['r-bc-drawsmiss', 'Bluffcatch · DrawsMiss'],
      ['r-to-sizing-elastic', 'Sizing · Elastic'], ['r-to-sizing-inelastic', 'Sizing · Inelastic'],
      ['r-call-range-wide', 'Call range · Wide'], ['r-call-range-tight', 'Call range · Tight'],
    ],
    [riverAllRoles]: [['r-can-raise-thin', 'Can Raise · Thin']],
    'Physical Tells': [
      ['tell-long-strong', 'Timing Long · S'], ['tell-long-weak', 'Timing Long · W'],
      ['tell-fast-strong', 'Timing Fast · S'], ['tell-fast-weak', 'Timing Fast · W'],
      ['talks-when-strong', 'Chatty = Strong'], ['tell-acting', 'Acting'],
    ],
  };
  for (const [section, reads] of Object.entries(manual))
    for (const [id, label, options] of reads)
      add(id, section, label, 'Set this read manually.', null, { mode: 'manual', ...options });
  for (const r of rules) {
    if (r.definition === holdingDefinition) r.definition = common + holdingDefinition;
    if(r.id.startsWith('float-'))r.definition = 'Call a flop cbet as preflop caller with Air, neither hole card A or K. No own pair, FD, OESD or gutshot; backdoors allowed.';
    if(r.id.startsWith('lead-flush-'))r.definition = 'Lead with a flush newly completed by this street’s card; a previously made flush does not count. Previous aggressor must still be in and waiting to act.';
    if(r.id==='protect-flush')r.definition = 'As preflop aggressor, check a flush completed by the turn card, when able to bet.';
    if(r.id==='b3b')r.definition = 'As PFR, bet flop, face a raise, reraise with two pair or better.';
    if(r.id==='bsti')r.definition = 'Raise a river bet up to one third pot while holding a qualifying bluff.';
    if(r.id==='trap')r.definition = 'As PFR, check river with two pair+ when able to bet. Check-throughs count. Apply texture exclusions.';
    if(r.id==='lead-blankstrong')r.definition = 'Lead a blank river with two pair or better. Previous aggressor still in and waiting. Apply texture exclusions.';
    if (r.id === 'low-protect') r.definition = 'On flops with a highest card of 9 or lower, measure checks with top pair or better. Every top-pair kicker qualifies.';
    if (r.id === 'oop-protect') r.definition = 'As the preflop raiser, measure flop checks when out of position and holding second pair or better. Both checks and bets with those holdings enter the sample.';
    if(r.id.includes('WKtp'))r.definition = 'OOP first flop bet in a limped multiway pot: top pair with kicker 9 or lower, without FD/OESD/gutshot. Original OOP grouping.';
    if (r.id === 'line-BBB') r.definition += ' The turn holding must also be third pair or worse, including unpaired hands.';
    if (r.id === 'line-XXB') r.definition += ' Only unpaired river holdings qualify after the flop and turn check through.';
    else if (r.id.startsWith('line-') || r.id.startsWith('river-hand-') || r.id.startsWith('river-card-') || r.id === 'river-raise')
      r.definition += ' River bluff = fifth pair or worse on ordinary boards; any one pair or worse on four-flush/four-straight boards. Ignore two pair/sets/trips on those texture boards.';
    if (/^river-(hand|card|type)-/.test(r.id)) r.definition += ' Turn check-calls are excluded.';
    if ([flopAllRoles, riverAllRoles].includes(r.section) && r.mode !== 'manual')
      r.definition += ' Includes raisers, callers and limped pots.';
    if (r.id.startsWith('flop-xr-'))
      r.definition += ' Excludes multiway limped pots, which have their own MWP Limp reads.';
    if (r.id === 'river-raise') r.definition += ' Includes check-raises and reraises. Each hand counts once.';
    if (r.id === 'river-hand-FD') r.definition += ' Flush draw on both flop and turn that missed on the river.';
    if (r.id === 'river-hand-BDFD') r.definition += ' Backdoor flush draw on the flop that became a flush draw on the turn and missed on the river.';
    if(r.id==='turn-call-wFD')r.definition = 'Call turn with FD: highest own card of draw suit J or lower. Pair+draw may also support another chip.';
    if(r.id==='turn-call-3rdP or worse')r.definition = 'Call turn with third pair or worse, including unpaired holdings. Ignore ambiguous/texture-excluded hands.';
    if(r.id==='turn-call-2ndP')r.definition = 'Call turn with second pair made using own cards. Draw overlap allowed.';
    if(r.id==='turn-call-SD')r.definition = 'Call turn with an OESD or gutshot.';
    if (r.id === 'bluff-turn-over') r.definition += ' Only unpaired holdings qualify, even when the hand also has a draw. Turns that make a three-flush or four-flush count in those categories instead.';
    if (r.action && r.mode !== 'rate') r.definition += ' Sample: eligible decisions with this holding. The percentage is the share that took the named action.';
  }
  const DEFAULT_SAMPLE_MIN = 15;
  const sampleKey = (rule, squid) => `${rule.combined ? 'all' : rule.squid || squid}:${rule.id}`;

  function evaluate(id,hands,{squid='all',overrides={},samples={}}={}){
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
        const sq=F.squid;if(base.squid&&sq!==base.squid||!base.combined&&squid!=='all'&&sq!==squid)continue;
        F.skippedCards=false;F.skippedTexture=false;
        let r;try{r=base.test(F);}catch(e){ignored++;continue;}
        if(r)ev.push({id:F.h.id,h:F.h,...r});
        else if(F.skippedCards||F.skippedTexture)unclassified.push({id:F.h.id,h:F.h,why:F.skippedTexture?"Two pair/set/trips ignored on four-flush/four-straight board":"Missing, invalid or ambiguous cards"});
      }
      const k = ev.filter(e => e.ok).length, n = ev.length, pct = n ? 100 * k / n : null;
      const key = sampleKey(cfg, squid);
      if (cfg.mode === 'mix') {
        const mix = { value: 0, bluff: 0, draw: 0, other: 0 };
        for (const e of ev) mix[e.bucket]++;
        return { ...cfg, mix, n, ev, ignored, unclassified, sampleKey: key };
      }
      if (cfg.mode === 'rate') return { ...cfg, k, n, pct, ev, ignored, unclassified, sampleKey: key };
      const savedMin = samples[key]?.value;
      const acceptedSample = !cfg.positiveOnly && Number.isInteger(savedMin) && savedMin > 0 ? savedMin : null;
      const ruleMin = cfg.minOpp || 1;
      const sampleMin = Math.max(ruleMin, acceptedSample ?? DEFAULT_SAMPLE_MIN);
      let verdict = null;
      if (n >= ruleMin) {
        if (cfg.mode === 'cap') verdict = k >= cfg.min ? 'Yes' : cfg.positiveOnly ? null : 'No';
        else if (cfg.mode === 'bands') {
          const wide = cfg.highInclusive ? pct >= cfg.high : pct > cfg.high;
          verdict = pct < cfg.low ? 'Tight' : wide ? 'Wide' : 'Normal';
        } else if (cfg.mode === 'activity') verdict = pct >= cfg.threshold ? 'Aggro' : 'Passive';
        else if (cfg.mode === 'fold3') {
          verdict = pct >= cfg.strong ? 'Strong Yes' : pct >= cfg.threshold ? 'Yes' : pct < cfg.hard ? 'Hard No' : 'No';
        } else {
          const passes = cfg.more
            ? (cfg.strict ? pct > cfg.threshold : pct >= cfg.threshold)
            : (cfg.strict ? pct < cfg.threshold : pct <= cfg.threshold);
          const yes = passes && k >= (cfg.minHits || 0);
          verdict = cfg.wide ? (yes ? 'Wide' : 'Tight') : (yes ? 'Yes' : 'No');
        }
      }
      const confirmedExample = cfg.mode === 'cap' && verdict === 'Yes';
      const established = !ignored && verdict !== null && (confirmedExample || n >= sampleMin);
      const state = ignored ? 'Review data' : established ? verdict : 'Not established';
      return {
        ...cfg, state, established, verdict, sampleKey: key, sampleMin, acceptedSample,
        canAcceptSample: !ignored && !established && verdict !== null,
        k, n, pct, ev, ignored, unclassified,
      };
    });
  }
  return {rules,evaluate,facts,holding,position,texture};
})();
