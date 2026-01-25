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

/* wheel: чтобы preventDefault реально работал, listener должен быть passive:false [web:192][web:108] */
window.addEventListener("wheel", (e) => {
  e.preventDefault();
  step(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

/* swipe (pointer events) */
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

/* Важно: ставим начальное состояние ОДИН раз и больше не трогаем translate */
setActive("top");
