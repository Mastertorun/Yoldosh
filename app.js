// Yo'ldosh — pilot web app (PWA + Telegram Mini App)
import { TEXTS, fixUz } from './i18n.js';

const SUPA_URL = 'https://furzmizxdxhdvapxhzje.supabase.co';
const SUPA_KEY = 'sb_publishable_BXCIrfns7IRAqaV0-8B2rg_BXT_qav0'; // public key; data is protected by RLS
const CENTER = [69.2797, 41.3111];
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const VERSION = 'pilot-0.2';

const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

// ---------- state ----------
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem('yd_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('yd_' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('yd_' + k); } catch {} }
};
const S = {
  lang: LS.get('lang', 'uz'),
  lite: LS.get('lite', false),
  user: null, summary: null,
  pos: null, posOk: false,
  tab: 'map',
  routesGeo: null, routesList: null,
  crowd: {}, stops: [],
  trip: LS.get('trip', null),
  queue: LS.get('queue', []),
  map: null, myMap: null,
  online: navigator.onLine
};

const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
if (tg) { try { tg.ready(); tg.expand(); } catch {} }

// ---------- helpers ----------
function t(key, vars = {}) {
  let s = (TEXTS[S.lang] && TEXTS[S.lang][key]) ?? TEXTS.uz[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', v);
  return S.lang === 'uz' || key.startsWith('lvl_') ? fixUz(s) : s;
}
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = () => $('#app');
const LEVEL_COLORS = { 0: 'var(--l0)', 1: 'var(--l1)', 2: 'var(--l2)', 3: 'var(--l3)', 4: 'var(--l4)' };
const LEVEL_HEX = { 0: '#a7aca9', 1: '#2E9E5B', 2: '#E2B400', 3: '#EF7D1A', 4: '#D93B3B' };

function toast(msg, ms = 2600) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}
function openSheet(html, onMount) {
  const sh = $('#sheet'), bd = $('#sheet-backdrop');
  sh.innerHTML = html; sh.classList.remove('hidden'); bd.classList.remove('hidden');
  bd.onclick = closeSheet;
  if (onMount) onMount(sh);
}
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheet-backdrop').classList.add('hidden'); $('#sheet').innerHTML = ''; }

async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}

// Original duck illustration for each crowd level (1..4). Colour + picture + label.
function duckSVG(level) {
  const c = LEVEL_HEX[level] || LEVEL_HEX[0];
  const duck = (x, y, s = 1, sweat = false, eyes = 'dot') => `
    <g transform="translate(${x},${y}) scale(${s})">
      <ellipse cx="0" cy="8" rx="14" ry="10" fill="#FFD84D" stroke="#1d2421" stroke-width="1.5"/>
      <circle cx="9" cy="-6" r="8" fill="#FFD84D" stroke="#1d2421" stroke-width="1.5"/>
      <path d="M16 -6 l8 2 l-8 3 z" fill="#F28C28" stroke="#1d2421" stroke-width="1"/>
      ${eyes === 'round' ? '<circle cx="11" cy="-8" r="2.6" fill="#fff" stroke="#1d2421"/><circle cx="11" cy="-8" r="1.2" fill="#1d2421"/>' : '<circle cx="11" cy="-8" r="1.5" fill="#1d2421"/>'}
      ${sweat ? '<path d="M3 -14 q-2 4 0 5 q2 -1 0 -5z" fill="#5BB8F0"/>' : ''}
    </g>`;
  let inner = '';
  if (level === 1) inner = duck(44, 34, 1.15) + `<path d="M20 40 q-8 -6 -10 -12" stroke="#1d2421" stroke-width="1.5" fill="none"/><path d="M68 40 q8 -6 10 -12" stroke="#1d2421" stroke-width="1.5" fill="none"/>`;
  else if (level === 2) inner = `<line x1="62" y1="4" x2="62" y2="62" stroke="#888" stroke-width="3"/>` + duck(22, 40, .75) + duck(44, 40, .75) + duck(70, 34, .9);
  else if (level === 3) inner = duck(18, 40, .7, true, 'round') + duck(40, 36, .7, true, 'round') + duck(62, 40, .7, true, 'round') + duck(30, 20, .6, true, 'round') + duck(54, 18, .6, true, 'round');
  else if (level === 4) inner = `<rect x="4" y="6" width="58" height="54" rx="6" fill="#fff" stroke="#1d2421" stroke-width="1.5"/>` +
      duck(16, 40, .55, true, 'round') + duck(34, 40, .55, true, 'round') + duck(50, 40, .55, true, 'round') + duck(24, 22, .5, true, 'round') + duck(44, 22, .5, true, 'round') +
      `<path d="M66 12 q4 -4 6 0" stroke="#fff8d0" stroke-width="3" fill="none"/>` + duck(78, 44, .6);
  else inner = `<text x="44" y="44" text-anchor="middle" font-size="34" fill="#888">?</text>`;
  return `<svg viewBox="0 0 92 66" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="92" height="66" rx="12" fill="${c}" opacity=".18"/>${inner}</svg>`;
}
function loadLabel(st) {
  if (!st) return `<span class="load"><span class="dot" style="background:var(--l0)"></span>${t('home_no_marks')}</span>`;
  const enough = st.total_weight >= 0.6;
  const lv = enough ? st.level : 0;
  const mins = Math.max(0, Math.round((Date.now() - new Date(st.last_at).getTime()) / 60000));
  return `<span class="load"><span class="dot" style="background:${LEVEL_COLORS[lv]}"></span>${enough ? t('load_' + st.level) : t('load_unknown')}</span>
          <span class="muted"> · ${t('home_marks_ago', { n: st.reports, m: mins })}${st.stroller_space ? ' · 👶' : ''}</span>`;
}
function routeChip(ref, pilot = true) { return `<span class="route-chip ${pilot ? '' : 'np'}">${esc(ref)}</span>`; }
const BADGE_ICONS = { ilk_qadam: '👣', yuzlik: '💯', mingta: '🏆', tong_yulduzi: '🌅', tungi_yolovchi: '🌙', kashfiyotchi: '🧭', butun_shahar: '🏙️', metro_ustasi: '🚇', mehribon: '💚', koz: '👁️', ovoz: '📣', bilagon: '🎓', navroz_2027: '🌷', sodiq: '🤝', birinchilar: '🐣' };

// ---------- geolocation ----------
function getPos(timeout = 8000) {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res(p), () => res(null), { enableHighAccuracy: true, timeout, maximumAge: 60000 });
  });
}

