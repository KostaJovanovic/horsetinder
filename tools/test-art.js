// Art, prompt and preference checks, run with `npm test`. Loads the app's own scripts in Node.
// 1. Every pose, accessory, mane, build, pattern and scene draws without NaN or undefined.
// 2. Round avatars (plain) are always side-on.
// 3. Every horse gets 3 different, answered prompts; old saved horses get them too.
// 4. Preferences cope with profiles with and without prompts, and with a liked prompt.
"use strict";
const assert = require("assert");
const path = require("path");

globalThis.window = globalThis;
for (const f of ["art", "horses", "prefs"]) require(path.join(__dirname, "..", "www", "js", f + ".js"));
const A = window.HorseArt, D = window.HorseData, P = window.HorsePrefs;
let checks = 0;

const keys = o => Object.keys(o);
for (const pose of keys(A.POSES)) for (const accessory of keys(A.ACCESSORIES)) for (const mane of keys(A.MANES))
  for (const build of keys(A.BUILDS)) for (const pattern of keys(A.PATTERNS)) {
    const spec = { pose, accessory, mane, build, pattern, marking: "blaze", scene: pose === "graze" ? "meadow" : "studio" };
    const svg = A.render(spec);
    assert.ok(!/NaN|undefined/.test(svg), `bad SVG for ${JSON.stringify(spec)}`);
    checks++;
  }
for (const scene of keys(A.SCENES).concat("photo")) {
  assert.ok(!/NaN|undefined/.test(A.render({ pose: "graze", scene })), `bad grazing SVG in ${scene}`);
  checks++;
}
// A grazing head is drawn rotated; side-on draws it unrotated
for (const pose of keys(A.POSES)) {
  assert.ok(/rotate\(0 /.test(A.render({ pose }, { plain: true })), `avatar for ${pose} isn't side-on`);
  checks++;
}

const deck = D.buildDeck(4242, 40, {});
for (const h of deck) {
  const qs = h.prompts.map(p => p.q);
  assert.strictEqual(new Set(qs).size, 3, `${h.name} doesn't have 3 different prompts`);
  assert.ok(h.prompts.every(p => p.a && p.a.length > 5), `${h.name} has an empty prompt answer`);
  checks++;
}
const old = Object.assign({}, deck[0]);
delete old.prompts;
assert.deepStrictEqual(D.promptsOf(old), D.promptsOf(old), "prompts for an old saved horse change between calls");
assert.strictEqual(D.promptsOf(old).length, 3, "an old saved horse got no prompts");
checks += 2;

const me = {
  name: "Dave", age: 8, sex: "gelding", showMe: "everyone", breed: "Mixed breed", inches: 60,
  discipline: "Trail riding", lookingFor: "unsure", interests: ["Carrots", "Swimming", "Goats"], photos: [{}, {}], bio: "",
};
for (const h of deck) {
  for (const profile of [me, Object.assign({}, me, { prompts: [{ q: "I go crazy for", a: "Carrots, obviously." }] })]) {
    for (const liked of [null, { kind: "prompt", index: 0, comment: "Same!" }]) {
      const v = P.evaluate(h, profile, "like", liked);
      assert.strictEqual(typeof v.match, "boolean");
      checks++;
    }
  }
}

// Likes you: only horses you'd pass with, pointing at something that exists on your profile
const withPrompts = Object.assign({}, me, { prompts: [{ q: "I go crazy for", a: "Carrots, obviously." }, { q: "Typical Sunday", a: "Nap." }] });
const rand = A.mulberry32(9);
let liked = 0;
for (const h of deck) for (const profile of [me, withPrompts]) {
  const l = P.likesYou(h, profile, rand);
  if (!l) continue;
  liked++;
  if (l.kind === "prompt") assert.ok(profile.prompts && profile.prompts[l.index] && profile.prompts[l.index].a, `${h.name} liked a prompt that isn't there`);
  else assert.ok(l.index >= 0 && l.index < profile.photos.length, `${h.name} liked a photo that isn't there`);
  assert.strictEqual(typeof l.comment, "string");
  checks++;
}
assert.ok(liked > 0, "no horse ever likes you first");
assert.ok(P.likeChance(withPrompts) > P.likeChance(me), "answering prompts doesn't help");
checks += 2;

// Calendar links for the browser: UTC stamps, everything encoded
const start = Date.UTC(2026, 10, 14, 17, 30), links = D.calendarLinks({
  title: "Horse date with Pepper & co", location: "the meadow, by the gate", description: "Bring carrots.\nAnd apples?", start, end: start + 3600000,
});
const g = new URL(links.google), o = new URL(links.outlook);
assert.strictEqual(g.searchParams.get("dates"), "20261114T173000Z/20261114T183000Z");
assert.strictEqual(g.searchParams.get("text"), "Horse date with Pepper & co");
assert.strictEqual(g.searchParams.get("details"), "Bring carrots.\nAnd apples?");
assert.strictEqual(o.searchParams.get("startdt"), "2026-11-14T17:30:00.000Z");
assert.strictEqual(o.searchParams.get("location"), "the meadow, by the gate");
checks += 5;

console.log(`art: ${checks} checks passed`);
