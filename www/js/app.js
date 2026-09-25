/* Horse Tinder: deck, swiping, matches, chat and your profile.
   No optional chaining or other post-Chrome-62 syntax: the Sunmi V2 WebView is Chrome 62. */
(function () {
  "use strict";
  const A = window.HorseArt;
  const D = window.HorseData;
  const P = window.HorsePrefs;
  const UI = window.HorseProfile;
  const esc = A.esc;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Saved state ----------
  const STORE_KEY = "horse-tinder-v2";
  const EXTRA_HORSES = 40;
  let state = freshState();

  function freshState() {
    return {
      profile: null,
      matches: [],
      stats: { yays: 0, nays: 0, rejections: 0, matches: 0, unmatched: 0 },
      seed: (Date.now() % 1000000007) >>> 0,
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) state = Object.assign(freshState(), JSON.parse(raw));
    } catch (e) { /* storage blocked: start fresh */ }
    state.matches.forEach(m => { m.typing = false; });
    if (state.profile) UI.unifyPhotos(state.profile);
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* not fatal */ }
  }

  // ---------- Elements ----------
  const $ = id => document.getElementById(id);
  const deckEl = $("deck"), emptyEl = $("empty"), controlsEl = $("controls");
  const matchList = $("match-list"), matchCount = $("match-count"), noMatches = $("no-matches");
  const matchesEl = document.querySelector(".matches"), tallyEl = $("tally");
  const overlay = $("overlay"), chatEl = $("chat"), profileEl = $("profile");

  let queue = [];
  let busy = false;

  // ---------- Cards ----------
  function sexWord(h) { return (D.SEXES[h.sex] || "").toLowerCase(); }

  function bars(count, active) {
    if (count < 2) return "";
    let out = "";
    for (let i = 0; i < count; i++) out += `<span${i === active ? ' class="on"' : ""}></span>`;
    return `<div class="bars">${out}</div>`;
  }

  function cardHTML(h, self) {
    const label = (self ? "Your photo" : "Photo of " + h.name);
    return `
      <div class="photo" data-photo="0">
        <div class="photo-img">${A.render(h.photos[0], { label })}</div>
        ${bars(h.photos.length, 0)}
        <span class="distance">${self ? "That's you" : D.plural(h.distance, "furlong") + " away"}</span>
        ${self ? "" : `<span class="stamp stamp-like">YAY</span><span class="stamp stamp-nope">NAY</span><span class="stamp stamp-super">SUGAR CUBE</span>`}
      </div>
      <div class="info">
        <div class="name-row"><h3 class="name">${esc(h.name)}</h3><span class="age">${h.age}</span></div>
        <div class="stats">
          <span>${esc(h.breed)} ${sexWord(h)}</span>
          <span><b>${D.fmtHeight(h.inches)}</b></span>
          <span>${esc(h.discipline)}</span>
        </div>
        ${D.LOOKING[h.lookingFor] ? `<p class="looking">Looking for <b>${D.LOOKING[h.lookingFor].toLowerCase()}</b></p>` : ""}
        ${h.bio ? `<p class="bio">${esc(h.bio)}</p>` : ""}
        <ul class="likes">${(h.likes || []).map(l => `<li>${esc(l)}</li>`).join("")}</ul>
      </div>`;
  }

  /* Tap on the photo: left third goes back, the rest goes forward */
  function flipPhoto(card, h, clientX) {
    if (h.photos.length < 2) return;
    const photo = card.querySelector(".photo");
    const rect = photo.getBoundingClientRect();
    let i = Number(photo.dataset.photo);
    i = clientX - rect.left < rect.width / 3 ? Math.max(0, i - 1) : Math.min(h.photos.length - 1, i + 1);
    photo.dataset.photo = i;
    photo.querySelector(".photo-img").innerHTML = A.render(h.photos[i], { label: "Photo " + (i + 1) + " of " + h.name });
    photo.querySelectorAll(".bars span").forEach((b, j) => b.classList.toggle("on", j === i));
  }

  function render() {
    deckEl.innerHTML = "";
    queue.slice(0, 4).reverse().forEach((h, i, arr) => {
      const depth = arr.length - 1 - i;
      const card = document.createElement("article");
      card.className = "card " + (depth === 0 ? "top" : "depth-" + depth);
      card.innerHTML = cardHTML(h);
      if (depth === 0) attachDrag(card, h);
      deckEl.appendChild(card);
    });
    const done = queue.length === 0;
    emptyEl.hidden = !done;
    deckEl.hidden = done;
    controlsEl.querySelectorAll("button").forEach(b => { b.disabled = done; });
  }

  function attachDrag(card, h) {
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, onPhoto = false;
    const like = card.querySelector(".stamp-like");
    const nope = card.querySelector(".stamp-nope");
    const sup = card.querySelector(".stamp-super");

    card.addEventListener("pointerdown", e => {
      if (busy) return;
      dragging = true;
      onPhoto = !!e.target.closest(".photo");
      startX = e.clientX; startY = e.clientY; dx = dy = 0;
      card.setPointerCapture(e.pointerId);
      card.style.transition = "none";
    });

    // Batch style writes to one per frame; pointermove fires faster than the V2 can paint
    let frame = 0;
    const paint = () => {
      frame = 0;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
      like.style.opacity = Math.max(0, Math.min(1, dx / 100));
      nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
      sup.style.opacity = Math.abs(dx) < 60 ? Math.max(0, Math.min(1, -dy / 100)) : 0;
    };

    card.addEventListener("pointermove", e => {
      if (!dragging) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      if (!frame) frame = requestAnimationFrame(paint);
    });

    const end = e => {
      if (!dragging) return;
      dragging = false;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      card.style.transition = "";
      if (dx > 110) swipe("like");
      else if (dx < -110) swipe("nope");
      else if (dy < -110 && Math.abs(dx) < 60) swipe("super");
      else {
        card.style.transform = "";
        [like, nope, sup].forEach(s => { s.style.opacity = 0; });
        if (onPhoto && e.type === "pointerup" && Math.abs(dx) < 8 && Math.abs(dy) < 8) flipPhoto(card, h, e.clientX);
      }
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  const REJECTIONS = [
    "went back to grazing.",
    "looked at your photos and flicked an ear.",
    "has very specific taste.",
    "says it's not you, it's the hay.",
    "turned around and swished a tail at you.",
    "is focusing on training right now.",
    "had a look and walked to the far end of the field.",
    "said nay.",
  ];

  function swipe(kind) {
    const card = deckEl.querySelector(".card.top");
    if (!card || busy) return;
    busy = true;
    const horse = queue[0];
    const stamp = card.querySelector(".stamp-" + kind);
    if (stamp) stamp.style.opacity = 1;

    const out = {
      like: "translate(150%, 30px) rotate(24deg)",
      nope: "translate(-150%, 30px) rotate(-24deg)",
      super: "translate(0, -140%) rotate(-4deg)",
    }[kind];
    card.style.transition = "transform 0.45s ease-in, opacity 0.45s";
    card.style.transform = out;
    card.style.opacity = "0";

    setTimeout(() => {
      queue.shift();
      busy = false;
      render();
      if (kind === "nope") {
        state.stats.nays++;
      } else {
        state.stats.yays++;
        const verdict = P.evaluate(horse, state.profile, kind);
        if (verdict.match) showMatch(horse, kind);
        else {
          state.stats.rejections++;
          const line = kind === "super" ? "ate your sugar cube and left." : pick(REJECTIONS);
          UI.toast(`<span class="toast-av avatar">${A.render(horse.photos[0], { plain: true, label: horse.name })}</span><span><b>${esc(horse.name)}</b> ${line}</span>`, 3000);
        }
      }
      renderTally();
      save();
    }, 380);
  }

  // ---------- Matches ----------
  let pendingMatch = null;

  function showMatch(h, kind) {
    const m = { horse: h, messages: [], unread: false, typing: false, sent: 0, status: "active", superLiked: kind === "super", matchedAt: Date.now() };
    state.matches.unshift(m);
    state.stats.matches++;
    pendingMatch = m;
    renderMatches();
    $("match-name").textContent = h.name;
    $("match-avatar").innerHTML = A.render(h.photos[0], { label: h.name });
    $("match-me").innerHTML = A.render(state.profile.photos[0], { label: "You" });
    const shared = state.profile.interests.filter(i => h.likes.indexOf(i) >= 0)[0];
    $("match-line").textContent = kind === "super"
      ? `Your sugar cube worked. ${h.name} is ${D.plural(h.distance, "furlong")} away and already trotting over.`
      : shared ? `You both said yay. You both like ${shared.toLowerCase()}, too.` : "You both said yay.";
    overlay.hidden = false;
    $("btn-whinny").focus();
  }

  function preview(m) {
    if (m.status === "unmatched") return "Unmatched you";
    if (m.typing) return "typing…";
    const last = m.messages[m.messages.length - 1];
    if (!last) return "New match. Say neigh!";
    return (last.from === "me" ? "You: " : "") + last.text;
  }

  function renderMatches() {
    const ms = state.matches;
    matchCount.textContent = ms.filter(m => m.status !== "unmatched").length;
    noMatches.hidden = ms.length > 0;
    matchesEl.classList.toggle("has-matches", ms.length > 0);
    matchList.innerHTML = ms.map((m, i) => `
      <li>
        <button class="match${m.unread ? " unread" : ""}${m.status === "unmatched" ? " gone" : ""}" type="button" data-index="${i}" aria-label="Chat with ${esc(m.horse.name)}">
          <div class="avatar">${A.render(m.horse.photos[0], { plain: true, label: m.horse.name })}</div>
          <div>
            <strong>${esc(m.horse.name)}</strong>
            <small>${esc(preview(m))}</small>
          </div>
          ${m.unread ? `<span class="dot" aria-label="Unread"></span>` : ""}
        </button>
      </li>`).join("");
  }

  function renderTally() {
    const s = state.stats;
    tallyEl.hidden = !s.yays;
    tallyEl.textContent = `${D.plural(s.yays, "yay")} sent, ${s.rejections} turned down`;
  }

  matchList.addEventListener("click", e => {
    const btn = e.target.closest(".match");
    if (btn) openChat(state.matches[Number(btn.dataset.index)]);
  });

  function closeOverlay() { overlay.hidden = true; }

  $("btn-whinny").addEventListener("click", () => {
    closeOverlay();
    openChat(pendingMatch, { quiet: true });
    sendMessage(pendingMatch, "*whinnies softly*");
  });
  $("btn-open-chat").addEventListener("click", () => { closeOverlay(); openChat(pendingMatch); });
  $("btn-graze").addEventListener("click", closeOverlay);
  overlay.addEventListener("click", e => { if (e.target === overlay) closeOverlay(); });

  // ---------- Chat ----------
  const C = window.HorseChat;
  const chatLog = $("chat-log"), chatForm = $("chat-form"), chatInput = $("chat-input"), quickEl = $("quick");
  const giftBtn = $("chat-gift"), vibeEl = $("vibe"), vibeFill = $("vibe-fill"), vibeDelta = $("vibe-delta");
  let activeChat = null, giftMode = false;
  // Replies waiting to be "typed", per chat. Kept in memory only: a reload drops them.
  const outbox = new Map();
  // Drawn, not typed: Android 7 turns the heart character into a colour emoji
  const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';

  function msgHTML(msg) {
    if (msg.from === "sys") return `<li class="sys${msg.kind ? " " + msg.kind : ""}">${esc(msg.text)}</li>`;
    const action = /^\*.*\*$/.test(msg.text.trim()) ? " action" : "";
    const react = msg.react
      ? `<span class="react${msg.react === "♥" ? " heart" : ""}" aria-label="${msg.react === "♥" ? "Loved" : msg.react === "ha" ? "Laughed at" : "Shocked by"} this">${msg.react === "♥" ? HEART_SVG : esc(msg.react)}</span>`
      : "";
    return `<li class="msg ${msg.from}${action}${react ? " has-react" : ""}">${esc(msg.text)}${react}</li>`;
  }

  function vibeWord(v) {
    return v >= 80 ? "Smitten" : v >= 62 ? "Into you" : v >= 40 ? "Curious" : v >= 20 ? "Cooling off" : "Not feeling it";
  }
  function renderVibe(m) {
    const v = typeof m.vibeShown === "number" ? m.vibeShown : m.vibe;
    vibeFill.style.width = v + "%";
    vibeEl.className = "vibe " + (v >= 62 ? "hi" : v >= 35 ? "mid" : "lo");
    vibeEl.setAttribute("aria-label", "Vibe: " + vibeWord(v));
    $("vibe-word").textContent = vibeWord(v);
    vibeEl.hidden = m.status === "unmatched";
  }
  function flashVibe(delta) {
    if (!delta) return;
    vibeDelta.textContent = (delta > 0 ? "+" : "−") + Math.abs(delta);
    vibeDelta.className = "vibe-delta " + (delta > 0 ? "up" : "down");
    void vibeDelta.offsetWidth; // restart the animation
    vibeDelta.classList.add("show");
  }

  function ghosting(m) {
    const p = m.horse.prefs;
    return p && p.ghostAfter && m.sent > p.ghostAfter && m.vibe < 80;
  }

  function renderChat() {
    const m = activeChat;
    if (!m) return;
    const h = m.horse;
    const gone = m.status === "unmatched";
    const shared = state.profile.interests.filter(i => h.likes.indexOf(i) >= 0);
    chatLog.innerHTML =
      `<li class="sys">You matched with ${esc(h.name)}.${shared.length ? " You both like " + esc(shared[0].toLowerCase()) + "." : ""}</li>` +
      m.messages.map(msgHTML).join("") +
      (m.mem && m.mem.date && !m.mem.calEventId && !gone
        ? `<li class="sys"><button class="btn-text" type="button" data-add-cal>Add date to calendar</button></li>` : "") +
      (m.typing ? `<li class="msg them typing" aria-label="${esc(h.name)} is typing"><span></span><span></span><span></span></li>` : "") +
      (gone ? `<li class="sys"><button class="btn-text" type="button" data-remove-chat>Remove this conversation</button></li>` : "");
    chatLog.scrollTop = chatLog.scrollHeight;
    chatForm.hidden = gone;
    quickEl.hidden = gone;
    const last = m.messages[m.messages.length - 1];
    $("chat-status").textContent = gone ? "Unmatched"
      : m.typing ? "typing…"
      : last && last.from === "me" && ghosting(m) ? "Seen"
      : m.mem && m.mem.date ? "Date: " + m.mem.date
      : `${D.plural(h.distance, "furlong")} away, grazing`;
    renderVibe(m);
  }

  function renderQuick() {
    const m = activeChat;
    if (!m) return;
    const items = giftMode
      ? C.GIFTS.map(g => ({ label: g.label, text: g.text }))
      : C.suggestions(m, state.profile).map(s => ({ label: s, text: s }));
    quickEl.innerHTML = items.map(it => `<button type="button" data-text="${esc(it.text)}"${giftMode ? ' class="gift"' : ""}>${esc(it.label)}</button>`).join("");
    quickEl.scrollLeft = 0;
    giftBtn.classList.toggle("on", giftMode);
    giftBtn.setAttribute("aria-pressed", String(giftMode));
  }

  function refresh(m) {
    if (activeChat === m) renderChat();
    renderMatches();
  }

  /* Horses type one bubble at a time, with a pause between them */
  function queueReplies(m, lines, done) {
    let q = outbox.get(m);
    if (!q) { q = { items: [], running: false }; outbox.set(m, q); }
    lines.forEach((text, i) => q.items.push({ text, done: i === lines.length - 1 ? done : null }));
    if (!lines.length && done) q.items.push({ text: null, done });
    if (!q.running) pump(m, q);
  }
  function pump(m, q) {
    const item = q.items.shift();
    if (!item) {
      q.running = false;
      if (activeChat === m && !giftMode) renderQuick();
      return;
    }
    q.running = true;
    if (item.text === null) { item.done(); refresh(m); save(); pump(m, q); return; }
    setTimeout(() => {
      m.typing = true;
      refresh(m);
      setTimeout(() => {
        m.typing = false;
        m.messages.push({ from: "them", text: item.text });
        if (activeChat !== m) m.unread = true;
        if (item.done) item.done();
        refresh(m);
        save();
        pump(m, q);
      }, 600 + Math.min(item.text.length * 28, 2000));
    }, 350 + Math.random() * 600);
  }

  function openChat(m, opts) {
    if (!m) return;
    activeChat = m;
    giftMode = false;
    m.unread = false;
    C.init(m, state.profile);
    if (typeof m.vibeShown !== "number") m.vibeShown = m.vibe;
    $("chat-avatar").innerHTML = A.render(m.horse.photos[0], { plain: true, label: m.horse.name });
    $("chat-name").textContent = m.horse.name;
    chatInput.placeholder = `Message ${m.horse.name}`;
    chatEl.hidden = false;
    renderChat();
    renderQuick();
    renderMatches();
    save();
    // Some horses message first
    if (!m.messages.length && !m.openerDone && !(opts && opts.quiet)) {
      m.openerDone = true;
      if (Math.random() < 0.65) queueReplies(m, C.opener(m, state.profile), () => { if (activeChat === m) renderQuick(); });
    }
    if (window.matchMedia && window.matchMedia("(hover: hover)").matches) chatInput.focus();
  }

  function closeChat() {
    chatEl.hidden = true;
    activeChat = null;
  }

  function sendMessage(m, text) {
    text = text.trim();
    if (!m || !text || m.status === "unmatched") return;
    C.init(m, state.profile);
    const msg = { from: "me", text };
    m.messages.push(msg);
    m.sent = (m.sent || 0) + 1;
    m.openerDone = true;
    const r = C.respond(m, state.profile, text);
    refresh(m);
    save();
    if (r.ignore) return; // ghosted: no reply, status shows "Seen"

    // The reaction lands once the horse has "read" it
    if (r.react) setTimeout(() => { msg.react = r.react; if (activeChat === m) renderChat(); save(); }, 650);

    queueReplies(m, r.replies, () => {
      m.vibeShown = m.vibe;
      if (activeChat === m) flashVibe(r.vibe);
      if (r.date) {
        m.messages.push({ from: "sys", kind: "date", text: `Date set: ${r.date}` });
        if (HorseSettings.get().autoCalendar) setTimeout(() => addToCalendar(m), 400);
      }
      if (r.unmatch) {
        m.status = "unmatched";
        m.messages.push({ from: "sys", text: `${m.horse.name} unmatched you.` });
        state.stats.unmatched++;
      }
    });
  }

  chatForm.addEventListener("submit", e => {
    e.preventDefault();
    sendMessage(activeChat, chatInput.value);
    chatInput.value = "";
  });
  quickEl.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    sendMessage(activeChat, b.getAttribute("data-text"));
    if (giftMode) { giftMode = false; renderQuick(); }
  });
  giftBtn.addEventListener("click", () => { giftMode = !giftMode; renderQuick(); });
  chatLog.addEventListener("click", e => {
    if (e.target.closest("[data-add-cal]") && activeChat) { addToCalendar(activeChat); return; }
    if (!e.target.closest("[data-remove-chat]") || !activeChat) return;
    state.matches.splice(state.matches.indexOf(activeChat), 1);
    closeChat();
    renderMatches();
    save();
  });
  $("chat-close").addEventListener("click", closeChat);
  $("chat-profile").addEventListener("click", () => openHorse(activeChat));
  chatEl.addEventListener("click", e => { if (e.target === chatEl) closeChat(); });

  // ---------- Your profile ----------
  const profileBody = $("profile-body");
  let deleteArmed = false;

  function meAsHorse() {
    const p = state.profile;
    return {
      name: p.name, age: p.age, sex: p.sex, breed: p.breed, inches: p.inches, discipline: p.discipline,
      lookingFor: p.lookingFor, bio: p.bio, likes: p.interests, photos: p.photos,
    };
  }

  function renderMe() {
    const p = state.profile;
    $("me-avatar").innerHTML = p ? A.render(p.photos[0], { plain: true, label: "You" }) : "";
  }

  function openProfile() {
    if (!state.profile) return;
    const s = state.stats;
    deleteArmed = false;
    profileBody.innerHTML = `
      <article class="card preview" id="me-card">${cardHTML(meAsHorse(), true)}</article>
      <dl class="tally-grid">
        <div><dt>Yays sent</dt><dd>${s.yays}</dd></div>
        <div><dt>Matches</dt><dd>${s.matches}</dd></div>
        <div><dt>Turned down</dt><dd>${s.rejections}</dd></div>
        <div><dt>Unmatched</dt><dd>${s.unmatched}</dd></div>
      </dl>
      <p class="secret-note">Every horse has secret preferences: who they're into, an age range, height, a coat colour they can't stand, an interest that's a dealbreaker, and how picky they are. New horses bring new preferences.</p>
      <button class="btn btn-wide" id="edit-profile" type="button">Edit profile</button>
      <button class="btn-text danger" id="delete-profile" type="button">Delete profile</button>`;
    profileEl.hidden = false;
  }
  function closeProfile() { profileEl.hidden = true; }

  profileBody.addEventListener("click", e => {
    const card = e.target.closest("#me-card .photo");
    if (card) flipPhoto($("me-card"), meAsHorse(), e.clientX);
    if (e.target.closest("#edit-profile")) {
      closeProfile();
      UI.openWizard(state.profile, p => {
        const oldShow = state.profile.showMe;
        state.profile = p;
        save();
        renderMe();
        if (p.showMe !== oldShow) newDeck(false);
        UI.toast("<b>Profile saved.</b>");
      });
    }
    const del = e.target.closest("#delete-profile");
    if (del) {
      if (!deleteArmed) {
        deleteArmed = true;
        del.textContent = "Tap again to delete your profile, matches and chats";
        return;
      }
      try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
      state = freshState();
      closeProfile();
      renderMatches();
      renderTally();
      renderMe();
      newDeck(true);
      startSetup();
    }
  });
  $("profile-close").addEventListener("click", closeProfile);
  profileEl.addEventListener("click", e => { if (e.target === profileEl) closeProfile(); });
  $("me-btn").addEventListener("click", openProfile);

  // ---------- Calendar (native plugin; the app itself never goes online) ----------
  const Cal = (function () {
    const cap = window.Capacitor;
    let plugin = null;
    try { if (cap && cap.registerPlugin) plugin = cap.registerPlugin("HorseCalendar"); } catch (e) { plugin = null; }
    if (!plugin && cap && cap.Plugins) plugin = cap.Plugins.HorseCalendar || null;
    const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
    return {
      available: native && !!plugin,
      list: () => plugin.listCalendars(),
      add: o => plugin.addEvent(o),
      remove: id => plugin.deleteEvent({ eventId: id }),
    };
  })();

  // ---------- Updates (native plugin; the only thing that goes online) ----------
  const Upd = (function () {
    const cap = window.Capacitor;
    let plugin = null;
    try { if (cap && cap.registerPlugin) plugin = cap.registerPlugin("HorseUpdate"); } catch (e) { plugin = null; }
    if (!plugin && cap && cap.Plugins) plugin = cap.Plugins.HorseUpdate || null;
    const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
    return {
      available: native && !!plugin,
      status: () => plugin.status(),
      check: () => plugin.check(),
      install: () => plugin.install(),
      on: fn => plugin.addListener("update", fn),
    };
  })();

  const updateBtn = $("update-btn");
  let updateState = "none";
  function renderUpdate(o) {
    if (!o) return;
    if (o.state === "said") { if (o.note) UI.toast(esc(o.note)); return; }
    updateState = o.state;
    const shown = ["available", "ready", "downloading", "failed"].indexOf(o.state) >= 0;
    updateBtn.hidden = !shown;
    updateBtn.disabled = o.state === "downloading";
    $("update-text").textContent = o.state === "downloading" ? `${Math.round((o.permille || 0) / 10)}%`
      : o.state === "failed" ? "Retry update" : "Update";
    updateBtn.title = o.note || (o.version ? `Horse Tinder ${o.version}` : "");
    updateBtn.setAttribute("aria-label", o.version ? `Update to Horse Tinder ${o.version}` : "Update Horse Tinder");
  }
  updateBtn.addEventListener("click", () => {
    if (!Upd.available || updateState === "downloading") return;
    UI.toast(updateState === "ready" ? "Installing. Horse Tinder closes to update, and your horses stay put."
      : "Downloading the update. It installs when it's done.");
    Upd.install();
  });
  if (Upd.available) {
    try { Upd.on(renderUpdate); } catch (e) { /* ignore */ }
    Upd.status().then(o => {
      renderUpdate(o);
      HorseSettings.setUpdater({ native: true, enabled: !!(o && o.enabled) });
    }, () => {});
  }

  function fmtDay(ts) { return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }

  function addToCalendar(m) {
    const h = m.horse, mem = m.mem;
    if (!mem || !mem.date || mem.calEventId) return Promise.resolve(false);
    if (!Cal.available) { UI.toast("Adding dates to the calendar works in the Android app."); return Promise.resolve(false); }
    C.upcoming(mem); // never into the past, even if the chat sat for days
    const st = HorseSettings.get();
    const opts = {
      title: `Horse date with ${h.name}`,
      location: mem.datePlace || mem.date,
      description: `${h.name}: ${h.age}, ${h.breed} ${sexWord(h)}, ${D.fmtHeight(h.inches)}. Likes ${h.likes.join(", ").toLowerCase()}.\nSet up on Horse Tinder. Bring carrots.`,
      start: mem.dateAt,
      end: mem.dateAt + 60 * 60000,
      reminderMinutes: st.reminder,
    };
    if (st.calendarId >= 0) opts.calendarId = st.calendarId;
    return Cal.add(opts).then(res => {
      mem.calEventId = res.eventId;
      m.messages.push({ from: "sys", kind: "cal", text: `In your calendar: ${fmtDay(mem.dateAt)}, ${fmtTime(mem.dateAt)}` });
      save();
      refresh(m);
      if (horseShown === m) openHorse(m);
      UI.toast(`<b>Date added</b> to ${esc(res.calendarName || "your calendar")}.`);
      return true;
    }, err => {
      UI.toast(err && err.code === "DENIED"
        ? "Calendar permission is off. Allow it in Android settings, under Apps > Horse Tinder."
        : "Couldn't add the date to your calendar.");
      return false;
    });
  }

  // ---------- Profiles of the horses you've matched with ----------
  const horseEl = $("horse"), horseBody = $("horse-body");
  let horseShown = null, unmatchArmed = false;

  function dateLine(m) {
    const mem = m.mem || {};
    if (!mem.date) return "No date yet";
    const place = mem.datePlace || mem.date;
    return esc(place.charAt(0).toUpperCase() + place.slice(1)) +
      (mem.dateAt ? `, ${fmtDay(mem.dateAt)} at ${fmtTime(mem.dateAt)}` : "") +
      (mem.calEventId ? ` <span class="hp-tag">In calendar</span>` : "");
  }

  function openHorse(m) {
    if (!m) return;
    C.init(m, state.profile);
    horseShown = m;
    unmatchArmed = false;
    const h = m.horse, mem = m.mem, gone = m.status === "unmatched";
    $("horse-title").textContent = h.name;
    $("horse-sub").textContent = gone ? "Unmatched you" : m.matchedAt ? `Matched ${fmtDay(m.matchedAt)}` : "Matched";
    const learned = mem.learned || { loves: [], hates: [] };
    const shared = state.profile.interests.filter(i => h.likes.indexOf(i) >= 0);
    const facts = learned.loves.map(x => `<li class="love"><span aria-hidden="true">${HEART_SVG}</span>Loves ${esc(x)}</li>`)
      .concat(learned.hates.map(x => `<li class="hate"><span aria-hidden="true">✕</span>Can't stand ${esc(x)}</li>`));
    const vibe = typeof m.vibeShown === "number" ? m.vibeShown : m.vibe;
    horseBody.innerHTML = `
      <article class="card preview" id="horse-card">${cardHTML(h)}</article>
      <section class="hp-section">
        <h3>You two</h3>
        <dl class="hp-facts">
          <div><dt>Vibe</dt><dd><span class="hp-vibe ${vibe >= 62 ? "hi" : vibe >= 35 ? "mid" : "lo"}"><span style="width:${vibe}%"></span></span>${vibeWord(vibe)}</dd></div>
          <div><dt>Messages</dt><dd>${m.messages.filter(x => x.from !== "sys").length}</dd></div>
          <div><dt>In common</dt><dd>${shared.length ? esc(shared.join(", ").toLowerCase()) : "Nothing yet"}</dd></div>
          <div><dt>Date</dt><dd>${dateLine(m)}</dd></div>
        </dl>
        ${mem.date && !mem.calEventId && !gone ? `<button class="btn-outline btn-wide" type="button" data-hp="cal">Add date to calendar</button>` : ""}
      </section>
      <section class="hp-section">
        <h3>What you've found out</h3>
        ${facts.length ? `<ul class="learned">${facts.join("")}</ul>`
          : `<p class="hp-empty">Nothing yet. Ask what ${esc(h.name)} likes, or bring up a few of your interests and watch the reaction.</p>`}
      </section>
      ${gone ? "" : `<button class="btn btn-wide" type="button" data-hp="chat">Message ${esc(h.name)}</button>`}
      <button class="btn-text danger" type="button" data-hp="unmatch">${gone ? "Remove from matches" : "Unmatch"}</button>`;
    horseEl.hidden = false;
    horseBody.scrollTop = 0;
  }
  function closeHorse() { horseEl.hidden = true; horseShown = null; }

  function removeMatch(m) {
    const at = state.matches.indexOf(m);
    if (at >= 0) state.matches.splice(at, 1);
    if (m.mem && m.mem.calEventId && Cal.available) Cal.remove(m.mem.calEventId).catch(() => {});
    if (activeChat === m) closeChat();
    closeHorse();
    renderMatches();
    save();
  }

  horseBody.addEventListener("click", e => {
    const m = horseShown;
    if (!m) return;
    if (e.target.closest("#horse-card .photo")) flipPhoto($("horse-card"), m.horse, e.clientX);
    const b = e.target.closest("[data-hp]");
    if (!b) return;
    const what = b.getAttribute("data-hp");
    if (what === "chat") { closeHorse(); if (activeChat !== m) openChat(m); }
    if (what === "cal") addToCalendar(m);
    if (what === "unmatch") {
      if (m.status !== "unmatched" && !unmatchArmed) {
        unmatchArmed = true;
        b.textContent = `Tap again to unmatch ${m.horse.name}`;
        return;
      }
      const name = m.horse.name, hadDate = !!(m.mem && m.mem.calEventId);
      removeMatch(m);
      if (m.status !== "unmatched") UI.toast(`You unmatched ${esc(name)}.` + (hadDate ? " The date is off your calendar too." : ""));
    }
  });
  $("horse-close").addEventListener("click", closeHorse);
  horseEl.addEventListener("click", e => { if (e.target === horseEl) closeHorse(); });

  // ---------- Settings ----------
  const S = window.HorseSettings;
  function renderRadius() { $("radius-text").textContent = D.plural(S.get().radius, "furlong"); }
  S.setCalendar({ available: Cal.available, list: () => Cal.list() });
  S.setActions({
    checkUpdates() { if (Upd.available) { UI.toast("Checking for updates..."); Upd.check(); } },
    newHorses() { newDeck(true); UI.toast("<b>New horses</b> just trotted in. New secrets too."); },
    resetStats() {
      state.stats = freshState().stats;
      renderTally();
      save();
      UI.toast("Stats reset.");
    },
    clearChats() {
      state.matches = [];
      closeChat();
      closeHorse();
      renderMatches();
      save();
      newDeck(false);
      UI.toast("Matches and chats cleared.");
    },
    clearAll() {
      try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
      S.reset();
      S.close();
      state = freshState();
      closeChat();
      closeHorse();
      closeProfile();
      renderMatches();
      renderTally();
      renderMe();
      renderRadius();
      newDeck(true);
      startSetup();
    },
  });
  S.onChange(key => {
    if (key === "radius" || key === "*") { renderRadius(); newDeck(false); }
  });
  $("settings-btn").addEventListener("click", () => S.open());

  // ---------- Deck lifecycle ----------
  function newDeck(reseed) {
    if (reseed) { state.seed = (Date.now() % 1000000007) >>> 0; save(); }
    const skip = {};
    state.matches.forEach(m => { skip[m.horse.id] = true; });
    const show = state.profile ? state.profile.showMe : "everyone";
    const radius = HorseSettings.get().radius;
    queue = D.buildDeck(state.seed, EXTRA_HORSES, skip)
      .filter(h => (show === "everyone" || h.sex === show) && h.distance <= radius);
    render();
  }

  function startSetup() {
    UI.openWizard(null, p => {
      state.profile = p;
      save();
      renderMe();
      newDeck(false);
    });
  }

  // ---------- Controls ----------
  $("btn-like").addEventListener("click", () => swipe("like"));
  $("btn-nope").addEventListener("click", () => swipe("nope"));
  $("btn-super").addEventListener("click", () => swipe("super"));
  $("restart").addEventListener("click", () => newDeck(true));

  function goBack() {
    if (UI.handleBack()) return true;
    if (!horseEl.hidden) { closeHorse(); return true; }
    if (S.isOpen()) { S.close(); return true; }
    if (!chatEl.hidden) { closeChat(); return true; }
    if (!profileEl.hidden) { closeProfile(); return true; }
    if (!overlay.hidden) { closeOverlay(); return true; }
    return false;
  }

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { goBack(); return; }
    if (UI.isOpen() || S.isOpen() || !horseEl.hidden || !chatEl.hidden || !profileEl.hidden || !overlay.hidden) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") swipe("like");
    else if (e.key === "ArrowLeft") swipe("nope");
    else if (e.key === "ArrowUp") { e.preventDefault(); swipe("super"); }
  });

  // Android back button (only present when running inside the Capacitor app)
  const CapApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (CapApp) {
    CapApp.addListener("backButton", () => {
      if (!goBack()) CapApp.minimizeApp();
    });
  }

  // ---------- Boot ----------
  load();
  renderRadius();
  renderMatches();
  renderTally();
  renderMe();
  newDeck(false);
  if (!state.profile) startSetup();
})();
