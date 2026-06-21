/**
 * Dream 星图 — Dream 中心 · 技术环 · 项目多线连接
 */

const COLORS = {
  shipped: "#00f5d4",
  partial: "#ffb703",
  pending: "#f72585",
  root: "#ffffff",
  link: "rgba(160, 180, 255, 0.1)",
  linkActive: "rgba(160, 180, 255, 0.42)",
  linkTech: "rgba(160, 180, 255, 0.18)",
  linkProject: "rgba(0, 245, 212, 0.22)",
};

const STATE = {
  projects: [],
  technologies: {},
  nodes: [],
  links: [],
  layout: "galaxy",
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  dragging: null,
  panning: false,
  panStart: { x: 0, y: 0 },
  hovered: null,
  selected: null,
  lastPointer: { x: 0, y: 0 },
  stars: [],
  time: 0,
  ui: {},
  meta: {},
  lang: "zh",
};

const bgCanvas = document.getElementById("bg-canvas");
const graphCanvas = document.getElementById("graph-canvas");
const bgCtx = bgCanvas.getContext("2d");
const ctx = graphCanvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const panel = document.getElementById("detail-panel");

function pickLines(obj, zhKey, enKey = `${zhKey}En`) {
  const zh = obj?.[zhKey] ?? "";
  const en = obj?.[enKey] ?? "";
  if (STATE.lang === "en") return { primary: en || zh, secondary: "" };
  return { primary: zh, secondary: "" };
}

function pickSingle(obj, zhKey, enKey = `${zhKey}En`) {
  return pickLines(obj, zhKey, enKey).primary;
}

function uiText(key) {
  return uiPick(STATE.ui[key]);
}

function uiPick(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return STATE.lang === "en" ? item.en : item.zh;
}

function setI18n(id, obj, zhKey, enKey = `${zhKey}En`) {
  const el = document.getElementById(id);
  if (el) el.textContent = pickSingle(obj, zhKey, enKey);
}

function applyLanguage() {
  document.documentElement.lang = STATE.lang === "en" ? "en" : "zh-CN";
  document.title = STATE.lang === "en" ? "Idea Nexus" : "念枢";

  setI18n("meta-title", STATE.meta, "title");

  document.getElementById("label-shipped").textContent = uiText("shipped");
  document.getElementById("label-partial").textContent = uiText("partial");
  document.getElementById("label-pending").textContent = uiText("pending");
  document.getElementById("btn-reset").title = uiText("reset");
  document.getElementById("btn-toggle-layout").title = uiText("layout");
  document.getElementById("btn-lang").title = uiText("lang");
  document.getElementById("btn-lang").textContent = STATE.lang === "zh" ? "EN" : "中文";

  applyLayout(true);

  if (STATE.selected) openPanel(STATE.selected.idea);
  if (STATE.hovered) updateTooltip(STATE.lastPointer.x, STATE.lastPointer.y, STATE.hovered);
}

function toggleLanguage() {
  STATE.lang = STATE.lang === "zh" ? "en" : "zh";
  applyLanguage();
}

function stripLegacyHudText() {
  for (const id of [
    "meta-mission",
    "meta-mission-en",
    "meta-subtitle",
    "meta-subtitle-en",
    "meta-title-en",
    "tech-legend",
    "heading-tech",
    "footer-hint",
  ]) {
    document.getElementById(id)?.remove();
  }
  document.querySelector(".hud-legend")?.remove();
  document.querySelector("footer.hint")?.remove();
}

async function init() {
  stripLegacyHudText();
  resize();
  initStars(280);
  window.addEventListener("resize", () => {
    resize();
    applyLayout(true);
  });

  const data = await fetch("ideas.json").then((r) => r.json());
  STATE.meta = data.meta || {};
  STATE.ui = data.ui || {};
  STATE.technologies = data.technologies || {};
  buildGraph(data.ideas || []);
  applyLanguage();
  updateCounts();
  bindEvents();
  requestAnimationFrame(loop);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const c of [bgCanvas, graphCanvas]) {
    c.width = window.innerWidth * dpr;
    c.height = window.innerHeight * dpr;
    c.style.width = window.innerWidth + "px";
    c.style.height = window.innerHeight + "px";
  }
  bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initStars(count) {
  STATE.stars = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.4 + 0.2,
    phase: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.015 + 0.003,
  }));
}