// ---------- offline queue ----------
function enqueue(fn, args) { S.queue.push({ fn, args, at: Date.now() }); LS.set('queue', S.queue); }
async function flushQueue() {
  if (!S.queue.length || !navigator.onLine) return;
  const left = [];
  for (const job of S.queue) {
    if (Date.now() - job.at > 20 * 60000 && job.fn === 'report_crowd') continue; // stale crowd marks are useless
    try { await rpc(job.fn, job.args); } catch (e) { if (!navigator.onLine) left.push(job); }
  }
  S.queue = left; LS.set('queue', S.queue);
}
window.addEventListener('online', () => { S.online = true; flushQueue(); refreshTopbar(); });
window.addEventListener('offline', () => { S.online = false; refreshTopbar(); });
setInterval(flushQueue, 30000);

// ---------- boot ----------
async function boot() {
  document.documentElement.lang = S.lang;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user || null;
  if (S.user) {
    try { S.summary = await rpc('my_summary'); } catch { S.summary = null; }
  }
  if (!S.user || !S.summary?.profile) return onboarding(S.user ? 'nick' : 'lang');
  S.lang = S.summary.profile.lang || S.lang; LS.set('lang', S.lang);
  flushQueue();
  if (S.trip) return tripScreen();
  mainShell();
}

// ---------- onboarding ----------
const OB = LS.get('ob', { step: 'lang', age: null, consents: { terms: false, location_trip: true, research: false, news: false } });
function saveOB() { LS.set('ob', OB); }

const NICK_A = ['Tez', 'Quvnoq', 'Dono', 'Yorqin', 'Mehribon', 'Chaqqon', 'Sokin', 'Botir', 'Shod', 'Ziyrak'];
const NICK_B = ['Laylak', 'Lochin', 'Bulbul', 'Turna', 'Kaptar', 'Qaldirgʻoch', 'Oʻrdak', 'Burgut', 'Tovus', 'Chumchuq'];
function randomNick() { return NICK_A[Math.random() * NICK_A.length | 0] + ' ' + NICK_B[Math.random() * NICK_B.length | 0] + ' ' + (10 + Math.random() * 90 | 0); }
const BAD = ['xuy', 'хуй', 'pizd', 'пизд', 'бля', 'blya', 'ebat', 'ебат', 'sik', 'jalab', 'жалаб', 'fuck', 'shit', 'qotoq', 'кутак', 'qutoq', 'сука', 'suka'];
const badNick = (n) => BAD.some(w => n.toLowerCase().includes(w));

function obFrame(inner, step, total = 6) {
  app().innerHTML = `<div class="screen full">${inner}<div class="dots">${Array.from({ length: total }, (_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div></div>`;
}

async function onboarding(step) {
  if (step) { OB.step = step; saveOB(); }
  const s = OB.step;
  if (s === 'lang') {
    obFrame(`<div class="onb-art"><div class="logo-duck"></div></div><h1>Tilni tanlang · Язык · Language</h1>
      ${[['uz', 'Oʻzbekcha'], ['ru', 'Русский'], ['en', 'English']].map(([k, n]) => `<button class="choice ${S.lang === k ? 'sel' : ''}" data-l="${k}">${n}</button>`).join('')}
      <p></p><button class="btn" id="next">${t('onb_next')}</button>`, 0);
    app().querySelectorAll('[data-l]').forEach(b => b.onclick = () => { S.lang = b.dataset.l; LS.set('lang', S.lang); onboarding('lang'); });
    $('#next').onclick = () => onboarding('intro');
  } else if (s === 'intro') {
    obFrame(`<div class="grid2" style="margin-top:8px">${[1, 2, 3, 4].map(l => `<div style="text-align:center">${duckSVG(l)}<div class="muted">${t('load_' + l)}</div></div>`).join('')}</div>
      <div class="card"><b>${t('onb_s1_title')}</b><p class="muted">${t('onb_s1_text')}</p></div>
      <div class="card"><b>${t('onb_s2_title')}</b><p class="muted">${t('onb_s2_text')}</p></div>
      <div class="card"><b>${t('onb_s3_title')}</b><p class="muted">${t('onb_s3_text')}</p></div>
      <p class="muted"><span class="pill pilot">${t('pilot_badge')}</span> ${t('pilot_note')}</p>
      <button class="btn" id="next">${t('onb_start')}</button>`, 1);
    $('#next').onclick = () => onboarding('age');
  } else if (s === 'age') {
    obFrame(`<h1>${t('onb_age_title')}</h1>
      <button class="choice" data-a="under13">${t('onb_age_under13')}</button>
      <button class="choice" data-a="teen">${t('onb_age_teen')}</button>
      <button class="choice" data-a="adult">${t('onb_age_adult')}</button>
      <div id="agemsg"></div>`, 2);
    app().querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      if (b.dataset.a === 'under13') { $('#agemsg').innerHTML = `<div class="card">${t('onb_age_under13_msg')}</div>`; LS.set('blocked', true); return; }
      OB.age = b.dataset.a; saveOB();
      if (OB.age === 'teen') { $('#agemsg').innerHTML = `<div class="card">${t('onb_age_teen_note')}</div><button class="btn" id="go">${t('onb_next')}</button>`; $('#go').onclick = () => onboarding('consent'); }
      else onboarding('consent');
    });
    if (LS.get('blocked')) $('#agemsg').innerHTML = `<div class="card">${t('onb_age_under13_msg')}</div>`;
  } else if (s === 'consent') {
    const c = OB.consents;
    const row = (k, label, note = '', link = false) => `<label class="chk"><input type="checkbox" data-c="${k}" ${c[k] ? 'checked' : ''}><div><div>${label}</div>${note ? `<div class="muted">${note}</div>` : ''}${link ? `<button class="muted" style="text-decoration:underline;padding:4px 0" id="readrules">${t('onb_consent_read')}</button>` : ''}</div></label>`;
    obFrame(`<h1>${t('onb_consent_title')}</h1><div class="card">
      ${row('terms', t('onb_consent_terms'), '', true)}
      ${row('location_trip', t('onb_consent_geo'), t('onb_consent_geo_note'))}
      ${row('research', t('onb_consent_research'))}
      ${row('news', t('onb_consent_news'))}</div>
      <div id="cerr"></div>
      <button class="btn" id="next" ${c.terms ? '' : 'disabled'}>${t('onb_next')}</button>`, 3);
    app().querySelectorAll('[data-c]').forEach(i => i.onchange = () => { c[i.dataset.c] = i.checked; saveOB(); $('#next').disabled = !c.terms; });
    $('#readrules').onclick = (e) => { e.preventDefault(); openSheet(`<h2>${t('p_rules')}</h2><p>${t('rules_text')}</p><button class="btn" onclick="document.getElementById('sheet-backdrop').click()">${t('close')}</button>`); };
    $('#next').onclick = async () => {
      $('#next').disabled = true;
      try {
        if (!S.user) {
          const { data, error } = await sb.auth.signInAnonymously();
          if (error) throw error;
          S.user = data.user;
        }
        const rows = Object.entries(c).map(([kind, granted]) => ({ user_id: S.user.id, kind, granted, version: VERSION }));
        const { error } = await sb.from('consents').upsert(rows, { onConflict: 'user_id,kind' });
        if (error) throw error;
        onboarding('nick');
      } catch (e) {
        console.error(e);
        $('#cerr').innerHTML = `<div class="err">${/anonymous/i.test(e.message || '') ? t('st_auth_off') : t('st_error')}</div>`;
        $('#next').disabled = false;
      }
    };
  } else if (s === 'nick') {
    const teen = OB.age === 'teen';
    let nick = randomNick();
    obFrame(`<h1>${teen ? t('onb_nick_teen') : t('onb_nick_title')}</h1>
      <input class="input" id="nick" maxlength="24" value="${esc(nick)}" ${teen ? 'readonly' : ''} placeholder="${esc(t('onb_nick_hint'))}">
      <button class="btn ghost" id="another">${t('onb_nick_another')}</button>
      <div id="nerr"></div><p></p>
      <button class="btn" id="next">${t('onb_next')}</button>`, 4);
    $('#another').onclick = () => { $('#nick').value = randomNick(); };
    $('#next').onclick = async () => {
      const n = $('#nick').value.trim().replace(/\s+/g, ' ');
      if (n.length < 3 || badNick(n)) { $('#nerr').innerHTML = `<div class="err">${t('onb_nick_bad')}</div>`; return; }
      $('#next').disabled = true;
      const { error } = await sb.from('profiles').insert({ id: S.user.id, nickname: n, lang: S.lang, age_group: OB.age || 'adult' });
      if (error) {
        $('#next').disabled = false;
        if (error.code === '23505' && /nickname/.test(error.message)) { $('#nerr').innerHTML = `<div class="err">${t('onb_nick_taken')}</div>`; if (teen) $('#nick').value = randomNick(); return; }
        if (error.code !== '23505') { $('#nerr').innerHTML = `<div class="err">${t('st_error')}</div>`; return; }
      }
      onboarding('route');
    };
  } else if (s === 'route') {
    obFrame(`<h1>${t('onb_route_title')}</h1><p class="muted">${t('onb_route_note')}</p><div id="rl">${t('st_loading')}</div>
      <button class="btn ghost" id="skip">${t('onb_route_skip')}</button>`, 5);
    const list = await loadRoutesList();
    const refs = [...new Set(list.filter(r => r.is_pilot).map(r => r.ref))];
    const others = [...new Set(list.filter(r => !r.is_pilot).map(r => r.ref))];
    $('#rl').innerHTML = `<div class="row" style="flex-wrap:wrap;gap:8px;margin:10px 0">${refs.map(r => `<button data-r="${esc(r)}">${routeChip(r)}</button>`).join('')}</div>
      <details><summary class="muted" style="padding:8px 0">${t('trip_all_routes')}</summary><div class="row" style="flex-wrap:wrap;gap:8px">${others.map(r => `<button data-r="${esc(r)}">${routeChip(r, false)}</button>`).join('')}</div></details>`;
    app().querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { try { await rpc('set_my_route', { p_ref: b.dataset.r }); } catch {} finishOnboarding(); });
    $('#skip').onclick = finishOnboarding;
  }
}
async function finishOnboarding() {
  LS.del('ob');
  S.summary = await rpc('my_summary');
  mainShell();
}

