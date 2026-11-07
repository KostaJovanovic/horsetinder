// Chat checks, run with `npm test`. Loads the app's own scripts in Node.
// 1. Every quick reply the app offers for a horse's question must answer it.
// 2. A date that's in the past stays in the past, so a new one can be planned.
"use strict";
const assert = require("assert");
const path = require("path");

globalThis.window = globalThis;
for (const f of ["content", "art", "horses", "prefs", "chat"]) require(path.join(__dirname, "..", "www", "js", f + ".js"));
const C = window.HorseChat, D = window.HorseData;

const me = {
  name: "Dave", age: 8, sex: "gelding", showMe: "everyone", breed: "Mixed breed", inches: 60,
  discipline: "Trail riding", lookingFor: "unsure", interests: ["Carrots", "Swimming", "Goats"], photos: [{}], bio: "",
};
// One of each question type the horses ask (QUESTIONS in chat.js), plus the "Do you?" follow-up
const PENDING = [
  { type: "fav_food" }, { type: "fun" }, { type: "choice", a: "gallop", b: "nap" }, { type: "yesno", about: "mud" },
  { type: "likeback", about: "carrot" }, { type: "morning_night" }, { type: "human" }, { type: "mood" },
  { type: "open" }, { type: "name" },
].concat(window.HorseContent.chat.scenarios.map(s => ({ type: "scenario", id: s.id })));

let checks = 0;
// (not the real horse: it doesn't ask questions or understand answers, see 15)
for (const horse of D.buildDeck(12345, 10, {}).filter(h => !h.real)) {
  // ghostAfter 0: a ghosting horse ignores every message, which isn't what this tests
  const h = Object.assign({}, horse, { prefs: Object.assign({}, horse.prefs, { ghostAfter: 0 }) });
  for (const p of PENDING) {
    const probe = { horse: h, messages: [{ from: "them", text: "?" }], sent: 0 };
    C.init(probe, me);
    probe.mem.pending = Object.assign({}, p);
    for (const reply of C.suggestions(probe, me)) {
      const m = { horse: h, messages: [{ from: "them", text: "?" }], sent: 1 };
      C.init(m, me);
      const asked = Object.assign({}, p);
      m.mem.pending = asked;
      C.respond(m, me, reply);
      assert.notStrictEqual(m.mem.pending, asked, `${h.name}: quick reply "${reply}" didn't answer a ${p.type} question`);
      checks++;
    }
  }
}

const past = Date.now() - 3 * 86400000;
const m = { horse: D.buildDeck(1, 0, {})[0], messages: [], sent: 1, vibe: 90 };
C.init(m, me);
Object.assign(m.mem, { date: "the beach at sunset", datePlace: "the beach", dateAt: past });
C.init(m, me);
assert.strictEqual(m.mem.dateAt, past, "opening a chat moved a past date into the future");
C.respond(m, me, "Want to meet up?");
assert.ok(m.mem.dateAt > Date.now(), "a date three days ago blocked planning a new one");
checks += 2;

// 3. content.js hangs together: questions point at word groups and follow-ups that exist,
//    every question type has quick replies
const K = window.HorseContent.chat;
const conceptIds = K.concepts.map(c => c.id), questionIds = K.questions.map(q => q.id);
for (const q of K.questions.concat(K.profileQuestions || [])) {
  for (const k of ["about", "a", "b"]) if (q[k]) assert.ok(conceptIds.indexOf(q[k]) >= 0, `question ${q.id}: ${k} "${q[k]}" isn't a word group`);
  for (const k in q.then || {}) assert.ok(questionIds.indexOf(q.then[k]) >= 0, `question ${q.id}: follow-up "${q.then[k]}" doesn't exist`);
  assert.ok(K.chips[q.type || "open"], `question ${q.id}: no quick replies for type "${q.type}"`);
  checks++;
}

// A horse with no hates and no ghosting, so the checks below aren't luck
const plain = () => {
  const h = D.buildDeck(7, 0, {}).filter(x => x.voice === "hyper")[0];
  return Object.assign({}, h, { prefs: Object.assign({}, h.prefs, { ghostAfter: 0, hatesInterest: null }) });
};
const fresh = (vibe, horse) => { const x = { horse: horse || plain(), messages: [{ from: "them", text: "hi" }], sent: 1, vibe: vibe || 50 }; C.init(x, me); return x; };

// 4. Two things at once get two reactions
{ const x = fresh(); const r = C.respond(x, me, "I love carrots and mud"); assert.ok(r.replies.length >= 2, "two topics got one reaction: " + r.replies); checks++; }

// 5. Gifts in a row are worth less, and the fifth is too many
{
  const x = fresh(40), v = [];
  for (let i = 0; i < 5; i++) v.push(C.respond(x, me, i % 2 ? "*gives you an apple*" : "*gives you a carrot*").vibe);
  assert.ok(v[0] > 0 && v[3] === 0 && v[4] < 0, "gift streak vibes: " + v);
  checks++;
}

