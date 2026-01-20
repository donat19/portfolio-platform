const stage = document.getElementById("stage");
const cube = document.getElementById("cube");
const demoBtn = document.getElementById("demoBtn");

demoBtn.addEventListener("click", () => alert("Кнопка нажалась"));

/* vh fix для мобилок (адресная строка меняет видимый viewport) */
function setVhVar() {
  const h = (window.visualViewport?.height ?? window.innerHeight);
  document.documentElement.style.setProperty("--vh", `${h * 0.01}px`);
}

setVhVar();
window.addEventListener("resize", setVhVar);
window.visualViewport?.addEventListener("resize", setVhVar);
window.visualViewport?.addEventListener("scroll", setVhVar);

const faces = [
  { x: -90, y: 0 },  // top
  { x: 0,   y: 0 },  // front
  { x: 90,  y: 0 },  // bottom
  { x: 0,   y: 180 },// back
  { x: 0,   y: -90 },// right
  { x: 0,   y: 90 }, // left
];

const faceNameByIndex = ["top", "front", "bottom", "back", "right", "left"];
const faceIndexByName = { top: 0, front: 1, bottom: 2, back: 3, right: 4, left: 5 };

let i = 0;

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.face === name);
  });
}

function apply() {
  const f = faces[i];
  cube.style.transform = `rotateX(${f.x}deg) rotateY(${f.y}deg)`;
  setActiveTab(faceNameByIndex[i]);
}

function step(dir) {
  i = (i + dir + faces.length) % faces.length;
  apply();
}

apply();

/* top nav -> direct jump */
const nav = document.querySelector(".hud__nav");
if (nav) {
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    const name = btn.dataset.face;
    if (!(name in faceIndexByName)) return;

    i = faceIndexByName[name];
    apply();
  });
}

/* wheel desktop */
let acc = 0;
let lock = false;

window.addEventListener("wheel", (e) => {
  if (lock) return;
  acc += e.deltaY;
  const thr = 120;
  if (Math.abs(acc) >= thr) {
    step(acc > 0 ? 1 : -1);
    acc = 0;
    lock = true;
    setTimeout(() => (lock = false), 250);
  }
}, { passive: true });

/* swipe mobile: preventDefault() только если это реально свайп, иначе не ломаем клики */
let t0x = 0;
let t0y = 0;
let startedOnInteractive = false;
let moved = false;

function isInteractiveTarget(target) {
  return !!target.closest?.("button, a, input, textarea, select, label");
}

stage.addEventListener("touchstart", (e) => {
  const t = e.changedTouches[0];
  t0x = t.clientX;
  t0y = t.clientY;
  moved = false;
  startedOnInteractive = isInteractiveTarget(e.target);
}, { passive: true });

stage.addEventListener("touchmove", (e) => {
  if (startedOnInteractive) return;

  const t = e.changedTouches[0];
  const dx = t.clientX - t0x;
  const dy = t.clientY - t0y;

  if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
  if (moved) e.preventDefault();
}, { passive: false });

stage.addEventListener("touchend", (e) => {
  if (startedOnInteractive) return;

  const t = e.changedTouches[0];
  const dx = t.clientX - t0x;
  const dy = t.clientY - t0y;

  if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    step(dy < 0 ? 1 : -1);
  }
}, { passive: true });