// ---------- data ----------
async function loadRoutesList() {
  if (S.routesList) return S.routesList;
  S.routesList = await rpc('routes_list'); return S.routesList;
}
async function loadRoutesGeo() {
  if (S.routesGeo) return S.routesGeo;
  const cached = LS.get('geo_v1');
  if (cached && Date.now() - cached.at < 3 * 86400000) { S.routesGeo = cached.data; return S.routesGeo; }
  S.routesGeo = await rpc('routes_geo', { p_pilot_only: false });
  LS.set('geo_v1', { at: Date.now(), data: S.routesGeo });
  return S.routesGeo;
}
async function loadCrowd(refs) {
  if (!refs.length) return;
  try {
    const rows = await rpc('crowd_now', { p_route_refs: refs });
    for (const r of refs) delete S.crowd[r];
    for (const r of rows) {
      const prev = S.crowd[r.route_ref];
      if (!prev || r.total_weight > prev.total_weight) S.crowd[r.route_ref] = r;
    }
  } catch {}
}

// ---------- shell & tabs ----------
const ICONS = {
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  mymap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h7v7h-7z" fill="currentColor"/></svg>',
  league: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3a3 3 0 0 1-3 4M7 5H4a3 3 0 0 0 3 4"/></svg>',
  voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>'
};
function mainShell(tab = S.tab) {
  S.tab = tab;
  $('#fab')?.remove();
  if (S.map) { try { S.map.remove(); } catch {} S.map = null; }
  if (S.myMap) { try { S.myMap.remove(); } catch {} S.myMap = null; }
  app().innerHTML = `<div id="top"></div><div class="screen" id="scr"></div>
    <nav class="tabs"><div class="in">${['map', 'mymap', 'league', 'voice', 'profile'].map(k => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${ICONS[k]}<span>${t('nav_' + k)}</span></button>`).join('')}</div></nav>`;
  app().querySelectorAll('[data-t]').forEach(b => b.onclick = () => mainShell(b.dataset.t));
  refreshTopbar();
  ({ map: homeTab, mymap: myMapTab, league: leagueTab, voice: voiceTab, profile: profileTab })[tab]();
}
function refreshTopbar() {
  const top = $('#top'); if (!top) return;
  const off = !navigator.onLine || S.queue.length ? `<div class="offline-bar">${t('home_offline', { n: S.queue.length })}</div>` : '';
  top.innerHTML = off;
}

// ---------- Home (Xarita) ----------
async function homeTab() {
  const scr = $('#scr');
  const p = S.summary?.profile || {};
  scr.innerHTML = `
    <div class="row" style="gap:8px;margin-bottom:6px"><span class="brand" style="font-weight:800;color:var(--green);font-size:20px">Yoʻldosh</span><span class="pill pilot">${t('pilot_badge')}</span></div>
    <div class="search"><input id="q" placeholder="${esc(t('home_search'))}" autocomplete="off"><div class="search-res hidden" id="qr"></div></div>
    <div id="mycard"></div>
    ${S.lite ? '' : '<div id="map"></div>'}
    <div id="geonote" class="muted">${t('home_locating')}</div>
    <h2>${t('home_nearby')}</h2><div id="stops" class="card">${t('st_loading')}</div>
    <p class="muted">${t('stop_legend')}</p>`;
  document.body.insertAdjacentHTML('beforeend', `<div class="fab-wrap" id="fab"><button class="btn big" id="onbus">🚌 ${t('home_im_on_bus')}</button></div>`);
  $('#onbus').onclick = () => { $('#fab')?.remove(); chooseRouteSheet(); };
  setupSearch();
  myRouteCard(p);

  if (!S.lite) initHomeMap();
  const pos = await getPos();
  if (pos) { S.pos = [pos.coords.longitude, pos.coords.latitude]; S.posOk = true; $('#geonote').textContent = ''; }
  else { S.pos = S.pos || CENTER; S.posOk = false; $('#geonote').textContent = t('home_no_geo'); }
  if (S.map) { S.map.jumpTo({ center: S.pos, zoom: 15 }); setUserMarker(S.map, S.pos); }
  await loadStops();
}

async function myRouteCard(p) {
  const el = $('#mycard'); if (!el) return;
  if (!p.my_route_ref) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card row"><div>${routeChip(p.my_route_ref)}</div><div class="grow"><b>${t('home_my_route')}</b><div class="muted" id="mrinfo">…</div></div></div>`;
  try {
    const [lg, td] = await Promise.all([rpc('league_activity'), rpc('route_today', { p_ref: p.my_route_ref })]);
    const me = lg.find(r => r.route_ref === p.my_route_ref);
    const parts = [];
    if (me) parts.push(t('home_league_place', { n: me.rank }));
    parts.push(t('home_today_marks', { n: td.riders }));
    parts.push(t('home_task'));
    $('#mrinfo').innerHTML = parts.map(esc).join(' · ');
  } catch { $('#mrinfo').textContent = ''; }
}

