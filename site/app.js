"use strict";
const $app = document.getElementById("app");
const STORE = "krillion-unlimited-v1";
let CATS, GAMES, PER;

// ---------- storage (best-effort) ----------
function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {} }
let state = Object.assign({ played: {}, best: 0, total: 0, count: 0 }, load());

// ---------- prompt logic (mirrors tools/generate.py) ----------
const letters = s => s.replace(/[^a-z]/gi, "");
function fits(item, k, v) {
  const t = letters(item); if (!t) return false;
  switch (k) {
    case "s": return item[0] === v;
    case "e": return t.slice(-1) === v;
    case "c": return t.includes(v);
    case "short": return t.length <= 5;
    case "long": return t.length >= 9;
    case "two": return item.includes(" ");
    case "len": return t.length === +v;
    case "dbl": return [...t].some((c, i) => i && c === t[i - 1]);
    case "vow": return "aeiou".includes(item[0]);
    case "s2": return item.replace(/ /g, "").startsWith(v);
    case "e2": return t.endsWith(v);
    default: return true;
  }
}
function suffix(k, v) {
  const V = (v || "").toUpperCase();
  return ({ s: ` that starts with ${V}`, e: ` that ends with ${V}`, c: ` that contains the letter ${V}`,
    short: " with 5 letters or fewer", long: " with 9 letters or more", two: " that is two or more words",
    len: ` with exactly ${v} letters`, dbl: " with a double letter (like “ll” or “ee”)", vow: " that starts with a vowel",
    s2: ` that starts with “${V}”`, e2: ` that ends with “${V}”` })[k] || "";
}
function buildPrompt([ci, k, v]) {
  const c = CATS[ci];
  const items = c.items.filter(i => fits(i, k, v));
  const w = items.map((_, r) => 1 / (r + 1));
  const W = w.reduce((a, b) => a + b, 0);
  // 92% of simulated players land on a listed answer; 8% give something else.
  const share = w.map(x => 0.92 * x / W);
  return { text: c.q + suffix(k, v) + "?", items, share, k, v };
}

// ---------- answer matching ----------
const norm = s => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().replace(/^(the|a|an) /, "");
function lev1(a, b) { // true if edit distance <= 1
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}
function findItem(p, raw) {
  const a = norm(raw); if (!a) return -1;
  const ns = p.items.map(norm);
  let i = ns.indexOf(a); if (i >= 0) return i;
  const sing = a.replace(/(es|s)$/, ""); i = ns.findIndex(n => n === sing || n + "s" === a || n + "es" === a);
  if (i >= 0) return i;
  if (a.length >= 5) { i = ns.findIndex(n => n.length >= 5 && lev1(a, n)); if (i >= 0) return i; }
  return -1;
}
function fitsPrompt(p, raw) {
  const a = norm(raw);
  return a.length >= 2 && /[a-z]/.test(a) && fits(a, p.k, p.v);
}
function score(p, raw) {
  const i = findItem(p, raw);
  if (i >= 0) {
    const s = p.share[i], pts = Math.round(100 * (1 - s / p.share[0]));
    return { pts, kind: "listed", pct: s * 100, item: p.items[i] };
  }
  if (fitsPrompt(p, raw)) return { pts: 100, kind: "krillion" };
  return { pts: 0, kind: "miss" };
}

// ---------- ui ----------
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtPct = n => n >= 10 ? n.toFixed(0) + "%" : n >= 1 ? n.toFixed(1) + "%" : n.toFixed(2) + "%";
function render(html) { $app.innerHTML = html; const f = $app.querySelector("[autofocus],input"); if (f) f.focus(); }

function home() {
  const unplayed = []; for (let i = 1; i <= GAMES.length; i++) if (!state.played[i]) unplayed.push(i);
  const avg = state.count ? Math.round(state.total / state.count) : 0;
  render(`
    <h1>Krillion <span>Unlimited</span></h1>
    <p class="tag">One in a krillion. Give answers few others would. Play as many games as you want.</p>
    <div class="card">
      <div class="row"><button class="btn" id="next">Play next game</button>
      <button class="btn alt" id="rand">Random game</button></div>
      <p class="meta" style="margin-top:14px">Or jump to a game (1–${GAMES.length}):</p>
      <form id="jump" class="row"><input type="number" min="1" max="${GAMES.length}" placeholder="#" style="width:110px" aria-label="Game number"><button class="btn alt">Go</button></form>
      <div class="stats"><div><b>${state.count}</b><span class="meta">games played</span></div>
      <div><b>${state.best}</b><span class="meta">best / ${PER * 100}</span></div>
      <div><b>${avg}</b><span class="meta">average</span></div></div>
    </div>
    <p class="meta">Each game is ${PER} prompts. Answer popularity is simulated from ranked answer lists, so scores are an approximation of a real player crowd.</p>`);
  document.getElementById("next").onclick = () => startGame(unplayed[0] || 1);
  document.getElementById("rand").onclick = () => startGame(unplayed.length ? unplayed[Math.random() * unplayed.length | 0] : (Math.random() * GAMES.length | 0) + 1);
  document.getElementById("jump").onsubmit = e => { e.preventDefault(); const n = +e.target.querySelector("input").value; if (n >= 1 && n <= GAMES.length) startGame(n); };
}

