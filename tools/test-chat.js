// Chat checks, run with `npm test`. Loads the app's own scripts in Node.
// 1. Every quick reply the app offers for a horse's question must answer it.
// 2. A date that's in the past stays in the past, so a new one can be planned.
"use strict";
const assert = require("assert");
const path = require("path");

globalThis.window = globalThis;
for (const f of ["art", "horses", "prefs", "chat"]) require(path.join(__dirname, "..", "www", "js", f + ".js"));
const C = window.HorseChat, D = window.HorseData;

const me = {
  name: "Dave", age: 8, sex: "gelding", showMe: "everyone", breed: "Mixed breed", inches: 60,
  discipline: "Trail riding", lookingFor: "unsure", interests: ["Carrots", "Swimming", "Goats"], photos: [{}], bio: "",
};
// One of each question type the horses ask (QUESTIONS in chat.js), plus the "Do you?" follow-up
const PENDING = [
  { type: "fav_food" }, { type: "fun" }, { type: "choice", a: "gallop", b: "nap" }, { type: "yesno", about: "mud" },
  { type: "likeback", about: "carrot" }, { type: "morning_night" }, { type: "human" }, { type: "mood" },
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

console.log(`chat: ${checks} checks passed`);
