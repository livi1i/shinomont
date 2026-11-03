function normalizePriceText(value) {
  return String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
}
function selectPriceEntries(entries,query='',scope='',category='') {
  const words=normalizePriceText(query).split(' ').filter(Boolean);
  return entries.filter(entry=>(!scope||entry.scope===scope)&&(!category||entry.category===category)&&words.every(word=>normalizePriceText(entry.search).includes(word)));
}

// All calendar parts come from the verified business time zone, never the
// visitor's local getDay()/getHours(). Only the current instant is device time.
function serviceOpeningStatus(schedule,timezone,now=new Date()) {
  try {
    if(!schedule||!timezone||!Number.isFinite(now.getTime())) return null;
    const days=['mon','tue','wed','thu','fri','sat','sun'];
    const dayLabels=['в понедельник','во вторник','в среду','в четверг','в пятницу','в субботу','в воскресенье'];
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const part=type=>parts.find(value=>value.type===type)?.value;
    const day=days.indexOf(part('weekday')?.toLowerCase());
    if(day<0) return null;
    const parse=(value,allowMidnight=false)=>{
      if(typeof value!=='string'||!/^\d{2}:\d{2}$/.test(value)) return NaN;
      const [hour,minute]=value.split(':').map(Number);
      return hour<24&&minute<60||allowMidnight&&hour===24&&minute===0?hour*60+minute:NaN;
    };
    const week=7*1440,intervals=[];
    for(let index=0;index<days.length;index++) {
      if(!Array.isArray(schedule[days[index]])) return null;
      for(const pair of schedule[days[index]]) {
        if(!Array.isArray(pair)||pair.length!==2) return null;
        const start=parse(pair[0]),end=parse(pair[1],true);
        if(!Number.isFinite(start)||!Number.isFinite(end)||start===end) return null;
        for(const shift of [-week,0,week]) intervals.push({start:index*1440+start+shift,end:index*1440+end+(end<start?1440:0)+shift});
      }
    }
    // Adjacent/overlapping intervals represent uninterrupted opening, including
    // an overnight Sunday interval continuing into Monday of the next week.
    intervals.sort((a,b)=>a.start-b.start);
    const merged=[];
    for(const interval of intervals) {
      const last=merged[merged.length-1];
      if(last&&interval.start<=last.end) last.end=Math.max(last.end,interval.end);
      else merged.push({...interval});
    }
    const minute=day*1440+Number(part('hour'))*60+Number(part('minute'));
    const time=value=>`${String(Math.floor((value%1440+1440)%1440/60)).padStart(2,'0')}:${String((value%60+60)%60).padStart(2,'0')}`;
    const current=merged.find(interval=>interval.start<=minute&&minute<interval.end);
    if(current) return {state:'open',label:`Открыто до ${time(current.end)}`};
    const next=merged.find(interval=>interval.start>minute);
    if(!next) return {state:'closed',label:'Закрыто'};
    const offset=Math.floor(next.start/1440)-day;
    const when=offset===0?'сегодня':offset===1?'завтра':dayLabels[(Math.floor(next.start/1440)%7+7)%7];
    return {state:'closed',label:`Закрыто · откроется ${when} в ${time(next.start)}`};
  } catch {return null;}
}

function pageScrollProgress(scrollTop,scrollHeight,viewportHeight) {
  if(![scrollTop,scrollHeight,viewportHeight].every(Number.isFinite)) return 0;
  const distance=scrollHeight-viewportHeight;
  return distance>0?Math.max(0,Math.min(1,scrollTop/distance)):0;
}

