/* BUFFCAT PFP maker
 * Konva 9.3.6 (vendored). No framework, no bundler.
 * Gear is drag / resize / rotate via Konva.Transformer.
 *
 * Coordinates: `at` and `scale` are expressed against a 1000px reference
 * square and multiplied by SIZE/1000 at render time, so the display canvas
 * can be resized without retuning anything.
 *
 * The body PNG has ~3px of headroom above the ears and 0 bottom margin, and
 * its content sits 35px left of centre. BODY_SCALE / BODY_X / BODY_Y inset it
 * so hats have somewhere to go. If the body art is ever re-exported with
 * padding built in, set BODY_SCALE = 1 and both offsets to 0.
 */
(function () {
  "use strict";

  var MAX_SIZE = 520;      // largest on-screen canvas
  var MIN_SIZE = 240;      // never shrink below this
  var SIZE = MAX_SIZE;     // current on-screen canvas (responsive)
  var EXPORT = 1000;       // exported PNG, independent of display size
  var REF = 1000;          // coordinate reference square
  var K = SIZE / REF;

  var BODY_SCALE = 0.86, BODY_X = 100, BODY_Y = 115;
  var BODY_SRC = "/assets/buffcat-body.png";
  var GEAR_DIR = "/assets/gear/";

  var GREEN = "#00C805", PANEL = "#0E1519";

  // Anchors derived from the body art: eye line y=168, eye centre x=568,
  // head top y=66, neck y=290, nipple line y=430 (pre-transform).
  var GEAR = [
    {id:'shades', name:'Thug shades', w:600, h:98, at:[0.5885,0.2615], scale:0.3333},
    {id:'pitvipers', name:'Pit vipers', w:348, h:163, at:[0.5885,0.2615], scale:0.5747},
    {id:'aviators', name:'Aviators', w:482, h:198, at:[0.5885,0.2635], scale:0.3838},
    {id:'cap', name:'Robin hood', w:329, h:200, at:[0.5709,0.18], scale:0.7599},
    {id:'beanie', name:'Beanie', w:194, h:176, at:[0.5709,0.156], scale:1.1082},
    {id:'sweatband', name:'Sweatband', w:280, h:158, at:[0.5709,0.214], scale:0.7143},
    {id:'headphones', name:'Headphones', w:232, h:192, at:[0.5709,0.202], scale:1.0259},
    {id:'chain', name:'Cuban chain', w:253, h:200, at:[0.53,0.4424], scale:0.751},
    {id:'dogtag', name:'Dog tag', w:187, h:165, at:[0.53,0.4444], scale:0.9358},
    {id:'earring', name:'Gold earring', w:184, h:186, at:[0.4655,0.1841], scale:0.2717},
    {id:'rings', name:'Nipple rings', w:516, h:152, at:[0.53,0.4618], scale:0.3682}
  ];

  var BGS = [
    {id:'green',  label:'Green',       color:'#00C805'},
    {id:'dark',   label:'Dark',        color:'#0E1519'},
    {id:'gold',   label:'Gold',        color:'#E8B33C'},
    {id:'cream',  label:'Cream',       color:'#F4F6F3'},
    {id:'none',   label:'Transparent', color:null}
  ];

  var SHARE_TEXT = "just hit the gym \uD83D\uDCAA $BUFFCAT";

  var stage, layer, bgRect, bodyNode, tr;
  var gearNodes = [], history = [], imgCache = {}, currentBg = 'green';

  function $(id) { return document.getElementById(id); }

  function load(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { rej(new Error("failed to load " + src)); };
      i.src = src;
    });
  }

  function toast(msg) {
    var t = $('pfpToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function snapshot() {
    history.push(gearNodes.map(function (n) {
      return { id:n.getAttr('gearId'), x:n.x(), y:n.y(),
               sx:n.scaleX(), sy:n.scaleY(), rot:n.rotation() };
    }));
    if (history.length > 30) history.shift();
    $('pfpUndo').disabled = history.length === 0;
  }

  function makeNode(g, o) {
    o = o || {};
    var n = new Konva.Image({
      image: imgCache[g.id],
      x: o.x != null ? o.x : g.at[0] * SIZE,
      y: o.y != null ? o.y : g.at[1] * SIZE,
      offsetX: g.w / 2,
      offsetY: g.h / 2,
      scaleX: o.sx != null ? o.sx : g.scale * K,
      scaleY: o.sy != null ? o.sy : g.scale * K,
      rotation: o.rot || 0,
      draggable: true
    });
    n.setAttr('gearId', g.id);
    n.on('click tap', function () { select(n); });
    n.on('dragstart transformstart', function () { snapshot(); });
    return n;
  }

  function addGear(g) {
    snapshot();
    var n = makeNode(g);
    layer.add(n);
    gearNodes.push(n);
    tr.moveToTop();
    select(n);
    syncTiles();
  }

  function select(n) {
    tr.nodes(n ? [n] : []);
    tr.moveToTop();
    layer.batchDraw();
    var has = !!n;
    ['pfpBigger','pfpSmaller','pfpRotL','pfpRotR','pfpFlip','pfpDel','pfpFwd','pfpBack']
      .forEach(function (id) { var e = $(id); if (e) e.disabled = !has; });
  }
  function sel() { return tr.nodes()[0] || null; }

  function syncTiles() {
    var on = {};
    gearNodes.forEach(function (n) { on[n.getAttr('gearId')] = 1; });
    Array.prototype.forEach.call(document.querySelectorAll('.pfp-tile'), function (t) {
      t.classList.toggle('on', !!on[t.dataset.id]);
      t.setAttribute('aria-pressed', on[t.dataset.id] ? 'true' : 'false');
    });
  }

  function rebuild(state) {
    gearNodes.forEach(function (n) { n.destroy(); });
    gearNodes = [];
    state.forEach(function (s) {
      var g = GEAR.filter(function (x) { return x.id === s.id; })[0];
      if (!g) return;
      var n = makeNode(g, s);
      layer.add(n);
      gearNodes.push(n);
    });
    tr.moveToTop();
    select(null);
    syncTiles();
    layer.batchDraw();
  }

  function buildUI() {
    var grid = $('pfpGear');
    GEAR.forEach(function (g) {
      var b = document.createElement('button');
      b.className = 'pfp-tile';
      b.dataset.id = g.id;
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'Add ' + g.name);
      b.innerHTML = '<img src="' + GEAR_DIR + g.id + '.png" alt="" loading="lazy"><span>' + g.name + '</span>';
      b.addEventListener('click', function () { addGear(g); });
      grid.appendChild(b);
    });

    var sw = $('pfpBgs');
    BGS.forEach(function (b) {
      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'pfp-sw' + (b.color ? '' : ' tp') + (b.id === currentBg ? ' on' : '');
      if (b.color) d.style.background = b.color;
      d.title = b.label;
      d.setAttribute('aria-label', 'Background: ' + b.label);
      d.addEventListener('click', function () {
        currentBg = b.id;
        Array.prototype.forEach.call(document.querySelectorAll('.pfp-sw'),
          function (s) { s.classList.remove('on'); });
        d.classList.add('on');
        if (b.color) { bgRect.fill(b.color); bgRect.visible(true); }
        else bgRect.visible(false);
        layer.batchDraw();
      });
      sw.appendChild(d);
    });
  }

  function wireControls() {
    var step = function (f) { var n = sel(); if (!n) return; snapshot(); f(n); layer.batchDraw(); };
    $('pfpBigger').onclick  = function () { step(function (n) { n.scale({ x:n.scaleX()*1.12, y:n.scaleY()*1.12 }); }); };
    $('pfpSmaller').onclick = function () { step(function (n) { n.scale({ x:n.scaleX()/1.12, y:n.scaleY()/1.12 }); }); };
    $('pfpRotL').onclick    = function () { step(function (n) { n.rotation(n.rotation() - 15); }); };
    $('pfpRotR').onclick    = function () { step(function (n) { n.rotation(n.rotation() + 15); }); };
    $('pfpFlip').onclick    = function () { step(function (n) { n.scaleX(-n.scaleX()); }); };
    $('pfpFwd').onclick     = function () { var n = sel(); if (!n) return; n.moveToTop(); tr.moveToTop(); layer.batchDraw(); };
    $('pfpBack').onclick    = function () {
      var n = sel(); if (!n) return;
      n.moveDown();
      if (n.zIndex() <= bodyNode.zIndex()) n.moveUp();
      layer.batchDraw();
    };
    $('pfpDel').onclick = function () {
      var n = sel(); if (!n) return;
      snapshot();
      gearNodes = gearNodes.filter(function (x) { return x !== n; });
      n.destroy(); select(null); syncTiles(); layer.batchDraw();
    };

    $('pfpUndo').onclick = function () {
      if (!history.length) return;
      rebuild(history.pop());
      $('pfpUndo').disabled = history.length === 0;
    };

    $('pfpRand').onclick = function () {
      snapshot();
      var pool = GEAR.slice().sort(function () { return Math.random() - 0.5; })
                     .slice(0, 2 + Math.floor(Math.random() * 3));
      rebuild(pool.map(function (g) {
        return { id:g.id,
                 x:g.at[0]*SIZE + (Math.random()*14 - 7),
                 y:g.at[1]*SIZE + (Math.random()*14 - 7),
                 sx:g.scale*K*(0.92 + Math.random()*0.2),
                 sy:g.scale*K*(0.92 + Math.random()*0.2),
                 rot:Math.random()*8 - 4 };
      }));
      var b = BGS[Math.floor(Math.random() * (BGS.length - 1))];
      currentBg = b.id;
      bgRect.fill(b.color); bgRect.visible(true);
      Array.prototype.forEach.call(document.querySelectorAll('.pfp-sw'), function (s, i) {
        s.classList.toggle('on', BGS[i].id === b.id);
      });
      layer.batchDraw();
    };

    $('pfpCircle').onclick = function () { $('pfpStageWrap').classList.toggle('circ'); };

    $('pfpReset').onclick = function () {
      snapshot();
      gearNodes.forEach(function (n) { n.destroy(); });
      gearNodes = [];
      select(null); syncTiles(); layer.batchDraw();
    };

    $('pfpDownload').onclick = function () {
      renderBlob().then(function (b) { saveBlob(b); toast('Downloaded at ' + EXPORT + '\u00d7' + EXPORT); });
    };

    $('pfpShare').onclick = function () {
      renderBlob().then(function (b) {
        var file = new File([b], 'buffcat-pfp.png', { type:'image/png' });
        if (navigator.canShare && navigator.canShare({ files:[file] })) {
          navigator.share({ files:[file], text:SHARE_TEXT })
            .catch(function (e) { if (e && e.name !== 'AbortError') fallbackShare(b); });
        } else {
          fallbackShare(b);
        }
      });
    };
  }

  function saveBlob(b) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'buffcat-pfp.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function fallbackShare(b) {
    saveBlob(b);
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(SHARE_TEXT), '_blank', 'noopener');
    toast('Image saved \u2014 attach it to the post');
  }

  // Hide the transformer before export so handles never land in the PNG.
  function renderBlob() {
    var keep = sel();
    tr.nodes([]);
    layer.draw();
    return new Promise(function (res) {
      stage.toCanvas({ pixelRatio: EXPORT / SIZE }).toBlob(function (b) {
        if (keep) { tr.nodes([keep]); tr.moveToTop(); }
        layer.draw();
        res(b);
      }, 'image/png');
    });
  }

  // Size the stage to its container and rescale everything proportionally.
  // Gear positions/scales are stored in stage px, so they must move with SIZE.
  function fitStage() {
    var box = $('pfpStageWrap');
    if (!box || !box.parentElement) return;
    var cs = window.getComputedStyle(box.parentElement);
    var avail = box.parentElement.clientWidth
              - parseFloat(cs.paddingLeft || 0)
              - parseFloat(cs.paddingRight || 0);
    var next = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.floor(avail)));
    if (!next || next === SIZE) return;

    var ratio = next / SIZE;
    SIZE = next;
    K = SIZE / REF;

    stage.width(SIZE);
    stage.height(SIZE);
    bgRect.width(SIZE);
    bgRect.height(SIZE);
    if (bodyNode) {
      bodyNode.x(BODY_X * K);
      bodyNode.y(BODY_Y * K);
      bodyNode.width(REF * BODY_SCALE * K);
      bodyNode.height(REF * BODY_SCALE * K);
    }
    gearNodes.forEach(function (n) {
      n.x(n.x() * ratio);
      n.y(n.y() * ratio);
      n.scaleX(n.scaleX() * ratio);
      n.scaleY(n.scaleY() * ratio);
    });
    layer.batchDraw();
  }

  var fitTimer = null;
  function scheduleFit() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitStage, 120);
  }

  function boot() {
    stage = new Konva.Stage({ container:'pfpStage', width:SIZE, height:SIZE });
    layer = new Konva.Layer();
    stage.add(layer);

    bgRect = new Konva.Rect({ x:0, y:0, width:SIZE, height:SIZE, fill:'#00C805', listening:false });
    layer.add(bgRect);

    tr = new Konva.Transformer({
      nodes: [],
      anchorSize: 13,
      anchorCornerRadius: 7,
      anchorStroke: GREEN,
      anchorFill: PANEL,
      anchorStrokeWidth: 2,
      borderStroke: GREEN,
      borderDash: [5, 5],
      rotateAnchorOffset: 26,
      keepRatio: true,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      boundBoxFunc: function (o, n) { return (n.width < 24 || n.height < 24) ? o : n; }
    });
    layer.add(tr);

    stage.on('click tap', function (e) {
      if (e.target === stage || e.target === bgRect || e.target === bodyNode) select(null);
    });

    buildUI();
    wireControls();
    fitStage();

    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', scheduleFit);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(scheduleFit);
      ro.observe($('pfpStageWrap').parentElement);
    }

    load(BODY_SRC).then(function (img) {
      bodyNode = new Konva.Image({
        image: img,
        x: BODY_X * K,
        y: BODY_Y * K,
        width: REF * BODY_SCALE * K,
        height: REF * BODY_SCALE * K,
        listening: false
      });
      layer.add(bodyNode);
      tr.moveToTop();
      layer.draw();
      return Promise.all(GEAR.map(function (g) {
        return load(GEAR_DIR + g.id + '.png').then(function (i) { imgCache[g.id] = i; });
      }));
    }).then(function () {
      select(null);
      $('pfpUndo').disabled = true;
      fitStage();
      layer.draw();
    }).catch(function (e) {
      toast('Could not load artwork');
      if (window.console) console.error(e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
