const cube = document.getElementById("cube");
const stage = document.getElementById("stage");
const tabs = Array.from(document.querySelectorAll(".tab"));

/* ===== cube faces ===== */
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

/* ===== right projects ===== */
const projectsWrap = document.getElementById("right-projects");
let projectsCreated = false;

function createProjectCubes() {
  if (projectsCreated) return;
  projectsCreated = true;
  
  const projects = [
    { title: "Project One", corner: "from-tl" },
    { title: "Project Two", corner: "from-tr" },
    { title: "Project Three", corner: "from-bl" },
    { title: "Project Four", corner: "from-br" },
  ];
  
  projects.forEach((p) => {
    const el = document.createElement("div");
    el.className = `project-cube ${p.corner}`;
    el.textContent = p.title;
    projectsWrap.appendChild(el);
  });
}

function showProjects() {
  createProjectCubes();
  projectsWrap.classList.remove("is-faded");
  
  // Принудительный reflow для применения начальных стилей
  projectsWrap.offsetHeight;
  
  // Двойной requestAnimationFrame для гарантии
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      projectsWrap.classList.add("is-visible");
    });
  });
}

function fadeProjects() {
  projectsWrap.classList.remove("is-visible");
  projectsWrap.classList.add("is-faded");
}

/* ===== state ===== */
function setActive(face) {
  const rot = FACE_ROT[face];
  cube.style.transform =
    `translate(-50%, -50%) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
  
  tabs.forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.face === face)
  );
  
  const i = ORDER.indexOf(face);
  if (i !== -1) index = i;
  
  if (face === "right") showProjects();
  else fadeProjects();
}

tabs.forEach((btn) =>
  btn.addEventListener("click", () => setActive(btn.dataset.face))
);

/* ===== navigation ===== */
function step(dir) {
  index = (index + dir + ORDER.length) % ORDER.length;
  setActive(ORDER[index]);
}

/* ===== wheel (desktop) ===== */
let wheelLock = false;
stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (wheelLock) return;
    step(e.deltaY > 0 ? 1 : -1);
    wheelLock = true;
    setTimeout(() => (wheelLock = false), 250);
  },
  { passive: false }
);

/* ===== swipe (touch only) ===== */
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

if (isTouchDevice) {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    tracking = true;
    stage.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
  });
  
  stage.addEventListener("pointerup", (e) => {
    if (!tracking) return;
    tracking = false;
    stage.releasePointerCapture(e.pointerId);
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
    
    if (Math.abs(dy) > Math.abs(dx)) step(dy > 0 ? -1 : 1);
    else step(dx > 0 ? -1 : 1);
  });
}

/* ===== init ===== */
setActive("top");
