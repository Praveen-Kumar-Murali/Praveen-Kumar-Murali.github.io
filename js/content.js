// Page content, project dock and project panel. Works without the 3D scene;
// main.js plugs into window.PF to move the camera when a project is selected.
import { PROJECTS, EXPERIENCE, EDUCATION, OTHER_WORK, REPOS, SKILLS, GH } from "./data.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const PF = (window.PF = {
  current: -1,
  hooks: { select: null, overview: null },
  select,
  overview,
  setStatus,
  count: PROJECTS.length,
});

// ---------- dock ----------
const dock = $("#dockItems");
dock.innerHTML =
  `<button class="dock-item" data-i="-1"><span class="n">00</span>Overview</button>` +
  PROJECTS.map((p, i) => `<button class="dock-item" data-i="${i}"><span class="n">${String(i + 1).padStart(2, "0")}</span>${esc(p.label)}</button>`).join("");
dock.addEventListener("click", (e) => {
  const b = e.target.closest(".dock-item");
  if (!b) return;
  const i = +b.dataset.i;
  i < 0 ? overview() : select(i);
});
$("#prevBtn").onclick = () => step(-1);
$("#nextBtn").onclick = () => step(1);
$("#startTour").onclick = () => select(0);
$("#panelClose").onclick = () => overview();

function step(d) {
  const n = PROJECTS.length;
  const i = PF.current < 0 ? (d > 0 ? 0 : n - 1) : (PF.current + d + n) % n;
  select(i);
}

document.addEventListener("keydown", (e) => {
  const heroVisible = window.scrollY < window.innerHeight * 0.6;
  if (!heroVisible || e.target.closest("input, textarea, video")) return;
  if (e.key === "ArrowRight") step(1);
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "Escape") overview();
});

function markDock() {
  dock.querySelectorAll(".dock-item").forEach((b) => b.classList.toggle("active", +b.dataset.i === PF.current));
  const a = dock.querySelector(".dock-item.active");
  if (a) a.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
}

// ---------- panel ----------
function panelHTML(p, i) {
  const vids = (p.videos || [])
    .map((v) => `<figure class="media"><video controls playsinline preload="none" poster="${esc(v.poster)}" class="${v.vertical ? "vertical" : ""}"><source src="${esc(v.src)}" type="video/mp4"></video><figcaption>${esc(v.caption)}</figcaption></figure>`)
    .join("");
  const imgs = (p.images || [])
    .map((m) => `<figure class="media"><img loading="lazy" src="${esc(m.src)}" alt="${esc(m.caption)}"><figcaption>${esc(m.caption)}</figcaption></figure>`)
    .join("");
  return `
    <p class="kicker">Project ${String(i + 1).padStart(2, "0")} / ${String(PROJECTS.length).padStart(2, "0")}</p>
    <h2>${esc(p.title)}</h2>
    <p class="when">${esc(p.when)}</p>
    <p>${esc(p.summary)}</p>
    <ul>${p.did.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
    ${p.broke ? `<div class="note"><h4>${esc(p.noteTitle || "Notes")}</h4><p>${esc(p.broke)}</p></div>` : ""}
    <div class="tags">${p.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
    ${vids}${imgs}
    <div class="links">${p.links.map((l) => `<a class="btn btn-small" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</div>`;
}

function openPanel(i) {
  const panel = $("#panel");
  panel.querySelectorAll("video").forEach((v) => v.pause());
  $("#panelBody").innerHTML = panelHTML(PROJECTS[i], i);
  $("#panelBody").scrollTop = 0;
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
}
function closePanel() {
  const panel = $("#panel");
  panel.querySelectorAll("video").forEach((v) => v.pause());
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

function select(i) {
  PF.current = i;
  markDock();
  openPanel(i);
  $("#intro").classList.add("away");
  $("#scrim").classList.add("off");
  history.replaceState(null, "", "#/" + PROJECTS[i].id);
  if (window.scrollY > 10) window.scrollTo({ top: 0, behavior: "smooth" });
  PF.hooks.select && PF.hooks.select(i);
}
function overview() {
  PF.current = -1;
  markDock();
  closePanel();
  setStatus("");
  $("#intro").classList.remove("away");
  $("#scrim").classList.remove("off");
  if (location.hash.startsWith("#/")) history.replaceState(null, "", location.pathname);
  PF.hooks.overview && PF.hooks.overview();
}

let lastStatus = null;
function setStatus(text) {
  if (text === lastStatus) return;
  lastStatus = text;
  const el = $("#status");
  el.textContent = text || "";
  el.classList.toggle("on", !!text);
}

// ---------- static sections ----------
$("#projectCards").innerHTML = PROJECTS.map((p, i) => {
  const poster = p.videos?.[0]?.poster || p.images?.[0]?.src;
  const thumb = poster
    ? `<div class="thumb" style="background-image:url('${esc(poster)}')"><span class="badge">${String(i + 1).padStart(2, "0")}</span></div>`
    : `<div class="thumb empty"><span>${esc(p.label)}</span></div>`;
  return `<article class="card" data-i="${i}" tabindex="0" role="button" aria-label="Open ${esc(p.title)}">${thumb}
    <div class="body"><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p><span class="more">See it in 3D →</span></div></article>`;
}).join("");
$("#projectCards").addEventListener("click", (e) => {
  const c = e.target.closest(".card");
  if (c) select(+c.dataset.i);
});
$("#projectCards").addEventListener("keydown", (e) => {
  const c = e.target.closest(".card");
  if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(+c.dataset.i); }
});

$("#otherWork").innerHTML = OTHER_WORK.map(([t, d]) => `<li><strong>${esc(t)}</strong>${esc(d)}</li>`).join("");
$("#repos").innerHTML = REPOS.map(([name, d]) => `<a class="repo" href="${GH}/${esc(name)}" target="_blank" rel="noopener"><strong>${esc(name)}</strong>${esc(d)}</a>`).join("");
$("#timeline").innerHTML = EXPERIENCE.map((x) => `<li><span class="when">${esc(x.when)}</span><h3>${esc(x.role)}</h3><div class="org">${esc(x.org)}</div><p>${esc(x.text)}</p></li>`).join("");
$("#education").innerHTML = EDUCATION.map((x) => `<li><strong>${esc(x.title)}</strong><span>${esc(x.org)} · ${esc(x.when)}</span></li>`).join("");
$("#skillsList").innerHTML = SKILLS.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");

markDock();

// deep link: #/nav, #/slam, ... opens that project (after the 3D scene has had a moment to start)
function openFromHash() {
  const m = location.hash.match(/^#\/([\w-]+)/);
  if (!m) return;
  const i = PROJECTS.findIndex((p) => p.id === m[1]);
  if (i >= 0) select(i);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(openFromHash, 150)); else setTimeout(openFromHash, 150);