// 6. "You?" answers the horse's own question and keeps waiting for yours
{
  const x = fresh();
  x.mem.pending = x.mem.lastAsked = { type: "fav_food", id: "fav_food" };
  const r = C.respond(x, me, "you?");
  assert.ok(r.replies.join(" ").toLowerCase().indexOf(D.favouriteFood(x.horse)) >= 0, "you? didn't answer: " + r.replies);
  assert.ok(x.mem.pending && x.mem.pending.type === "fav_food", "you? dropped the open question");
  checks++;
}

// 7. A yes gets its follow-up question
{
  const x = fresh();
  x.mem.pending = { type: "yesno", id: "jump", about: "jump", then: { yes: "jump_height" } };
  C.respond(x, me, "yes");
  assert.strictEqual(x.mem.pending && x.mem.pending.id, "jump_height", "no follow-up after yes");
  checks++;
}

// 8. A date that never went into the calendar is a stand-up, said once
{
  const x = fresh(70);
  Object.assign(x.mem, { date: "the beach at sunset", datePlace: "the beach", dateAt: Date.now() - 3 * 3600000 });
  const r = C.afterDate(x, me);
  assert.ok(r && r.vibe < 0 && /beach/.test(r.replies.join(" ")), "stood-up date: " + JSON.stringify(r));
  assert.ok(!x.mem.date && C.afterDate(x, me) === null, "the date message came twice");
  checks++;
}

// 9. Hyper horses nudge once per question; chill ones never do
{
  const x = fresh();
  x.mem.pending = { type: "mood" };
  assert.ok(C.nudge(x, me) && C.nudge(x, me) === null, "hyper nudge should come once");
  const chill = D.buildDeck(7, 0, {}).filter(h => h.voice === "chill")[0];
  const y = fresh(50, chill);
  y.mem.pending = { type: "mood" };
  assert.strictEqual(C.nudge(y, me), null, "a chill horse nudged");
  checks += 2;
}

// 10. Personalities use their own lines for the big moments
{
  const posh = D.buildDeck(7, 0, {}).filter(h => h.voice === "posh")[0];
  const x = fresh(90, Object.assign({}, posh, { prefs: Object.assign({}, posh.prefs, { ghostAfter: 0 }) }));
  const r = C.respond(x, me, "Want to meet up?");
  const own = K.voiceLines.posh["date.yes"].map(s => s.split(".")[0].replace(/\{\w+\}/g, "").trim().toLowerCase());
  assert.ok(own.some(s => r.replies.join(" ").toLowerCase().indexOf(s) >= 0), "posh date reply wasn't posh: " + r.replies);
  checks++;
}

// 11. A typo is followed by its *correction
{
  const keep = K.typos.hyper;
  K.typos.hyper = 1;
  const r = C.respond(fresh(), me, "tell me a joke");
  K.typos.hyper = keep;
  assert.ok(r.replies.some(s => /^\*[A-Za-z]+$/.test(s)), "no typo correction: " + r.replies);
  checks++;
}

// From here on the checks look for exact words, so no random typos
K.typos = {};

// 12. "but" splits a statement: liking one thing and not the other
{
  const x = fresh();
  const said = [];
  const keep = K.lines;
  K.lines = Object.assign({}, keep, { "statement.ok": ["LIKE {x}"], "statement.meh": ["LIKE {x}"], "statement.food": ["LIKE {x}"],
    "statement.love": ["LIKE {x}"], "statement.secret": ["LIKE {x}"], "dislike.ok": ["NOT {x}"], "dislike.love": ["NOT {x}"], "dislike.hate": ["NOT {x}"] });
  said.push(C.respond(x, me, "I love carrots but hate mud").replies.join(" "));
  K.lines = keep;
  assert.ok(/LIKE carrots/i.test(said[0]) && /NOT mud/i.test(said[0]), "but-split: " + said[0]);
  checks++;
}

// 13. Small things people type
{
  assert.strictEqual(D.fill("I'm a {breed}.", { breed: "Akhal-Teke" }), "I'm an Akhal-Teke.", "a/an");
  assert.strictEqual(D.fill("a {breed}", { breed: "Shire" }), "a Shire", "a/an");
  const x = fresh(60);
  C.respond(x, me, "you're ugly");
  const hurt = x.vibe;
  C.respond(x, me, "sorry");
  assert.ok(x.vibe > hurt, "sorry after an insult didn't help");
  const again = x.vibe;
  C.respond(x, me, "so sorry");
  assert.ok(x.vibe <= again, "sorry counted twice for one insult");
  const y = fresh();
  const r = C.respond(y, me, "what are you looking for?");
  assert.ok(!/known for|bred/i.test(r.replies.join(" ")) && r.replies.length, "looking-for answered with the breed: " + r.replies);
  y.mem.pending = { type: "yesno", about: "mud" };
  C.respond(y, me, "ok");
  assert.ok(y.mem.pending, "the first ok should still wait for an answer");
  C.respond(y, me, "cool");
  assert.ok(!y.mem.pending || y.mem.pending.about !== "mud", "the second ok should let the question go");
  const z = fresh();
  assert.ok(C.respond(z, me, "❤️").vibe > 0, "a heart did nothing");
  checks += 6;
}

