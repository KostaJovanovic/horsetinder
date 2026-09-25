/* The horses: handmade profiles, a generator for random ones, and chat personalities. */
(function () {
  "use strict";
  const A = window.HorseArt;
  const pick = A.pick;

  // [label, words that count as mentioning it in chat]
  const INTERESTS = [
    ["Apples", "apples?"], ["Carrots", "carrots?"], ["Peppermints", "mints?"], ["Sugar cubes", "sugar"],
    ["Rolling in mud", "mud|muddy"], ["Long gallops", "gallop(s|ing)?"], ["Trail rides", "trails?"], ["Jumping", "jump(s|ing)?"],
    ["Dressage", "dressage"], ["Napping standing up", "naps?|napping"], ["Swimming", "swim(s|ming)?"], ["Being groomed", "groom(ed|ing)?|brush(ed|ing)?"],
    ["Hay nets", "hay"], ["Beach rides", "beach"], ["Snow days", "snow"], ["Parades", "parade"],
    ["Pony Club kids", "kids?|pony club"], ["Country music", "country"], ["Classical music", "classical|mozart|bach"],
    ["Spooking at bags", "spook|bags?"], ["Sunbathing", "sunbath|sunshine"], ["Goats", "goats?"], ["Barn cats", "cats?"],
    ["Racing", "rac(e|es|ing)"], ["Stargazing", "stars?|stargaz"], ["Mutual grooming", "scratch"],
    ["Horse shows", "shows?|ribbons?|rosettes?"], ["Rain rugs", "rugs?|blankets?"],
  ];
  const INTEREST_NAMES = INTERESTS.map(i => i[0]);
  const FOODS = ["Apples", "Carrots", "Peppermints", "Sugar cubes", "Hay nets"];

  function interestRegex(name) {
    const row = INTERESTS.filter(i => i[0] === name)[0];
    // The full name anywhere ("peppermints"), or a keyword at the start of a word ("mints")
    const full = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(" + full + ")|\\b(" + (row ? row[1] : full) + ")\\b", "i");
  }

  const SEXES = { mare: "Mare", stallion: "Stallion", gelding: "Gelding" };
  const LOOKING = {
    longterm: "Long-term paddock mate",
    trail: "A trail buddy",
    casual: "Something casual",
    graze: "Just here to graze",
    unsure: "Still figuring it out",
  };

  const DISCIPLINES = [
    "Dressage", "Show jumping", "Eventing", "Trail riding", "Endurance", "Barrel racing", "Reining",
    "Polo", "Carriage driving", "Hunting", "Pony Club", "Therapy work", "Retired", "Vaulting",
    "Western pleasure", "Trick riding", "Professional grazing",
  ];

  /* Heights in inches (1 hand = 4 in). Coats and patterns match the breed. */
  const BREEDS = [
    { name: "Arabian", min: 57, max: 61, coats: ["grey", "bay", "chestnut", "black"], build: "light" },
    { name: "Thoroughbred", min: 62, max: 68, coats: ["bay", "chestnut", "seal", "black", "grey"], build: "light", disc: ["Racing", "Retired", "Eventing", "Show jumping"] },
    { name: "Quarter Horse", min: 57, max: 64, coats: ["chestnut", "bay", "buckskin", "palomino", "dun"], disc: ["Barrel racing", "Reining", "Western pleasure", "Trail riding"] },
    { name: "Dutch Warmblood", min: 63, max: 69, coats: ["bay", "chestnut", "black", "seal"], build: "light", disc: ["Dressage", "Show jumping"] },
    { name: "Irish Draught", min: 62, max: 67, coats: ["grey", "bay", "chestnut"], build: "draft", disc: ["Hunting", "Eventing"] },
    { name: "Percheron", min: 64, max: 72, coats: ["grey", "black"], build: "draft", disc: ["Carriage driving", "Professional grazing"] },
    { name: "Haflinger", min: 54, max: 60, coats: ["palomino", "flaxen"], build: "pony", disc: ["Trail riding", "Carriage driving", "Therapy work"] },
    { name: "Fjord", min: 52, max: 58, coats: ["dun"], build: "pony", mane: "roached", disc: ["Trail riding", "Carriage driving"] },
    { name: "Icelandic", min: 52, max: 56, coats: ["dun", "chestnut", "bay", "grey", "black", "flaxen"], build: "pony", mane: "wild", disc: ["Trail riding", "Endurance"] },
    { name: "Welsh Pony", min: 48, max: 56, coats: ["grey", "chestnut", "bay", "palomino"], build: "pony", disc: ["Pony Club", "Show jumping"] },
    { name: "Appaloosa", min: 57, max: 63, coats: ["white", "cremello", "bay", "black"], patterns: ["spots"], disc: ["Western pleasure", "Trail riding"] },
    { name: "Paint Horse", min: 57, max: 64, coats: ["bay", "chestnut", "black", "palomino"], patterns: ["pinto"], disc: ["Reining", "Trail riding"] },
    { name: "Tennessee Walker", min: 59, max: 66, coats: ["black", "chestnut", "bay", "palomino"], disc: ["Trail riding"] },
    { name: "Morgan", min: 57, max: 62, coats: ["bay", "chestnut", "black"], disc: ["Carriage driving", "Trail riding", "Dressage"] },
    { name: "Mustang", min: 54, max: 60, coats: ["dun", "buckskin", "bay", "grey"], mane: "wild", disc: ["Trail riding", "Endurance", "Professional grazing"] },
    { name: "Shetland pony", min: 28, max: 42, coats: ["black", "bay", "chestnut", "grey"], build: "pony", mane: "wild", disc: ["Pony Club", "Therapy work", "Professional grazing"] },
    { name: "Miniature horse", min: 26, max: 38, coats: ["bay", "palomino", "dun", "silver", "chestnut"], build: "pony", disc: ["Therapy work", "Professional grazing"] },
    { name: "Friesian", min: 60, max: 68, coats: ["black"], mane: "long", disc: ["Dressage", "Carriage driving"] },
    { name: "Lusitano", min: 60, max: 64, coats: ["grey", "bay", "buckskin"], mane: "long", disc: ["Dressage"] },
    { name: "Gypsy Cob", min: 54, max: 62, coats: ["black", "bay", "chestnut"], patterns: ["pinto"], build: "draft", mane: "long", disc: ["Carriage driving", "Trail riding"] },
    { name: "Standardbred", min: 60, max: 64, coats: ["bay", "seal", "black"], disc: ["Racing", "Retired", "Carriage driving"] },
    { name: "Akhal-Teke", min: 58, max: 64, coats: ["buckskin", "palomino", "bay", "cremello"], disc: ["Endurance", "Show jumping"] },
    { name: "Clydesdale", min: 64, max: 72, coats: ["bay", "black"], build: "draft", disc: ["Parades", "Carriage driving"] },
  ];

  const NAMES = [
    "Apollo", "Bramble", "Buttercup", "Cinnamon", "Comet", "Daisy", "Dakota", "Domino", "Echo", "Fable",
    "Fergus", "Fig", "Hazel", "Indigo", "Jasper", "Juniper", "Kestrel", "Lady Grey", "Maple", "Marshmallow",
    "Mercury", "Misty", "Monty", "Nutmeg", "Oakley", "Obsidian", "Olive", "Paprika", "Pebble", "Penny",
    "Poppy", "Pumpkin", "Quincy", "Rascal", "Rocket", "Rusty", "Saffron", "Sage", "Scout", "Shadow",
    "Sherbet", "Skye", "Smokey", "Snickers", "Sonny", "Sorrel", "Sparrow", "Sprout", "Storm", "Sundance",
    "Tango", "Teddy", "Thistle", "Toffee", "Truffle", "Tumbleweed", "Velvet", "Waffles", "Whisper", "Willow",
    "Winston", "Zephyr", "Ziggy", "Barnaby", "Bolt", "Cocoa", "Dolly", "Frankie", "Gatsby", "Hamish",
    "Ivy", "Jellybean", "Kahlua", "Lord Neigh", "Moose", "Noodle", "Oreo", "Pistachio", "Rumble", "Mabel",
  ];

  const BIO_BITS = [
    h => `${h.discipline} by day, ${h.likes[0].toLowerCase()} by night.`,
    () => "Looking for a paddock mate who respects my hay.",
    h => `${h.age} years old and still spooking at the same bucket.`,
    h => `Swipe right if you're into ${h.likes[1].toLowerCase()}.`,
    h => `${fmtHeight(h.inches)} of pure ${h.breed} charm.`,
    () => "My human says I'm a lot. My human is correct.",
    () => "Recently single after my field buddy moved yards. Ready to graze again.",
    () => "Will share my salt lick with the right horse.",
    () => "Not here for a trot-and-run. Looking for something stable.",
    () => "Two truths and a lie: I've won a ribbon, I love baths, I've never bitten anyone.",
    () => "Fluent in neigh, nicker and aggressive snorting.",
    () => "Ask me about the time I jumped out of the arena.",
    () => "I'll be the one standing dramatically in the rain.",
    () => "Farrier says I have lovely feet. Just saying.",
    () => "Allergic to fly spray and small talk.",
    h => `Once ate an entire ${pick(Math.random, ["hat", "rosette", "lead rope", "picnic"])}. No regrets.`,
  ];

  // ---------- Chat personalities ----------
  const VOICES = {
    posh: {
      greet: ["Good evening. Your whinny had excellent cadence.", "Hello. I don't usually reply this quickly."],
      snack: ["Only the finest {food}, hand-fed. Never from a bucket."],
      ride: ["{disc} is really just dancing where someone else takes the credit."],
      lines: ["My groom says I'm high-maintenance. I say I have standards.", "Tell me, how's your extended trot?", "I've been braided for a show all day and I'm exhausted.", "Do you summer in the north paddock or the south paddock?"],
    },
    foodie: {
      greet: ["heyyy", "oh hi!! sorry I was eating. I'm still eating actually"],
      snack: ["{food}. Also carrots. Also apples. Also other horses' hay. I'm not picky."],
      ride: ["{disc} is great because there are snacks along the way."],
      lines: ["do you have food", "sorry I got distracted by a dandelion", "you seem nice. do you seem nice AND have carrots?", "what's your stance on sharing hay nets"],
    },
    chill: {
      greet: ["Hey.", "Oh, hi. I was just standing in the field thinking about nothing."],
      snack: ["{food}, eaten slowly."],
      ride: ["I do a bit of {disc}. Mostly I do standing still."],
      lines: ["Want to walk somewhere nice? Really slowly?", "Sun's out. Good day for a nap.", "I don't really stress about stuff. Except gates.", "Cool cool cool."],
    },
    sassy: {
      greet: ["Well well well.", "Took you long enough."],
      snack: ["{food}, and I don't share."],
      ride: ["{disc}. I look calm. That's the whole trick."],
      lines: ["If you're going to be boring, I'm going back to the mud.", "Don't mention my mane. I know about my mane.", "You're lucky I'm in a good mood. I bit the farrier today.", "Impress me."],
    },
    gentle: {
      greet: ["Good day to you, friend.", "Ah, a visitor. How lovely."],
      snack: ["{food}, served warm if possible. I'm a horse of simple tastes."],
      ride: ["{disc} keeps me busy. I like being useful."],
      lines: ["Would you mind brushing my mane sometime?", "I once stood still for three hours during a parade. It was lovely.", "Be kind to the little ones in the field. That's my one rule.", "How was your day, really?"],
    },
    hyper: {
      greet: ["HI!!! Hi. Hello. Hi!", "omg hi, I just jumped a fence I wasn't supposed to"],
      snack: ["{food}!!! and whatever gets me to the next jump fastest"],
      ride: ["{disc} is my entire personality!!"],
      lines: ["Race you to the far hedge?", "I spooked at a plastic bag today but it was a VERY suspicious bag.", "do you like going fast. you should like going fast", "WAIT did you hear that"],
    },
    guarded: {
      greet: ["Hey there.", "Hi. Let's see if you're worth it."],
      snack: ["{food}. No, you can't have any."],
      ride: ["{disc}. I'm good at it. Don't get in my way."],
      lines: ["I don't open up to just anyone.", "Why are you really on here?", "Keep up.", "Fences make me nervous. So do commitments."],
    },
    tiny: {
      greet: ["Hello. I am small.", "Hello. My goat said I should reply to you."],
      snack: ["I'm not allowed many treats. {food} is my favourite though."],
      ride: ["Nobody rides me. I do {disc} instead."],
      lines: ["I am small but I have lived a long time.", "Please do not try to pick me up.", "Everyone calls me cute. I would like to be called fierce.", "I can walk under that fence. Can you?"],
    },
  };
  const VOICE_KEYS = Object.keys(VOICES);

  // ---------- Handmade horses ----------
  const HANDMADE = [
    { id: "duchess", name: "Duchess", age: 7, sex: "mare", breed: "Hanoverian", inches: 66, discipline: "Dressage", distance: 3, voice: "posh", lookingFor: "longterm",
      art: { coat: "bay", marking: "blaze", mane: "braided", scene: "arena", accessory: "rosette" },
      bio: "Looking for someone who can hold a collected canter and a conversation. Mints are the way to my heart.",
      likes: ["Peppermints", "Dressage", "Classical music"] },
    { id: "biscuit", name: "Biscuit", age: 12, sex: "gelding", breed: "Haflinger", inches: 57, discipline: "Trail riding", distance: 5, voice: "foodie", lookingFor: "casual",
      art: { coat: "palomino", build: "pony", mane: "long", scene: "sunset", accessory: "flowers" },
      bio: "Professional snacker. I'll share my hay net if you're cute.",
      likes: ["Hay nets", "Trail rides", "Carrots"] },
    { id: "midnight", name: "Midnight Express", age: 5, sex: "gelding", breed: "Thoroughbred", inches: 64, discipline: "Retired", distance: 11, voice: "chill", lookingFor: "graze",
      art: { coat: "black", marking: "star", scene: "night" },
      bio: "Ran 14 races and won 2. These days I just want to walk slowly somewhere nice.",
      likes: ["Napping standing up", "Stargazing", "Racing"],
      talk: { lines: ["Starting gates still give me the jitters.", "Want to walk somewhere nice? Really slowly?", "I lost 12 races and I'm at peace with it."] } },
    { id: "pepper", name: "Pepper", age: 9, sex: "mare", breed: "Appaloosa", inches: 60, discipline: "Western pleasure", distance: 7, voice: "sassy", lookingFor: "unsure",
      art: { coat: "white", pattern: "spots", marking: "snip", scene: "sunset", accessory: "cowboy" },
      bio: "The spots are natural. So is the attitude.",
      likes: ["Rolling in mud", "Apples", "Country music"],
      talk: { lines: ["I just rolled in the deepest mud puddle in the county. You're welcome.", "Don't mention the spots. I know about the spots.", "If you're going to be boring, I'm going back to the mud."] } },
    { id: "reginald", name: "Sir Reginald", age: 19, sex: "gelding", breed: "Shire", inches: 71, discipline: "Carriage driving", distance: 14, voice: "gentle", lookingFor: "longterm",
      art: { coat: "seal", marking: "bald", build: "draft", mane: "long", scene: "barn", accessory: "halter" },
      bio: "Gentle giant. My feathers need daily brushing, and so do I.",
      likes: ["Parades", "Being groomed", "Sugar cubes"] },
    { id: "clover", name: "Clover", age: 4, sex: "mare", breed: "Connemara", inches: 58, discipline: "Eventing", distance: 2, voice: "hyper", lookingFor: "trail",
      art: { coat: "grey", pattern: "dapples", marking: "star", build: "pony", scene: "meadow" },
      bio: "I jump first and think later. Swipe right if you like cross-country.",
      likes: ["Jumping", "Long gallops", "Spooking at bags"] },
    { id: "rosie", name: "Rosie", age: 14, sex: "mare", breed: "Quarter Horse", inches: 61, discipline: "Barrel racing", distance: 9, voice: "guarded", lookingFor: "longterm",
      art: { coat: "chestnut", marking: "stripe", scene: "arena", accessory: "cowboy" },
      bio: "Fast on the turns, slow to trust.",
      likes: ["Racing", "Horse shows", "Country music"] },
    { id: "gus", name: "Gus", age: 22, sex: "gelding", breed: "Miniature horse", inches: 34, discipline: "Therapy work", distance: 1, voice: "tiny", lookingFor: "graze",
      art: { coat: "dun", build: "pony", mane: "wild", scene: "meadow", accessory: "bow" },
      bio: "Small horse, big opinions. I live with a goat named Kevin.",
      likes: ["Goats", "Being groomed", "Napping standing up"],
      talk: { greet: ["Hello. I am Gus.", "Kevin said I should reply to you."], lines: ["Kevin just ate part of a fence.", "I am small but I have lived a long time.", "Please do not try to pick me up."] } },
    { id: "bella", name: "Bella", age: 6, sex: "mare", breed: "Friesian", inches: 64, discipline: "Dressage", distance: 4, voice: "posh", lookingFor: "longterm",
      art: { coat: "black", mane: "wild", scene: "studio" },
      bio: "Yes, the hair is natural. It takes two hours to brush and I regret nothing.",
      likes: ["Being groomed", "Classical music", "Rain rugs"] },
    { id: "chester", name: "Chester", age: 8, sex: "stallion", breed: "Welsh Cob", inches: 58, discipline: "Pony Club", distance: 6, voice: "hyper", lookingFor: "casual",
      art: { coat: "flaxen", marking: "blaze", build: "pony", scene: "arena", accessory: "rosette" },
      bio: "Won 31 rosettes. Lost count of the Pony Club kids I've bucked off.",
      likes: ["Horse shows", "Jumping", "Pony Club kids"] },
    { id: "luna", name: "Luna", age: 10, sex: "mare", breed: "Andalusian", inches: 63, discipline: "Dressage", distance: 8, voice: "gentle", lookingFor: "longterm",
      art: { coat: "grey", mane: "long", scene: "beach", accessory: "flowers" },
      bio: "Spanish, romantic, and very good at slow-motion hair flips.",
      likes: ["Beach rides", "Stargazing", "Swimming"] },
    { id: "tank", name: "Tank", age: 15, sex: "gelding", breed: "Clydesdale", inches: 72, discipline: "Carriage driving", distance: 12, voice: "chill", lookingFor: "longterm",
      art: { coat: "bay", marking: "bald", build: "draft", scene: "snow", accessory: "halter" },
      bio: "Used to pull logs. Now I pull my weight emotionally.",
      likes: ["Snow days", "Hay nets", "Parades"] },
    { id: "honey", name: "Honey", age: 6, sex: "mare", breed: "Paso Fino", inches: 56, discipline: "Trail riding", distance: 3, voice: "sassy", lookingFor: "trail",
      art: { coat: "palomino", marking: "star", mane: "long", scene: "sunset", accessory: "shades" },
      bio: "Smoothest ride you'll ever have. Four beats, no spilled drinks.",
      likes: ["Trail rides", "Sunbathing", "Apples"] },
    { id: "dusty", name: "Dusty", age: 17, sex: "stallion", breed: "Mustang", inches: 58, discipline: "Professional grazing", distance: 19, voice: "guarded", lookingFor: "unsure",
      art: { coat: "dun", mane: "wild", scene: "sunset", accessory: "cowboy" },
      bio: "Grew up on open range in Nevada. Still not sure about fences.",
      likes: ["Long gallops", "Stargazing", "Rolling in mud"] },
    { id: "nimbus", name: "Nimbus", age: 11, sex: "gelding", breed: "Akhal-Teke", inches: 62, discipline: "Endurance", distance: 10, voice: "posh", lookingFor: "casual",
      art: { coat: "buckskin", marking: "snip", mane: "roached", scene: "studio", accessory: "shades" },
      bio: "My coat is metallic. Please stop asking if it's a filter.",
      likes: ["Long gallops", "Sunbathing", "Horse shows"] },
    { id: "pickles", name: "Pickles", age: 2, sex: "mare", breed: "Shetland pony", inches: 38, discipline: "Professional grazing", distance: 1, voice: "tiny", lookingFor: "casual",
      art: { coat: "chestnut", pattern: "pinto", build: "pony", mane: "wild", scene: "meadow", accessory: "bow" },
      bio: "I have escaped from 4 different paddocks. Catch me if you can.",
      likes: ["Sugar cubes", "Spooking at bags", "Barn cats"] },
    { id: "marigold", name: "Marigold", age: 25, sex: "mare", breed: "Morgan", inches: 60, discipline: "Pony Club", distance: 5, voice: "gentle", lookingFor: "graze",
      art: { coat: "chestnut", marking: "star", scene: "barn", accessory: "halter" },
      bio: "Taught 200 kids to ride. Patient, kind, will bite if you pull my mane.",
      likes: ["Pony Club kids", "Carrots", "Barn cats"] },
    { id: "ghost", name: "Ghost", age: 7, sex: "stallion", breed: "Lipizzaner", inches: 61, discipline: "Dressage", distance: 15, voice: "posh", lookingFor: "longterm",
      art: { coat: "white", mane: "braided", scene: "night", accessory: "rosette" },
      bio: "I was born black and turned white. Very dramatic, like me.",
      likes: ["Dressage", "Horse shows", "Classical music"] },
  ];

  // ---------- Helpers ----------
  function fmtHeight(inches) {
    return inches <= 42 ? `${inches} in` : `${Math.floor(inches / 4)}.${inches % 4} hh`;
  }
  function plural(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }

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
      likes: pickN(rand, INTEREST_NAMES, 3),
      art: A.randomSpec(rand, { coats: breed.coats, patterns: breed.patterns, build: breed.build, mane: breed.mane }),
    };
    const bits = pickN(rand, BIO_BITS, 2);
    h.bio = bits.map(b => b(h)).join(" ");
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
    });

    const deck = all.filter(h => !(skip && skip[h.id]));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  window.HorseData = {
    INTERESTS: INTEREST_NAMES, FOODS, SEXES, LOOKING, DISCIPLINES, BREEDS, VOICES,
    fmtHeight, plural, pickN, voiceFor, favouriteFood, interestRegex, buildDeck,
  };
})();
