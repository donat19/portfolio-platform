const cube = document.getElementById("cube");
const stage = document.getElementById("stage");
const tabs = Array.from(document.querySelectorAll(".tab"));

const FACE_ROT = {
  front: { x: 0, y: 0 },
  back: { x: 0, y: 180 },
  right: { x: 0, y: -90 },
  left: { x: 0, y: 90 },
  top: { x: -90, y: 0 },
  bottom: { x: 90, y: 0 },
};

const ORDER = ["top", "front", "bottom", "back", "right", "left"];
let index = 0;

function setActive(face) {
  const rot = FACE_ROT[face];
  cube.style.transform =
    `translate(-50%, -50%) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;

  tabs.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.face === face));
  index = Math.max(0, ORDER.indexOf(face));
}

tabs.forEach((btn) => btn.addEventListener("click", () => setActive(btn.dataset.face)));

function step(dir) {
  index = (index + dir + ORDER.length) % ORDER.length;
  setActive(ORDER[index]);
}

/* ===== Scroll only on desktop, swipe only on touch ===== */

// колесо мыши (и трекпад-скролл тоже сюда) — всегда
window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    step(e.deltaY > 0 ? 1 : -1);
  },
  { passive: false }
);

// свайп — только на тач-устройствах (mobile/tablet)
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

if (isTouchDevice) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  stage.addEventListener("pointerdown", (e) => {
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  stage.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;

    if (Math.abs(dy) > Math.abs(dx)) step(dy > 0 ? -1 : 1);
    else step(dx > 0 ? -1 : 1);
  });
}

/* ===== Auto-fit: try to "fill" height by font-size ===== */
function fitParagraph(
  box,
  p,
  {
    headerSelector = null,
    headerGapPx = 0,
    minPx = 12,
    maxPx = 26,
    steps = 12,
    tightenStep = 0.2,
    epsilonPx = 0.5,
  } = {}
) {
  if (!box || !p) return;
  if (box.clientWidth === 0 || box.clientHeight === 0) return;

  const availableH = () => {
    const header = headerSelector ? box.querySelector(headerSelector) : null;
    const headerH = header ? header.getBoundingClientRect().height : 0;
    return Math.max(0, box.clientHeight - headerH - headerGapPx);
  };

  const fits = (px) => {
    p.style.fontSize = `${px}px`;
    return (
      p.scrollHeight <= availableH() + epsilonPx &&
      p.scrollWidth <= box.clientWidth + epsilonPx
    );
  };

  // 1) binary search: max that fits
  let lo = minPx;
  let hi = maxPx;

  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }

  // 2) tighten: push a bit more
  let px = lo;
  while (px + tightenStep <= maxPx && fits(px + tightenStep)) {
    px += tightenStep;
  }
  p.style.fontSize = `${px}px`;
}

function observeFit(selector, opts) {
  const box = document.querySelector(selector);
  const p = box?.querySelector("p");
  if (!box || !p) return;

  const run = () => fitParagraph(box, p, opts);

  requestAnimationFrame(run);
  window.addEventListener("load", run);

  const ro = new ResizeObserver(() => run());
  ro.observe(box);
}

/* TOP: есть h2 */
observeFit(".face--top .card__content", {
  headerSelector: "h2",
  headerGapPx: 10,
  minPx: 12,
  maxPx: 26,
  steps: 12,
  tightenStep: 0.2,
});

/* FRONT: без h2 */
observeFit(".face--front .card__content", {
  headerSelector: null,
  headerGapPx: 0,
  minPx: 11,
  maxPx: 24,
  steps: 12,
  tightenStep: 0.2,
});

setActive("top");