// 14. Grammar in lines, and short replies run together
{
  assert.strictEqual(D.fill("{X} is the best.", { x: "carrots" }), "Carrots are the best.", "plural verb");
  assert.strictEqual(D.fill("{x} isn't for me", { x: "spooking at bags" }), "spooking at bags isn't for me", "an -ing activity is one thing");
  assert.strictEqual(D.fill("{X} is fine", { x: "grass" }), "Grass is fine", "grass isn't a plural");
  const keep = K.lines;
  K.lines = Object.assign({}, keep, { same: ["SAME"], ack: ["ACK"], "huh.really": ["REALLY"], laugh: ["LAUGH"], yes: ["YES"] });
  const said = t => { const x = fresh(); x.mem.pending = null; return C.respond(x, me, t).replies.join(" "); };
  const got = ["oh same lol", "yeah same", "ok cool", "wait really??", "haha ok"].map(said);
  K.lines = keep;
  assert.ok(/SAME/.test(got[0]) && /SAME/.test(got[1]) && /ACK/.test(got[2]) && /REALLY/.test(got[3]) && /LAUGH/.test(got[4]), "short replies: " + got);
  checks += 4;
}

// 16. Minigames: combos, scenarios and goals
{
  // Good replies in a row: the third counts x1.5, a bad one ends the combo
  const x = fresh(20);
  const v = ["you're gorgeous", "you're so pretty", "you're beautiful"].map(t => C.respond(x, me, t).vibe);
  assert.ok(x.mem.combo === 3 && v[2] > v[0], "combo: " + v + " combo " + x.mem.combo);
  C.respond(x, me, "you're ugly");
  assert.strictEqual(x.mem.combo, 0, "an insult kept the combo");
  // "Let's play a game" starts a scenario whose cards are the quick replies
  const y = fresh();
  C.respond(y, me, "let's play a game");
  const s = K.scenarios.filter(q => q.id === (y.mem.pending && y.mem.pending.id))[0];
  assert.ok(s && C.suggestions(y, me).join() === s.cards.map(c => c.text).join(), "no scenario cards: " + JSON.stringify(y.mem.pending));
  // A card about something the horse secretly loves gives it away and finishes two goals
  const lover = plain();
  const secret = lover.prefs.lovesInterests[0];
  const concept = K.concepts.filter(c => c.interest === secret)[0];
  const z = fresh(50, lover);
  const keep = K.scenarios;
  K.scenarios = [{ id: "t", text: ["Pick"], cards: [{ text: "That one", about: concept.id, vibe: -5, reply: ["no"] }] }];
  C.respond(z, me, "let's play a game");
  const r = C.respond(z, me, "That one");
  K.scenarios = keep;
  assert.ok(r.vibe > 0 && z.mem.learned.loves.indexOf(concept.label) >= 0, "secret card: " + JSON.stringify(r));
  assert.ok(z.mem.goals.secret && z.mem.goals.game && r.goals.length >= 2, "goals: " + JSON.stringify(r.goals));
  assert.ok(C.goals(z, me).filter(g => g.done).length >= 2, "goal checklist");
  checks += 6;
}

// 15. The real horse: its own photos with credits, and only noises from its own lines
{
  const real = D.buildDeck(1, 0, {}).filter(h => h.real)[0];
  assert.ok(real && real.photos.length && real.photos.every(p => p.src && p.credit), "real horse photos: " + JSON.stringify(real && real.photos));
  const x = fresh(50, Object.assign({}, real, { prefs: Object.assign({}, real.prefs, { ghostAfter: 0 }) }));
  const noises = [].concat(real.talk.greet, real.talk.snack, real.talk.lines);
  for (const t of ["hi", "do you like carrots?", "what's your name?", "you're ugly", "*gives you an apple*", "want to meet up?"]) {
    const r = C.respond(x, me, t);
    assert.ok(r.replies.length && r.replies.every(s => noises.indexOf(s) >= 0) && !r.unmatch, `real horse said "${r.replies}" to "${t}"`);
  }
  assert.ok(C.opener(x, me).every(s => real.talk.greet.indexOf(s) >= 0), "real horse opener");
  checks += 3;
}

console.log(`chat: ${checks} checks passed`);