function startGame(n) {
  location.hash = "#/game/" + n;
  const prompts = GAMES[n - 1].map(buildPrompt);
  const g = { n, prompts, results: [], i: 0 };
  askRound(g);
}

function progress(g) {
  return `<div class="progress">${g.prompts.map((_, i) => `<i class="${i < g.i ? "done" : i === g.i ? "cur" : ""}"></i>`).join("")}</div>`;
}

function askRound(g) {
  const p = g.prompts[g.i];
  render(`
    <p class="meta">Game #${g.n} · Prompt ${g.i + 1} of ${PER} · Score ${g.results.reduce((a, r) => a + r.pts, 0)}</p>
    ${progress(g)}
    <div class="card"><div class="q">${esc(p.text)}</div>
    <form id="f" autocomplete="off"><input type="text" id="ans" autofocus placeholder="Your answer" aria-label="Your answer" autocapitalize="off" spellcheck="false">
    <div class="row" style="margin-top:12px"><button class="btn">Submit</button><button type="button" class="btn alt" id="skip">Skip</button></div></form></div>`);
  document.getElementById("f").onsubmit = e => { e.preventDefault(); const v = document.getElementById("ans").value; if (v.trim()) reveal(g, v); };
  document.getElementById("skip").onclick = () => reveal(g, "");
}

function reveal(g, raw) {
  const p = g.prompts[g.i];
  const r = raw ? score(p, raw) : { pts: 0, kind: "skip" };
  r.raw = raw; g.results.push(r);
  let msg;
  if (r.kind === "listed") msg = `<span class="good">${fmtPct(r.pct)}</span> of players said <b>${esc(r.item)}</b>.`;
  else if (r.kind === "krillion") msg = `<span class="good">One in a krillion!</span> Nobody on our list said <b>${esc(raw.trim())}</b>.`;
  else if (r.kind === "miss") msg = `<span class="bad">“${esc(raw.trim())}” doesn't fit the prompt.</span>`;
  else msg = `<span class="bad">Skipped.</span>`;
  const top = p.items.slice(0, 5).map((it, i) => `<li>${esc(it)} <span class="meta">${fmtPct(p.share[i] * 100)}</span></li>`).join("");
  const last = g.i === PER - 1;
  render(`
    <p class="meta">Game #${g.n} · Prompt ${g.i + 1} of ${PER}</p>
    ${progress({ ...g, i: g.i + 1 })}
    <div class="card"><div class="meta">${esc(p.text)}</div>
    <div class="big" style="margin:8px 0">+${r.pts}</div>
    <div class="bar"><b style="width:${r.pts}%"></b></div>
    <p>${msg}</p>
    <p class="meta" style="margin-bottom:0">Most common answers</p><ol class="top">${top}</ol></div>
    <button class="btn" id="go" autofocus>${last ? "See results" : "Next prompt"}</button>`);
  document.getElementById("go").onclick = () => { if (last) finish(g); else { g.i++; askRound(g); } };
}

function finish(g) {
  const total = g.results.reduce((a, r) => a + r.pts, 0);
  state.played[g.n] = Math.max(state.played[g.n] || 0, total) || 1;
  state.count++; state.total += total; state.best = Math.max(state.best, total); save(state);
  const rows = g.prompts.map((p, i) => `<tr><td>${esc(p.text.replace(/\?$/, ""))}<br><span class="meta">${esc(g.results[i].raw || "skipped")}</span></td><td>${g.results[i].pts}</td></tr>`).join("");
  const grid = g.results.map(r => r.pts >= 90 ? "🟩" : r.pts >= 50 ? "🟨" : r.pts > 0 ? "🟧" : "⬛").join("");
  const share = `Krillion Unlimited #${g.n}: ${total}/${PER * 100}\n${grid}`;
  render(`
    <h1>Game #${g.n} complete</h1>
    <div class="card"><div class="big">${total}<span class="meta" style="font-size:1rem"> / ${PER * 100}</span></div>
    <p style="font-size:1.6rem;margin:8px 0">${grid}</p><table>${rows}</table></div>
    <div class="row"><button class="btn" id="again" autofocus>Play next game</button><button class="btn alt" id="copy">Copy score</button><button class="btn alt" id="home">Home</button></div>`);
  document.getElementById("again").onclick = () => startGame(g.n % GAMES.length + 1);
  document.getElementById("home").onclick = () => { location.hash = ""; home(); };
  document.getElementById("copy").onclick = async e => { try { await navigator.clipboard.writeText(share); e.target.textContent = "Copied!"; } catch { e.target.textContent = share; } };
}

// ---------- boot ----------
Promise.all([fetch("data/categories.json"), fetch("data/games.json")].map(p => p.then(r => r.json())))
  .then(([c, g]) => {
    CATS = c; GAMES = g.games; PER = g.perGame;
    const m = location.hash.match(/^#\/game\/(\d+)$/);
    if (m && +m[1] >= 1 && +m[1] <= GAMES.length) startGame(+m[1]); else home();
  })
  .catch(() => render("<h1>Couldn't load games</h1><p class='meta'>Serve this folder over HTTP (e.g. <code>python3 -m http.server</code>) rather than opening the file directly.</p>"));
