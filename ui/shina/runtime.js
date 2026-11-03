// shina-tread runtime. Without JavaScript both price panels and every card stay visible.
function normalizeQuery(value) {
  return String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
}
function filterEntries(entries,query,filters) {
  var words=normalizeQuery(query).split(' ').filter(Boolean);
  filters=filters||{};
  return entries.filter(function(entry){
    for(var key in filters) if(filters[key]&&entry[key]!==filters[key]) return false;
    var text=normalizeQuery(entry.search);
    return words.every(function(word){return text.indexOf(word)!==-1;});
  });
}
function countLabel(found,total) {return 'Найдено '+found+' из '+total;}

// Complete accepted weekly schedule in the business time zone only.
function serviceOpeningStatus(schedule,timezone,now) {
  try {
    now=now||new Date();
    if(!schedule||!timezone||!Number.isFinite(now.getTime())) return null;
    var days=['mon','tue','wed','thu','fri','sat','sun'];
    var dayLabels=['в понедельник','во вторник','в среду','в четверг','в пятницу','в субботу','в воскресенье'];
    var parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    var part=function(type){var item=parts.find(function(p){return p.type===type;});return item?item.value:'';};
    var day=days.indexOf(part('weekday').toLowerCase());
    if(day<0) return null;
    var parse=function(value,allowMidnight){
      if(typeof value!=='string'||!/^\d{2}:\d{2}$/.test(value)) return NaN;
      var hm=value.split(':').map(Number);
      return hm[0]<24&&hm[1]<60||allowMidnight&&hm[0]===24&&hm[1]===0?hm[0]*60+hm[1]:NaN;
    };
    var week=7*1440,intervals=[];
    for(var index=0;index<days.length;index++) {
      if(!Array.isArray(schedule[days[index]])) return null;
      for(var i=0;i<schedule[days[index]].length;i++) {
        var pair=schedule[days[index]][i];
        if(!Array.isArray(pair)||pair.length!==2) return null;
        var start=parse(pair[0]),end=parse(pair[1],true);
        if(!Number.isFinite(start)||!Number.isFinite(end)||start===end) return null;
        [-week,0,week].forEach(function(shift){intervals.push({start:index*1440+start+shift,end:index*1440+end+(end<start?1440:0)+shift});});
      }
    }
    intervals.sort(function(a,b){return a.start-b.start;});
    var merged=[];
    intervals.forEach(function(interval){
      var last=merged[merged.length-1];
      if(last&&interval.start<=last.end) last.end=Math.max(last.end,interval.end); else merged.push({start:interval.start,end:interval.end});
    });
    var minute=day*1440+Number(part('hour'))*60+Number(part('minute'));
    var time=function(value){return String(Math.floor((value%1440+1440)%1440/60)).padStart(2,'0')+':'+String((value%60+60)%60).padStart(2,'0');};
    var current=merged.find(function(interval){return interval.start<=minute&&minute<interval.end;});
    if(current) return {state:'open',label:'Открыто до '+time(current.end)};
    var next=merged.find(function(interval){return interval.start>minute;});
    if(!next) return {state:'closed',label:'Закрыто'};
    var offset=Math.floor(next.start/1440)-day;
    var when=offset===0?'сегодня':offset===1?'завтра':dayLabels[(Math.floor(next.start/1440)%7+7)%7];
    return {state:'closed',label:'Закрыто · откроется '+when+' в '+time(next.start)};
  } catch(error) {return null;}
}

if(typeof document!=='undefined') {
  var catalogue=document.querySelector('[data-price-catalogue]');
  if(catalogue) {
    var panels=[].slice.call(catalogue.querySelectorAll('[data-price-panel]'));
    panels.forEach(function(panel){
      var input=panel.querySelector('[data-search-input]'),count=panel.querySelector('[data-price-count]'),empty=panel.querySelector('[data-price-empty]');
      var resets=[].slice.call(panel.querySelectorAll('[data-reset]')),chips=[].slice.call(panel.querySelectorAll('[data-filter]')),selects=[].slice.call(panel.querySelectorAll('[data-filter-select]'));
      var entries=[].slice.call(panel.querySelectorAll('[data-price-card]')).map(function(element){return {element:element,search:element.dataset.search||'',category:element.dataset.category||'',season:element.dataset.season||'',diameter:element.dataset.diameter||''};});
      var filters={};
      var update=function(){
        selects.forEach(function(select){filters[select.dataset.filterSelect]=select.value;});
        var matched=filterEntries(entries,input.value,filters),set=new Set(matched);
        entries.forEach(function(entry){entry.element.hidden=!set.has(entry);});
        count.textContent=countLabel(matched.length,entries.length);
        empty.hidden=matched.length!==0;
        var active=Boolean(normalizeQuery(input.value))||Object.keys(filters).some(function(key){return filters[key];});
        resets.forEach(function(button){if(!empty.contains(button)) button.hidden=!active;});
        chips.forEach(function(chip){chip.setAttribute('aria-pressed',String((filters[chip.dataset.filter]||'')===(chip.dataset.value||'')));});
      };
      input.addEventListener('input',update);
      chips.forEach(function(chip){chip.addEventListener('click',function(){filters[chip.dataset.filter]=chip.dataset.value||'';update();});});
      selects.forEach(function(select){select.addEventListener('change',update);});
      resets.forEach(function(button){button.addEventListener('click',function(){input.value='';filters={};selects.forEach(function(select){select.value='';});update();input.focus({preventScroll:true});});});
      panel.querySelector('[data-tools]').hidden=false;
      update();
    });
    var tabs=document.querySelector('[data-tabs]');
    if(tabs&&panels.length>1) {
      var buttons=[].slice.call(tabs.querySelectorAll('[data-tab]'));
      var select=function(id,focus){
        buttons.forEach(function(button){var on=button.dataset.tab===id;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;if(on&&focus) button.focus();});
        panels.forEach(function(panel){panel.hidden=panel.dataset.pricePanel!==id;});
      };
      buttons.forEach(function(button,index){
        button.addEventListener('click',function(){select(button.dataset.tab);});
        button.addEventListener('keydown',function(event){
          if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft') return;
          var next=buttons[(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length];
          select(next.dataset.tab,true);event.preventDefault();
        });
      });
      catalogue.classList.add('is-tabbed');
      tabs.hidden=false;
      select(buttons[0].dataset.tab);
    }
  }
  var scheduleElement=document.querySelector('#service-schedule');
  if(scheduleElement) {
    try {
      var data=JSON.parse(scheduleElement.textContent),badges=[].slice.call(document.querySelectorAll('[data-service-status]')),timer;
      var refresh=function(){
        var status=serviceOpeningStatus(data.schedule,data.timezone,new Date());
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
