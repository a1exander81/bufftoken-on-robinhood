// Theme system: dark (default) -> light -> auto (follows OS). Persists choice.
(function(){
  const KEY = 'buffcat-theme';
  const root = document.documentElement;
  const order = ['dark','light','auto'];
  const icons = { dark:'🌙', light:'☀️', auto:'🌗' };
  const labels = { dark:'Dark', light:'Light', auto:'Auto' };
  function systemPrefersLight(){
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  }
  function effective(mode){
    return mode === 'auto' ? (systemPrefersLight() ? 'light' : 'dark') : mode;
  }
  function apply(mode){
    root.setAttribute('data-theme', effective(mode));
    root.setAttribute('data-theme-pref', mode);
    const btn = document.getElementById('themeToggle');
    if(btn){ btn.textContent = icons[mode]; btn.title = 'Theme: ' + labels[mode];
      btn.setAttribute('aria-label','Theme: '+labels[mode]+' (click to change)'); }
  }
  let pref = 'dark';
  try { pref = localStorage.getItem(KEY) || 'dark'; } catch(e){}
  apply(pref);
  if(window.matchMedia){
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if(pref === 'auto') apply('auto');
    });
  }
  function init(){
    const btn = document.getElementById('themeToggle');
    if(!btn) return; apply(pref);
    btn.addEventListener('click', () => {
      pref = order[(order.indexOf(pref)+1) % order.length];
      try { localStorage.setItem(KEY, pref); } catch(e){}
      apply(pref);
    });
  }
  if(document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
