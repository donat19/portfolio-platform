const cube = document.getElementById("cube");
const stage = document.getElementById("stage");
const tabs = Array.from(document.querySelectorAll(".tab"));

const FACE_ROT = {
  front:  { x: 0,   y: 0   },
  back:   { x: 0,   y: 180 },
  right:  { x: 0,   y: -90 },
  left:   { x: 0,   y: 90  },
  top:    { x: -90, y: 0   },
  bottom: { x: 90,  y: 0   },
};

const ORDER = ["top","front","bottom","back","right","left"];
let index = 0;

function setActive(face){
  const rot = FACE_ROT[face];
  cube.style.transform = `translate(-50%, -50%) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
  tabs.forEach(btn => btn.classList.toggle("is-active", btn.dataset.face === face));
  index = Math.max(0, ORDER.indexOf(face));
}

tabs.forEach(btn => {
  btn.addEventListener("click", () => setActive(btn.dataset.face));
});

function step(dir){
  index = (index + dir + ORDER.length) % ORDER.length;
  setActive(ORDER[index]);
}

window.addEventListener("wheel", (e) => {
  e.preventDefault();
  step(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

let startX = 0, startY = 0, tracking = false;

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

  if (Math.abs(dy) > Math.abs(dx)){
    step(dy > 0 ? -1 : 1);
  } else {
    step(dx > 0 ? -1 : 1);
  }
});

/* ===== Auto-fit per side (each element separately) ===== */

function fitParagraphToAvailableHeight(box, p, {
  headerSelector = null,
  headerGapPx = 0,
  minPx = 12,
  maxPx = 26,
  steps = 12,
} = {}) {
  if (!box || !p) return;
  if (box.clientWidth === 0 || box.clientHeight === 0) return;

  const availableH = () => {
    const header = headerSelector ? box.querySelector(headerSelector) : null;
    const headerH = header ? header.getBoundingClientRect().height : 0;
    return Math.max(0, box.clientHeight - headerH - headerGapPx);
  };

  const fits = (px) => {
    p.style.fontSize = `${px}px`;
    return p.scrollHeight <= availableH() && p.scrollWidth <= box.clientWidth;
  };

  let lo = minPx;
  let hi = maxPx;

  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }

  p.style.fontSize = `${lo}px`;
}

function observeAutofitForBox(box, opts){
  const p = box.querySelector("p");
  if (!p) return;

  const run = () => fitParagraphToAvailableHeight(box, p, opts);

  // 1) первичный расчёт
  requestAnimationFrame(run);
  window.addEventListener("load", run);

  // 2) индивидуальный ResizeObserver на КАЖДЫЙ box [web:307][web:269]
  const ro = new ResizeObserver(() => run());
  ro.observe(box);
}

/* TOP: отдельные параметры */
const topBox = document.querySelector(".face--top .card__content");
if (topBox){
  observeAutofitForBox(topBox, {
    headerSelector: "h2",
    headerGapPx: 10,
    minPx: 12,
    maxPx: 26,
    steps: 12,
  });
}

/* FRONT: отдельные параметры (без h2, другие min/max) */
const frontBox = document.querySelector(".face--front .card__content");
if (frontBox){
  observeAutofitForBox(frontBox, {
    headerSelector: null,
    headerGapPx: 0,
    minPx: 11,
    maxPx: 19,
    steps: 12,
  });
}

setActive("top");
