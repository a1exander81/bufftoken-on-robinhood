(function () {
  "use strict";

  // -------------------------------------------------------------------
  // Buff'mania 3D fan carousel.
  // Reads whatever .buff-card elements already exist inside
  // #buffCarouselTrack in index.html — to add more images later, just
  // duplicate a .buff-card block in the HTML (no JS edits needed).
  // -------------------------------------------------------------------

  const stage = document.getElementById("buffCarouselStage");
  const track = document.getElementById("buffCarouselTrack");
  const captionEl = document.getElementById("buffCarouselCaption");
  if (!stage || !track) return;

  const cards = Array.from(track.querySelectorAll(".buff-card"));
  const n = cards.length;
  if (n === 0) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Depth palette pulled straight from the site's own tokens:
  // shadow -> gold -> green as a card swings to the front.
  const COL_BACK = [4, 10, 8];
  const COL_MID = [232, 179, 60];
  const COL_FRONT = [0, 200, 5];

  const lerp = (a, b, t) => a + (b - a) * t;
  function mixColor(depth) {
    if (depth > 0.5) {
      const k = (depth - 0.5) * 2;
      return [lerp(COL_MID[0], COL_FRONT[0], k), lerp(COL_MID[1], COL_FRONT[1], k), lerp(COL_MID[2], COL_FRONT[2], k)];
    }
    const k = depth * 2;
    return [lerp(COL_BACK[0], COL_MID[0], k), lerp(COL_BACK[1], COL_MID[1], k), lerp(COL_BACK[2], COL_MID[2], k)];
  }

  let angle = 0; // radians
  let lastFocusIndex = -1;
  let hoverPaused = false;
  let clickPauseUntil = 0;
  const LAP_MS = 58000; // one slow, "astounding" full lap
  const SPEED = prefersReduced ? 0 : (2 * Math.PI) / LAP_MS; // radians / ms

  function isPaused() {
    return hoverPaused || Date.now() < clickPauseUntil;
  }

  function layout() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const radiusX = w * 0.36;
    const radiusZ = w * 0.3;
    const lift = h * 0.11;

    let frontIdx = 0;
    let bestCos = -Infinity;

    cards.forEach((card, i) => {
      const a = angle + i * ((2 * Math.PI) / n);
      const s = Math.sin(a);
      const c = Math.cos(a);
      const depth = (c + 1) / 2; // 0 = back, 1 = front

      const x = s * radiusX;
      const y = -depth * lift + (1 - depth) * (lift * 0.3);
      const z = c * radiusZ;
      const fanRotate = s * -26; // degrees — cards fan open toward the viewer
      const scale = 0.58 + depth * 0.52;

      card.style.transform =
        "translate(-50%, -50%) translate3d(" +
        x.toFixed(2) + "px, " + y.toFixed(2) + "px, " + z.toFixed(2) + "px) " +
        "rotateY(" + fanRotate.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
      card.style.zIndex = String(Math.round(depth * 1000));
      card.style.opacity = (0.35 + depth * 0.65).toFixed(3);

      const blur = ((1 - depth) * 2.4).toFixed(2);
      const brightness = (0.5 + depth * 0.65).toFixed(2);
      const saturate = (0.55 + depth * 0.6).toFixed(2);
      card.style.filter = "brightness(" + brightness + ") saturate(" + saturate + ") blur(" + blur + "px)";

      const [r, g, b] = mixColor(depth).map(Math.round);
      const inner = card.firstElementChild;
      if (inner) {
        const glowA = (0.12 + depth * 0.55).toFixed(2);
        const spread = Math.round(6 + depth * 26);
        const blurShadow = Math.round(18 + depth * 46);
        inner.style.boxShadow =
          "0 " + spread + "px " + blurShadow + "px -8px rgba(" + r + "," + g + "," + b + "," + glowA + ")";
        inner.style.borderColor = "rgba(" + r + "," + g + "," + b + "," + (0.25 + depth * 0.4).toFixed(2) + ")";
      }

      if (c > bestCos) {
        bestCos = c;
        frontIdx = i;
      }
    });

    if (frontIdx !== lastFocusIndex && captionEl) {
      lastFocusIndex = frontIdx;
      const label = cards[frontIdx].dataset.label || "";
      captionEl.classList.add("swap");
      window.setTimeout(() => {
        captionEl.textContent = label;
        captionEl.classList.remove("swap");
      }, 160);
    }
  }

  function focusCard(i) {
    const currentA = angle + i * ((2 * Math.PI) / n);
    const k = Math.round(currentA / (2 * Math.PI));
    angle -= currentA - k * (2 * Math.PI);
    clickPauseUntil = Date.now() + 4000;
  }

  cards.forEach((card, i) => {
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.addEventListener("click", () => focusCard(i));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        focusCard(i);
      }
    });
  });

  stage.addEventListener("mouseenter", () => (hoverPaused = true));
  stage.addEventListener("mouseleave", () => (hoverPaused = false));
  stage.addEventListener("touchstart", () => (hoverPaused = true), { passive: true });
  stage.addEventListener(
    "touchend",
    () => {
      hoverPaused = false;
      clickPauseUntil = Date.now() + 2500;
    },
    { passive: true }
  );

  let lastTs = null;
  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    if (!isPaused()) angle += SPEED * dt;
    layout();
    requestAnimationFrame(tick);
  }

  layout();
  requestAnimationFrame(tick);
  window.addEventListener("resize", layout);
})();