function setupSearch() {
  const q = $('#q'), qr = $('#qr'); let tm;
  q.oninput = () => {
    clearTimeout(tm);
    const v = q.value.trim();
    if (!v) { qr.classList.add('hidden'); return; }
    tm = setTimeout(async () => {
      try {
        const res = await rpc('search_all', { p_q: v });
        qr.innerHTML = res.length ? res.map((r, i) => `<button data-i="${i}">${r.kind === 'route' ? routeChip(r.title) + ' ' : '📍 '}<b>${r.kind === 'route' ? '' : esc(r.title)}</b> <span class="muted">${esc(r.subtitle)}</span></button>`).join('') : `<button class="muted">—</button>`;
        qr.classList.remove('hidden');
        qr.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
          const r = res[+b.dataset.i]; qr.classList.add('hidden'); q.value = '';
          if (r.kind === 'route') routeSheet(r.id, r.title);
          else { S.pos = [r.lng, r.lat]; if (S.map) S.map.flyTo({ center: S.pos, zoom: 16 }); loadStops(); }
        });
      } catch {}
    }, 300);
  };
}

function setUserMarker(map, ll) {
  if (map._me) map._me.remove();
  const el = document.createElement('div');
  el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#2a7de1;border:3px solid #fff;box-shadow:0 0 0 2px rgba(42,125,225,.3)';
  map._me = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
}

function initHomeMap() {
  try {
    S.map = new maplibregl.Map({ container: 'map', style: MAP_STYLE, center: S.pos || CENTER, zoom: 13, attributionControl: { compact: true } });
  } catch (e) { console.warn(e); return; }
  S.map.on('load', async () => {
    S.map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    S.map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    S.map.addSource('focus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    S.map.addLayer({ id: 'lines', type: 'line', source: 'lines', paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': .75 } });
    S.map.addLayer({ id: 'focus', type: 'line', source: 'focus', paint: { 'line-color': '#0E7C66', 'line-width': 6 } });
    S.map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': 7, 'circle-color': '#fff', 'circle-stroke-color': '#0E7C66', 'circle-stroke-width': 3 } });
    S.map.on('click', 'stops', (e) => { const f = e.features[0]; const st = S.stops.find(s => s.id == f.properties.id); if (st) stopSheet(st); });
    S.map.on('mouseenter', 'stops', () => S.map.getCanvas().style.cursor = 'pointer');
    try {
      const geo = await loadRoutesGeo();
      drawPilotLines();
    } catch {}
    if (S.stops.length) drawStops();
  });
}
function drawPilotLines() {
  if (!S.map || !S.map.getSource('lines') || !S.routesGeo) return;
  const feats = S.routesGeo.filter(r => r.is_pilot).map(r => {
    const st = S.crowd[r.ref]; const lv = st && st.total_weight >= .6 ? st.level : 0;
    return { type: 'Feature', geometry: r.geojson, properties: { ref: r.ref, color: lv ? LEVEL_HEX[lv] : '#7fb5a8' } };
  });
  S.map.getSource('lines').setData({ type: 'FeatureCollection', features: feats });
}
function drawStops() {
  if (!S.map || !S.map.getSource('stops')) return;
  S.map.getSource('stops').setData({ type: 'FeatureCollection', features: S.stops.map(s => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties: { id: s.id } })) });
}

async function loadStops() {
  const el = $('#stops'); if (!el) return;
  try {
    S.stops = await rpc('stops_near', { p_lat: S.pos[1], p_lng: S.pos[0], p_radius: 800, p_limit: 12 });
  } catch { el.innerHTML = `<div>${t('st_error')}</div><button class="btn secondary" id="rt">${t('st_retry')}</button>`; $('#rt').onclick = loadStops; return; }
  const refs = new Set();
  S.stops.forEach(s => (s.routes || []).forEach(r => refs.add(r.ref)));
  if (S.routesGeo) S.routesGeo.filter(r => r.is_pilot).forEach(r => refs.add(r.ref));
  await loadCrowd([...refs]);
  drawStops(); drawPilotLines();
  const withRoutes = S.stops.filter(s => s.routes && s.routes.length);
  if (!withRoutes.length) { el.innerHTML = `<div class="muted">${t('home_no_stops')}</div>`; return; }
  // de-duplicate stops with same name
  const seen = new Set(); const list = [];
  for (const s of withRoutes) { if (seen.has(s.name)) continue; seen.add(s.name); list.push(s); if (list.length >= 6) break; }
  el.innerHTML = list.map((s, i) => {
    const uniq = [...new Map(s.routes.map(r => [r.ref, r])).values()];
    return `<button class="stop-btn bus-row" data-s="${s.id}">
      <div class="grow"><b>${s.kind === 'metro' ? 'Ⓜ ' : ''}${esc(s.name)}</b> <span class="muted">· ${s.dist} ${t('m')}</span>
        <div style="margin-top:6px">${uniq.slice(0, 4).map(r => `<div class="row" style="margin:4px 0">${routeChip(r.ref, r.pilot)}<span class="grow">${loadLabel(S.crowd[r.ref])}</span></div>`).join('')}
        ${uniq.length > 4 ? `<span class="muted">+${uniq.length - 4}</span>` : ''}</div></div></button>`;
  }).join('');
  el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => stopSheet(S.stops.find(s => s.id == b.dataset.s)));
  // "be first" invitation for a pilot route without marks
  const noMark = [...refs].find(r => !S.crowd[r] && S.routesGeo?.some(g => g.ref === r && g.is_pilot));
  if (noMark && !$('#befirst')) el.insertAdjacentHTML('afterend', `<div class="card" id="befirst" style="background:#FFF7DB">${duckSVG(0).replace('<svg', '<svg style="width:46px;height:34px;float:left;margin-right:10px"')}${esc(t('home_be_first', { route: noMark }))}</div>`);
}