function ideaStatus(idea) {
  if (idea.isRoot || idea.isTech) return null;
  if (idea.status) return idea.status;
  return "pending";
}

function nodeRadius(idea) {
  if (idea.isRoot) return 28;
  if (idea.isTech) return 16;
  const s = ideaStatus(idea);
  return s === "pending" ? 11 : 12;
}

function getTechMeta(idea) {
  if (idea.isTech && idea.techKey) return STATE.technologies[idea.techKey];
  return null;
}

function getTechColor(idea) {
  if (idea.isTech) return getTechMeta(idea)?.color || idea.color || "#888";
  return "#888";
}

function techNodeId(key) {
  return `tech-${key}`;
}

function buildGraph(projectIdeas) {
  STATE.projects = projectIdeas.filter((p) => !p.isRoot);

  const techNodes = Object.entries(STATE.technologies).map(([key, t]) => ({
    id: techNodeId(key),
    techKey: key,
    title: t.label,
    titleEn: t.labelEn,
    description: t.description,
    descriptionEn: t.descriptionEn,
    isTech: true,
    color: t.color,
  }));

  const root = projectIdeas.find((p) => p.isRoot) || {
    id: "dream",
    title: "Dream",
    titleEn: "Dream",
    isRoot: true,
    description: "",
    descriptionEn: "",
  };

  const allIdeas = [root, ...techNodes, ...STATE.projects];

  STATE.nodes = allIdeas.map((idea) => ({
    id: idea.id,
    idea,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: nodeRadius(idea),
    targetX: 0,
    targetY: 0,
  }));

  const linkSet = new Set();
  STATE.links = [];

  const addLink = (a, b, kind = "default") => {
    const key = [a, b].sort().join("--");
    if (linkSet.has(key)) return;
    linkSet.add(key);
    STATE.links.push({ source: a, target: b, kind });
  };

  for (const t of techNodes) addLink(root.id, t.id, "dream-tech");

  for (const project of STATE.projects) {
    for (const key of project.tech || []) {
      const tid = techNodeId(key);
      if (STATE.technologies[key]) addLink(project.id, tid, "project-tech");
    }
    for (const pid of project.basedOn || []) {
      if (STATE.projects.some((p) => p.id === pid)) addLink(project.id, pid, "project-project");
    }
  }

  applyLayout(true);
}

function applyLayout(instant = false) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  if (STATE.layout === "tree") layoutTree(cx, cy);
  else layoutDreamTech(cx, cy);

  if (instant) {
    for (const n of STATE.nodes) {
      n.x = n.targetX;
      n.y = n.targetY;
      n.vx = 0;
      n.vy = 0;
    }
  }
}

function layoutDreamTech(cx, cy) {
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  const spread = STATE.lang === "en" ? 1.12 : 1;
  const techR = minDim * 0.23 * spread;
  const projectR = minDim * 0.44 * spread;

  const root = STATE.nodes.find((n) => n.idea.isRoot);
  if (root) {
    root.targetX = cx;
    root.targetY = cy;
  }

  const techNodes = STATE.nodes.filter((n) => n.idea.isTech);
  techNodes.forEach((n, i) => {
    const angle = -Math.PI / 2 + ((2 * Math.PI) / techNodes.length) * i;
    n.targetX = cx + Math.cos(angle) * techR;
    n.targetY = cy + Math.sin(angle) * techR;
  });

  const techMap = new Map(techNodes.map((n) => [n.id, n]));
  const projects = STATE.nodes.filter((n) => !n.idea.isRoot && !n.idea.isTech);

  const buckets = new Map();
  for (const p of projects) {
    const keys = (p.idea.tech || []).map(techNodeId).filter((id) => techMap.has(id));
    if (!keys.length) {
      p.targetX = cx;
      p.targetY = cy + projectR;
      continue;
    }
    let ax = 0;
    let ay = 0;
    for (const k of keys) {
      const t = techMap.get(k);
      ax += t.targetX;
      ay += t.targetY;
    }
    ax /= keys.length;
    ay /= keys.length;
    const angle = Math.atan2(ay - cy, ax - cx);
    const bucket = angle.toFixed(2);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push({ node: p, angle });
  }

  for (const group of buckets.values()) {
    group.forEach(({ node, angle }, i) => {
      const spread = (group.length - 1) * 0.16;
      const a = angle - spread / 2 + 0.16 * i;
      const ring = Math.floor(i / 3);
      const r = projectR + ring * 48 + (i % 2) * 22;
      node.targetX = cx + Math.cos(a) * r;
      node.targetY = cy + Math.sin(a) * r;
    });
  }

  for (const p of projects) {
    for (const pid of p.idea.basedOn || []) {
      const parent = projects.find((n) => n.id === pid);
      if (!parent) continue;
      p.targetX = parent.targetX * 0.38 + p.targetX * 0.62;
      p.targetY = parent.targetY * 0.38 + p.targetY * 0.62;
    }
  }
}

