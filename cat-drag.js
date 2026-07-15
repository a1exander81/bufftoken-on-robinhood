// Draggable buff cats v2 — state-tracked position + hover enlarge.
(function(){
  function makeDraggable(el){
    var pos={x:0,y:0}, start={x:0,y:0}, dragging=false;
    el.style.cursor='grab';
    function render(scale){
      el.style.transform='translate('+pos.x+'px,'+pos.y+'px) rotate(2deg)'+(scale?(' scale('+scale+')'):'');
    }
    function down(e){
      dragging=true; el.style.animation='none'; el.style.cursor='grabbing'; el.style.zIndex=60; el.style.transition='none';
      var p=e.touches?e.touches[0]:e;
      start.x=p.clientX-pos.x; start.y=p.clientY-pos.y;
      e.preventDefault();
    }
    function move(e){
      if(!dragging) return;
      var p=e.touches?e.touches[0]:e;
      pos.x=p.clientX-start.x; pos.y=p.clientY-start.y;
      render(1.1);
    }
    function up(){
      if(!dragging) return;
      dragging=false; el.style.cursor='grab'; el.style.transition='transform .2s ease'; render(1);
    }
    el.addEventListener('mouseenter',function(){ if(!dragging){el.style.transition='transform .25s ease'; render(1.18);} });
    el.addEventListener('mouseleave',function(){ if(!dragging){ render(1); } });
    el.addEventListener('mousedown',down);
    el.addEventListener('touchstart',down,{passive:false});
    window.addEventListener('mousemove',move);
    window.addEventListener('touchmove',move,{passive:false});
    window.addEventListener('mouseup',up);
    window.addEventListener('touchend',up);
    el.addEventListener('dblclick',function(){
      pos.x=0; pos.y=0; el.style.transition='transform .3s ease'; el.style.transform='';
      setTimeout(function(){ el.style.animation=''; el.style.transition=''; },320);
    });
  }
  function init(){
    document.querySelectorAll('.buff-cat-float').forEach(function(el){
      el.style.pointerEvents='auto'; makeDraggable(el);
    });
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
