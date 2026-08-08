(function () {
  "use strict";

  // -------------------------------------------------------------------
  // Buff'mania fanned-deck carousel.
  // Every card shares one pivot point (bottom-center of the stage) and is
  // positioned purely with `rotate()` — that's what makes it fan out like a
  // hand of cards instead of an arranged grid. Rest state uses a tight angle
  // step so cards mostly overlap; hover/focus/tap widens the step so they
  // spread open. Reads whatever .buff-card elements already exist inside
  // #buffCarouselTrack in index.html — to add more images later, just
  // duplicate a .buff-card block in the HTML (no JS edits needed). The card
  // in the middle of the list becomes the centered, front-most card.
  // -------------------------------------------------------------------

  const stage = document.getElementById("buffCarouselStage");
  const track = document.getElementById("buffCarouselTrack");
  const captionEl = document.getElementById("buffCarouselCaption");
  if (!stage || !track) return;

  const cards = Array.from(track.querySelectorAll(".buff-card"));
  const n = cards.length;
  if (n === 0) return;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Degrees of rotation PER CARD STEP (not a fixed total) — this way the fan
  // scales gracefully as more images are added instead of needing retuning.
  function steps() {
    const mobile = window.innerWidth <= 760;
    return {
      rest: mobile ? 3.2 : 4.5, // small: cards mostly overlap at rest
      hover: mobile ? 7.5 : 10, // wider: fan opens on hover/focus/tap
    };
  }

  function layout() {
    const { rest, hover } = steps();
    const center = (n - 1) / 2;

    cards.forEach((card, i) => {
      const k = i - center; // signed offset from the centered card
      card.style.setProperty("--deg-rest", (k * rest).toFixed(2) + "deg");
      card.style.setProperty("--deg-hover", (prefersReduced ? k * rest : k * hover).toFixed(2) + "deg");
      card.style.zIndex = String(100 - Math.round(Math.abs(k))); // centered card stacks on top
      const dim = 1 - Math.min(Math.abs(k) * 0.045, 0.3);
      card.style.filter = "brightness(" + dim.toFixed(2) + ")";
    });
  }

  layout();
  window.addEventListener("resize", layout);

  // Touch fallback — :hover doesn't fire reliably on tap, so tapping the
  // stage toggles the spread directly; tapping elsewhere closes it again.
  stage.addEventListener("click", () => {
    if (!("ontouchstart" in window)) return;
    stage.classList.toggle("is-spread");
  });
  document.addEventListener(
    "click",
    (e) => {
      if (!stage.contains(e.target)) stage.classList.remove("is-spread");
    },
    { passive: true }
  );

  // Caption follows whichever card has attention.
  function setCaption(text) {
    if (!captionEl) return;
    captionEl.textContent = text || captionEl.textContent;
    captionEl.classList.toggle("show", !!text);
  }
  cards.forEach((card) => {
    card.setAttribute("tabindex", "0");
    const label = card.dataset.label || "";
    card.addEventListener("mouseenter", () => setCaption(label));
    card.addEventListener("focus", () => setCaption(label));
  });
  stage.addEventListener("mouseleave", () => setCaption(""));
})();