function layoutTree(cx, cy) {
  layoutDreamTech(cx, cy);
}

function simulate() {
  const easing = 0.045;
  for (const n of STATE.nodes) {
    if (STATE.dragging === n) continue;
    n.vx += (n.targetX - n.x) * easing;
    n.vy += (n.targetY - n.y) * easing;
    n.vx *= 0.82;
    n.vy *= 0.82;
    n.x += n.vx;
    n.y += n.vy;
  }

  for (let i = 0; i < STATE.nodes.length; i++) {
    for (let j = i + 1; j < STATE.nodes.length; j++) {
      const a = STATE.nodes[i];
      const b = STATE.nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const minDist = a.radius + b.radius + (a.idea.isTech || b.idea.isTech ? 64 : 58);
      if (dist < minDist) {
        const force = (minDist - dist) * 0.028;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (STATE.dragging !== a) {
          a.vx -= fx;
          a.vy -= fy;
        }
        if (STATE.dragging !== b) {
          b.vx += fx;
          b.vy += fy;
        }
      }
    }
  }
}

function loop(t) {
  STATE.time = t * 0.001;
  simulate();
  drawBackground();
  drawGraph();
  requestAnimationFrame(loop);
}

function drawBackground() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  bgCtx.fillStyle = "#030308";
  bgCtx.fillRect(0, 0, w, h);

  const grd = bgCtx.createRadialGradient(w * 0.3, h * 0.4, 0, w * 0.3, h * 0.4, w * 0.55);
  grd.addColorStop(0, "rgba(90, 20, 140, 0.07)");
  grd.addColorStop(1, "transparent");
  bgCtx.fillStyle = grd;
  bgCtx.fillRect(0, 0, w, h);

  for (const star of STATE.stars) {
    const flicker = 0.4 + 0.6 * Math.abs(Math.sin(STATE.time * star.speed * 60 + star.phase));
    bgCtx.beginPath();
    bgCtx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
    bgCtx.fillStyle = `rgba(220, 230, 255, ${flicker * 0.55})`;
    bgCtx.fill();
  }
}

function resolveNodeColor(idea) {
  if (idea.isRoot) return COLORS.root;
  if (idea.isTech) return getTechColor(idea);
  return COLORS[ideaStatus(idea)] || COLORS.pending;
}

function drawGraph() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.save();
  ctx.translate(STATE.offsetX, STATE.offsetY);
  ctx.scale(STATE.scale, STATE.scale);

  const nodeMap = new Map(STATE.nodes.map((n) => [n.id, n]));
  const activeId = STATE.hovered?.id || STATE.selected?.id;

  for (const link of STATE.links) {
    const a = nodeMap.get(link.source);
    const b = nodeMap.get(link.target);
    if (!a || !b) continue;
    const isActive = activeId && (link.source === activeId || link.target === activeId);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = isActive
      ? COLORS.linkActive
      : link.kind === "project-project"
        ? COLORS.linkProject
        : link.kind === "project-tech"
          ? COLORS.linkTech
          : COLORS.link;
    ctx.lineWidth = isActive ? 1.5 : link.kind === "project-project" ? 1.3 : link.kind === "project-tech" ? 1.1 : 0.8;
    ctx.stroke();
  }

  for (const node of STATE.nodes) drawNode(node, node.id === activeId);
  ctx.restore();
}