function stopSheet(s) {
  const uniq = [...new Map((s.routes || []).map(r => [r.id, r])).values()];
  openSheet(`<h2>${s.kind === 'metro' ? 'Ⓜ ' : ''}${esc(s.name)}</h2><div class="muted">${esc(s.name_ru || '')}</div>
    <h2>${t('stop_routes')}</h2>
    ${uniq.length ? uniq.map(r => `<button class="bus-row stop-btn" data-r="${r.id}" data-ref="${esc(r.ref)}">${routeChip(r.ref, r.pilot)}<div class="grow"><div class="muted">→ ${esc(r.to || '')}</div>${loadLabel(S.crowd[r.ref])}</div></button>`).join('') : `<p class="muted">${t('stop_no_routes')}</p>`}
    <p class="muted">${t('stop_legend')}</p>
    <button class="btn secondary" id="cl">${t('close')}</button>`, (sh) => {
    sh.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { closeSheet(); routeSheet(+b.dataset.r, b.dataset.ref); });
    $('#cl', sh).onclick = closeSheet;
  });
}
async function routeSheet(id, ref) {
  await loadRoutesGeo().catch(() => {});
  const dirs = (S.routesGeo || []).filter(r => r.ref === ref);
  await loadCrowd([ref]);
  openSheet(`<div class="row">${routeChip(ref)}<div class="grow">${loadLabel(S.crowd[ref])}</div></div>
    ${dirs.length ? dirs.map(d => `<div class="bus-row"><div class="grow">${esc(d.from_name || '')} → <b>${esc(d.to_name || '')}</b><div class="muted">${esc(d.operator_name || '')}</div></div>${S.map ? `<button class="pill" data-show="${d.id}">${t('route_show')}</button>` : ''}</div>`).join('') : `<p class="muted">${t('stop_no_routes')}</p>`}
    <p></p><button class="btn secondary" id="cl">${t('close')}</button>`, (sh) => {
    $('#cl', sh).onclick = closeSheet;
    sh.querySelectorAll('[data-show]').forEach(b => b.onclick = () => {
      const d = dirs.find(x => x.id == b.dataset.show); closeSheet();
      if (!S.map || !d) return;
      S.map.getSource('focus')?.setData({ type: 'Feature', geometry: d.geojson, properties: {} });
      const coords = d.geojson.type === 'MultiLineString' ? d.geojson.coordinates.flat() : d.geojson.coordinates;
      const b2 = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      S.map.fitBounds(b2, { padding: 30 });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ---------- Trip ----------
async function chooseRouteSheet() {
  openSheet(`<h2>${t('trip_which_bus')}</h2><div id="near" class="muted">${t('home_locating')}</div>
    <h2>${t('trip_number')}</h2><input class="input" id="rnum" inputmode="numeric" placeholder="24"><div id="rmatch"></div>
    <p></p><button class="btn ghost" id="cl">${t('cancel')}</button>`, async (sh) => {
    $('#cl', sh).onclick = () => { closeSheet(); if (S.tab === 'map') mainShell('map'); };
    $('#sheet-backdrop').onclick = () => { closeSheet(); if (S.tab === 'map') mainShell('map'); };
    const list = await loadRoutesList();
    const show = (rows, el) => {
      el.innerHTML = rows.length ? rows.map(r => `<button class="bus-row stop-btn" data-id="${r.id}">${routeChip(r.ref, r.is_pilot)}<div class="grow">${esc(r.from_name || '')} → <b>${esc(r.to_name || '')}</b></div></button>`).join('') : '<span class="muted">—</span>';
      el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => startTrip(rows.find(x => x.id == b.dataset.id)));
    };
    $('#rnum', sh).oninput = (e) => { const v = e.target.value.trim(); show(v ? list.filter(r => r.ref === v) : [], $('#rmatch', sh)); };
    const pos = await getPos(6000);
    if (pos) {
      S.pos = [pos.coords.longitude, pos.coords.latitude];
      try { const near = await rpc('routes_near', { p_lat: S.pos[1], p_lng: S.pos[0], p_radius: 150 }); $('#near', sh).classList.remove('muted'); show(near, $('#near', sh)); if (!near.length) $('#near', sh).innerHTML = `<span class="muted">${t('home_no_stops')}</span>`; } catch { $('#near', sh).textContent = t('st_error'); }
    } else $('#near', sh).textContent = t('st_geo_off');
  });
}

let geoWatch = null, motionOn = false, lastBrake = 0, wakeLock = null;
async function startTrip(route) {
  closeSheet();
  // iOS motion permission must be requested from the tap
  try { if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission(); } catch {}
  try {
    const id = await rpc('start_trip', { p_route_id: route.id });
    S.trip = { id, route_id: route.id, ref: route.ref, to: route.to_name, started: Date.now(), points: 0, brakes: 0, marks: [], level: null, stroller: false };
    LS.set('trip', S.trip);
    tripScreen();
  } catch (e) { toast(t('st_error')); mainShell('map'); }
}
function saveTrip() { LS.set('trip', S.trip); }
function startSensors() {
  if (navigator.geolocation && geoWatch == null) {
    let last = 0;
    geoWatch = navigator.geolocation.watchPosition(async (p) => {
      if (!S.trip) return;
      const now = Date.now();
      S.pos = [p.coords.longitude, p.coords.latitude];
      if (now - last < 15000 || (p.coords.accuracy && p.coords.accuracy > 100)) return;
      last = now;
      try { await rpc('add_trip_point', { p_trip: S.trip.id, p_lat: p.coords.latitude, p_lng: p.coords.longitude, p_speed: p.coords.speed }); S.trip.points++; saveTrip(); updateTripStatus(); } catch {}
    }, () => { S.trip && ($('#gps') && ($('#gps').textContent = t('trip_gps_off'))); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  if (!motionOn) {
    motionOn = true;
    window.addEventListener('devicemotion', (e) => {
      if (!S.trip) return;
      const a = e.acceleration; if (!a || a.x == null) return;
      const m = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      if (m > 4.5 && Date.now() - lastBrake > 4000) { lastBrake = Date.now(); S.trip.brakes++; saveTrip(); updateTripStatus(); }
    });
  }
  try { navigator.wakeLock?.request('screen').then(w => wakeLock = w).catch(() => {}); } catch {}
}
function stopSensors() {
  if (geoWatch != null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
  try { wakeLock?.release(); } catch {} wakeLock = null;
}
function updateTripStatus() {
  const g = $('#gps'); if (g) g.textContent = t('trip_gps_on', { n: S.trip.points }) + ' · ' + t('trip_brakes', { n: S.trip.brakes });
}
function tripScreen() {
  $('#fab')?.remove();
  if (S.map) { try { S.map.remove(); } catch {} S.map = null; }
  const tr = S.trip;
  app().innerHTML = `<div id="top"></div><div class="screen full">
    <div class="trip-head row">${routeChip(tr.ref)}<div class="grow"><b>→ ${esc(tr.to || '')}</b><div style="opacity:.85;font-size:14px" id="gps">${t('trip_gps_on', { n: tr.points })}</div></div></div>
    <h2>${t('trip_how_full')}</h2><div class="muted">${t('trip_points_hint')}</div>
    <div class="levels">${[1, 2, 3, 4].map(l => `<button class="level-btn ${tr.level === l ? 'sel' : ''}" data-l="${l}" style="color:${LEVEL_HEX[l]}">${duckSVG(l)}<span style="color:var(--ink)">${t('load_' + l)}</span></button>`).join('')}</div>
    <div class="card toggle"><span>👶 ${t('load_stroller')}</span><label class="switch"><input type="checkbox" id="stroller" ${tr.stroller ? 'checked' : ''}><span></span></label></div>
    <div class="grid2"><button class="btn secondary" id="prob">⚠️ ${t('trip_problem')}</button><button class="btn danger" id="sos">🆘 ${t('trip_emergency')}</button></div>
    <p class="muted" style="text-align:center">💺 ${t('trip_give_seat')}</p>
    <button class="btn" id="end">${t('trip_end')}</button>
  </div>`;
  refreshTopbar();
  updateTripStatus();
  startSensors();
  $('#stroller').onchange = (e) => { tr.stroller = e.target.checked; saveTrip(); };
  app().querySelectorAll('[data-l]').forEach(b => b.onclick = () => markCrowd(+b.dataset.l));
  $('#prob').onclick = problemSheet;
  $('#sos').onclick = sosSheet;
  $('#end').onclick = endTrip;
}
async function markCrowd(level) {
  const tr = S.trip;
  const last = tr.marks[tr.marks.length - 1];
  if (last && Date.now() - last < 180000) { toast(t('trip_too_often')); return; }
  const args = { p_route_id: tr.route_id, p_level: level, p_stroller: tr.stroller, p_trip: tr.id, p_lat: S.pos?.[1] ?? null, p_lng: S.pos?.[0] ?? null };
  tr.marks.push(Date.now()); tr.level = level; saveTrip();
  app().querySelectorAll('[data-l]').forEach(b => b.classList.toggle('sel', +b.dataset.l === level));
  if (!navigator.onLine) { enqueue('report_crowd', args); refreshTopbar(); toast(t('trip_queued')); return; }
  try {
    const r = await rpc('report_crowd', args);
    if (r && r.ok === false && r.error === 'too_frequent') { toast(t('trip_too_often')); return; }
    toast(t('trip_thanks_mark'));
  } catch (e) { enqueue('report_crowd', args); refreshTopbar(); toast(t('trip_queued')); }
}
function problemSheet() {
  const cats = ['seat', 'dirty', 'ac', 'door', 'ramp', 'rude', 'phone', 'danger', 'skip', 'other'];
  let sel = null;
  openSheet(`<h2>${t('sig_title')}</h2>${cats.map(c => `<button class="choice" data-c="${c}">${t('sig_cat_' + c)}</button>`).join('')}
    <textarea class="input" id="desc" rows="2" maxlength="500" placeholder="${esc(t('sig_comment'))}"></textarea><div id="shelp"></div><p></p>
    <button class="btn" id="send" disabled>${t('sig_send')}</button><button class="btn ghost" id="cl">${t('cancel')}</button>`, (sh) => {
    sh.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      sel = b.dataset.c; sh.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('sel', x === b)); $('#send', sh).disabled = false;
      $('#shelp', sh).innerHTML = ['phone', 'danger'].includes(sel) ? `<div class="card" style="background:#FFF1F0">${t('sig_danger_help')}</div>` : '';
    });
    $('#cl', sh).onclick = closeSheet;
    $('#send', sh).onclick = async () => {
      $('#send', sh).disabled = true;
      try {
        const r = await rpc('send_signal', { p_trip: S.trip?.id || null, p_category: sel, p_description: $('#desc', sh).value });
        closeSheet(); toast(r.ok ? t('sig_sent') : t('sig_limit'), 3500);
      } catch { $('#send', sh).disabled = false; toast(t('st_error')); }
    };
  });
}
function sosSheet() {
  openSheet(`<h2>${t('sos_title')}</h2><p>${t('sos_text')}</p>
    <a class="btn danger" id="call" href="tel:112" style="text-decoration:none">📞 ${t('sos_call')}</a><p></p>
    <button class="btn ghost" id="cl">${t('sos_cancel')}</button>`, (sh) => {
    $('#cl', sh).onclick = closeSheet;
    $('#call', sh).onclick = () => { rpc('send_signal', { p_trip: S.trip?.id || null, p_category: 'emergency', p_description: 'SOS 112' }).catch(() => {}); };
  });
}
async function endTrip() {
  $('#end').disabled = true; $('#end').textContent = t('trip_confirming');
  await flushQueue();
  let res;
  try { res = await rpc('end_trip', { p_trip: S.trip.id, p_hard_brakes: S.trip.brakes }); }
  catch (e) { $('#end').disabled = false; $('#end').textContent = t('trip_end'); toast(t('st_error')); return; }
  stopSensors();
  const tr = S.trip; S.trip = null; LS.del('trip');
  postTrip(tr, res);
}
function postTrip(tr, res) {
  const sc = { driver: 0, bus: 0, route: 0 }; let thanks = false;
  const stars = (k) => `<div class="row between" style="margin:10px 0"><span>${t('post_' + k)}</span><div class="stars" data-k="${k}">${[1, 2, 3, 4, 5].map(i => `<button data-v="${i}">★</button>`).join('')}</div></div>`;
  const badgeNames = (res.badges || []).map(c => (BADGE_ICONS[c] || '🏅') + ' ' + c.replace('_', ' '));
  app().innerHTML = `<div class="screen full">
    <div class="card" style="background:${res.confirmed ? '#E6F4EC' : '#FFF4E5'}">
      <b>${res.confirmed ? '✅ ' + t('post_confirmed', { n: res.xp }) : 'ℹ️ ' + t('post_not_confirmed')}</b>
      ${res.new_cells ? `<div class="muted">🗺️ ${t('post_new_cells', { n: res.new_cells })}</div>` : ''}
      ${badgeNames.map(b => `<div class="muted">${t('post_badge', { name: esc(b) })}</div>`).join('')}
      ${res.level_up ? `<div><b>⭐ ${t('post_level_up', { level: t('lvl_' + res.level_up) })}</b></div>` : ''}
    </div>
    <h1>${t('post_title')}</h1>
    <div class="row">${routeChip(tr.ref)}<span class="muted">${t('post_smooth', { n: tr.brakes })}</span></div>
    <div class="card">${stars('driver')}${stars('bus')}${stars('route')}
      <div class="toggle"><span>🙏 ${t('post_thanks_driver')}</span><label class="switch"><input type="checkbox" id="thx"><span></span></label></div></div>
    <button class="btn" id="send">${t('post_send')}</button>
    <button class="btn ghost" id="skip">${t('post_skip')}</button></div>`;
  app().querySelectorAll('.stars').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
    sc[g.dataset.k] = +b.dataset.v; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.v <= sc[g.dataset.k]));
  }));
  $('#thx').onchange = (e) => thanks = e.target.checked;
  const done = async () => { S.summary = await rpc('my_summary').catch(() => S.summary); mainShell('map'); };
  $('#skip').onclick = done;
  $('#send').onclick = async () => {
    $('#send').disabled = true;
    try { const r = await rpc('rate_trip', { p_trip: tr.id, p_driver: sc.driver || null, p_bus: sc.bus || null, p_route: sc.route || null, p_thanks: thanks }); if (r.xp) toast('+' + r.xp); } catch {}
    done();
  };
}

