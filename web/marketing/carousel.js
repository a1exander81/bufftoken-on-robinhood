(function () {
  "use strict";

  // -------------------------------------------------------------------
  // Buff'mania stacked carousel.
  // Cards sit in a leaning stack; every ROTATE_MS the front card cycles to
  // the back of the queue and the next one animates into the front slot.
  // Because every slot's lean/offset increases in the same direction, the
  // cycle reads as the whole stack slowly turning clockwise. Reads whatever
  // .buff-card elements already exist inside #buffCarouselTrack in
  // index.html — to add more images later, just duplicate a .buff-card
  // block in the HTML (no JS edits needed). The first card in the list is
  // the one that starts in front.
  // -------------------------------------------------------------------

  const stage = document.getElementById("buffCarouselStage");
  const track = document.getElementById("buffCarouselTrack");
  const captionEl = document.getElementById("buffCarouselCaption");
  if (!stage || !track) return;

  const cards = Array.from(track.querySelectorAll(".buff-card"));
  const n = cards.length;
  if (n === 0) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const VISIBLE = Math.min(5, n); // how many stacked slots get a real (non-hidden) position
  const ROTATE_MS = 4200; // slow

  // Each entry is one stacked position, depth 0 = front. Cards past the
  // table length share the last (fully transparent) entry, i.e. they wait
  // invisibly until their turn cycles back around to the front.
  function slotTable(mobile) {
    return mobile
      ? [
          { x: 0, y: 0, r: -2, s: 1, o: 1 },
          { x: 16, y: 5, r: 5, s: 0.94, o: 0.9 },
          { x: 30, y: 8, r: 11, s: 0.89, o: 0.72 },
          { x: 42, y: 10, r: 17, s: 0.84, o: 0.5 },
          { x: 52, y: 11, r: 23, s: 0.8, o: 0 },
        ]
      : [
          { x: 0, y: 0, r: -2, s: 1, o: 1 },
          { x: 30, y: 8, r: 5, s: 0.94, o: 0.92 },
          { x: 56, y: 14, r: 11, s: 0.89, o: 0.76 },
          { x: 78, y: 18, r: 17, s: 0.84, o: 0.55 },
          { x: 96, y: 20, r: 23, s: 0.8, o: 0 },
        ];
  }
  function slot(depth, mobile) {
    const table = slotTable(mobile);
    return table[Math.min(depth, table.length - 1)];
  }

  let order = cards.slice(); // current front-to-back order
  let paused = false;
  let timer = null;

  function render() {
    const mobile = window.innerWidth <= 760;
    order.forEach((card, depth) => {
      const s = slot(depth, mobile);
      card.style.transform =
        "translate(-50%, -50%) translate(" + s.x + "px, " + s.y + "px) rotate(" + s.r + "deg) scale(" + s.s + ")";
      card.style.opacity = String(s.o);
      card.style.zIndex = String(200 - depth);
      card.style.filter = depth === 0 ? "brightness(1)" : "brightness(" + Math.max(0.55, 1 - depth * 0.08).toFixed(2) + ")";
      card.style.pointerEvents = depth < VISIBLE ? "auto" : "none";
      card.tabIndex = depth < VISIBLE ? 0 : -1;
    });

    const front = order[0];
    const label = front.dataset.label || "";
    if (captionEl && captionEl.textContent !== label) {
      captionEl.classList.add("swap");
      window.setTimeout(() => {
        captionEl.textContent = label;
        captionEl.classList.remove("swap");
      }, 160);
    }
  }

  function advance() {
    order.push(order.shift());
    render();
  }

  function bringToFront(card) {
    const i = order.indexOf(card);
    if (i <= 0) return;
    order.splice(i, 1);
    order.unshift(card);
    render();
    restartTimer();
  }

  function startTimer() {
    if (prefersReduced) return;
    timer = window.setInterval(() => {
      if (!paused) advance();
    }, ROTATE_MS);
  }
  function restartTimer() {
    if (timer) window.clearInterval(timer);
    startTimer();
  }

  cards.forEach((card) => {
    card.addEventListener("click", () => bringToFront(card));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        bringToFront(card);
      }
    });
  });

  stage.addEventListener("mouseenter", () => (paused = true));
  stage.addEventListener("mouseleave", () => (paused = false));
  stage.addEventListener("focusin", () => (paused = true));
  stage.addEventListener("focusout", () => (paused = false));

  render();
  startTimer();
  window.addEventListener("resize", render);
})();
