/* The horses: handmade profiles, a generator for random ones, and chat personalities.
   The words themselves (names, breeds, bios, prompts, voices, handmade horses) live in
   content.js, which tools/editor.py edits. */
(function () {
  "use strict";
  const A = window.HorseArt;
  const pick = A.pick;
  const K = window.HorseContent;

  // What chat words count as each interest lives in content.js (chat.concepts)
  const INTERESTS = K.interests;
  const FOODS = K.foods;

  const SEXES = { mare: "Mare", stallion: "Stallion", gelding: "Gelding" };
  const LOOKING = {
    longterm: "Long-term paddock mate",
    trail: "A trail buddy",
    casual: "Something casual",
    graze: "Just here to graze",
    unsure: "Still figuring it out",
  };

  const DISCIPLINES = K.disciplines;
  /* Heights in inches (1 hand = 4 in). Coats and patterns match the breed. */
  const BREEDS = K.breeds;
  const NAMES = K.names;

  // ---------- Templates ----------
  const low = s => String(s).toLowerCase();
  function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* Fills a line from content.js: {x} puts in a value, {X} the same value capitalised,
     {a|b|c} picks one at random. Unknown names are left as they are, so a typo shows. */
  function fill(text, vars) {
    return String(text).replace(/\{([^{}]+)\}/g, (all, k) => {
      if (k.indexOf("|") >= 0) { const opts = k.split("|"); return opts[Math.floor(Math.random() * opts.length)]; }
      if (vars && vars[k] != null) return String(vars[k]);
      const lo = k.charAt(0).toLowerCase() + k.slice(1);
      if (vars && lo !== k && vars[lo] != null) return cap(vars[lo]);
      return all;
    });
  }

  /* What a horse's own lines can mention */
  function varsOf(h) {
    const likes = h.likes || [];
    return {
      name: h.name, age: h.age, breed: h.breed, disc: low(h.discipline || ""), height: fmtHeight(h.inches),
      food: favouriteFood(h), like1: low(likes[0] || ""), like2: low(likes[1] || ""), like3: low(likes[2] || ""),
    };
  }

  // ---------- Profile prompts ----------
  /* Questions a profile can answer, with answer templates for the horses. The player picks
     from the same questions in setup. */
  const PROMPTS = K.prompts;
  const PROMPT_QUESTIONS = PROMPTS.map(p => p.q);

  /* Three different prompts with answers made from the horse's own details. `own` are
     hand-written answers that go first. */
  function makePrompts(h, rand, own) {
    const out = (own || []).slice(0, 3), used = {}, food = favouriteFood(h), vars = varsOf(h);
    out.forEach(p => { used[p.q] = true; });
    pickN(rand, PROMPTS.filter(p => !used[p.q]), 3 - out.length).forEach(p => {
      // Mention the favourite food once at most; every question has an answer without it
      const said = out.some(x => low(x.a).indexOf(food) >= 0);
      const answers = pickN(rand, p.a, p.a.length).map(a => fill(a, vars));
      out.push({ q: p.q, a: answers.filter(a => !said || low(a).indexOf(food) < 0)[0] || answers[0] });
    });
    return out;
  }
  /* Horses saved in older matches have no prompts yet, or one that was taken out of the
     app: make new ones, the same ones every time */
  const known = ps => ps.every(p => PROMPT_QUESTIONS.indexOf(p.q) >= 0);
  function promptsOf(h) {
    return h.prompts && h.prompts.length && known(h.prompts) ? h.prompts
      : makePrompts(h, A.mulberry32(A.hashString(h.id || h.name || "")), h.ownPrompts);
  }

  // ---------- Chat personalities ----------
  const VOICES = K.voices;
  const VOICE_KEYS = Object.keys(VOICES);

  // ---------- Handmade horses ----------
  const HANDMADE = K.horses;

  // ---------- Helpers ----------
  function fmtHeight(inches) {
    return inches <= 42 ? `${inches} in` : `${Math.floor(inches / 4)}.${inches % 4} hh`;
  }
  function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }
  /* Distances are stored in furlongs; Settings can show them in km (1 furlong = 201.168 m) */
  function fmtDist(furlongs) {
    const S = window.HorseSettings;
    return S && S.get().units === "km" ? `${+(furlongs * 0.201168).toFixed(1)} km` : plural(furlongs, "furlong");
  }

  /* "Add to calendar" links for a browser: o = { title, location, description, start, end } (ms) */
  function utcStamp(t) { return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function calendarLinks(o) {
    const q = obj => Object.keys(obj).map(k => k + "=" + encodeURIComponent(obj[k])).join("&");
    return {
      google: "https://calendar.google.com/calendar/render?" + q({
        action: "TEMPLATE", text: o.title, dates: utcStamp(o.start) + "/" + utcStamp(o.end), details: o.description, location: o.location,
      }),
      outlook: "https://outlook.live.com/calendar/0/deeplink/compose?" + q({
        path: "/calendar/action/compose", rru: "addevent", subject: o.title,
        startdt: new Date(o.start).toISOString(), enddt: new Date(o.end).toISOString(), body: o.description, location: o.location,
      }),
    };
  }

  function pickN(rand, arr, n) {
    const pool = arr.slice(), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return out;
  }

  function voiceFor(h) {
    const base = VOICES[h.voice] || VOICES.chill;
    return Object.assign({}, base, h.talk || {});
  }

  function favouriteFood(h) {
    const f = h.likes.filter(l => FOODS.indexOf(l) >= 0)[0];
    return (f || "Carrots").toLowerCase();
  }

  function generateHorse(rand, used) {
    const breed = pick(rand, BREEDS);
    let name = pick(rand, NAMES);
    for (let tries = 0; used[name] && tries < 40; tries++) name = pick(rand, NAMES);
    if (used[name]) name = name + " " + ["II", "Jr.", "the Second"][Math.floor(rand() * 3)];
    used[name] = true;

    const inches = breed.min + Math.floor(rand() * (breed.max - breed.min + 1));
    const h = {
      id: "g-" + A.hashString(name + breed.name).toString(36),
      name,
      age: 2 + Math.floor(rand() * 22),
      sex: pick(rand, ["mare", "mare", "gelding", "gelding", "stallion"]),
      breed: breed.name,
      inches,
      discipline: pick(rand, breed.disc || DISCIPLINES),
      distance: 1 + Math.floor(rand() * 19),
      voice: inches <= 42 ? "tiny" : pick(rand, VOICE_KEYS.filter(v => v !== "tiny")),
      lookingFor: pick(rand, Object.keys(LOOKING)),
      likes: pickN(rand, INTERESTS, 3),
      art: A.randomSpec(rand, { coats: breed.coats, patterns: breed.patterns, build: breed.build, mane: breed.mane }),
    };
    const bits = pickN(rand, K.bios, 2);
    const vars = varsOf(h);
    h.bio = bits.map(b => fill(b, vars)).join(" ");
    return h;
  }

  /* A fresh deck: the handmade horses plus `extra` random ones, shuffled.
     Horses whose ids are in `skip` (already matched) are left out. */
  function buildDeck(seed, extra, skip) {
    const rand = A.mulberry32(seed);
    const used = {};
    const all = [];
    HANDMADE.forEach(h => {
      used[h.name] = true;
      all.push(Object.assign({}, h, { art: A.normalize(h.art), likes: h.likes.slice() }));
    });
    for (let i = 0; i < extra; i++) all.push(generateHorse(rand, used));

    all.forEach(h => {
      const r = A.mulberry32(A.hashString(h.id) ^ seed);
      h.photos = A.variants(A.normalize(h.art), r, 2 + Math.floor(r() * 3));
      h.prefs = window.HorsePrefs.generate(h, r);
      h.prompts = makePrompts(h, r, h.ownPrompts); // last, so photos and prefs stay as they were
    });

    const deck = all.filter(h => !(skip && skip[h.id]));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  window.HorseData = {
    INTERESTS, SEXES, LOOKING, DISCIPLINES, BREEDS, NAMES, PROMPT_QUESTIONS,
    fmtHeight, plural, fmtDist, pickN, voiceFor, favouriteFood, buildDeck, makePrompts, promptsOf,
    utcStamp, calendarLinks, fill, varsOf, cap,
  };
})();
