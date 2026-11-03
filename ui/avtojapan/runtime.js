// Progressive enhancement: without JavaScript every price card stays visible.
function normalizeQuery(value) {
  return String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
}
function filterEntries(entries,query='',category='') {
  const words=normalizeQuery(query).split(' ').filter(Boolean);
  return entries.filter(entry=>(!category||entry.category===category)&&words.every(word=>normalizeQuery(entry.search).includes(word)));
}
function countLabel(found,total) {
  return `Найдено ${found} из ${total}`;
}

if(typeof document!=='undefined') {
  const root=document.querySelector('[data-price-catalogue]');
  if(root) {
    const tools=root.querySelector('[data-catalogue-tools]');
    const input=root.querySelector('#price-search');
    const chips=[...root.querySelectorAll('[data-chip]')];
    const count=root.querySelector('[data-price-count]');
    const empty=root.querySelector('[data-price-empty]');
    const resets=[...root.querySelectorAll('[data-reset]')];
    const entries=[...root.querySelectorAll('[data-price-card]')].map(element=>({element,search:element.dataset.search||'',category:element.dataset.category||''}));
    let category='';
    const update=()=>{
      const matched=new Set(filterEntries(entries,input.value,category));
      entries.forEach(entry=>{entry.element.hidden=!matched.has(entry);});
      count.textContent=countLabel(matched.size,entries.length);
      empty.hidden=matched.size!==0;
      const active=Boolean(normalizeQuery(input.value)||category);
      resets.forEach(button=>{if(!empty.contains(button)) button.hidden=!active;});
      chips.forEach(chip=>chip.setAttribute('aria-pressed',String(chip.dataset.chip===category)));
    };
    input.addEventListener('input',update);
    chips.forEach(chip=>chip.addEventListener('click',()=>{category=chip.dataset.chip||'';update();}));
    resets.forEach(button=>button.addEventListener('click',()=>{input.value='';category='';update();input.focus({preventScroll:true});}));
    // Direction cards: plain #prices anchors; with JS they also preselect the matching chip.
    document.querySelectorAll('[data-filter-category]').forEach(link=>link.addEventListener('click',()=>{
      const wanted=link.dataset.filterCategory||'';
      if(!chips.some(chip=>chip.dataset.chip===wanted)) return;
      input.value='';category=wanted;update();
    }));
    tools.hidden=false;
    update();
  }
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

// Reading progress (2026-11-03, same behaviour as the brand template): fixed bar above the sticky header,
// transform:scaleX only, passive listeners + requestAnimationFrame; stays hidden without JS.
if(typeof document!=='undefined') {
  (function(){
    var bar=document.querySelector('[data-scroll-progress]'),fill=bar&&bar.querySelector('[data-scroll-progress-fill]');
    if(!fill) return;
    var frame=0;
    var paint=function(){
      frame=0;
      var root=document.scrollingElement||document.documentElement,distance=root.scrollHeight-document.documentElement.clientHeight;
      var amount=distance>0?Math.max(0,Math.min(1,root.scrollTop/distance)):0;
      fill.style.transform='scaleX('+amount+')';
      bar.hidden=false;
    };
    var schedulePaint=function(){if(!frame) frame=requestAnimationFrame(paint);};
    window.addEventListener('scroll',schedulePaint,{passive:true});
    window.addEventListener('resize',schedulePaint,{passive:true});
    window.addEventListener('pageshow',schedulePaint);
    if(typeof ResizeObserver!=='undefined') {var sizeObserver=new ResizeObserver(schedulePaint);sizeObserver.observe(document.body);sizeObserver.observe(document.documentElement);}
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(schedulePaint);
    document.addEventListener('visibilitychange',function(){if(!document.hidden) schedulePaint();});
    schedulePaint();
  })();
}
