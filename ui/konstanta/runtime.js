// konstanta-signal needs no runtime behaviour: the call button is a plain tel: link,
// and no live «open now» status is shown because the round-the-clock mode and the
// workshop hours are different services (README rule). Kept as a separate file so the
// page owns its assets and other pages' scripts stay untouched.

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
