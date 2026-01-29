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
  if (!projectsWrap) return;
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
  if (!projectsWrap) return;

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
  if (!projectsWrap) return;
  projectsWrap.classList.remove("is-visible");
  projectsWrap.classList.add("is-faded");
}

/* ===== left qrs (Contacts) ===== */

const qrsWrap = document.getElementById("left-qrs");
let qrsCreated = false;

function createQrs() {
  if (!qrsWrap) return;
  if (qrsCreated) return;

  qrsCreated = true;

  const links = Array.from(
    document.querySelectorAll(".face--left .contact-card")
  );
  const corners = ["from-tl", "from-tr", "from-bl", "from-br"];

  links.slice(0, 4).forEach((a, idx) => {
    const href = (a.getAttribute("href") || "").trim();
    const data = href.length ? href : window.location.href;

    const label = (
      a.querySelector(".contact-card__label")?.textContent ||
      `Link ${idx + 1}`
    ).trim();

    const el = document.createElement("div");
    el.className = `qr-fly ${corners[idx] || ""}`;

    const canvas = document.createElement("canvas");
    canvas.className = "qr-fly__canvas";
    canvas.dataset.qrText = data;

    const cap = document.createElement("div");
    cap.className = "qr-fly__label";
    cap.textContent = label;

    el.appendChild(canvas);
    el.appendChild(cap);
    qrsWrap.appendChild(el);

    // Дождаться layout, чтобы canvas.clientWidth был корректный (фиксит разный размер)
    requestAnimationFrame(() => drawQrToCanvas(canvas, data));
  });
}

function showQrs() {
  if (!qrsWrap) return;

  createQrs();
  qrsWrap.classList.remove("is-faded");
  qrsWrap.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      qrsWrap.classList.add("is-visible");
    });
  });
}

function fadeQrs() {
  if (!qrsWrap) return;
  qrsWrap.classList.remove("is-visible");
  qrsWrap.classList.add("is-faded");
}

/* ===== QR generator (no libs, byte mode, versions 1..4, EC L, mask 0) ===== */

function utf8Bytes(str) {
  return new TextEncoder().encode(str);
}

function makeBitBuffer() {
  const bits = [];
  return {
    push(value, length) {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    },
    get length() {
      return bits.length;
    },
    toBytes() {
      const out = [];
      for (let i = 0; i < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
        out.push(b);
      }
      return out;
    },
  };
}

// Versions 1..4, EC level L (single block)
const QR_TOTAL_CW = [0, 26, 44, 70, 100];
const QR_EC_CW_L = [0, 7, 10, 15, 20];
const QR_DATA_CW_L = QR_TOTAL_CW.map((t, i) => (t ? t - QR_EC_CW_L[i] : 0));

function pickVersionForBytes(n) {
  // byte-mode capacities for level L
  const caps = [0, 17, 32, 53, 78];
  for (let v = 1; v <= 4; v++) if (n <= caps[v]) return v;
  return 4;
}

function buildCodewords(text) {
  const data = utf8Bytes(text);
  const version = pickVersionForBytes(data.length);

  const bb = makeBitBuffer();
  bb.push(0b0100, 4); // byte mode
  bb.push(data.length, 8); // char count (versions 1..9)

  for (const b of data) bb.push(b, 8);

  bb.push(0, 4); // terminator
  while (bb.length % 8 !== 0) bb.push(0, 1);

  let bytes = bb.toBytes();
  const dataCw = QR_DATA_CW_L[version];

  const pads = [0xec, 0x11];
  let padIdx = 0;
  while (bytes.length < dataCw) bytes.push(pads[padIdx++ & 1]);

  const ecLen = QR_EC_CW_L[version];
  const ec = rsCompute(bytes, ecLen);

  return { version, codewords: bytes.concat(ec) };
}

/* ----- Reed–Solomon over GF(256) ----- */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(ecLen) {
  let poly = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCompute(dataBytes, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Array(ecLen).fill(0);

  for (const b of dataBytes) {
    const factor = b ^ res[0];
    res.shift();
    res.push(0);
    for (let j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j], factor);
  }
  return res;
}

/* ----- Matrix building ----- */

function makeMatrix(size) {
  const m = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  return { m, reserved };
}

function setModule(ctx, r, c, val, isReserved = true) {
  ctx.m[r][c] = val;
  if (isReserved) ctx.reserved[r][c] = true;
}

function placeFinder(ctx, r0, c0) {
  const size = ctx.m.length;

  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = r0 + r;
      const cc = c0 + c;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;

      const onBorder = r === -1 || r === 7 || c === -1 || c === 7;
      const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;

      if (onBorder) setModule(ctx, rr, cc, false);
      else if (inOuter) {
        setModule(
          ctx,
          rr,
          cc,
          r === 0 || r === 6 || c === 0 || c === 6 || inInner
        );
      }
    }
  }
}

function placeAlignment(ctx, r0, c0) {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = r0 + r;
      const cc = c0 + c;
      const dist = Math.max(Math.abs(r), Math.abs(c));
      setModule(ctx, rr, cc, dist !== 1);
    }
  }
}