if(typeof document!=='undefined') {
  const photoDialog=document.querySelector('#safe-photo-dialog');
  if(photoDialog&&typeof photoDialog.showModal==='function') {
    let returnFocus=null;
    document.querySelectorAll('[data-safe-photo-viewer]>summary').forEach(summary=>summary.addEventListener('click',event=>{
      event.preventDefault();
      const expanded=summary.parentElement.querySelector('.photo-expanded');
      if(!expanded) return;
      returnFocus=summary;
      const body=photoDialog.querySelector('[data-photo-dialog-body]');
      body.replaceChildren(expanded.cloneNode(true));
      photoDialog.showModal();
    }));
    photoDialog.addEventListener('close',()=>returnFocus?.focus({preventScroll:true}));
    photoDialog.addEventListener('click',event=>{if(event.target===photoDialog) photoDialog.close();});
  }
  const progress=document.querySelector('[data-scroll-progress]');
  if(progress) {
    const fill=progress.querySelector('[data-scroll-progress-fill]');
    let frame=0;
    const paint=()=>{
      frame=0;
      const root=document.scrollingElement||document.documentElement;
      const amount=pageScrollProgress(root.scrollTop,root.scrollHeight,document.documentElement.clientHeight);
      fill.style.transform=`scaleX(${amount})`;
      progress.hidden=false;
    };
    const schedulePaint=()=>{if(!frame) frame=requestAnimationFrame(paint);};
    window.addEventListener('scroll',schedulePaint,{passive:true});
    window.addEventListener('resize',schedulePaint,{passive:true});
    window.addEventListener('pageshow',schedulePaint);
    if(typeof ResizeObserver!=='undefined') {
      const sizeObserver=new ResizeObserver(schedulePaint);
      sizeObserver.observe(document.body);
      sizeObserver.observe(document.documentElement);
    }
    document.fonts?.ready.then(schedulePaint);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden) schedulePaint();});
    schedulePaint();
  }
  const scheduleElement=document.querySelector('#service-schedule');
  if(scheduleElement) {
    try {
      const data=JSON.parse(scheduleElement.textContent);
      const badges=[...document.querySelectorAll('[data-service-status]')];
      let statusTimer;
      const update=()=>{
        const status=serviceOpeningStatus(data.schedule,data.timezone,new Date());
        badges.forEach(badge=>{
          badge.hidden=!status;
          if(status) {
            badge.dataset.state=status.state;
            const label=badge.querySelector('[data-service-status-label]');
            if(label.textContent!==status.label) label.textContent=status.label;
          }
        });
        clearTimeout(statusTimer);
        statusTimer=setTimeout(update,60000-Date.now()%60000+25);
      };
      update();
      document.addEventListener('visibilitychange',()=>{if(!document.hidden) update();});
      window.addEventListener('pageshow',update);
    } catch { /* Keep hidden when runtime data is absent or invalid. */ }
  }
  const catalogue=document.querySelector('[data-price-catalogue]');
  if(catalogue) {
    const entries=[...catalogue.querySelectorAll('[data-price-row]')].map(element=>({element,search:element.dataset.search,scope:element.dataset.scope,category:element.dataset.category}));
    const search=catalogue.querySelector('input[type="search"]'),category=catalogue.querySelector('#price-category');
    const scopes=[...catalogue.querySelectorAll('[name="price-scope"]')];
    const more=catalogue.querySelector('[data-price-more]'),count=catalogue.querySelector('[data-price-count]'),empty=catalogue.querySelector('[data-price-empty]'),reset=catalogue.querySelector('[data-reset-filters]');
    const batch=18;let limit=batch,matched=[];
    function update(resetLimit=true) {
      if(resetLimit) limit=batch;
      const scope=scopes.find(input=>input.checked)?.value||'';
      matched=selectPriceEntries(entries,search.value,scope,category?.value||'');
      const visible=new Set(matched.slice(0,limit));
      entries.forEach(entry=>{entry.element.hidden=!visible.has(entry);});
      count.textContent=`Найдено ${matched.length} из ${entries.length} · показано ${Math.min(limit,matched.length)}`;
      empty.hidden=matched.length!==0;more.hidden=matched.length<=limit;
      more.textContent=`Показать ещё ${Math.min(batch,Math.max(0,matched.length-limit))}`;
      reset.hidden=!(search.value||scope||category?.value);
    }
    search.addEventListener('input',()=>update());
    scopes.forEach(input=>input.addEventListener('change',()=>update()));
    category?.addEventListener('change',()=>update());
    reset.addEventListener('click',()=>{search.value='';if(category) category.value='';if(scopes[0]) scopes[0].checked=true;update();search.focus();});
    more.addEventListener('click',()=>{const firstNew=matched[limit]?.element;limit+=batch;update(false);if(firstNew){firstNew.tabIndex=-1;firstNew.focus({preventScroll:true});}});
    update();
  }
  document.querySelectorAll('.mobile-menu nav a').forEach(a=>a.addEventListener('click',()=>{a.closest('details').open=false;}));
}

