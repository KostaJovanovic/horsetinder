/* Chat brain. Reads what you type word by word (plurals and small typos included),
   works out what you mean, and answers from the horse's profile, personality,
   secret preferences and what's been said so far.
   Everything it says or understands is in content.js (chat.*), edited with
   tools/editor.py; this file only decides which line fits.
   Plain ES2017 for the Sunmi V2 (Chrome 62): no named groups, lookbehind or ?. */
(function () {
  "use strict";
  const D = window.HorseData;
  const A = window.HorseArt;
  const K = window.HorseContent.chat;

  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function chance(p) { return Math.random() < p; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  /* A line from content.js by name: the personality's own version if it has one */
  function line(key, vars, voice) {
    const own = K.voiceLines && K.voiceLines[voice] && K.voiceLines[voice][key];
    const pool = own && own.length ? own : K.lines[key];
    if (!pool || !pool.length) return "";
    return D.fill(pool.length === 1 ? pool[0] : rnd(pool), vars);
  }

  // ---------- Vocabulary ----------
  /* kind: food | bad (not horse food) | act (activity/interest) | word (intent signal) */
  const CONCEPTS = K.concepts;

  // word -> concept (the first concept listing a word wins, so foods beat intent words)
  const INDEX = {};
  CONCEPTS.forEach(c => c.words.forEach(w => { if (!INDEX[w]) INDEX[w] = c; }));
  // Typo matching only for things (not small talk words like "thanks"), and only on
  // longer words, so "think" doesn't become "thanks" or "start" become "stars"
  const LONG_WORDS = Object.keys(INDEX).filter(w => w.length >= 6 &&
    (INDEX[w].kind !== "word" || INDEX[w].id === "compliment" || INDEX[w].id === "insult"));
  const BY_ID = {};
  CONCEPTS.forEach(c => { BY_ID[c.id] = c; });

  // Edit distance, capped: we only care whether it's 0, 1 or 2
  function close(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let prev = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return false;
      prev = cur;
    }
    return prev[b.length] <= max;
  }

  /* Exact word, then without a plural s, then allowing a typo on longer words */
  function lookup(w) {
    if (INDEX[w]) return INDEX[w];
    if (w.length > 3 && w.charAt(w.length - 1) === "s" && INDEX[w.slice(0, -1)]) return INDEX[w.slice(0, -1)];
    if (w.length >= 6) {
      const max = w.length >= 9 ? 2 : 1;
      for (let i = 0; i < LONG_WORDS.length; i++) if (close(w, LONG_WORDS[i], max)) return INDEX[LONG_WORDS[i]];
    }
    return null;
  }

  function analyze(raw) {
    let t = String(raw).toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, " ").trim();
    const action = /^\*[^*]+\*$/.test(t);
    t = t.replace(/sugar cubes?/g, "sugarcube").replace(/hay ?nets?/g, "haynet").replace(/ice cream/g, "icecream")
      .replace(/dog food/g, "dogfood").replace(/glue factory/g, "glue").replace(/pony club/g, "ponyclub")
      .replace(/show ?jumping/g, "showjumping").replace(/cross[- ]country/g, "crosscountry").replace(/plastic bags?/g, "bag")
      .replace(/half[- ]pass/g, "halfpass").replace(/\bwhat's\b/g, "what is").replace(/\bwhats\b/g, "what is")
      .replace(/\bu\b/g, "you").replace(/\bur\b/g, "your").replace(/\br\b/g, "are").replace(/\bim\b/g, "i'm")
      .replace(/\bdont\b/g, "don't").replace(/\bcant\b/g, "can't").replace(/\bwanna\b/g, "want to")
      .replace(/\b(?:luv|luvv|wuv|lurve|looove|loove)\b/g, "love").replace(/\bfave?[a-z]*\b/g, "favourite")
      .replace(/\bfavo[a-z]*\b/g, "favourite").replace(/\bgonna\b/g, "going to")
      // "lame" about yourself means hurt; about the horse it stays an insult
      .replace(/\b(i'm|i am|i feel|feeling|went|gone) lame\b/g, "$1 sad");
    const toks = t.replace(/[^a-z0-9' ]/g, " ").split(" ").filter(Boolean);
    const ents = [], words = {};
    toks.forEach(w => {
      const c = lookup(w.replace(/'s$/, ""));
      if (!c) return;
      if (c.kind === "word") words[c.id] = true;
      else if (!ents.some(e => e.c === c)) ents.push({ c, word: w });
    });
    const isQ = /\?\s*$/.test(t) ||
      /^(do|does|did|are|is|was|can|could|would|will|have|has|what|how|where|who|why|when|which|want|should|shall)\b/.test(t);
    return { raw: String(raw), t, toks, ents, words, isQ, action };
  }

  // ---------- Horse knowledge ----------
  function opinion(h, c) {
    const p = h.prefs || {};
    if (c.kind === "bad") return "bad";
    if (c.interest && p.hatesInterest === c.interest) return "hate";
    if (c.interest && h.likes.indexOf(c.interest) >= 0) return "love";
    if (c.interest && p.lovesInterests && p.lovesInterests.indexOf(c.interest) >= 0) return "secret";
    if (c.id === "ride" && /riding|dressage|jump|trail|eventing|endurance|racing|barrel|reining|polo|hunting|western|vaulting|pony club/i.test(h.discipline)) return "love";
    if (c.kind === "food") return "food";
    // Stable per horse: some things they're lukewarm about
    return A.hashString(h.id + c.id) % 3 === 0 ? "meh" : "ok";
  }

  function breedFact(h) {
    if (K.breedFacts[h.breed]) return K.breedFacts[h.breed];
    const build = (h.art && h.art.build) || "light";
    return K.buildFacts[build] || K.buildFacts.light;
  }

  // ---------- Personality ----------
  /* Text emoticons (kaomoji and classic ASCII), never emoji. Picked by the mood of the
     reply first, then by personality. Characters stick to scripts Android 7 has fonts for. */
  const FACES = K.faces;
  const VOICE_FACES = K.voiceFaces;
  const settings = { emoticons: true };

  function moodOf(out) {
    if (out.mood) return out.mood;
    if (out.unmatch) return "angry";
    if (out.react === "♥") return "love";
    if (out.react === "ha") return "laugh";
    if (out.react === "!?") return out.vibe <= -10 ? "angry" : "shock";
    return null;
  }

  /* Adds a face to one bubble, or now and then sends the face on its own */
  function addFaces(out, voice) {
    if (!settings.emoticons || !out.replies.length) return;
    const mood = moodOf(out);
    if (!(mood ? chance(0.65) : chance(0.22))) return;
    const face = rnd(mood ? FACES[mood] : VOICE_FACES[voice] || VOICE_FACES.chill);
    if (mood && ["love", "laugh", "shy"].indexOf(mood) >= 0 && chance(0.15)) { out.replies.push(face); return; }
    // Prefer a bubble that isn't a question or an *action*
    let i = out.replies.length - 1;
    for (let j = 0; j < out.replies.length; j++) {
      if (!/\?$|^\*.*\*$/.test(out.replies[j])) { i = j; break; }
    }
    out.replies[i] = out.replies[i] + " " + face;
  }

  /* Remember what the horse let slip, for its profile page */
  function learn(mem, kind, label) {
    if (!mem.learned) mem.learned = { loves: [], hates: [] };
    const list = mem.learned[kind];
    if (list.indexOf(label) < 0) list.push(label);
  }

  function style(text, voice) {
    if (/^\*.*\*$/.test(text)) return text;
    let out = cap(text);
    const openers = K.openers[voice];
    // Never in front of an *action*: "Oh oh oh *takes it gently*" reads wrong
    if (openers && openers.length && chance(0.18) && !/^(?:[A-Z]{2}|I\b|I'|\*)/.test(out)) {
      const o = rnd(openers);
      // "Well, hi" but "Indeed. Hi"
      out = o + (/[.!?] $/.test(o) ? out : out.charAt(0).toLowerCase() + out.slice(1));
    }
    if (voice === "foodie") out = out.toLowerCase().replace(/\.(\s|$)/g, "$1").trim();
    if (voice === "hyper") out = out.replace(/\.(\s|$)/g, "!$1").replace(/!(\s*)$/, "!!$1");
    if (voice === "guarded") out = out.replace(/!+/g, ".");
    return out;
  }

  // ---------- State ----------
  function init(m, me) {
    if (!m.mem) m.mem = { asked: [], told: {}, turns: 0, jokes: 0, insults: 0, compliments: 0, repeats: {} };
    if (typeof m.vibe !== "number") {
      const shared = me ? me.interests.filter(i => m.horse.likes.indexOf(i) >= 0).length : 0;
      m.vibe = Math.min(75, 45 + shared * 6 + (m.superLiked ? 10 : 0));
    }
    // No upcoming() here: rolling the date forward on every open meant it never ended.
    // addToCalendar rolls it, so the calendar still never gets a date in the past.
  }

  const DATE_MINS = 60, DATE_LEAD = 30 * 60000;
  const DATE_TIMES = K.dateTimes;

  function dateOver(mem) { return !!(mem.date && mem.dateAt && mem.dateAt + DATE_MINS * 60000 < Date.now()); }

  /* Called just before a date goes into the calendar: if its day came and went
     (the chat sat unopened, or it's from an older version), it moves to the next
     day at the same time. */
  function upcoming(mem) {
    if (!mem || !mem.date || mem.calEventId) return mem && mem.dateAt;
    const now = Date.now();
    if (mem.dateAt && mem.dateAt > now + DATE_LEAD) return mem.dateAt;
    let at = [12, 0];
    if (mem.dateAt) { const o = new Date(mem.dateAt); at = [o.getHours(), o.getMinutes()]; }
    else for (const k in DATE_TIMES) if (mem.date.slice(-k.length) === k) at = DATE_TIMES[k];
    const d = new Date(now);
    d.setHours(at[0], at[1], 0, 0);
    while (d.getTime() <= now + DATE_LEAD) d.setDate(d.getDate() + 1);
    mem.dateAt = d.getTime();
    return mem.dateAt;
  }

  /* Questions about your own profile, with what they mention filled in. Only the ones
     your profile has the details for. */
  function profileQuestions(m, me) {
    if (!me) return [];
    const h = m.horse;
    const notShared = (me.interests || []).filter(i => h.likes.indexOf(i) < 0);
    const likes = notShared.length ? notShared : me.interests || [];
    const answered = (me.prompts || []).filter(p => p && p.a);
    const pr = answered.length ? answered[A.hashString(h.id) % answered.length] : null;
    const vars = {
      yourLike: likes.length ? likes[A.hashString(h.id + "like") % likes.length].toLowerCase() : "",
      yourDisc: (me.discipline || "").toLowerCase(),
      yourQ: pr ? pr.q : "", yourA: pr ? (pr.a.length > 50 ? pr.a.slice(0, 48).trim() + "…" : pr.a) : "",
    };
    const has = { like: !!vars.yourLike, disc: !!vars.yourDisc, prompt: !!pr, bio: ((me.bio || "").trim().length >= 20) };
    return (K.profileQuestions || []).filter(q => has[q.needs]).map(q => ({ id: q.id, type: q.type || "open", text: D.fill(q.text, vars) }));
  }

  /* The horse asks something. `force` is a follow-up's id, asked whatever else is left. */
  function nextQuestion(m, me, force) {
    const mem = m.mem, h = m.horse;
    const byId = id => K.questions.filter(q => q.id === id)[0];
    let q = force && mem.asked.indexOf(force) < 0 ? byId(force) : null;
    if (!q && !nickOf(m, me) && mem.asked.indexOf("name") < 0) q = { id: "name", type: "name", text: line("name.ask", {}, h.voice) || "What do I call you, by the way?" };
    if (!q) {
      const left = K.questions.filter(x => !x.followup && mem.asked.indexOf(x.id) < 0);
      const mine = profileQuestions(m, me).filter(x => mem.asked.indexOf(x.id) < 0);
      // Prefer questions about things this horse cares about, then ones about you
      const keen = left.filter(x => x.about && BY_ID[x.about] && ["love", "secret"].indexOf(opinion(h, BY_ID[x.about])) >= 0);
      if (mine.length && mem.turns >= 2 && chance(0.3)) q = rnd(mine);
      else if (keen.length && chance(0.6)) q = rnd(keen);
      else if (left.length) q = rnd(left);
      else if (mine.length) q = rnd(mine);
    }
    if (!q) return null;
    mem.asked.push(q.id);
    mem.pending = { type: q.type, id: q.id, about: q.about, a: q.a, b: q.b, then: q.then };
    mem.lastAsked = mem.pending;
    return q.text;
  }

  /* What the horse calls you: a nickname you told it, else the name on your profile */
  function nickOf(m, me) { return (m.mem && m.mem.nick) || (me && me.name) || ""; }

  /* Everything a line can mention about this horse, you and this chat */
  function varsFor(m, me) {
    const h = m.horse, mem = m.mem || {};
    const coat = A.COATS[(h.art && h.art.coat) || "bay"];
    const nick = nickOf(m, me);
    return Object.assign(D.varsOf(h), {
      me: nick || "you", nick, dist: D.fmtDist(h.distance), coat: coat ? coat.name : "",
      date: mem.date || "", place: mem.datePlace || "",
    });
  }

  // ---------- Mood of the day ----------
  function today() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  /* Same mood all day for a horse, a new one tomorrow */
  function moodId(h) {
    const moods = K.moods || {}, ids = Object.keys(moods);
    if (!ids.length) return "normal";
    const total = ids.reduce((s, k) => s + (moods[k].weight || 0), 0);
    let r = total > 0 ? A.hashString(h.id + "|" + today()) % total : 0;
    for (let i = 0; i < ids.length; i++) { r -= moods[ids[i]].weight || 0; if (r < 0) return ids[i]; }
    return ids[0];
  }
  function moodOfDay(h) { return (K.moods && K.moods[moodId(h)]) || {}; }
  /* For the chat header: "grazing", "grumpy today" */
  function moodStatus(h) { return moodOfDay(h).status || "grazing"; }
  /* How long this horse takes to type: 1 is normal, 2 twice as slow */
  function typingSpeed(h) { return ((K.typingSpeed && K.typingSpeed[h.voice || "chill"]) || 1) * (moodOfDay(h).speed || 1); }

  // ---------- Reactions to things you like / dislike ----------
  function aboutStatement(h, ent, likesIt, out, mem) {
    const c = ent.c, x = c.label;
    const v = { x, word: ent.word };
    const op = opinion(h, c);
    if (c.kind === "bad") { out.say(out.line("statement.bad", v), -2); return; }
    if (likesIt) {
      if (op === "hate") {
        out.unmatch = true;
        out.say(out.line("statement.hate", v), -40, "!?");
      } else if (op === "love") {
        mem.told[c.id] = "love";
        learn(mem, "loves", x);
        out.say(out.line("statement.love", v), 10, "♥");
      } else if (op === "secret") {
        mem.told[c.id] = "love";
        learn(mem, "loves", x);
        out.say(out.line("statement.secret", v), 15, "♥");
      } else if (op === "food") out.say(out.line("statement.food", v), 4);
      else if (op === "meh") out.say(out.line("statement.meh", v), -2);
      else out.say(out.line("statement.ok", v), 3);
    } else {
      if (op === "hate") learn(mem, "hates", x);
      if (op === "hate") out.say(out.line("dislike.hate", v), 15, "♥");
      else if (op === "love" || op === "secret") out.say(out.line("dislike.love", v), -6, "!?");
      else out.say(out.line("dislike.ok", v), 0);
    }
  }

  /* `asked` is set when an earlier topic in the same message already asked "Do you?" */
  function doYouLike(h, ent, out, mem, asked) {
    const c = ent.c, x = c.label;
    const v = { x, word: ent.word };
    const op = opinion(h, c);
    if (op === "bad") { out.say(out.line("like.bad", v)); return; }
    if (op === "hate") {
      mem.revealedHate = true;
      learn(mem, "hates", x);
      out.say(out.line("like.hate", v), -4);
    } else if (op === "love" || op === "secret") {
      learn(mem, "loves", x);
      out.say(out.line(op === "love" ? "like.love" : "like.secret", v), op === "love" ? 3 : 2);
      if (!asked) {
        out.say(out.line("like.doYou", v));
        mem.pending = { type: "likeback", about: c.id };
        out.askedBack = true;
      }
    } else if (op === "food") out.say(out.line("like.food", v));
    else if (op === "meh") out.say(out.line("like.meh", v));
    else out.say(out.line("like.ok", v));
  }

  // ---------- Answers to the horse's own questions ----------
  function answerPending(m, me, a, out) {
    const p = m.mem.pending, h = m.horse, mem = m.mem;
    const yes = a.words.yes && !a.words.no, no = a.words.no && !a.words.yes;
    mem.pending = null;
    switch (p.type) {
      case "fav_food": {
        const food = a.ents.filter(e => e.c.kind === "food" || e.c.kind === "bad")[0];
        if (!food) { out.say(out.line("answer.food.unknown")); return true; }
        mem.told.food = food.c.id;
        const v = { x: food.c.label, word: food.word, mine: D.favouriteFood(h) };
        if (food.c.kind === "bad") { out.say(out.line("answer.food.bad", v), -2, "!?"); return true; }
        if (opinion(h, food.c) === "love" || food.c.label === v.mine) out.say(out.line("answer.food.same", v), 10, "♥");
        else if (opinion(h, food.c) === "hate") out.say(out.line("answer.food.hate", v), -6);
        else out.say(out.line("answer.food.other", v), 3);
        return true;
      }
      case "fun": {
        const act = a.ents.filter(e => e.c.kind === "act")[0];
        if (!act) { out.say(out.line("answer.fun.none"), 1); return true; }
        mem.told[act.c.id] = mem.told[act.c.id] || "love";
        aboutStatement(h, act, true, out, mem);
        return true;
      }
      case "open": {
        // Any answer will do. If it mentions something the horse has feelings about, it says so.
        const e = a.ents[0], op = e && opinion(h, e.c);
        if (e && (op === "love" || op === "secret")) aboutStatement(h, e, true, out, mem);
        else if (e && op === "hate") out.say(out.line("passing.hate", { x: e.c.label, word: e.word }), -3);
        else out.say(out.line("answer.open"), 2);
        return true;
      }
      case "name": {
        if (/\b(?:rather not|secret|not telling|none of your)\b/.test(a.t) || (no && a.toks.length <= 2)) { out.say(out.line("name.secret")); return true; }
        const named = /\b(?:my name is|call me|i'm called|i am called|name's)\s+([A-Za-z][A-Za-z'-]*)/i.exec(a.raw);
        const word = named ? named[1] : a.toks.length <= 2 ? (a.raw.trim().split(/\s+/)[0] || "").replace(/[^A-Za-z'-]/g, "") : "";
        if (!word) { mem.pending = p; return false; }
        mem.nick = cap(word);
        out.say(out.line("name.mine"), 2);
        return true;
      }
      case "likeback":
        if (yes) out.say(out.line("answer.likeback.yes"), 8, "♥");
        else if (no) out.say(out.line("answer.likeback.no"), -3);
        else { mem.pending = p; return false; }
        return true;
      case "yesno": {
        const c = BY_ID[p.about];
        if (!c) return true; // a question whose topic was removed from content.js
        const op = opinion(h, c);
        const v = { x: c.label };
        if (!yes && !no) { mem.pending = p; return false; }
        mem.told["yn:" + c.id] = yes ? "yes" : "no";
        if (p.then && p.then[yes ? "yes" : "no"]) out.followUp = p.then[yes ? "yes" : "no"];
        const keen = op === "love" || op === "secret";
        if (yes) {
          if (keen) out.say(out.line("answer.yesno.yes.love", v), 8, "♥");
          else if (op === "hate") out.say(out.line("answer.yesno.yes.hate", v), -8);
          else out.say(out.line("answer.yesno.yes.ok", v), 2);
        } else {
          if (keen) out.say(out.line("answer.yesno.no.love", v), -1);
          else if (op === "hate") out.say(out.line("answer.yesno.no.hate", v), 8, "♥");
          else out.say(out.line("answer.yesno.no.ok", v));
        }
        return true;
      }
      case "choice": {
        const picked = a.ents.filter(e => e.c.id === p.a || e.c.id === p.b)[0];
        if (a.words.both) { out.say(out.line("answer.choice.both"), 3); return true; }
        if (!picked) { mem.pending = p; return false; }
        mem.told["pick:" + picked.c.id] = "yes";
        if (p.then && p.then[picked.c.id === p.a ? "a" : "b"]) out.followUp = p.then[picked.c.id === p.a ? "a" : "b"];
        const op = opinion(h, picked.c);
        const v = { x: picked.c.label };
        if (op === "love" || op === "secret") out.say(out.line("answer.choice.love", v), 8, "♥");
        else if (op === "hate") out.say(out.line("answer.choice.hate", v), -5);
        else out.say(out.line("answer.choice.ok", v), 1);
        return true;
      }
      case "morning_night": {
        const early = a.words.morning, late = a.words.night;
        if (!early && !late) { mem.pending = p; return false; }
        const mine = A.hashString(h.id) % 2 ? "morning" : "night";
        mem.told.clock = early ? "morning" : "night";
        if ((early && mine === "morning") || (late && mine === "night")) out.say(out.line("answer.clock.same"), 6);
        else out.say(out.line(early ? "answer.clock.morning" : "answer.clock.night"), -1);
        return true;
      }
      case "human":
        mem.told.human = "yes";
        out.say(out.line("answer.human"), 2);
        return true;
      case "mood":
        if (a.words.sad) mem.told.sad = today();
        if (a.words.sad) out.say(out.line("answer.mood.sad"), 4);
        else if (a.words.happy || yes) out.say(out.line("answer.mood.happy"), 2);
        else out.say(out.line("answer.mood.other"));
        return true;
      default:
        return false;
    }
  }

  /* Ghosting (secret preference). A horse that's really into you keeps replying. */
  function ghosting(m) {
    const p = m.horse.prefs;
    return !!(p && p.ghostAfter && m.sent > p.ghostAfter && m.vibe < 80);
  }

  /* "How are you?" answers for today's mood, if it has its own */
  function howAreYouKey(h) {
    const k = "howAreYou." + moodId(h);
    return K.lines[k] && K.lines[k].length ? k : "howAreYou";
  }

  /* "You?": the horse answers the question it asked (or is still waiting on), else
     says what it thinks of the last thing you talked about */
  function selfAnswer(m, out) {
    const mem = m.mem, h = m.horse;
    const p = mem.pending || mem.lastAsked;
    const feel = c => {
      const op = opinion(h, c);
      out.say(out.line(op === "love" || op === "secret" ? "self.yes" : op === "hate" ? "self.hate" : "self.meh", { x: c.label }));
    };
    if (p) {
      const ca = BY_ID[p.a], cb = BY_ID[p.b], c = BY_ID[p.about];
      if (p.type === "fav_food") out.say(out.line("self.food"));
      else if (p.type === "fun") out.say(out.line("self.fun"));
      else if (p.type === "choice" && ca && cb) {
        const score = x => ({ love: 3, secret: 3, food: 1, ok: 1, meh: 0, hate: -1 })[opinion(h, x)] || 0;
        const pick = score(ca) === score(cb) ? (A.hashString(h.id + p.id) % 2 ? ca : cb) : score(ca) > score(cb) ? ca : cb;
        out.say(out.line("self.choice", { x: pick.label }));
      } else if ((p.type === "yesno" || p.type === "likeback") && c) feel(c);
      else if (p.type === "morning_night") out.say(out.line(A.hashString(h.id) % 2 ? "self.clock.morning" : "self.clock.night"));
      else if (p.type === "human") out.say(out.line("human"));
      else if (p.type === "mood") out.say(out.line(howAreYouKey(h)));
      else if (p.type === "name") out.say(out.line("yourName"));
      else out.say(out.line("self.open"));
      if (mem.pending) out.say(out.line("self.yourTurn"));
      else mem.lastAsked = null;
      return;
    }
    const last = mem.lastTopic && BY_ID[mem.lastTopic];
    if (last) feel(last);
    else out.say(out.line("self.none"));
  }

  // ---------- The main reply ----------
  /* Returns { replies, react, vibe, unmatch, ignore, date } and updates m.mem / m.vibe */
  function respond(m, me, raw) {
    init(m, me);
    const h = m.horse, mem = m.mem, voice = h.voice || "chill";
    const v = D.voiceFor(h);
    const a = analyze(raw);
    const t = a.t, W = a.words;
    const out = {
      replies: [], react: null, vibe: 0, unmatch: false, ignore: false, date: null, ask: null,
      say(text, dv, react) { if (text) this.replies.push(text); this.vibe += dv || 0; if (react) this.react = react; },
      // A named line from content.js, with this chat's details filled in
      line(key, extra) { return line(key, Object.assign(varsFor(m, me), extra), voice); },
      fill(text) { return D.fill(text, varsFor(m, me)); },
    };
    mem.turns++;

    if (ghosting(m)) { out.ignore = true; return out; }

    // The first reply of the day says how the horse is feeling today
    if (mem.moodDay !== today()) {
      mem.moodDay = today();
      out.moodFirst = out.line("mood." + moodId(h) + ".first");
    }

    // Saying the same thing twice
    if (mem.last === t && t.length > 3) {
      out.say(out.line("repeat"), -2);
      out.ask = false;
      return finish(m, out, voice, me);
    }
    mem.last = t;

    const ent = a.ents[0];
    const iLike = /\bi(?: really| totally| kinda| also| just| do)? (?:like|love|adore|enjoy|am into|'m into|am a fan of|'m a fan of|'m obsessed with|am obsessed with)\b/.test(t) ||
      /\b(?:is|are) my fav(?:ou?rite)?\b|\bmy fav(?:ou?rite)?(?: \w+)? (?:is|are)\b/.test(t);
    const iHate = /\bi(?: really| totally| kinda| just)? (?:hate|dislike|can't stand|don't like|do not like|am not into|'m not into)\b/.test(t);
    const askLike = /\b(?:do|would|did) you (?:like|love|enjoy|want|fancy|eat|ever)\b|\bare you (?:into|a fan of)\b|\bwhat do you think (?:of|about)\b|\bhow do you feel about\b|\bany good at\b|\bdo you do\b|\bthoughts on\b/.test(t);
    const invite = /\b(?:want to|shall we|should we|let's|lets|wanna|come|join me|would you like to|up for)\b/.test(t);
    const gift = a.action && /^\*\s*(?:gives?|hands?|offers?|brings?|tosses?|throws?|shares?|feeds?)\b/.test(t);
    const youToo = /^(?:and |what about |how about |)(?:you|yourself|you too)\s*\?*$|^(?:wbu|hbu)\b/.test(t);
    const askHate = /\b(?:do|would|did) you (?:hate|dislike|not like)\b|\bdon't you like\b/.test(t);
    const whatHate = /\bwhat (?:do you|don't you) (?:hate|dislike|not like|like least)\b|\bwhat don't you like\b|\banything you (?:hate|don't like)\b|\bpet peeves?\b/.test(t);
    if (!gift) mem.giftStreak = 0;
    if (ent) mem.lastTopic = ent.c.id;

    // 1. Horse-meat jokes land badly
    if (W.glue) { out.say(out.line("glue"), -40, "!?"); out.ask = false; return finish(m, out, voice, me); }

    // 2. Insults (but "you're not ugly" is fine)
    if (W.insult && !/\bnot\b|\bn't\b/.test(t) && !iHate) {
      mem.insults++;
      if (mem.insults >= 2) { out.unmatch = true; out.say(out.line("insult.last"), -30); return finish(m, out, voice, me); }
      out.say(out.line("insult"), -25, "!?");
      out.ask = false;
      return finish(m, out, voice, me);
    }

    // 3. Gifts
    if (gift) {
      // Each gift in a row is worth less, and the fifth one in a row is too many
      mem.giftStreak = (mem.giftStreak || 0) + 1;
      if (mem.giftStreak >= 5) { out.say(out.line("gift.tooMany"), -3); out.ask = false; return finish(m, out, voice, me); }
      const food = a.ents.filter(e => e.c.kind === "food" || e.c.kind === "bad")[0];
      if (!food) out.say(out.line("gift.unknown"), 1);
      else {
        const op = opinion(h, food.c);
        const fv = { x: food.c.label, word: food.word };
        if (op === "bad") out.say(out.line("gift.bad", fv), -8, "!?");
        else if (op === "hate") out.say(out.line("gift.hate", fv) + (mem.revealedHate ? " " + out.line("gift.hate.again", fv) : ""), -10);
        else if (op === "love" || op === "secret") { out.say(out.line("gift.love", fv), 12, "♥"); out.mood = "food"; }
        else out.say(out.line("gift.ok", fv), 6, "♥");
      }
      if (out.vibe > 0) out.vibe = Math.round(out.vibe * [1, 0.5, 0.25, 0][mem.giftStreak - 1]);
      out.ask = false;
      return finish(m, out, voice, me);
    }

    // 4. Statements: "I love mud", "I hate carrots", "apples are my favourite".
    // Two things at once ("I love carrots and mud") get a reaction each.
    // shortcut: "I love carrots but hate mud" counts as liking both; split on "but" if it matters.
    if ((iLike || iHate) && ent && !a.isQ) {
      a.ents.slice(0, 2).forEach(e => { if (!out.unmatch) aboutStatement(h, e, iLike && !iHate, out, mem); });
      if (mem.pending) mem.pending = null;
      return finish(m, out, voice, me);
    }

    // "You?" after the horse asked you something: it answers its own question
    if (youToo) {
      selfAnswer(m, out);
      out.ask = false;
      return finish(m, out, voice, me);
    }

    // 5. Answers to the horse's last question
    // ("hey", "bye", "lol" and the like aren't answers, so they skip this,
    // except "great, thanks" to "how are you", which is one)
    const moodAnswer = mem.pending && mem.pending.type === "mood" && (W.happy || W.sad);
    const smallTalk = (W.hello || W.bye || W.laugh || W.thanks || W.compliment || W.kiss || W.joke) && !a.ents.length && !moodAnswer;
    if (mem.pending && !a.isQ && !smallTalk && answerPending(m, me, a, out)) return finish(m, out, voice, me);

    // 6. Actions like *nuzzles*
    if (a.action) {
      if (W.kiss) {
        if (m.vibe >= 60) out.say(out.line("action.kiss.yes"), 5, "♥");
        else out.say(out.line("action.kiss.no"), -3);
      } else if (W.whinny) out.say(out.line("action.whinny"), 2);
      else out.say(out.line("action.other"), 1);
      out.ask = false;
      return finish(m, out, voice, me);
    }

    // 7. Questions about the horse
    const yourAge = /\bhow old\b|\byour age\b/.test(t);
    const yourName = /\bwhat is your name\b|\bwho are you\b|\byour name\b/.test(t);
    const yourBreed = /\bwhat (?:breed|kind of horse|type of horse|kind are you)\b|\byour breed\b|\bwhat are you\b/.test(t);
    const yourHeight = /\bhow (?:tall|big|high)\b|\byour height\b|\bhow many hands\b/.test(t);
    const where = /\bwhere (?:are|do) you\b|\bwhere is your\b|\bhow far\b|\bnear me\b/.test(t);
    const howAreYou = /\bhow are you\b|\bhow is it going\b|\bhow's it going\b|\bhow are things\b|\bhow have you been\b|\bhow is your day\b|\bhow's your day\b|\bwhat is up\b|\bsup\b|\bhow you doing\b/.test(t);
    const wyd = /\bwhat (?:are|were) you (?:doing|up to)\b|\bwyd\b|\bwhat you up to\b/.test(t);
    const fav = /\bfav(?:ou?rite)?\b/.test(t) && a.isQ;
    const hobby = /\bwhat do you (?:do|like)\b|\bhobbies\b|\bfor fun\b|\bwhat are you into\b|\byour interests\b|\bwhat do you enjoy\b/.test(t);
    const myName = /\b(?:my name is|call me|i'm called|i am called)\s+([a-z]+)/.exec(t);
    const bot = /\bare you (?:a )?(?:bot|robot|ai|real|fake|human|a real horse)\b|\bcatfish/.test(t) || (W.bot && a.isQ);

    // "Do you hate X?" and "what don't you like?"
    if (askHate && ent) {
      a.ents.slice(0, 2).forEach(e => {
        const op = opinion(h, e.c), hv = { x: e.c.label, word: e.word };
        if (op === "bad") out.say(out.line("like.bad", hv));
        else if (op === "hate") { mem.revealedHate = true; learn(mem, "hates", e.c.label); out.say(out.line("hate.yes", hv), 2); }
        else if (op === "love" || op === "secret") { learn(mem, "loves", e.c.label); out.say(out.line("hate.no.love", hv), 1); }
        else out.say(out.line("hate.no", hv));
      });
      out.ask = false;
      return finish(m, out, voice, me);
    }
    if (whatHate) {
      const hated = h.prefs && h.prefs.hatesInterest;
      const c = hated && CONCEPTS.filter(x => x.interest === hated)[0];
      const label = c ? c.label : hated && hated.toLowerCase();
      if (!hated) out.say(out.line("hates.none"));
      else if (m.vibe >= 55) { mem.revealedHate = true; learn(mem, "hates", label); out.say(out.line("hates.reveal", { x: label }), 2); }
      else out.say(out.line("hates.coy"));
      return finish(m, out, voice, me);
    }

    if (myName) {
      const orig = /\b(?:my name is|call me|i'm called|i am called)\s+([A-Za-z]+)/i.exec(a.raw);
      mem.nick = cap(orig ? orig[1] : myName[1]);
      out.say(out.line("name.mine"), 2);
      return finish(m, out, voice, me);
    }
    if (bot) { out.say(out.line("bot"), 0); return finish(m, out, voice, me); }
    if (howAreYou) {
      out.say(out.line(howAreYouKey(h)), 1);
      out.say(out.line("howAreYou.back"));
      mem.pending = { type: "mood" };
      out.ask = false;
      return finish(m, out, voice, me);
    }
    if (wyd) {
      const hr = new Date().getHours();
      out.say(out.line(hr < 9 ? "wyd.early" : hr < 13 ? "wyd.morning" : hr < 18 ? "wyd.afternoon" : hr < 22 ? "wyd.evening" : "wyd.night"), 1);
      return finish(m, out, voice, me);
    }
    if (yourName) { out.say(out.line(mem.askedName ? "yourName.again" : "yourName")); mem.askedName = true; return finish(m, out, voice, me); }
    if (yourAge) {
      const gap = me.age - h.age;
      out.say(out.line("age") + " " + out.line(Math.abs(gap) <= 2 ? "age.same" : gap > 0 ? "age.older" : "age.younger"));
      return finish(m, out, voice, me);
    }
    if (yourBreed) { out.say(out.line("breed", { fact: breedFact(h) }), 1); return finish(m, out, voice, me); }
    if (yourHeight) {
      const diff = me.inches - h.inches;
      out.say(out.line("height") + " " + out.line(Math.abs(diff) <= 1 ? "height.same" : diff > 0 ? "height.taller" : "height.shorter"));
      return finish(m, out, voice, me);
    }
    if (where) { out.say(out.line("where")); return finish(m, out, voice, me); }
    if (fav) {
      if (/snack|food|treat|eat/.test(t)) out.say(out.line("fav.food"));
      else if (/colou?r|coat/.test(t)) out.say(out.line("fav.colour"));
      else if (/place|spot|field/.test(t)) out.say(out.line("fav.place"));
      else if (/song|music/.test(t)) out.say(out.line(h.likes.indexOf("Country music") >= 0 ? "fav.music.country" : h.likes.indexOf("Classical music") >= 0 ? "fav.music.classical" : "fav.music.other"));
      else out.say(out.line("fav.other"));
      return finish(m, out, voice, me);
    }
    if (hobby) { out.say(out.line("hobby"), 1); return finish(m, out, voice, me); }

    // 8. "Do you like X?" (and "do you like carrots and apples?")
    if (askLike && ent && !invite) {
      a.ents.slice(0, 2).forEach(e => doYouLike(h, e, out, mem, out.askedBack));
      out.ask = false;
      return finish(m, out, voice, me);
    }

    // 9. Dates and invitations
    const act = a.ents.filter(e => e.c.kind === "act")[0];
    if (invite && act && !W.date) {
      const op = opinion(h, act.c);
      const av = { x: act.c.label };
      if (op === "hate") out.say(out.line("invite.hate", av), -6);
      else if (op === "love" || op === "secret") out.say(out.line("invite.love", av), 8, "♥");
      else out.say(out.line("invite.ok", av), 3);
      return finish(m, out, voice, me);
    }
    if (W.date && (invite || a.isQ)) {
      if (dateOver(mem)) { // that one's been and gone, so a new one can be planned
        mem.lastDate = mem.date;
        delete mem.date; delete mem.datePlace; delete mem.dateAt; delete mem.calEventId;
      }
      if (mem.date) out.say(out.line("date.already"), 2);
      else if (m.vibe >= 62) {
        const liked = Object.keys(K.datePlaces).filter(i => h.likes.indexOf(i) >= 0)[0];
        const place = liked ? K.datePlaces[liked] : out.line("date.place");
        const when = rnd(Object.keys(DATE_TIMES));
        mem.date = `${place} ${when}`;
        mem.datePlace = place;
        mem.dateAt = dateTime(when);
        out.date = mem.date;
        out.say(out.line("date.yes", { place, when }), 8, "♥");
        out.ask = false;
      } else if (m.vibe >= 40) out.say(out.line("date.maybe"), -1);
      else out.say(out.line("date.no"), -3);
      return finish(m, out, voice, me);
    }

    // 10. Compliments and affection
    if (W.compliment && !/\bnot\b|n't\b/.test(t)) {
      mem.compliments++;
      if (mem.compliments >= 4) out.say(out.line("compliment.many"), 1);
      else { out.say(out.line("compliment"), 6, "♥"); out.mood = "shy"; }
      return finish(m, out, voice, me);
    }
    if (W.kiss) {
      if (m.vibe >= 60) out.say(out.line("kiss.yes"), 5, "♥");
      else out.say(out.line("kiss.no"), -2);
      return finish(m, out, voice, me);
    }

    // 11. Small talk
    if (W.joke && (a.isQ || /\btell\b|\bknow\b|\bjoke\b/.test(t)) && K.jokes.length) {
      const j = K.jokes[mem.jokes % K.jokes.length];
      mem.jokes++;
      j.forEach(s => out.say(out.fill(s)));
      out.say(out.line("joke.after"));
      out.ask = false;
      return finish(m, out, voice, me);
    }
    if (W.laugh) { out.say(out.line("laugh"), 3, "ha"); return finish(m, out, voice, me); }
    if (W.thanks) { out.say(out.line("thanks"), 1); return finish(m, out, voice, me); }
    if (W.sad && !a.isQ) { out.mood = "sad"; out.say(out.line("sad"), 4); out.ask = false; return finish(m, out, voice, me); }
    if (W.weather) {
      const muddy = opinion(h, BY_ID.mud);
      out.say(out.line(/rain|storm/.test(t) ? (muddy === "love" || muddy === "secret" ? "weather.rain.mud" : "weather.rain")
        : /cold|snow/.test(t) ? "weather.cold" : "weather.other"), 1);
      return finish(m, out, voice, me);
    }
    if (W.human) { out.say(out.line("human"), 1); if (!mem.pending) { mem.pending = { type: "human" }; out.say(out.line("human.ask")); } out.ask = false; return finish(m, out, voice, me); }
    if (W.bye) { out.say(out.line("bye")); out.ask = false; return finish(m, out, voice, me); }
    if (W.hello) {
      if (mem.userGreeted) out.say(out.line("hello.again"));
      else if (mem.greeted) out.say(out.line("hello.back"), 1); // horse spoke first
      else out.say(out.fill(rnd(v.greet)));
      mem.greeted = mem.userGreeted = true;
      out.ask = true;
      return finish(m, out, voice, me);
    }

    // 12. Something mentioned in passing
    if (ent) {
      const op = opinion(h, ent.c);
      const ev = { x: ent.c.label, word: ent.word };
      if (ent.c.kind === "bad") out.say(out.line("passing.bad", ev));
      else if (op === "hate") out.say(out.line("passing.hate", ev), mem.revealedHate ? -10 : -5, "!?");
      else if (op === "love" || op === "secret") out.say(out.line("passing.love", ev), 4);
      else if (ent.c.kind === "food") out.say(out.fill(rnd(v.snack)));
      else if (ent.c.id === "ride" || ent.c.id === "jump" || ent.c.id === "dressage") out.say(out.fill(rnd(v.ride)));
      else out.say(out.line("passing.other", ev));
      return finish(m, out, voice, me);
    }
    if ((W.yes || W.no) && !a.isQ) { out.say(out.line(W.yes ? "yes" : "no")); return finish(m, out, voice, me); }

    // 13. Nothing recognised
    if (a.isQ) out.mood = "shrug";
    if (a.isQ) out.say(out.line("unknown.question"));
    else {
      const story = chance(0.45) && nextStory(m);
      const back = !story && chance(0.35) && callback(m, out);
      if (story) story.forEach((s, i) => out.say(out.fill(s), i ? 0 : 1));
      else if (back) out.say(back, 1);
      else out.say(out.fill(v.lines[mem.turns % v.lines.length]));
      if (story || back) { out.ask = false; return finish(m, out, voice, me); }
    }
    out.ask = true;
    return finish(m, out, voice, me);
  }

  /* A story the horse hasn't told yet: about its own likes first, then its discipline,
     then anything. Each one is a few bubbles. */
  function nextStory(m) {
    const S = K.stories || {}, mem = m.mem, h = m.horse;
    mem.stories = mem.stories || [];
    const keys = h.likes.filter(l => S[l]).concat(["disc", "any"].filter(k => S[k]));
    for (let i = 0; i < keys.length; i++) {
      const list = S[keys[i]];
      for (let j = 0; j < list.length; j++) {
        const id = keys[i] + "#" + j;
        if (mem.stories.indexOf(id) < 0 && list[j] && list[j].length) { mem.stories.push(id); return list[j]; }
      }
    }
    return null;
  }

  /* Something you told the horse earlier, brought up again. Each memory once. */
  function callback(m, out) {
    const mem = m.mem, told = mem.told || {};
    mem.calledBack = mem.calledBack || [];
    const options = [];
    Object.keys(told).forEach(k => {
      const c = BY_ID[k.replace(/^(?:yn|pick):/, "")];
      if (k === "food" && BY_ID[told.food]) options.push(["food", "callback.food", BY_ID[told.food].label]);
      else if (k === "clock") options.push(["clock", "callback." + told.clock, ""]);
      else if (k === "human") options.push(["human", "callback.human", ""]);
      else if (k === "sad" && told.sad === today()) options.push(["sad:" + told.sad, "callback.sad", ""]);
      else if (k.indexOf("yn:") === 0 && told[k] === "yes" && c) options.push([k, "callback.yes", c.label]);
      else if (k.indexOf("pick:") === 0 && c) options.push([k, "callback.pick", c.label]);
      else if (told[k] === "love" && c) options.push([k, "callback.love", c.label]);
    });
    const left = options.filter(o => mem.calledBack.indexOf(o[0]) < 0 && K.lines[o[1]]);
    if (!left.length) return "";
    const o = rnd(left);
    mem.calledBack.push(o[0]);
    return out.line(o[1], { x: o[2] });
  }

  /* "at sunset" -> the next sunset-ish time, as a timestamp */
  function dateTime(when) {
    const now = new Date(), d = new Date(now.getTime());
    const at = DATE_TIMES[when] || [12, 0];
    d.setHours(at[0], at[1], 0, 0);
    if (when === "tomorrow morning") d.setDate(d.getDate() + 1);
    while (d.getTime() <= now.getTime() + DATE_LEAD) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function finish(m, out, voice, me) {
    const mem = m.mem, h = m.horse;
    // A grumpy day makes good things count for less, a playful one for more
    const gain = moodOfDay(h).gain;
    if (out.vibe > 0 && typeof gain === "number") out.vibe = Math.round(out.vibe * gain);
    m.vibe = Math.max(0, Math.min(100, m.vibe + out.vibe));
    if (!out.unmatch && m.vibe <= 8) {
      out.unmatch = true;
      out.replies.push(out.line("unmatch.low"));
    }
    // A follow-up to the answer you just gave ("Yes, I jump" -> "How high?")
    let asked = false;
    if (!out.unmatch && out.followUp && !mem.pending) {
      const q = nextQuestion(m, me, out.followUp);
      if (q) { out.replies.push(out.fill(q)); asked = true; }
    }
    // Keep the conversation going with a question of its own, or something you said earlier
    if (!asked && !out.unmatch && out.ask !== false && !mem.pending) {
      if (out.ask === true ? chance(0.7) : chance(0.3)) {
        const q = nextQuestion(m, me);
        if (q) out.replies.push(out.fill(q));
      } else if (mem.turns >= 4 && chance(0.15)) {
        const back = callback(m, out);
        if (back) out.replies.push(back);
      }
    }
    // Now and then, a horse that's into you says so
    if (!out.unmatch && m.vibe >= 85 && !mem.saidLike) { mem.saidLike = true; out.replies.push(out.line("saidLike")); }
    out.replies = out.replies.filter(Boolean).map(r => style(r, voice));
    // Now and then it uses your name: "Dave, same!! I love mud." After style(), so no
    // opener ends up in front of it and lowercases it.
    const nick = nickOf(m, me);
    if (nick && !out.unmatch && chance(0.07)) {
      const i = out.replies.findIndex(r => !/^\*/.test(r) && r.indexOf(nick) < 0 && r.indexOf(h.name) !== 0 && !/^(?:[A-Z]{2}|I\b|I')/.test(r));
      const pre = i >= 0 && out.line("name.prefix", { nick });
      if (pre) out.replies[i] = pre + out.replies[i].charAt(0).toLowerCase() + out.replies[i].slice(1);
    }
    if (out.moodFirst && !out.unmatch && out.replies.length) out.replies.unshift(style(out.moodFirst, voice));
    addFaces(out, voice);
    typo(out, voice);
    delete out.say; delete out.line; delete out.fill;
    return out;
  }

  /* Some personalities fumble a word now and then, then send the *correction */
  function typo(out, voice) {
    const p = K.typos && K.typos[voice];
    if (!p || !chance(p)) return;
    for (let i = 0; i < out.replies.length; i++) {
      const r = out.replies[i];
      if (/^\*|\*$/.test(r)) continue;
      const words = r.match(/[A-Za-z]{5,}/g);
      if (!words) continue;
      const w = rnd(words), j = 1 + Math.floor(Math.random() * (w.length - 3));
      const wrong = w.slice(0, j) + w.charAt(j + 1) + w.charAt(j) + w.slice(j + 2);
      if (wrong === w) continue;
      out.replies[i] = r.replace(w, wrong);
      out.replies.splice(i + 1, 0, "*" + w);
      return;
    }
  }

  /* First message from the horse when a chat opens empty */
  function opener(m, me) {
    init(m, me);
    const h = m.horse, v = D.voiceFor(h), voice = h.voice || "chill";
    m.mem.greeted = true;
    const vars = varsFor(m, me);
    const lines = [D.fill(rnd(v.greet), vars)];
    if (m.mem.moodDay !== today()) { m.mem.moodDay = today(); lines.push(line("mood." + moodId(h) + ".first", vars, voice)); }
    const shared = me.interests.filter(i => h.likes.indexOf(i) >= 0)[0];
    if (shared && chance(0.6)) lines.push(line("opener.shared", Object.assign(vars, { shared: shared.toLowerCase() }), voice));
    const q = nextQuestion(m, me);
    if (q) lines.push(D.fill(q, vars));
    const out = { replies: lines.filter(Boolean).map(l => style(l, voice)) };
    addFaces(out, voice);
    return out.replies;
  }

  /* Quick replies that fit what the horse just asked */
  function suggestions(m, me) {
    init(m, me);
    const p = m.mem.pending;
    const chips = K.chips;
    if (p) {
      if (p.type === "choice" && BY_ID[p.a] && BY_ID[p.b]) return chips.choice.map(c => D.fill(c, { a: BY_ID[p.a].label, b: BY_ID[p.b].label }));
      if (p.type !== "choice" && chips[p.type]) return chips[p.type].slice();
    }
    // Lean toward what the horse likes, and once it's into you, hint at its secret likes
    const h = m.horse, prefs = h.prefs || {};
    const secret = (prefs.lovesInterests || []).filter(i => h.likes.indexOf(i) < 0);
    const warm = m.vibe >= 70 && secret.length;
    const roll = Math.random();
    const topic = rnd(warm && roll < 0.5 ? secret : roll < 0.75 && h.likes.length ? h.likes : D.INTERESTS).toLowerCase();
    const good = me.interests.filter(i => h.likes.indexOf(i) >= 0 || (warm && secret.indexOf(i) >= 0));
    const mine = (good.length && chance(0.6) ? rnd(good) : me.interests.length ? rnd(me.interests) : "long gallops").toLowerCase();
    const pool = chips.any.map(c => D.fill(c, { topic, mine }));
    const dateChip = chips.date[0];
    const out = [];
    while (out.length < 5 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    if (dateChip && m.vibe >= 62 && !m.mem.date && out.indexOf(dateChip) < 0) out[0] = dateChip;
    if (!m.messages || !m.messages.length) chips.first.slice().reverse().forEach(c => out.unshift(c));
    return out;
  }

  /* Once a date's time has passed, the horse says how it went. Not adding it to the
     calendar counts as standing it up. Returns { replies, vibe, unmatch } or null. */
  function afterDate(m, me) {
    init(m, me);
    const mem = m.mem, h = m.horse, voice = h.voice || "chill";
    if (m.status === "unmatched" || !dateOver(mem)) return null;
    const added = !!(mem.calEventId || mem.calWeb);
    const key = !added ? "date.after.stood" : m.vibe >= 55 ? "date.after.good" : "date.after.meh";
    const out = {
      replies: [], vibe: !added ? -15 : m.vibe >= 55 ? 8 : -4, unmatch: false, react: null, ask: false,
      line(k, extra) { return line(k, Object.assign(varsFor(m, me), extra), voice); },
      fill(text) { return D.fill(text, varsFor(m, me)); },
    };
    out.mood = out.vibe > 0 ? "love" : "sad";
    out.replies.push(out.line(key));
    // That date is done: a new one can be planned
    mem.lastDate = mem.date;
    delete mem.date; delete mem.datePlace; delete mem.dateAt; delete mem.calEventId; delete mem.calWeb;
    const r = finish(m, out, voice, me);
    return { replies: r.replies, vibe: r.vibe, unmatch: r.unmatch };
  }

  /* A nudge when you leave the horse's question unanswered: only personalities that
     have nudges in content.js, and once per question */
  function nudge(m, me) {
    init(m, me);
    const mem = m.mem, h = m.horse, voice = h.voice || "chill";
    const pool = K.nudges && K.nudges[voice];
    if (!pool || !pool.length || !mem.pending || m.status === "unmatched" || ghosting(m)) return null;
    const mark = mem.asked.length + ":" + mem.pending.type;
    if (mem.nudged === mark) return null;
    mem.nudged = mark;
    return [style(D.fill(rnd(pool), varsFor(m, me)), voice)];
  }

  const GIFTS = K.gifts;

  window.HorseChat = {
    init, respond, opener, suggestions, GIFTS, settings, upcoming, ghosting,
    afterDate, nudge, moodStatus, typingSpeed,
  };
})();