// ---------- My map (fog of war) ----------
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohashBounds(h) {
  let even = true, lat = [-90, 90], lon = [-180, 180];
  for (const ch of h) {
    const cd = B32.indexOf(ch);
    for (let m = 16; m >= 1; m >>= 1) {
      const r = even ? lon : lat; const mid = (r[0] + r[1]) / 2;
      if (cd & m) r[0] = mid; else r[1] = mid;
      even = !even;
    }
  }
  return [lon[0], lat[0], lon[1], lat[1]];
}
async function myMapTab() {
  const scr = $('#scr');
  S.summary = await rpc('my_summary').catch(() => S.summary);
  const sm = S.summary || {}; const cells = sm.cells || [];
  scr.innerHTML = `<h1>${t('my_title')}</h1><div class="muted">${t('my_cells', { n: cells.length })} · ${t('my_hint')}</div>
    ${S.lite ? '' : '<div id="mymap" style="height:40vh;border-radius:16px;overflow:hidden;margin:10px 0"></div>'}
    <h2>${t('my_badges')}</h2><div class="badges">${(sm.badges || []).map(b => `<div class="badge ${b.earned ? 'on' : ''}"><div class="ic">${BADGE_ICONS[b.code] || '🏅'}</div><b>${esc(S.lang === 'ru' ? b.ru : S.lang === 'en' ? b.en : fixUz(b.uz || ''))}</b><div class="muted" style="font-size:11px">${esc(b.rule || '')}</div></div>`).join('')}</div>`;
  if (S.lite) return;
  try {
    S.myMap = new maplibregl.Map({ container: 'mymap', style: MAP_STYLE, center: CENTER, zoom: 10.5, attributionControl: { compact: true } });
    S.myMap.on('load', () => {
      const feats = cells.map(c => { const [w, s, e, n] = geohashBounds(c); return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }, properties: {} }; });
      // fog: whole city dark, opened cells as holes
      const fog = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[68.9, 41.1], [69.7, 41.1], [69.7, 41.55], [68.9, 41.55], [68.9, 41.1]], ...feats.map(f => f.geometry.coordinates[0].slice().reverse())] }, properties: {} };
      S.myMap.addSource('fog', { type: 'geojson', data: fog });
      S.myMap.addLayer({ id: 'fog', type: 'fill', source: 'fog', paint: { 'fill-color': '#26332f', 'fill-opacity': .55 } });
      S.myMap.addSource('cells', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
      S.myMap.addLayer({ id: 'cells', type: 'line', source: 'cells', paint: { 'line-color': '#2E9E5B', 'line-width': 1.5 } });
    });
  } catch {}
}