function drawNode(node, isActive) {
  const { idea, x, y, radius } = node;
  const color = resolveNodeColor(idea);
  const r = radius * (isActive ? 1.2 : 1);

  const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3);
  glow.addColorStop(0, color + (isActive ? "55" : "30"));
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.35, color);
  core.addColorStop(1, color + "77");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  if (idea.isTech) {
    ctx.strokeStyle = color + "bb";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (idea.isRoot) {
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 8 + Math.sin(STATE.time * 2) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawNodeLabel(node, isActive, color, r);
}

function techRingLabel(idea) {
  const meta = getTechMeta(idea);
  if (!meta) return pickSingle(idea, "title");
  const { primary: ring } = pickLines(meta, "ringLabel", "ringLabelEn");
  return ring || pickSingle(meta, "label");
}

function projectRingLabel(idea) {
  const { primary } = pickLines(idea, "shortTitle", "shortTitleEn");
  return primary || pickSingle(idea, "title");
}

function drawNodeLabel(node, isActive, color, r) {
  const { idea, x, y } = node;
  let label = "";
  let fontSize = 11;
  let labelY = y + r + 14;
  let show = false;
  let labelColor = isActive ? "#ffffff" : "rgba(232, 234, 246, 0.78)";

  if (idea.isTech) {
    label = techRingLabel(idea);
    fontSize = STATE.lang === "en" ? 9 : 11;
    labelY = y - r - 10;
    labelColor = isActive ? "#ffffff" : color;
    show = true;
  } else if (idea.isRoot) {
    label = pickSingle(idea, "title");
    fontSize = 15;
    labelY = y + r + 16;
    show = true;
  } else {
    label = projectRingLabel(idea);
    fontSize = STATE.lang === "en" ? 8 : 9;
    labelY = y + r + 11;
    labelColor = isActive ? "#ffffff" : color + "cc";
    show = true;
  }

  if (!show || !label) return;

  const font = STATE.lang === "en" && (idea.isTech || !idea.isRoot) ? "Orbitron" : "Noto Sans SC";
  ctx.font = `500 ${fontSize}px "${font}", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = idea.isTech ? "bottom" : "top";

  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(3, 3, 8, 0.85)";
  ctx.strokeText(label, x, labelY);

  ctx.fillStyle = labelColor;
  ctx.fillText(label, x, labelY);
  ctx.textBaseline = "alphabetic";
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - STATE.offsetX) / STATE.scale,
    y: (sy - STATE.offsetY) / STATE.scale,
  };
}

function hitTest(sx, sy) {
  const { x, y } = screenToWorld(sx, sy);
  for (let i = STATE.nodes.length - 1; i >= 0; i--) {
    const n = STATE.nodes[i];
    if (Math.hypot(x - n.x, y - n.y) < n.radius + 10) return n;
  }
  return null;
}

function bindEvents() {
  graphCanvas.addEventListener("mousemove", onMouseMove);
  graphCanvas.addEventListener("mousedown", onMouseDown);
  graphCanvas.addEventListener("mouseup", onMouseUp);
  graphCanvas.addEventListener("mouseleave", onMouseLeave);
  graphCanvas.addEventListener("wheel", onWheel, { passive: false });
  graphCanvas.addEventListener("click", onClick);
  graphCanvas.addEventListener("touchstart", onTouchStart, { passive: false });
  graphCanvas.addEventListener("touchmove", onTouchMove, { passive: false });
  graphCanvas.addEventListener("touchend", onTouchEnd);
  document.getElementById("btn-reset").addEventListener("click", resetView);
  document.getElementById("btn-toggle-layout").addEventListener("click", toggleLayout);
  document.getElementById("btn-lang").addEventListener("click", toggleLanguage);
  document.getElementById("close-panel").addEventListener("click", closePanel);
}

function onMouseMove(e) {
  const hit = hitTest(e.clientX, e.clientY);
  if (STATE.dragging) {
    const { x, y } = screenToWorld(e.clientX, e.clientY);
    STATE.dragging.x = x;
    STATE.dragging.y = y;
    STATE.dragging.vx = 0;
    STATE.dragging.vy = 0;
    graphCanvas.style.cursor = "grabbing";
    return;
  }
  if (STATE.panning) {
    STATE.offsetX = e.clientX - STATE.panStart.x;
    STATE.offsetY = e.clientY - STATE.panStart.y;
    return;
  }
  STATE.hovered = hit;
  STATE.lastPointer = { x: e.clientX, y: e.clientY };
  graphCanvas.style.cursor = hit ? "pointer" : "crosshair";
  updateTooltip(e.clientX, e.clientY, hit);
}

function onMouseDown(e) {
  const hit = hitTest(e.clientX, e.clientY);
  if (hit) STATE.dragging = hit;
  else {
    STATE.panning = true;
    STATE.panStart = { x: e.clientX - STATE.offsetX, y: e.clientY - STATE.offsetY };
  }
}

function onMouseUp() {
  STATE.dragging = null;
  STATE.panning = false;
}

function onMouseLeave() {
  STATE.hovered = null;
  STATE.dragging = null;
  STATE.panning = false;
  tooltip.classList.add("hidden");
}

function onClick(e) {
  const hit = hitTest(e.clientX, e.clientY);
  if (hit) {
    STATE.selected = hit;
    openPanel(hit.idea);
  }
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  const newScale = Math.min(3, Math.max(0.3, STATE.scale * factor));
  STATE.offsetX = e.clientX - (e.clientX - STATE.offsetX) * (newScale / STATE.scale);
  STATE.offsetY = e.clientY - (e.clientY - STATE.offsetY) * (newScale / STATE.scale);
  STATE.scale = newScale;
}

let lastTouchDist = 0;

function onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0];
    const hit = hitTest(t.clientX, t.clientY);
    if (hit) STATE.dragging = hit;
    else {
      STATE.panning = true;
      STATE.panStart = { x: t.clientX - STATE.offsetX, y: t.clientY - STATE.offsetY };
    }
  } else if (e.touches.length === 2) {
    lastTouchDist = touchDist(e.touches);
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1 && STATE.dragging) {
    const t = e.touches[0];
    const { x, y } = screenToWorld(t.clientX, t.clientY);
    STATE.dragging.x = x;
    STATE.dragging.y = y;
  } else if (e.touches.length === 1 && STATE.panning) {
    const t = e.touches[0];
    STATE.offsetX = t.clientX - STATE.panStart.x;
    STATE.offsetY = t.clientY - STATE.panStart.y;
  } else if (e.touches.length === 2) {
    const dist = touchDist(e.touches);
    STATE.scale = Math.min(3, Math.max(0.3, STATE.scale * (dist / lastTouchDist)));
    lastTouchDist = dist;
  }
}

function onTouchEnd() {
  STATE.dragging = null;
  STATE.panning = false;
}

function touchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function setTechBadge(el, idea) {
  if (idea.isRoot) {
    el.classList.add("hidden");
    return;
  }
  if (idea.isTech) {
    el.classList.remove("hidden");
    el.textContent = pickSingle(getTechMeta(idea) || idea, "label");
    el.style.color = getTechColor(idea);
    return;
  }
  const names = (idea.tech || [])
    .map((k) => STATE.technologies[k])
    .filter(Boolean)
    .map((t) => pickSingle(t, "label"));
  if (!names.length) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.textContent = names.join(" · ");
  el.style.color = "rgba(232,234,246,0.55)";
}

function updateTooltip(x, y, node) {
  if (!node) {
    tooltip.classList.add("hidden");
    return;
  }
  const { idea } = node;
  const statusEl = document.getElementById("tooltip-status");
  setTechBadge(document.getElementById("tooltip-category"), idea);

  if (idea.isRoot) {
    statusEl.textContent = uiText("coreHub");
    statusEl.className = "tooltip-status shipped";
  } else if (idea.isTech) {
    statusEl.textContent = uiText("techHub");
    statusEl.className = "tooltip-status";
    statusEl.style.color = getTechColor(idea);
  } else {
    const st = ideaStatus(idea);
    statusEl.textContent = uiText(st);
    statusEl.className = "tooltip-status " + st;
    statusEl.style.color = "";
  }

  setI18n("tooltip-title", idea, "title");
  setI18n("tooltip-desc", idea, "description");
  tooltip.classList.remove("hidden");

  const rect = tooltip.getBoundingClientRect();
  let left = x + 16;
  let top = y + 16;
  if (left + rect.width > window.innerWidth - 12) left = x - rect.width - 16;
  if (top + rect.height > window.innerHeight - 12) top = y - rect.height - 16;
  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}

function openPanel(idea) {
  const statusEl = document.getElementById("panel-status");
  const glow = panel.querySelector(".panel-glow");
  setTechBadge(document.getElementById("panel-category"), idea);

  if (idea.isRoot) {
    statusEl.textContent = uiText("coreHub");
    statusEl.className = "panel-status shipped";
    glow.style.background = COLORS.root;
  } else if (idea.isTech) {
    statusEl.textContent = uiText("techHub");
    statusEl.className = "panel-status";
    statusEl.style.color = getTechColor(idea);
    glow.style.background = getTechColor(idea);
  } else {
    const st = ideaStatus(idea);
    statusEl.textContent = uiText(st);
    statusEl.className = "panel-status " + st;
    statusEl.style.color = "";
    glow.style.background = COLORS[st];
  }

  setI18n("panel-title", idea, "title");
  setI18n("panel-desc", idea, "description");

  const linksEl = document.getElementById("panel-links");
  linksEl.innerHTML = "";

  if (idea.isRoot) {
    for (const [key, t] of Object.entries(STATE.technologies)) {
      linksEl.appendChild(makeChip(pickSingle(t, "label"), `tech-${key}`));
    }
  } else if (idea.isTech) {
    for (const p of STATE.projects.filter((pr) => (pr.tech || []).includes(idea.techKey))) {
      linksEl.appendChild(makeChip(pickSingle(p, "title"), p.id));
    }
  } else {
    for (const key of idea.tech || []) {
      const t = STATE.technologies[key];
      if (t) linksEl.appendChild(makeChip(pickSingle(t, "label"), techNodeId(key)));
    }
    for (const pid of idea.basedOn || []) {
      const rel = STATE.projects.find((p) => p.id === pid);
      if (rel) linksEl.appendChild(makeChip(pickSingle(rel, "shortTitle"), rel.id));
    }
    for (const child of STATE.projects.filter((p) => (p.basedOn || []).includes(idea.id))) {
      linksEl.appendChild(makeChip(pickSingle(child, "shortTitle"), child.id));
    }
  }

  panel.classList.remove("hidden");
}

function makeChip(label, nodeId) {
  const chip = document.createElement("button");
  chip.className = "link-chip";
  chip.textContent = label;
  chip.addEventListener("click", () => {
    const node = STATE.nodes.find((n) => n.id === nodeId);
    if (node) {
      STATE.selected = node;
      openPanel(node.idea);
      focusNode(node);
    }
  });
  return chip;
}

function focusNode(node) {
  STATE.offsetX = window.innerWidth / 2 - node.x * STATE.scale;
  STATE.offsetY = window.innerHeight / 2 - node.y * STATE.scale;
}

function closePanel() {
  panel.classList.add("hidden");
  STATE.selected = null;
}

function resetView() {
  STATE.scale = 1;
  STATE.offsetX = 0;
  STATE.offsetY = 0;
  applyLayout();
  closePanel();
}

function toggleLayout() {
  STATE.layout = STATE.layout === "galaxy" ? "tree" : "galaxy";
  applyLayout();
}

function updateCounts() {
  document.getElementById("count-shipped").textContent = STATE.projects.filter(
    (i) => ideaStatus(i) === "shipped"
  ).length;
  document.getElementById("count-partial").textContent = STATE.projects.filter(
    (i) => ideaStatus(i) === "partial"
  ).length;
  document.getElementById("count-pending").textContent = STATE.projects.filter(
    (i) => ideaStatus(i) === "pending"
  ).length;
}

init();
