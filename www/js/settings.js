/* App settings: stored separately from your profile, applied immediately.
   Plain ES2017 for the Sunmi V2 (Chrome 62). */
(function () {
  "use strict";
  const KEY = "horse-tinder-settings";
  const DEFAULTS = {
    theme: "system",      // system | light | dark
    reduceMotion: false,
    radius: 20,           // furlongs
    emoticons: true,
    showVibe: true,
    autoCalendar: false,  // add dates to the calendar as soon as they're set
    reminder: 30,         // minutes before a date; -1 = no reminder
    calendarId: -1,       // -1 = let the phone pick (primary Google calendar)
  };
  let s = load();
  const listeners = [];
  let actions = {}, calendar = { available: false }, updater = { native: false, enabled: false };

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* not fatal */ } }

  function apply() {
    const root = document.documentElement;
    if (s.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", s.theme);
    root.classList.toggle("reduce-motion", !!s.reduceMotion);
    root.classList.toggle("hide-vibe", !s.showVibe);
    if (window.HorseChat) window.HorseChat.settings.emoticons = !!s.emoticons;
  }

  function get() { return Object.assign({}, s); }
  function set(key, value) {
    const old = s[key];
    s[key] = value;
    save();
    apply();
    listeners.forEach(fn => fn(key, value, old));
  }
  function reset() {
    s = Object.assign({}, DEFAULTS);
    save();
    apply();
    listeners.forEach(fn => fn("*"));
  }

  // ---------- Panel ----------
  const panel = document.getElementById("settings");
  const body = document.getElementById("settings-body");
  let armed = null; // destructive button waiting for a second tap

  function seg(key, options) {
    return `<div class="seg" role="radiogroup">` + options.map(o =>
      `<button type="button" role="radio" aria-checked="${s[key] === o[0]}" class="${s[key] === o[0] ? "on" : ""}" data-set="${key}" data-value="${o[0]}">${o[1]}</button>`
    ).join("") + `</div>`;
  }
  function toggle(key, label, hint) {
    return `<div class="set-row">
      <div class="set-text"><span>${label}</span>${hint ? `<small>${hint}</small>` : ""}</div>
      <button type="button" class="switch${s[key] ? " on" : ""}" role="switch" aria-checked="${!!s[key]}" aria-label="${label}" data-toggle="${key}"><span></span></button>
    </div>`;
  }

  function render() {
    const reminders = [[-1, "No reminder"], [15, "15 minutes before"], [30, "30 minutes before"], [60, "1 hour before"], [1440, "1 day before"]];
    body.innerHTML = `
      <section class="set-group">
        <h3>Appearance</h3>
        <div class="set-row stack"><div class="set-text"><span>Theme</span></div>
          ${seg("theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]])}</div>
        ${toggle("reduceMotion", "Reduce motion", "Fewer animations when swiping and chatting")}
      </section>

      <section class="set-group">
        <h3>Swiping</h3>
        <div class="set-row stack"><div class="set-text"><span>Search radius</span><small>Only show horses this close</small></div>
          ${seg("radius", [[5, "5 fur."], [10, "10 fur."], [20, "20 fur."]])}</div>
        <div class="set-row"><div class="set-text"><span>New horses</span><small>Deal a fresh deck with new secret preferences</small></div>
          <button type="button" class="set-btn" data-action="newHorses">Bring in</button></div>
      </section>

      <section class="set-group">
        <h3>Chat</h3>
        ${toggle("emoticons", "Horse emoticons", "Horses add faces like (◕‿◕) and ¯\\_(ツ)_/¯")}
        ${toggle("showVibe", "Show vibe meter", "How much a horse likes talking to you")}
      </section>

      <section class="set-group">
        <h3>Calendar</h3>
        ${calendar.available ? `
          ${toggle("autoCalendar", "Add dates automatically", "As soon as a horse agrees to a date")}
          <div class="set-row stack"><label class="set-text" for="set-reminder"><span>Reminder</span></label>
            <select class="set-select" id="set-reminder">${reminders.map(r => `<option value="${r[0]}"${s.reminder === r[0] ? " selected" : ""}>${r[1]}</option>`).join("")}</select></div>
          <div class="set-row stack"><label class="set-text" for="set-calendar"><span>Calendar</span><small id="cal-hint">Dates sync to Google Calendar through the phone's own sync. The app never sends them anywhere.</small></label>
            <select class="set-select" id="set-calendar"><option value="-1">Phone's main calendar</option></select>
            <button type="button" class="set-btn" id="cal-load">Show my calendars</button></div>`
        : `<p class="set-note">Calendar works in the Android app. In the app, dates go into the phone's calendar and sync to Google Calendar from there.</p>`}
      </section>

      <section class="set-group">
        <h3>Data</h3>
        <div class="set-row"><div class="set-text"><span>Reset stats</span><small>Yays, matches and rejections go back to zero</small></div>
          <button type="button" class="set-btn" data-action="resetStats" data-confirm="Tap again">Reset</button></div>
        <div class="set-row"><div class="set-text"><span>Clear matches and chats</span><small>Your profile stays</small></div>
          <button type="button" class="set-btn danger" data-action="clearChats" data-confirm="Tap again">Clear</button></div>
        <div class="set-row"><div class="set-text"><span>Delete everything</span><small>Profile, matches, chats and settings</small></div>
          <button type="button" class="set-btn danger" data-action="clearAll" data-confirm="Really?">Delete</button></div>
      </section>

      <section class="set-group">
        <h3>Updates</h3>
        <div class="set-row"><div class="set-text"><span>Version ${esc(version())}</span><small>${updater.enabled
          ? "Checks GitHub for a new version when the app starts. That's the only thing it ever goes online for."
          : updater.native ? "This build doesn't update itself." : "The Android app updates itself from GitHub."}</small></div>
          ${updater.enabled ? `<button type="button" class="set-btn" data-action="checkUpdates">Check</button>` : ""}</div>
      </section>

      <p class="set-about">Horse Tinder · everything but the update check works offline · every horse here is made up, even the rude ones</p>`;
    armed = null;
  }

  body.addEventListener("click", e => {
    const segBtn = e.target.closest("[data-set]");
    if (segBtn) {
      const key = segBtn.getAttribute("data-set");
      const raw = segBtn.getAttribute("data-value");
      set(key, typeof DEFAULTS[key] === "number" ? Number(raw) : raw);
      render();
      return;
    }
    const sw = e.target.closest("[data-toggle]");
    if (sw) {
      const key = sw.getAttribute("data-toggle");
      set(key, !s[key]);
      sw.classList.toggle("on", !!s[key]);
      sw.setAttribute("aria-checked", String(!!s[key]));
      return;
    }
    const act = e.target.closest("[data-action]");
    if (act) {
      const name = act.getAttribute("data-action");
      const confirmText = act.getAttribute("data-confirm");
      if (confirmText && armed !== act) {
        if (armed) armed.textContent = armed.getAttribute("data-label");
        act.setAttribute("data-label", act.textContent);
        act.textContent = confirmText;
        armed = act;
        return;
      }
      armed = null;
      if (actions[name]) actions[name]();
      if (name !== "clearAll") render();
      return;
    }
    if (e.target.closest("#cal-load")) loadCalendars();
  });

  body.addEventListener("change", e => {
    if (e.target.id === "set-reminder") set("reminder", Number(e.target.value));
    if (e.target.id === "set-calendar") set("calendarId", Number(e.target.value));
  });

  function loadCalendars() {
    const sel = document.getElementById("set-calendar");
    const hint = document.getElementById("cal-hint");
    calendar.list().then(res => {
      const list = (res && res.calendars) || [];
      sel.innerHTML = `<option value="-1">Phone's main calendar</option>` + list.map(c =>
        `<option value="${c.id}"${s.calendarId === c.id ? " selected" : ""}>${esc(c.name)}${c.account && c.account !== c.name ? " (" + esc(c.account) + ")" : ""}</option>`).join("");
      hint.textContent = list.some(c => c.google)
        ? "Google calendars sync through the phone. The app never sends your dates anywhere."
        : "No Google calendar on this phone yet. Dates will go into a local Horse Tinder calendar.";
      const btn = document.getElementById("cal-load");
      if (btn) btn.hidden = true;
    }, err => {
      hint.textContent = err && err.code === "DENIED"
        ? "Calendar permission is off. Turn it on in Android settings, under Apps > Horse Tinder."
        : "Couldn't read your calendars.";
    });
  }

  function esc(t) { return window.HorseArt.esc(t); }
  function version() { const v = window.HORSE_VERSION; return v ? v.label : "dev"; }

  function open() { render(); panel.hidden = false; }
  function close() { panel.hidden = true; }
  function isOpen() { return !panel.hidden; }

  document.getElementById("settings-close").addEventListener("click", close);
  panel.addEventListener("click", e => { if (e.target === panel) close(); });

  apply();

  window.HorseSettings = {
    get, set, reset, apply, open, close, isOpen,
    onChange(fn) { listeners.push(fn); },
    setActions(a) { actions = a; },
    setCalendar(c) { calendar = c; },
    setUpdater(u) { updater = u; if (isOpen()) render(); },
  };
})();
