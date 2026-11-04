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

  /* Would horse h swipe right on this player profile? `liked` is set when the player
     tapped the heart on one photo or prompt: { kind: "photo" | "prompt", comment }.
     Returns { match, reason } where reason is internal only and never shown. */
  function evaluate(h, me, kind, liked) {
    const p = h.prefs;
    const main = me.photos[0] || {};
    const no = reason => ({ match: false, reason });
    const answers = (me.prompts || []).map(x => x.a || "").filter(Boolean);
    const words = ((me.bio || "") + " " + answers.join(" ")).toLowerCase();

    if (p.sexes.indexOf(me.sex) < 0) return no("sex");
    if (me.age < p.ageMin || me.age > p.ageMax) return no("age");
    if (p.hatesCoat && main.coat === p.hatesCoat) return no("coat");
    if (p.hatesInterest && me.interests.indexOf(p.hatesInterest) >= 0) return no("interest");
    if (p.strictGoal && me.lookingFor !== h.lookingFor && me.lookingFor !== "unsure") return no("goal");
    // Prompt answers count as something to read, same as a bio
    if (p.needsBio && words.trim().length < 20) return no("bio");
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
    score += Math.min(answers.length, 3) * 3;
    if (h.likes.some(l => words.indexOf(l.toLowerCase()) >= 0)) score += 8; // you wrote about something they love
    if (liked && liked.kind === "prompt") score += 4; // you read what they wrote
    if (liked && liked.comment) score += 6;
    score += Math.floor(Math.random() * 30); // mood on the day
    if (kind === "super") score += 20;

    return score >= p.pickiness ? { match: true, reason: "score" } : no("score");
  }

  // ---------- Horses liking you first ----------
  const PHOTO_COMMENTS = {
    cowboy: ["Yeehaw. That hat works on you.", "Is the hat staying on for the date?"],
    shades: ["Cool shades. Can I borrow them?", "Too cool for this paddock."],
    flowers: ["Did you make that crown yourself?", "The flowers. Stop it."],
    bow: ["The bow is doing a lot of work and I'm here for it."],
    halter: ["Red really suits you."],
    flymask: ["Mysterious. I like it."],
    rosette: ["A winner, I see. Show me how."],
  };
  const POSE_COMMENTS = { graze: ["Save me some of that grass?"], back: ["Looking back at me?"] };
  const ANY_PHOTO = ["That mane, though.", "Great light in this one.", "Okay, hello.", "You look like trouble. Good trouble."];
  const PROMPT_COMMENTS = [
    a => `"${a.length > 40 ? a.slice(0, 38).trim() + "…" : a}" Same, honestly.`,
    () => "Okay, this made me snort.",
    () => "We need to talk about this answer.",
    () => "Finally, a horse with taste.",
    () => "Ha. You get it.",
  ];

  /* Would horse h like one of your photos or prompts before you've swiped on it?
     Only horses whose secret preferences you pass. Returns null, or what it liked:
     { kind: "photo" | "prompt", index, comment } (comment can be ""). */
  function likesYou(h, me, rand) {
    if (!evaluate(h, me, "like", null).match) return null;
    const A = window.HorseArt;
    const answered = (me.prompts || []).map((p, i) => p && p.a ? i : -1).filter(i => i >= 0);
    // Answered prompts get liked more often than photos, like on Hinge
    const kind = answered.length && rand() < 0.6 ? "prompt" : "photo";
    const index = kind === "prompt" ? A.pick(rand, answered) : Math.floor(rand() * me.photos.length);
    let comment = "";
    if (rand() < 0.5) {
      if (kind === "prompt") comment = A.pick(rand, PROMPT_COMMENTS)(me.prompts[index].a);
      else {
        const ph = me.photos[index] || {};
        comment = A.pick(rand, PHOTO_COMMENTS[ph.accessory] || POSE_COMMENTS[ph.pose] || ANY_PHOTO);
      }
    }
    return { kind, index, comment };
  }
  /* Chance per swipe that some horse likes you first: about 1 in 12, a little more
     with prompts answered and a few photos */
  function likeChance(me) {
    const answered = (me.prompts || []).filter(p => p && p.a).length;
    return 0.07 + 0.01 * Math.min(answered, 3) + (me.photos.length >= 3 ? 0.01 : 0);
  }

  window.HorsePrefs = { generate, evaluate, likesYou, likeChance };
})();
