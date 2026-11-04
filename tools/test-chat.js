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
];

let checks = 0;
for (const horse of D.buildDeck(12345, 10, {})) {
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

console.log(`chat: ${checks} checks passed`);