// ---------- League ----------
async function leagueTab(mode = 'activity') {
  const scr = $('#scr');
  const my = S.summary?.profile?.my_route_ref;
  scr.innerHTML = `<h1>${t('lg_title')}</h1><div class="muted">${t('lg_week')}</div>
    <div class="tabs2"><button data-m="quality" class="${mode === 'quality' ? 'on' : ''}">${t('lg_quality')}</button><button data-m="activity" class="${mode === 'activity' ? 'on' : ''}">${t('lg_activity')}</button></div>
    <div class="muted">${mode === 'quality' ? t('lg_quality_note') : t('lg_activity_note')}</div><div class="card" id="lg">${t('st_loading')}</div>`;
  scr.querySelectorAll('[data-m]').forEach(b => b.onclick = () => leagueTab(b.dataset.m));
  if (mode === 'quality') { $('#lg').innerHTML = `<p class="muted">${t('lg_not_ranked')}</p>`; return; }
  try {
    const rows = await rpc('league_activity');
    const any = rows.some(r => r.score > 0);
    $('#lg').innerHTML = (any ? '' : `<p class="muted">${t('lg_empty')}</p>`) + rows.map(r => `<div class="lg-row ${r.route_ref === my ? 'me' : ''}">
      <div class="lg-rank">${r.rank <= 3 && r.score > 0 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</div>${routeChip(r.route_ref, r.is_pilot)}
      <div class="grow"><div>${t('lg_members', { n: r.members })}${r.route_ref === my ? ' · <b>' + t('lg_your_route') + '</b>' : ''}</div></div><b>${Math.round(r.score)}</b></div>`).join('');
  } catch { $('#lg').textContent = t('st_error'); }
}

