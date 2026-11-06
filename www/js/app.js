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
      seen: {}, // ids swiped in this deck, so a restart doesn't deal them again
      likesYou: [], // horses that liked one of your photos or prompts first
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) adopt(JSON.parse(raw));
    } catch (e) { /* storage blocked: start fresh */ }
  }
  /* A saved state, from this browser or from a save file */
  function adopt(saved) {
    state = Object.assign(freshState(), saved);
    state.matches.forEach(m => { m.typing = false; });
    if (state.profile) {
      UI.unifyPhotos(state.profile);
      // Prompts that were taken out of the app (they weren't family friendly)
      state.profile.prompts = (state.profile.prompts || []).filter(p => D.PROMPT_QUESTIONS.indexOf(p.q) >= 0);
    }
  }
  /* Ask the browser not to clear this site's storage on its own. Firefox asks the
     player once; Chrome and Safari decide silently. */
  function keepData() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
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
  let lastNay = null; // the horse just sent away, while it can still be brought back
  const undoBtn = $("btn-undo");

  // ---------- Cards ----------
  function sexWord(h) { return (D.SEXES[h.sex] || "").toLowerCase(); }

  /* A Hinge-style profile: one scrolling column where photos alternate with prompts.
     opts.self: your own profile. opts.likeable: hearts on each photo and prompt (deck cards).
     opts.full === false: just the name and first photo, for the cards stacked behind. */
  function cardHTML(h, opts) {
    opts = opts || {};
    const self = !!opts.self, full = opts.full !== false;
    const photos = full ? h.photos : h.photos.slice(0, 1);
    const prompts = !full ? [] : self ? (h.prompts || []) : D.promptsOf(h);
    const heart = (kind, i) => opts.likeable
      ? `<button class="hc-like" type="button" data-like="${kind}:${i}" aria-label="Like this ${kind}">${HEART_SVG}</button>` : "";
    // Real photos carry their credit (CC BY-SA asks for one where the photo shows)
    const credit = i => photos[i].credit ? `<small class="hc-credit">${esc(photos[i].credit)}</small>` : "";
    const photo = i => `<figure class="hc-photo">${A.render(photos[i], { label: self ? "Your photo " + (i + 1) : "Photo " + (i + 1) + " of " + h.name })}${credit(i)}${heart("photo", i)}</figure>`;
    const prompt = i => `<section class="hc-prompt"><p class="hc-q">${esc(prompts[i].q)}</p><p class="hc-a">${esc(prompts[i].a)}</p>${heart("prompt", i)}</section>`;
    const vitals = [D.SEXES[h.sex], h.breed, D.fmtHeight(h.inches), h.discipline,
      self ? "" : D.fmtDist(h.distance) + " away", D.LOOKING[h.lookingFor]].filter(Boolean);

    let body = `<header class="hc-head"><h3 class="name">${esc(h.name)}</h3><span class="age">${h.age}</span>${self ? `<span class="hc-you">That's you</span>` : ""}</header>` + photo(0);
    if (full) {
      body += `<ul class="hc-vitals">${vitals.map(v => `<li>${esc(v)}</li>`).join("")}</ul>`;
      if (prompts[0]) body += prompt(0);
      if (photos[1]) body += photo(1);
      if (prompts[1]) body += prompt(1);
      if (h.likes && h.likes.length) body += `<section class="hc-block"><p class="hc-q">Into</p><ul class="likes">${h.likes.map(l => `<li>${esc(l)}</li>`).join("")}</ul></section>`;
      if (photos[2]) body += photo(2);
      if (prompts[2]) body += prompt(2);
      for (let i = 3; i < photos.length; i++) body += photo(i);
      if (h.bio) body += `<section class="hc-block"><p class="hc-q">About me</p><p class="hc-bio">${esc(h.bio)}</p></section>`;
    }
    return `<div class="card-scroll">${body}</div>` +
      (self ? "" : `<span class="stamp stamp-like">YAY</span><span class="stamp stamp-nope">NAY</span><span class="stamp stamp-super">SUGAR CUBE</span>`);
  }

  function render() {
    deckEl.innerHTML = "";
    queue.slice(0, 4).reverse().forEach((h, i, arr) => {
      const depth = arr.length - 1 - i;
      const card = document.createElement("article");
      card.className = "card " + (depth === 0 ? "top" : "depth-" + depth);
      // Only the top card gets every photo: the V2 has little memory to spare for SVGs
      card.innerHTML = cardHTML(h, { likeable: depth === 0, full: depth === 0 });
      if (depth === 0) attachDrag(card, h);
      deckEl.appendChild(card);
    });
    const done = queue.length === 0;
    emptyEl.hidden = !done;
    deckEl.hidden = done;
    controlsEl.querySelectorAll("button").forEach(b => { b.disabled = done; });
    undoBtn.disabled = !lastNay; // works on an empty deck too: the last horse comes back
  }

  function attachDrag(card, h) {
    /* Sideways drags swipe. Up and down scroll the profile (touch-action: pan-y hands
       vertical pans to the browser, which cancels our pointer), so there's no drag-up
       sugar cube any more: that's the button and the Up arrow. */
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
    const like = card.querySelector(".stamp-like");
    const nope = card.querySelector(".stamp-nope");

    card.addEventListener("pointerdown", e => {
      if (busy || e.target.closest("button")) return; // hearts are buttons, not drag handles
      dragging = true;
      startX = e.clientX; startY = e.clientY; dx = dy = 0;
      card.setPointerCapture(e.pointerId);
      card.style.transition = "none";
    });

    // Batch style writes to one per frame; pointermove fires faster than the V2 can paint
    let frame = 0;
    const paint = () => {
      frame = 0;
      card.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${dx / 14}deg)`;
      like.style.opacity = Math.max(0, Math.min(1, dx / 100));
      nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
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
      else {
        card.style.transform = "";
        [like, nope].forEach(s => { s.style.opacity = 0; });
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
    const liked = kind === "like" ? pendingLike : null; // a heart on one photo or prompt, maybe with a comment
    pendingLike = null;
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
      state.seen[horse.id] = true;
      busy = false;
      lastNay = kind === "nope" ? horse : null;
      render();
      if (kind === "nope") {
        state.stats.nays++;
      } else {
        state.stats.yays++;
        const verdict = P.evaluate(horse, state.profile, kind, liked);
        if (verdict.match) {
          const m = showMatch(horse, kind);
          // Like Hinge: the comment on the liked photo or prompt opens the chat
          if (liked && liked.comment) { sendMessage(m, liked.comment); $("btn-whinny").hidden = true; $("btn-open-chat").focus(); }
        } else {
          state.stats.rejections++;
          const line = kind === "super" ? "ate your sugar cube and left." : pick(REJECTIONS);
          UI.toast(`<span class="toast-av avatar">${A.render(horse.photos[0], { plain: true, label: horse.name })}</span><span><b>${esc(horse.name)}</b> ${line}</span>`, 3000);
        }
      }
      maybeLikedYou();
      renderTally();
      save();
    }, 380);
  }

  /* Bring back the horse you just said nay to. Only a nay: a yay may have matched. */
  function undoNay() {
    if (!lastNay || busy) return;
    const h = lastNay;
    lastNay = null;
    delete state.seen[h.id];
    state.stats.nays = Math.max(0, state.stats.nays - 1);
    queue.unshift(h);
    render();
    save();
  }

  // ---------- Liking one photo or prompt ----------
  const likeEl = $("like-sheet"), likeComment = $("like-comment");
  let likeTarget = null, pendingLike = null;

  function openLike(h, kind, i) {
    likeTarget = { kind, index: i };
    $("like-name").textContent = h.name;
    const p = kind === "prompt" ? D.promptsOf(h)[i] : null;
    $("like-preview").innerHTML = p
      ? `<p class="hc-q">${esc(p.q)}</p><p class="hc-a">${esc(p.a)}</p>`
      : `<div class="like-photo">${A.render(h.photos[i], { label: "Photo " + (i + 1) + " of " + h.name })}</div>`;
    likeComment.value = "";
    likeEl.hidden = false;
    // Don't pop the keyboard over the sheet on touch devices
    if (window.matchMedia && window.matchMedia("(hover: hover)").matches) likeComment.focus();
  }
  function closeLike() { likeEl.hidden = true; likeTarget = null; }
  function sendLike() {
    if (!likeTarget) return;
    pendingLike = { kind: likeTarget.kind, index: likeTarget.index, comment: likeComment.value.trim() };
    closeLike();
    swipe("like");
  }
  deckEl.addEventListener("click", e => {
    const b = e.target.closest("[data-like]");
    if (!b || busy || !b.closest(".card.top") || !queue[0]) return;
    const at = b.getAttribute("data-like").split(":");
    openLike(queue[0], at[0], Number(at[1]));
  });
  $("like-send").addEventListener("click", sendLike);
  $("like-cancel").addEventListener("click", closeLike);
  likeComment.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendLike(); } });
  likeEl.addEventListener("click", e => { if (e.target === likeEl) closeLike(); });

  // ---------- Likes you ----------
  /* Now and then a horse further back in the deck likes one of your photos or prompts
     first. It leaves the deck and waits in Likes you, where you match back or pass. */
  const likesEl = $("likes"), likesBody = $("likes-body"), likesBadge = $("likes-badge");
  let likerShown = -1; // which like is open in detail, -1 = the list

  function maybeLikedYou() {
    if (!state.profile || Math.random() >= P.likeChance(state.profile)) return;
    // Not the cards you can see: a horse vanishing from under your thumb would be odd
    const pool = queue.slice(4);
    for (let tries = 0; tries < 6 && pool.length; tries++) {
      const h = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const liked = P.likesYou(h, state.profile, Math.random);
      if (!liked) continue;
      queue.splice(queue.indexOf(h), 1);
      state.likesYou.unshift(Object.assign({ horse: h, at: Date.now(), seen: false }, liked));
      renderLikesBadge();
      UI.toast(`<span class="toast-av avatar">${A.render(h.photos[0], { plain: true, label: h.name })}</span><span><b>${esc(h.name)}</b> liked your ${liked.kind}.</span>`, 3000);
      return;
    }
  }

  function renderLikesBadge() {
    const fresh = state.likesYou.filter(l => !l.seen).length;
    [likesBadge, $("tab-likes-badge")].forEach(b => {
      b.hidden = !fresh;
      b.textContent = fresh > 9 ? "9+" : fresh;
    });
    const label = fresh ? `Likes you, ${fresh} new` : "Likes you";
    $("likes-btn").setAttribute("aria-label", label);
    document.querySelector('[data-tab="likes"]').setAttribute("aria-label", label);
    renderMatches(); // the Likes circle in the new matches row
  }

  /* What a horse liked: your photo, or your prompt with its answer */
  function likedItemHTML(l) {
    const me = state.profile;
    if (l.kind === "prompt" && me.prompts && me.prompts[l.index]) {
      const p = me.prompts[l.index];
      return `<div class="liked-item"><p class="hc-q">${esc(p.q)}</p><p class="hc-a">${esc(p.a)}</p></div>`;
    }
    const ph = me.photos[l.index] || me.photos[0];
    return `<div class="liked-item"><div class="like-photo">${A.render(ph, { label: "Your photo" })}</div></div>`;
  }

  function renderLikes() {
    likerShown = -1;
    $("likes-title").textContent = "Likes you";
    $("likes-sub").textContent = "Horses who liked something on your profile";
    const ls = state.likesYou;
    likesBody.innerHTML = ls.length ? `<ul class="likes-list">` + ls.map((l, i) => `
      <li><button class="like-row${l.seen ? "" : " new"}" type="button" data-liker="${i}">
        <span class="avatar">${A.render(l.horse.photos[0], { plain: true, label: l.horse.name })}</span>
        <span class="like-row-text"><strong>${esc(l.horse.name)}</strong>
          <small>Liked your ${l.kind}${l.kind === "prompt" && state.profile.prompts && state.profile.prompts[l.index] ? `: ${esc(state.profile.prompts[l.index].q)}` : ""}</small>
          ${l.comment ? `<span class="like-row-comment">${esc(l.comment)}</span>` : ""}</span>
      </button></li>`).join("") + `</ul>`
      : `<p class="hp-empty">No likes yet. Horses like profiles with a few photos and some prompts answered. Keep swiping.</p>`;
    likesBody.scrollTop = 0;
  }

  /* One like in full: what they liked, their comment, their whole profile, match or pass */
  function openLiker(i) {
    const l = state.likesYou[i];
    if (!l) return;
    likerShown = i;
    $("likes-title").textContent = l.horse.name;
    $("likes-sub").textContent = `Liked your ${l.kind}`;
    likesBody.innerHTML = `
      <section class="liked-what">${likedItemHTML(l)}
        ${l.comment ? `<p class="liked-comment"><b>${esc(l.horse.name)}:</b> ${esc(l.comment)}</p>` : ""}</section>
      <article class="card preview">${cardHTML(l.horse)}</article>
      <button class="btn btn-wide" type="button" data-lk="match">Match with ${esc(l.horse.name)}</button>
      <button class="btn-text danger" type="button" data-lk="pass">Pass</button>`;
    likesBody.scrollTop = 0;
  }

  function openLikes() {
    state.likesYou.forEach(l => { l.seen = true; }); // the badge counts likes you haven't looked at
    renderLikesBadge();
    save();
    renderLikes();
    likesEl.hidden = false;
  }
  function closeLikes() { likesEl.hidden = true; likerShown = -1; }
  function likesBack() { if (likerShown >= 0) renderLikes(); else closeLikes(); }

  likesBody.addEventListener("click", e => {
    const row = e.target.closest("[data-liker]");
    if (row) { openLiker(Number(row.getAttribute("data-liker"))); return; }
    const b = e.target.closest("[data-lk]");
    if (!b || likerShown < 0) return;
    const l = state.likesYou.splice(likerShown, 1)[0];
    state.seen[l.horse.id] = true;
    if (b.getAttribute("data-lk") === "pass") { renderLikes(); renderLikesBadge(); save(); return; }
    // They already said yes: matching back always works, and their comment opens the chat
    closeLikes();
    const m = showMatch(l.horse, "like");
    $("match-line").textContent = l.comment
      ? `${l.horse.name} liked your ${l.kind}: “${l.comment}”`
      : `${l.horse.name} liked your ${l.kind}. You said yay back.`;
    if (l.comment) { m.messages.push({ from: "them", text: l.comment }); m.unread = true; }
    renderMatches();
    renderLikesBadge();
    save();
  });
  $("likes-btn").addEventListener("click", openLikes);
  $("likes-close").addEventListener("click", likesBack);
  likesEl.addEventListener("click", e => { if (e.target === likesEl) closeLikes(); });

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
      ? `Your sugar cube worked. ${h.name} is ${D.fmtDist(h.distance)} away and already trotting over.`
      : shared ? `You both said yay. You both like ${shared.toLowerCase()}, too.` : "You both said yay.";
    $("btn-whinny").hidden = false;
    overlay.hidden = false;
    $("btn-whinny").focus();
    return m;
  }

  function preview(m) {
    if (m.status === "unmatched") return "Unmatched you";
    if (m.typing) return "typing…";
    const last = m.messages[m.messages.length - 1];
    if (!last) return "New match. Say neigh!";
    return (last.from === "me" ? "You: " : "") + last.text;
  }

  /* Like Tinder: matches you haven't talked to yet sit in a row of circles on top,
     conversations go in the list below */
  const isNew = m => m.status !== "unmatched" && !m.messages.some(x => x.from !== "sys") && !m.typing;
  function yourTurn(m) {
    const said = m.messages.filter(x => x.from !== "sys");
    return m.status !== "unmatched" && !m.typing && said.length > 0 && said[said.length - 1].from === "them";
  }
  function renderMatches() {
    const ms = state.matches;
    const fresh = [], talking = [];
    ms.forEach((m, i) => (isNew(m) ? fresh : talking).push(i));
    const likes = state.likesYou.length;
    matchCount.textContent = ms.filter(m => m.status !== "unmatched").length;
    noMatches.hidden = ms.length > 0 || likes > 0;
    $("new-wrap").hidden = !fresh.length && !likes;
    $("msg-head").hidden = !talking.length;
    $("new-matches").innerHTML =
      (likes ? `<li><button class="new-match likes-circle" type="button" data-open-likes aria-label="Likes you: ${likes}">
        <span class="avatar"><span class="likes-count">${likes > 99 ? "99+" : likes}</span></span><span class="nm-name">Likes</span></button></li>` : "") +
      fresh.map(i => {
        const m = ms[i];
        return `<li><button class="new-match" type="button" data-index="${i}" aria-label="Say hi to ${esc(m.horse.name)}">
          <span class="avatar">${A.render(m.horse.photos[0], { plain: true, label: m.horse.name })}</span><span class="nm-name">${esc(m.horse.name)}</span></button></li>`;
      }).join("");
    matchList.innerHTML = talking.map(i => {
      const m = ms[i], turn = yourTurn(m);
      return `
      <li>
        <button class="match${m.unread ? " unread" : ""}${m.status === "unmatched" ? " gone" : ""}" type="button" data-index="${i}" aria-label="Chat with ${esc(m.horse.name)}${turn ? ", your turn" : ""}">
          <div class="avatar">${A.render(m.horse.photos[0], { plain: true, label: m.horse.name })}</div>
          <div>
            <strong>${esc(m.horse.name)}${turn ? `<span class="your-turn">Your turn</span>` : ""}</strong>
            <small>${esc(preview(m))}</small>
          </div>
          ${m.unread ? `<span class="dot" aria-label="Unread"></span>` : ""}
        </button>
      </li>`;
    }).join("");
    const unread = ms.filter(m => m.unread).length;
    const badge = $("tab-chats-badge");
    badge.hidden = !unread;
    badge.textContent = unread > 9 ? "9+" : unread;
  }

  function renderTally() {
    const s = state.stats;
    tallyEl.hidden = !s.yays;
    tallyEl.textContent = `${D.plural(s.yays, "yay")} sent, ${s.rejections} turned down`;
  }

  matchesEl.addEventListener("click", e => {
    if (e.target.closest("[data-open-likes]")) { showTab("likes"); return; }
    const btn = e.target.closest("[data-index]");
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
  let activeChat = null, giftMode = false, stickToEnd = false;
  // Matches whose replies are being "typed" in this page right now
  const typingNow = new Set();
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

  function renderChat() {
    const m = activeChat;
    if (!m) return;
    const h = m.horse;
    const gone = m.status === "unmatched";
    const shared = state.profile.interests.filter(i => h.likes.indexOf(i) >= 0);
    // Follow new bubbles only if you were already at the bottom, not while you read back
    const atEnd = stickToEnd || chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 60;
    stickToEnd = false;
    chatLog.innerHTML =
      `<li class="sys">You matched with ${esc(h.name)}.${shared.length ? " You both like " + esc(shared[0].toLowerCase()) + "." : ""}</li>` +
      m.messages.map(msgHTML).join("") +
      (m.mem && m.mem.date && !m.mem.calEventId && !m.mem.calWeb && !gone
        ? `<li class="sys"><button class="btn-text" type="button" data-add-cal>Add date to calendar</button></li>` : "") +
      (m.typing ? `<li class="msg them typing" aria-label="${esc(h.name)} is typing"><span></span><span></span><span></span></li>` : "") +
      (gone ? `<li class="sys"><button class="btn-text" type="button" data-remove-chat>Remove this conversation</button></li>` : "");
    if (atEnd) chatLog.scrollTop = chatLog.scrollHeight;
    chatForm.hidden = gone;
    quickEl.hidden = gone;
    const last = m.messages[m.messages.length - 1];
    $("chat-status").textContent = gone ? "Unmatched"
      : m.typing ? "typing…"
      : last && last.from === "me" && C.ghosting(m) ? "Seen"
      : m.mem && m.mem.date ? "Date: " + m.mem.date
      : `${D.fmtDist(h.distance)} away, ${C.moodStatus(h)}`;
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

  /* The chat with the latest message goes first in the match list */
  function toFront(m) {
    const at = state.matches.indexOf(m);
    if (at > 0) { state.matches.splice(at, 1); state.matches.unshift(m); }
  }

  /* Horses type one bubble at a time, with a pause between them. The bubbles still to
     come wait in m.inbox, saved with the match, so a reload picks up where it left off.
     The last one carries `after`: what happens once the horse has said it all. */
  function queueReplies(m, lines, after) {
    const items = lines.map(text => ({ text }));
    if (after) {
      if (!items.length) items.push({ text: null });
      items[items.length - 1].after = after;
    }
    m.inbox = (m.inbox || []).concat(items);
    save();
    pump(m);
  }
  function pump(m) {
    if (typingNow.has(m)) return;
    const item = m.inbox && m.inbox[0];
    if (!item || state.matches.indexOf(m) < 0) {
      if (activeChat === m && !giftMode) renderQuick();
      if (activeChat === m) scheduleNudge(m);
      return;
    }
    typingNow.add(m);
    const deliver = () => {
      typingNow.delete(m);
      m.typing = false;
      m.inbox.shift();
      if (state.matches.indexOf(m) < 0) return; // the chat was removed while the horse typed
      if (item.text !== null) {
        m.messages.push({ from: "them", text: item.text });
        if (activeChat !== m) m.unread = true;
        toFront(m);
      }
      if (item.after) settle(m, item.after);
      refresh(m);
      save();
      pump(m);
    };
    if (item.text === null) { deliver(); return; }
    const speed = C.typingSpeed(m.horse); // hyper horses type fast, chill and sleepy ones slowly
    setTimeout(() => {
      m.typing = true;
      refresh(m);
      setTimeout(deliver, speed * (600 + Math.min(item.text.length * 28, 2000)));
    }, speed * (350 + Math.random() * 600));
  }

  /* Leave the horse's question unanswered with the chat open and some personalities
     nudge you. Typing, sending or closing the chat calls it off. */
  let nudgeTimer = null;
  function scheduleNudge(m) {
    clearTimeout(nudgeTimer);
    const last = m && m.messages[m.messages.length - 1];
    if (!m || activeChat !== m || !last || last.from !== "them" || !m.mem || !m.mem.pending) return;
    nudgeTimer = setTimeout(() => {
      if (activeChat !== m || chatInput.value.trim() || (m.inbox && m.inbox.length) || m.messages[m.messages.length - 1] !== last) return;
      const lines = C.nudge(m, state.profile);
      if (lines) queueReplies(m, lines);
    }, 25000 + Math.random() * 20000);
  }

  /* A date whose time has passed gets a message about how it went */
  function checkDate(m) {
    if (!m || state.matches.indexOf(m) < 0 || (m.inbox && m.inbox.length)) return;
    const r = C.afterDate(m, state.profile);
    if (r) queueReplies(m, r.replies, { vibe: r.vibe, unmatch: r.unmatch });
  }
  /* Once the horse has said everything: the vibe moves, and maybe a date or an unmatch */
  function settle(m, a) {
    m.vibeShown = m.vibe;
    if (activeChat === m) flashVibe(a.vibe);
    if (a.date) {
      m.messages.push({ from: "sys", kind: "date", text: `Date set: ${a.date}` });
      if (Cal && HorseSettings.get().autoCalendar) setTimeout(() => addToCalendar(m), 400);
    }
    if (a.unmatch) {
      m.status = "unmatched";
      m.messages.push({ from: "sys", text: `${m.horse.name} unmatched you.` });
      state.stats.unmatched++;
    }
  }

  function openChat(m, opts) {
    if (!m) return;
    if (activeChat && activeChat !== m) activeChat.draft = chatInput.value;
    activeChat = m;
    giftMode = false;
    m.unread = false;
    C.init(m, state.profile);
    if (typeof m.vibeShown !== "number") m.vibeShown = m.vibe;
    $("chat-avatar").innerHTML = A.render(m.horse.photos[0], { plain: true, label: m.horse.name });
    $("chat-name").textContent = m.horse.name;
    chatInput.placeholder = `Message ${m.horse.name}`;
    chatInput.value = m.draft || ""; // each chat keeps its own half-typed message
    chatEl.hidden = false;
    stickToEnd = true;
    renderChat();
    renderQuick();
    renderMatches();
    save();
    // Some horses message first
    if (!m.messages.length && !m.openerDone && !(opts && opts.quiet)) {
      m.openerDone = true;
      if (Math.random() < 0.65) queueReplies(m, C.opener(m, state.profile));
    }
    checkDate(m);
    scheduleNudge(m);
    if (window.matchMedia && window.matchMedia("(hover: hover)").matches) chatInput.focus();
  }

  function closeChat() {
    clearTimeout(nudgeTimer);
    if (activeChat) activeChat.draft = chatInput.value;
    chatEl.hidden = true;
    activeChat = null;
  }

  function sendMessage(m, text) {
    text = text.trim();
    if (!m || !text || m.status === "unmatched") return;
    clearTimeout(nudgeTimer);
    C.init(m, state.profile);
    const msg = { from: "me", text };
    m.messages.push(msg);
    m.sent = (m.sent || 0) + 1;
    m.openerDone = true;
    m.draft = "";
    toFront(m);
    const r = C.respond(m, state.profile, text);
    if (activeChat === m) stickToEnd = true;
    refresh(m);
    save();
    if (r.ignore) return; // ghosted: no reply, status shows "Seen"

    // The reaction lands once the horse has "read" it
    if (r.react) setTimeout(() => { msg.react = r.react; if (activeChat === m) renderChat(); save(); }, 650);

    queueReplies(m, r.replies, { vibe: r.vibe, date: r.date, unmatch: r.unmatch });
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
  chatInput.addEventListener("input", () => scheduleNudge(activeChat)); // typing restarts the wait
  chatLog.addEventListener("click", e => {
    if (e.target.closest("[data-add-cal]") && activeChat) { addToCalendar(activeChat); return; }
    if (e.target.closest("[data-remove-chat]") && activeChat) removeMatch(activeChat);
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
      lookingFor: p.lookingFor, bio: p.bio, likes: p.interests, photos: p.photos, prompts: p.prompts || [],
    };
  }

  function renderMe() {
    const p = state.profile;
    // Two separate renders: each SVG needs its own clip-path ids
    ["me-avatar", "tab-me"].forEach(id => { $(id).innerHTML = p ? A.render(p.photos[0], { plain: true, label: "You" }) : ""; });
  }

  function openProfile() {
    if (!state.profile) return;
    const s = state.stats;
    deleteArmed = false;
    profileBody.innerHTML = `
      <article class="card preview" id="me-card">${cardHTML(meAsHorse(), { self: true })}</article>
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
      state.matches.forEach(dropDate);
      try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
      state = freshState();
      closeProfile();
      renderMatches();
      renderTally();
      renderLikesBadge();
      renderMe();
      newDeck(true);
      startSetup();
    }
  });
  $("profile-close").addEventListener("click", closeProfile);
  profileEl.addEventListener("click", e => { if (e.target === profileEl) closeProfile(); });
  $("me-btn").addEventListener("click", openProfile);

  // ---------- Native plugins: null in a browser ----------
  function nativePlugin(name) {
    const cap = window.Capacitor;
    if (!(cap && cap.isNativePlatform && cap.isNativePlatform())) return null;
    let plugin = null;
    try { if (cap.registerPlugin) plugin = cap.registerPlugin(name); } catch (e) { plugin = null; }
    return plugin || (cap.Plugins && cap.Plugins[name]) || null;
  }
  const Cal = nativePlugin("HorseCalendar"); // the app itself never goes online
  const Upd = nativePlugin("HorseUpdate");   // the only thing that goes online

  const updateBtn = $("update-btn");
  let updateState = "none", lastInstall = 0;
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
    // A second tap within seconds would open a second install session and confirm screen
    if (!Upd || updateState === "downloading" || Date.now() - lastInstall < 4000) return;
    lastInstall = Date.now();
    UI.toast(updateState === "ready" ? "Installing. Horse Tinder closes to update, and your horses stay put."
      : "Downloading the update. It installs when it's done.");
    Upd.install();
  });
  if (Upd) {
    try { Upd.addListener("update", renderUpdate); } catch (e) { /* ignore */ }
    Upd.status().then(o => {
      renderUpdate(o);
      HorseSettings.setUpdater({ native: true, enabled: !!(o && o.enabled) });
    }, () => {});
  }

  function fmtDay(ts) { return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }

  function addToCalendar(m) {
    const h = m.horse, mem = m.mem;
    // A reply still typing when its chat was removed must not put a date in the calendar
    if (!mem || !mem.date || mem.calEventId || mem.calWeb || state.matches.indexOf(m) < 0) return Promise.resolve(false);
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
    if (!Cal) { openCalSheet(m, opts); return Promise.resolve(false); }
    if (st.calendarId >= 0) opts.calendarId = st.calendarId;
    return Cal.addEvent(opts).then(res => {
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

  /* In a browser: Google or Outlook on the web, a .ics file, or the phone's share menu.
     Links open only when tapped; the app itself still sends nothing anywhere. */
  const calSheet = $("cal-sheet");
  let calFor = null;
  const CAL_DONE = { google: "Sent to Google Calendar", outlook: "Sent to Outlook", ics: "Calendar file saved", share: "Shared" };
  function openCalSheet(m, opts) {
    calFor = { m, opts };
    $("cal-share").hidden = !navigator.share;
    calSheet.hidden = false;
  }
  function closeCal() { calSheet.hidden = true; calFor = null; }
  function calDone(m, how) {
    m.mem.calWeb = how;
    m.messages.push({ from: "sys", kind: "cal", text: `${CAL_DONE[how]}: ${fmtDay(m.mem.dateAt)}, ${fmtTime(m.mem.dateAt)}` });
    save();
    refresh(m);
    if (horseShown === m) openHorse(m);
  }
  calSheet.addEventListener("click", e => {
    if (e.target === calSheet) { closeCal(); return; }
    const b = e.target.closest("[data-cal]");
    if (!b || !calFor) return;
    const how = b.getAttribute("data-cal"), m = calFor.m, o = calFor.opts;
    closeCal();
    if (how === "cancel") return;
    const links = D.calendarLinks(o), file = `Horse date with ${m.horse.name}.ics`;
    if (how === "google" || how === "outlook") { window.open(links[how], "_blank", "noopener"); calDone(m, how); }
    if (how === "ics") {
      downloadIcs(o, file);
      UI.toast("<b>Calendar file saved.</b> Open it to add the date to your calendar.");
      calDone(m, how);
    }
    if (how === "share") {
      const text = `${o.title}, ${fmtDay(o.start)} at ${fmtTime(o.start)}, ${o.location}.`;
      // Chrome on Android won't share .ics files, so most phones get the text and a Google link
      let data = { title: o.title, text, url: links.google };
      try {
        const f = new File([icsText(o)], file, { type: "text/calendar" });
        if (navigator.canShare && navigator.canShare({ files: [f] })) data = { title: o.title, text, files: [f] };
      } catch (err) { /* no File constructor: share the text */ }
      navigator.share(data).then(() => calDone(m, how), () => {}); // cancelled: nothing changes
    }
  });

  /* A .ics file, which phone and desktop calendars all open */
  function downloadIcs(o, filename) { downloadFile(icsText(o), filename, "text/calendar"); }
  function icsText(o) {
    const stamp = D.utcStamp;
    const text = s => String(s).replace(/[\\;,]/g, "\\$&").replace(/\n/g, "\\n");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Horse Tinder//EN", "BEGIN:VEVENT",
      `UID:${o.start}-${Math.random().toString(36).slice(2)}@horsetinder`, `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(o.start)}`, `DTEND:${stamp(o.end)}`,
      `SUMMARY:${text(o.title)}`, `LOCATION:${text(o.location)}`, `DESCRIPTION:${text(o.description)}`,
    ];
    if (o.reminderMinutes >= 0) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${text(o.title)}`, `TRIGGER:-PT${o.reminderMinutes}M`, "END:VALARM");
    lines.push("END:VEVENT", "END:VCALENDAR");
    // Lines longer than 75 characters fold onto a continuation line that starts with a space
    return lines.map(l => l.replace(/(.{74})(?=.)/g, "$1\r\n ")).join("\r\n");
  }
  function downloadFile(content, filename, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
      (mem.calEventId || mem.calWeb ? ` <span class="hp-tag">In calendar</span>` : "");
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
        ${mem.date && !mem.calEventId && !mem.calWeb && !gone ? `<button class="btn-outline btn-wide" type="button" data-hp="cal">Add date to calendar</button>` : ""}
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

  /* Every way a match goes away takes its date off the phone's calendar too */
  function dropDate(m) {
    if (m.mem && m.mem.calEventId && Cal) Cal.deleteEvent({ eventId: m.mem.calEventId }).catch(() => {});
  }
  function removeMatch(m) {
    const at = state.matches.indexOf(m);
    if (at >= 0) state.matches.splice(at, 1);
    dropDate(m);
    if (activeChat === m) closeChat();
    closeHorse();
    renderMatches();
    save();
  }

  horseBody.addEventListener("click", e => {
    const m = horseShown;
    if (!m) return;
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
      const name = m.horse.name, hadDate = !!(m.mem && m.mem.calEventId), webDate = !!(m.mem && m.mem.calWeb);
      removeMatch(m);
      if (m.status !== "unmatched") UI.toast(`You unmatched ${esc(name)}.` + (hadDate ? " The date is off your calendar too."
        : webDate ? " The date is still in your calendar. Remove it there yourself." : ""));
    }
  });
  $("horse-close").addEventListener("click", closeHorse);
  horseEl.addEventListener("click", e => { if (e.target === horseEl) closeHorse(); });

  // ---------- Settings ----------
  const S = window.HorseSettings;
  function renderRadius() {
    $("radius-text").textContent = $("empty-radius").textContent = D.fmtDist(S.get().radius);
  }

  /* "Save to a file" in Settings: everything but the settings, for a backup or another device */
  function exportSave() {
    const day = new Date().toISOString().slice(0, 10);
    downloadFile(JSON.stringify({ app: "horse-tinder", saved: Date.now(), state }), `horse-tinder-${day}.json`, "application/json");
    UI.toast("<b>Saved to a file.</b> Load it in Settings, here or on another device.");
  }
  /* Load a save file: it replaces the profile, matches and chats in this browser */
  function importSave() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data = null;
        try { data = JSON.parse(reader.result); } catch (e) { data = null; }
        if (!data || data.app !== "horse-tinder" || !data.state || !Array.isArray(data.state.matches)) {
          UI.toast("That isn't a Horse Tinder save file.");
          return;
        }
        // Calendar event ids belong to the phone that made them: here they could delete a stranger's event
        data.state.matches.forEach(m => { if (m.mem) delete m.mem.calEventId; });
        S.close(); closeChat(); closeHorse(); closeProfile(); UI.closeWizard();
        state.matches.forEach(dropDate);
        adopt(data.state);
        save();
        keepData();
        renderMatches(); renderTally(); renderLikesBadge(); renderMe(); newDeck(false);
        state.matches.forEach(m => pump(m));
        if (state.profile) UI.toast(`<b>Welcome back, ${esc(state.profile.name)}.</b>`);
        else startSetup();
      };
      reader.readAsText(file);
    });
    input.click();
  }
  S.setCalendar({ available: !!Cal, list: () => Cal.listCalendars() });
  S.setActions({
    checkUpdates() { if (Upd) { UI.toast("Checking for updates..."); Upd.check(); } },
    exportSave,
    importSave,
    newHorses() { newDeck(true); UI.toast("<b>New horses</b> just trotted in. New secrets too."); },
    resetStats() {
      state.stats = freshState().stats;
      renderTally();
      save();
      UI.toast("Stats reset.");
    },
    clearChats() {
      state.matches.forEach(dropDate);
      state.matches = [];
      closeChat();
      closeHorse();
      renderMatches();
      save();
      newDeck(false);
      UI.toast("Matches and chats cleared.");
    },
    clearAll() {
      state.matches.forEach(dropDate);
      try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
      S.reset();
      S.close();
      state = freshState();
      closeChat();
      closeHorse();
      closeProfile();
      renderMatches();
      renderTally();
      renderLikesBadge();
      renderMe();
      renderRadius();
      newDeck(true);
      startSetup();
    },
  });
  S.onChange(key => {
    if (key === "radius" || key === "*") { renderRadius(); newDeck(false); }
    if (key === "units") { renderRadius(); render(); }
    if (key === "classicArt") { render(); renderMatches(); renderMe(); }
  });
  $("settings-btn").addEventListener("click", () => S.open());

  // ---------- Deck lifecycle ----------
  function newDeck(reseed) {
    if (reseed) { state.seed = (Date.now() % 1000000007) >>> 0; state.seen = {}; save(); }
    lastNay = null;
    const skip = Object.assign({}, state.seen);
    state.matches.forEach(m => { skip[m.horse.id] = true; });
    state.likesYou.forEach(l => { skip[l.horse.id] = true; }); // already waiting in Likes you
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
      keepData();
      renderMe();
      newDeck(false);
    });
  }

  // ---------- Controls ----------
  $("btn-like").addEventListener("click", () => swipe("like"));
  $("btn-nope").addEventListener("click", () => swipe("nope"));
  $("btn-super").addEventListener("click", () => swipe("super"));
  undoBtn.addEventListener("click", undoNay);
  $("restart").addEventListener("click", () => newDeck(true));

  // ---------- Tabs (phones) ----------
  /* Likes and Profile are panels that stop above the tab bar; Chats is the matches
     sidebar shown full screen. Swipe closes them all. */
  const inChats = () => document.body.classList.contains("tab-chats");
  function showTab(name) {
    if (name !== "likes" && !likesEl.hidden) closeLikes();
    if (name !== "profile" && !profileEl.hidden) closeProfile();
    document.body.classList.toggle("tab-chats", name === "chats");
    if (name === "likes") { if (likesEl.hidden) openLikes(); else renderLikes(); }
    if (name === "profile" && profileEl.hidden) openProfile();
    syncTabs();
  }
  function syncTabs() {
    const on = !likesEl.hidden ? "likes" : !profileEl.hidden ? "profile" : inChats() ? "chats" : "swipe";
    document.querySelectorAll("[data-tab]").forEach(t => {
      const is = t.getAttribute("data-tab") === on;
      t.classList.toggle("on", is);
      if (is) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
    });
  }
  $("tabbar").addEventListener("click", e => {
    const t = e.target.closest("[data-tab]");
    if (t) showTab(t.getAttribute("data-tab"));
  });
  // Panels also open and close from buttons elsewhere (desktop top bar, Edit profile)
  const tabWatch = new MutationObserver(syncTabs);
  [likesEl, profileEl].forEach(p => tabWatch.observe(p, { attributes: true, attributeFilter: ["hidden"] }));

  function goBack() {
    if (!calSheet.hidden) { closeCal(); return true; }
    if (!likeEl.hidden) { closeLike(); return true; }
    if (!likesEl.hidden) { likesBack(); return true; }
    if (UI.handleBack()) return true;
    if (!horseEl.hidden) { closeHorse(); return true; }
    if (S.isOpen()) { S.close(); return true; }
    if (!chatEl.hidden) { closeChat(); return true; }
    if (!profileEl.hidden) { closeProfile(); return true; }
    if (!overlay.hidden) { closeOverlay(); return true; }
    if (inChats()) { showTab("swipe"); return true; }
    return false;
  }

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { goBack(); return; }
    if (UI.isOpen() || S.isOpen() || !horseEl.hidden || !chatEl.hidden || !profileEl.hidden || !overlay.hidden ||
      !likeEl.hidden || !likesEl.hidden || !calSheet.hidden || inChats()) return;
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

  // Browser back button: while any panel is open, one extra history entry sits on top,
  // so "back" closes the panel instead of leaving the site
  if (!CapApp && window.history && history.pushState) {
    const panels = ["overlay", "chat", "profile", "horse", "settings", "onboard", "creator", "sheet", "info",
      "likes", "like-sheet", "cal-sheet"].map($);
    let guarded = false, skipPop = false;
    const sync = () => {
      const open = panels.some(p => !p.hidden) || inChats();
      if (open && !guarded) { history.pushState({ horsePanel: true }, ""); guarded = true; }
      else if (!open && guarded) { guarded = false; skipPop = true; history.back(); } // closed by a button
    };
    window.addEventListener("popstate", () => {
      if (skipPop) { skipPop = false; return; }
      guarded = false;
      if (!goBack()) { history.back(); return; } // nothing to close (first setup screen): leave
      sync(); // a panel underneath is still open, or the setup went back one step
    });
    const watch = new MutationObserver(sync);
    panels.forEach(p => watch.observe(p, { attributes: true, attributeFilter: ["hidden"] }));
    watch.observe(document.body, { attributes: true, attributeFilter: ["class"] }); // the Chats tab
    setTimeout(sync, 0); // after boot has opened the setup, if it does
  }

  // ---------- Boot ----------
  load();
  renderRadius();
  renderMatches();
  renderTally();
  renderLikesBadge();
  renderMe();
  newDeck(false);
  state.matches.forEach(m => pump(m)); // replies a reload interrupted
  // Dates that ended while the app was closed, or while it's open
  state.matches.forEach(checkDate);
  setInterval(() => state.matches.forEach(checkDate), 60000);
  if (state.profile) keepData();
  else startSetup();
})();