// Status standard 2026-11-03 (all branches): strictly from accepted data in the business time zone.
// A day with appointment intervals → grey «По предварительной записи до HH:MM», otherwise red «Закрыто».
// A day only in schedule → green «Открыто до HH:MM» / red «Перерыв · откроется в …» / «Закрыто · откроется …»
// (an opening is promised only through known regular days). A day in neither → no status.
function knownScheduleStatus(schedule,timezone,now,appointment) {
  try {
    now=now||new Date();
    if(!schedule&&!appointment||!timezone||!Number.isFinite(now.getTime())) return null;
    var days=['mon','tue','wed','thu','fri','sat','sun'];
    var labels=['в понедельник','во вторник','в среду','в четверг','в пятницу','в субботу','в воскресенье'];
    var parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    var get=function(type){var item=parts.find(function(p){return p.type===type;});return item?item.value:'';};
    var day=days.indexOf(get('weekday').toLowerCase()),minute=Number(get('hour'))*60+Number(get('minute'));
    if(day<0||!Number.isFinite(minute)) return null;
    var toMinutes=function(value){return typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value)?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;};
    var clock=function(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');};
    var list=function(source,key){
      if(!source||!Object.prototype.hasOwnProperty.call(source,key)||!Array.isArray(source[key])) return null;
      var out=[];
      for(var i=0;i<source[key].length;i++) {
        var pair=source[key][i],start=toMinutes(pair&&pair[0]),end=toMinutes(pair&&pair[1]);
        if(!(start<end)||out.length&&out[out.length-1][1]>start) return null;
        out.push([start,end]);
      }
      return out;
    };
    var dayOf=function(index){
      var byAppointment=list(appointment,days[index]);
      if(byAppointment&&byAppointment.length) return {appointment:true,intervals:byAppointment};
      var regular=list(schedule,days[index]);
      return regular?{appointment:false,intervals:regular}:null;
    };
    var today=dayOf(day);
    if(!today) return null;
    var i;
    if(today.appointment) {
      for(i=0;i<today.intervals.length;i++) if(minute>=today.intervals[i][0]&&minute<today.intervals[i][1]) return {state:'appointment',label:'По предварительной записи до '+clock(today.intervals[i][1])};
      return {state:'closed',label:'Закрыто'};
    }
    for(i=0;i<today.intervals.length;i++) {
      if(minute>=today.intervals[i][0]&&minute<today.intervals[i][1]) return {state:'open',label:'Открыто до '+clock(today.intervals[i][1])};
      if(minute<today.intervals[i][0]) return i>0?{state:'break',label:'Перерыв · откроется в '+clock(today.intervals[i][0])}:{state:'closed',label:'Закрыто · откроется сегодня в '+clock(today.intervals[i][0])};
    }
    for(var offset=1;offset<7;offset++) {
      var index=(day+offset)%7,next=dayOf(index);
      if(!next||next.appointment) return {state:'closed',label:'Закрыто'};
      if(next.intervals.length) return {state:'closed',label:'Закрыто · откроется '+(offset===1?'завтра':labels[index])+' в '+clock(next.intervals[0][0])};
    }
    return {state:'closed',label:'Закрыто'};
  } catch(error) {return null;}
}
if(typeof document!=='undefined') {
  (function(){
    var element=document.querySelector('#known-schedule');
    if(!element) return;
    try {
      var data=JSON.parse(element.textContent),badges=[].slice.call(document.querySelectorAll('[data-service-status]')),timer;
      var refresh=function(){
        var status=knownScheduleStatus(data.schedule,data.timezone,new Date(),data.appointment);
        badges.forEach(function(badge){
          badge.hidden=!status;
          if(status){badge.dataset.state=status.state;var label=badge.querySelector('[data-service-status-label]');if(label.textContent!==status.label) label.textContent=status.label;}
        });
        clearTimeout(timer);timer=setTimeout(refresh,60000-Date.now()%60000+25);
      };
      refresh();
      document.addEventListener('visibilitychange',function(){if(!document.hidden) refresh();});
      window.addEventListener('pageshow',refresh);
    } catch(error) { /* keep hidden */ }
  })();
}