function placePatterns(ctx, version) {
  const size = ctx.m.length;

  placeFinder(ctx, 0, 0);
  placeFinder(ctx, 0, size - 7);
  placeFinder(ctx, size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(ctx, 6, i, i % 2 === 0);
    setModule(ctx, i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(ctx, 4 * version + 9, 8, true);

  // Alignment patterns
  const alignPos = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26] }[version];
  if (alignPos && alignPos.length) {
    for (const r of alignPos) {
      for (const c of alignPos) {
        const nearTL = r < 9 && c < 9;
        const nearTR = r < 9 && c > size - 10;
        const nearBL = r > size - 10 && c < 9;
        if (nearTL || nearTR || nearBL) continue;
        placeAlignment(ctx, r, c);
      }
    }
  }

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      ctx.reserved[8][i] = true;
      ctx.reserved[i][8] = true;
    }
  }
  for (let i = size - 8; i < size; i++) {
    ctx.reserved[8][i] = true;
    ctx.reserved[i][8] = true;
  }
  ctx.reserved[8][8] = true;
  ctx.reserved[7][8] = true;
  ctx.reserved[8][7] = true;
}

function placeData(ctx, codewords) {
  const size = ctx.m.length;

  const bits = [];
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
  }

  let bitIdx = 0;
  let dirUp = true;

  for (let c = size - 1; c >= 1; c -= 2) {
    if (c === 6) c--;

    for (let rStep = 0; rStep < size; rStep++) {
      const r = dirUp ? size - 1 - rStep : rStep;

      for (let k = 0; k < 2; k++) {
        const cc = c - k;
        if (ctx.reserved[r][cc]) continue;

        const bit = bits[bitIdx++] || 0;
        ctx.m[r][cc] = !!bit;
      }
    }

    dirUp = !dirUp;
  }
}

function applyMask0(ctx) {
  const size = ctx.m.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (ctx.reserved[r][c]) continue;
      if (((r + c) & 1) === 0) ctx.m[r][c] = !ctx.m[r][c];
    }
  }
}

function formatBits(ecLevelBits, mask) {
  let data = ((ecLevelBits & 0b11) << 3) | (mask & 0b111);
  let rem = data << 10;
  const gen = 0x537;

  for (let i = 14; i >= 10; i--) {
    if (((rem >>> i) & 1) !== 0) rem ^= gen << (i - 10);
  }

  return (((data << 10) | (rem & 0x3ff)) ^ 0x5412) & 0x7fff;
}

function placeFormat(ctx, mask) {
  const size = ctx.m.length;
  const fmt = formatBits(0b01, mask); // EC level L

  const coords1 = [
    [8, 0],
    [8, 1],
    [8, 2],
    [8, 3],
    [8, 4],
    [8, 5],
    [8, 7],
    [8, 8],
    [7, 8],
    [5, 8],
    [4, 8],
    [3, 8],
    [2, 8],
    [1, 8],
    [0, 8],
  ];

  const coords2 = [
    [size - 1, 8],
    [size - 2, 8],
    [size - 3, 8],
    [size - 4, 8],
    [size - 5, 8],
    [size - 6, 8],
    [size - 7, 8],
    [8, size - 8],
    [8, size - 7],
    [8, size - 6],
    [8, size - 5],
    [8, size - 4],
    [8, size - 3],
    [8, size - 2],
    [8, size - 1],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = ((fmt >>> (14 - i)) & 1) === 1;

    const [r1, c1] = coords1[i];
    const [r2, c2] = coords2[i];

    setModule(ctx, r1, c1, bit);
    setModule(ctx, r2, c2, bit);
  }
}

function makeQrMatrix(text) {
  const { version, codewords } = buildCodewords(text);
  const size = 17 + 4 * version;
  const ctx = makeMatrix(size);

  placePatterns(ctx, version);
  placeData(ctx, codewords);

  applyMask0(ctx);
  placeFormat(ctx, 0);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (ctx.m[r][c] === null) ctx.m[r][c] = false;
    }
  }

  return ctx.m;
}

function drawQrToCanvas(canvas, text) {
  const matrix = makeQrMatrix(text);
  const size = matrix.length;

  const border = 3;
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  // Фиксируем ВИДИМЫЙ размер по CSS (например 132px), поэтому QR всегда одинаковый.
  const target = Math.max(64, Math.floor(canvas.clientWidth || 132));

  canvas.width = target * dpr;
  canvas.height = target * dpr;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, target, target);

  const modules = size + border * 2;
  const scale = Math.max(1, Math.floor(target / modules));
  const drawn = modules * scale;
  const offset = Math.floor((target - drawn) / 2);

  ctx.fillStyle = "#0b1220";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!matrix[r][c]) continue;
      const x = offset + (c + border) * scale;
      const y = offset + (r + border) * scale;
      ctx.fillRect(x, y, scale, scale);
    }
  }
}

/* ===== state ===== */

function setActive(face) {
  const rot = FACE_ROT[face];

  cube.style.transform = `translate(-50%, -50%) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;

  tabs.forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.face === face)
  );

  const i = ORDER.indexOf(face);
  if (i !== -1) index = i;

  if (face === "right") showProjects();
  else fadeProjects();

  if (face === "left") showQrs();
  else fadeQrs();
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

/* ===== keep QR crisp on resize ===== */

window.addEventListener("resize", () => {
  document.querySelectorAll(".qr-fly__canvas").forEach((c) => {
    const t = c.dataset.qrText;
    if (t) drawQrToCanvas(c, t);
  });
});

/* ===== init ===== */

setActive("top");
