/* Secret preferences. Every horse gets a randomly generated set when the deck is built.
   The app never shows them; the player only finds out through rejections. */
(function () {
  "use strict";

  const SEX_KEYS = ["mare", "stallion", "gelding"];

  function generate(h, rand) {
    const D = window.HorseData;
    const A = window.HorseArt;
    const coatKeys = Object.keys(A.COATS);
    const notMine = D.INTERESTS.filter(i => h.likes.indexOf(i) < 0);

    const p = {
      // Who they're into. Most horses are open to everyone.
      sexes: rand() < 0.85 ? SEX_KEYS.slice() : D.pickN(rand, SEX_KEYS, 2),
      ageMin: Math.max(1, h.age - 6 - Math.floor(rand() * 12)),
      ageMax: h.age + 6 + Math.floor(rand() * 16),
      height: A.weighted(rand, { any: 8, taller: 2, shorter: 1, similar: 2 }),
      hatesCoat: rand() < 0.25 ? A.pick(rand, coatKeys) : null,
      lovesCoat: rand() < 0.3 ? A.pick(rand, coatKeys) : null,
      hatesInterest: rand() < 0.4 ? A.pick(rand, notMine) : null,
      lovesInterests: D.pickN(rand, notMine, 2),
      lovesAccessory: rand() < 0.25 ? A.pick(rand, Object.keys(A.ACCESSORIES).slice(1)) : null,
      strictGoal: rand() < 0.1,
      needsBio: rand() < 0.25,
      minPhotos: rand() < 0.1 ? 3 : rand() < 0.4 ? 2 : 1,
      pickiness: 35 + Math.floor(rand() * 40), // score needed to say yay
      ghostAfter: rand() < 0.15 ? 3 + Math.floor(rand() * 5) : 0, // stops replying after N messages
    };
    // Don't love and hate the same coat
    if (p.lovesCoat === p.hatesCoat) p.lovesCoat = null;
    return p;
  }

  /* Would horse h swipe right on this player profile?
     Returns { match, reason } where reason is internal only and never shown. */
  function evaluate(h, me, kind) {
    const p = h.prefs;
    const main = me.photos[0] || {};
    const no = reason => ({ match: false, reason });

    if (p.sexes.indexOf(me.sex) < 0) return no("sex");
    if (me.age < p.ageMin || me.age > p.ageMax) return no("age");
    if (p.hatesCoat && main.coat === p.hatesCoat) return no("coat");
    if (p.hatesInterest && me.interests.indexOf(p.hatesInterest) >= 0) return no("interest");
    if (p.strictGoal && me.lookingFor !== h.lookingFor && me.lookingFor !== "unsure") return no("goal");
    if (p.needsBio && (me.bio || "").trim().length < 20) return no("bio");
    if (me.photos.length < p.minPhotos) return no("photos");
    if (p.height === "taller" && me.inches < h.inches - 2) return no("height");
    if (p.height === "shorter" && me.inches > h.inches + 2) return no("height");
    if (p.height === "similar" && Math.abs(me.inches - h.inches) > 8) return no("height");

    let score = 42;
    me.interests.forEach(i => {
      if (h.likes.indexOf(i) >= 0) score += 12;
      if (p.lovesInterests.indexOf(i) >= 0) score += 10;
    });
    if (p.lovesCoat && main.coat === p.lovesCoat) score += 15;
    if (p.lovesAccessory && me.photos.some(ph => ph.accessory === p.lovesAccessory)) score += 10;
    if (me.discipline === h.discipline) score += 8;
    if (me.lookingFor === h.lookingFor) score += 6;
    score += Math.min(me.photos.length, 6) * 2;
    score += Math.floor(Math.random() * 30); // mood on the day
    if (kind === "super") score += 20;

    return score >= p.pickiness ? { match: true, reason: "score" } : no("score");
  }

  /* Does a chat message bring up the thing this horse can't stand? */
  function offends(h, text) {
    const hate = h.prefs && h.prefs.hatesInterest;
    return !!hate && window.HorseData.interestRegex(hate).test(text);
  }

  window.HorsePrefs = { generate, evaluate, offends };
})();