// ---------- Voice ----------
async function voiceTab() {
  const scr = $('#scr');
  S.summary = await rpc('my_summary').catch(() => S.summary);
  const sigs = S.summary?.signals || [];
  scr.innerHTML = `<h1>${t('v_title')}</h1><h2>${t('v_my_signals')}</h2>
    <div class="card">${sigs.length ? sigs.map(s => `<div class="bus-row">${s.route ? routeChip(s.route) : ''}<div class="grow"><b>${esc(t('sig_cat_' + s.category) === 'sig_cat_' + s.category ? s.category : t('sig_cat_' + s.category))}</b><div class="muted">${new Date(s.at).toLocaleString(S.lang === 'en' ? 'en-GB' : S.lang === 'ru' ? 'ru-RU' : 'uz-UZ', { dateStyle: 'short', timeStyle: 'short' })}</div></div><span class="pill">${t('v_st_' + s.status)}</span></div>`).join('') : `<p class="muted">${t('v_none')}</p>`}</div>
    <div class="card muted">📣 ${t('v_appeals_soon')}</div>`;
}

// ---------- Profile ----------
async function profileTab() {
  const scr = $('#scr');
  S.summary = await rpc('my_summary').catch(() => S.summary);
  const sm = S.summary || {}; const p = sm.profile || {};
  scr.innerHTML = `<div class="row"><div style="font-size:44px">🦆</div><div class="grow"><h1 style="margin:0">${esc(p.nickname)}</h1>
      <div class="muted">${t('p_level')}: <b>${t('lvl_' + (p.level || 1))}</b>${p.age_group === 'teen' ? ' · ' + t('p_teen') : ''}</div></div></div>
    <div class="grid2" style="margin:12px 0"><div class="stat"><b>${p.xp ?? 0}</b>${t('p_points')}</div><div class="stat"><b>${sm.trips ?? 0}</b>${t('p_trips')}</div></div>
    <div class="muted">${t('p_today', { n: sm.today_xp ?? 0 })}</div>
    <div class="card"><div class="row between"><b>${t('p_trust')}</b><b>${p.trust ?? 40}/100</b></div><div class="bar" style="margin:8px 0"><i style="width:${p.trust ?? 40}%"></i></div><div class="muted">${t('p_trust_note')}</div></div>
    <div class="card"><div class="row between"><span>${t('p_my_route')}</span>${p.my_route_ref ? routeChip(p.my_route_ref) : `<span class="muted">${t('p_none')}</span>`}</div>
      <button class="btn secondary" id="chroute" style="margin-top:10px">${t('p_change_route')}</button></div>
    <h2>${t('p_settings')}</h2>
    <div class="card"><div>${t('p_language')}</div><div class="row" style="gap:8px;margin:8px 0">${[['uz', 'Oʻz'], ['ru', 'Ру'], ['en', 'En']].map(([k, n]) => `<button class="choice ${S.lang === k ? 'sel' : ''}" style="margin:0;text-align:center" data-l="${k}">${n}</button>`).join('')}</div>
      <div class="toggle"><span>${t('p_lite')}</span><label class="switch"><input type="checkbox" id="lite" ${S.lite ? 'checked' : ''}><span></span></label></div></div>
    <button class="btn secondary" id="rules">${t('p_rules')}</button>
    <h2>${t('p_privacy')}</h2>
    <div class="card"><button class="btn secondary" id="export">${t('p_my_data')}</button><p></p><button class="btn ghost" id="delete" style="color:var(--l4)">${t('p_delete')}</button></div>
    <button class="btn ghost" id="logout">${t('p_logout')}</button>
    <p class="muted" style="text-align:center">Yoʻldosh ${VERSION}</p>`;
  scr.querySelectorAll('[data-l]').forEach(b => b.onclick = async () => { S.lang = b.dataset.l; LS.set('lang', S.lang); document.documentElement.lang = S.lang; try { await sb.from('profiles').update({ lang: S.lang }).eq('id', S.user.id); } catch {} mainShell('profile'); });
  $('#lite').onchange = (e) => { S.lite = e.target.checked; LS.set('lite', S.lite); toast(t('st_saved')); };
  $('#rules').onclick = () => openSheet(`<h2>${t('p_rules')}</h2><p>${t('rules_text')}</p><button class="btn" id="cl">${t('close')}</button>`, sh => $('#cl', sh).onclick = closeSheet);
  $('#chroute').onclick = async () => {
    const list = await loadRoutesList();
    const refs = [...new Set(list.map(r => r.ref))];
    openSheet(`<h2>${t('p_change_route')}</h2><p class="muted">${t('onb_route_note')}</p><div class="row" style="flex-wrap:wrap;gap:8px">${refs.map(r => `<button data-r="${esc(r)}">${routeChip(r, list.some(x => x.ref === r && x.is_pilot))}</button>`).join('')}</div><p></p><button class="btn ghost" id="cl">${t('cancel')}</button>`, sh => {
      $('#cl', sh).onclick = closeSheet;
      sh.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
        const r = await rpc('set_my_route', { p_ref: b.dataset.r }).catch(() => null);
        closeSheet();
        if (r && r.ok) { toast(t('st_saved')); mainShell('profile'); } else if (r && r.error === 'wait') toast(t('p_route_wait', { n: r.days })); else toast(t('st_error'));
      });
    });
  };
  $('#export').onclick = async () => {
    try {
      const data = await rpc('export_me');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'yoldosh-data.json';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { toast(t('st_error')); }
  };
  $('#delete').onclick = async () => {
    if (!confirm(t('p_delete_confirm'))) return;
    try { await rpc('delete_me'); } catch { toast(t('st_error')); return; }
    try { await sb.auth.signOut(); } catch {}
    Object.keys(localStorage).filter(k => k.startsWith('yd_') || k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)); location.reload();
  };
  $('#logout').onclick = async () => {
    if (!confirm(t('p_logout_warn'))) return;
    await sb.auth.signOut(); Object.keys(localStorage).filter(k => k.startsWith('yd_')).forEach(k => localStorage.removeItem(k)); location.reload();
  };
}

boot().catch(e => { console.error(e); app().innerHTML = `<div class="screen full"><p>${t('st_error')}</p><button class="btn" onclick="location.reload()">${t('st_retry')}</button></div>`; });
