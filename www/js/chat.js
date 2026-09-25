/* Chat brain. Reads what you type word by word (plurals and small typos included),
   works out what you mean, and answers from the horse's profile, personality,
   secret preferences and what's been said so far.
   Plain ES2017 for the Sunmi V2 (Chrome 62): no named groups, lookbehind or ?. */
(function () {
  "use strict";
  const D = window.HorseData;
  const A = window.HorseArt;

  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function chance(p) { return Math.random() < p; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ---------- Vocabulary ----------
  /* kind: food | bad (not horse food) | act (activity/interest) | word (intent signal) */
  const CONCEPTS = [
    { id: "carrot", kind: "food", interest: "Carrots", label: "carrots", words: ["carrot", "carrots"] },
    { id: "apple", kind: "food", interest: "Apples", label: "apples", words: ["apple", "apples"] },
    { id: "mint", kind: "food", interest: "Peppermints", label: "peppermints", words: ["mint", "mints", "peppermint", "peppermints", "polo", "polos"] },
    { id: "sugar", kind: "food", interest: "Sugar cubes", label: "sugar cubes", words: ["sugar", "sugarcube", "sugarcubes", "cube", "cubes"] },
    { id: "hay", kind: "food", interest: "Hay nets", label: "hay", words: ["hay", "haynet", "haynets", "haylage"] },
    { id: "oats", kind: "food", label: "oats", words: ["oat", "oats", "oatmeal", "grain", "muesli", "mash"] },
    { id: "grass", kind: "food", label: "grass", words: ["grass", "clover", "dandelion", "dandelions", "graze", "grazing"] },
    { id: "banana", kind: "food", label: "bananas", words: ["banana", "bananas"] },
    { id: "melon", kind: "food", label: "watermelon", words: ["watermelon", "melon", "melons"] },
    { id: "beet", kind: "food", label: "sugar beet", words: ["beet", "beets", "beetroot"] },
    { id: "treat", kind: "food", label: "treats", words: ["treat", "treats", "snack", "snacks", "cookie", "cookies", "biscuit", "biscuits", "food"] },
    { id: "junk", kind: "bad", label: "that", words: ["chocolate", "bread", "pizza", "meat", "candy", "cake", "onion", "onions", "avocado", "coffee", "fries", "chips", "donut", "donuts", "icecream", "burger"] },

    { id: "gallop", kind: "act", interest: "Long gallops", label: "galloping", words: ["gallop", "gallops", "galloping", "run", "running", "sprint", "zoomies", "fast"] },
    { id: "jump", kind: "act", interest: "Jumping", label: "jumping", words: ["jump", "jumps", "jumping", "fence", "fences", "showjumping", "xc", "crosscountry"] },
    { id: "trail", kind: "act", interest: "Trail rides", label: "trail rides", words: ["trail", "trails", "hack", "hacking", "hike", "walk", "walks", "woods", "forest"] },
    { id: "dressage", kind: "act", interest: "Dressage", label: "dressage", words: ["dressage", "piaffe", "passage", "collected", "halfpass"] },
    { id: "swim", kind: "act", interest: "Swimming", label: "swimming", words: ["swim", "swimming", "lake", "river", "pond"] },
    { id: "beach", kind: "act", interest: "Beach rides", label: "the beach", words: ["beach", "sea", "ocean", "sand", "waves", "seaside"] },
    { id: "snow", kind: "act", interest: "Snow days", label: "snow", words: ["snow", "snowy", "winter", "snowman"] },
    { id: "nap", kind: "act", interest: "Napping standing up", label: "napping", words: ["nap", "naps", "napping", "sleep", "sleeping", "snooze", "resting"] },
    { id: "mud", kind: "act", interest: "Rolling in mud", label: "mud", words: ["mud", "muddy", "roll", "rolling", "puddle", "puddles", "dirt"] },
    { id: "groom", kind: "act", interest: "Being groomed", label: "being brushed", words: ["groom", "grooming", "groomed", "brush", "brushing", "brushed", "scratch", "scratches", "itchy"] },
    { id: "race", kind: "act", interest: "Racing", label: "racing", words: ["race", "races", "racing", "racetrack", "derby"] },
    { id: "show", kind: "act", interest: "Horse shows", label: "horse shows", words: ["show", "shows", "ribbon", "ribbons", "rosette", "rosettes", "competition", "competitions", "compete"] },
    { id: "parade", kind: "act", interest: "Parades", label: "parades", words: ["parade", "parades"] },
    { id: "stars", kind: "act", interest: "Stargazing", label: "stargazing", words: ["stars", "stargazing", "moon", "moonlight"] },
    { id: "country", kind: "act", interest: "Country music", label: "country music", words: ["country", "banjo", "dolly"] },
    { id: "classical", kind: "act", interest: "Classical music", label: "classical music", words: ["classical", "mozart", "bach", "beethoven", "violin"] },
    { id: "goats", kind: "act", interest: "Goats", label: "goats", words: ["goat", "goats", "kevin"] },
    { id: "cats", kind: "act", interest: "Barn cats", label: "barn cats", words: ["cat", "cats", "kitten", "kittens"] },
    { id: "kids", kind: "act", interest: "Pony Club kids", label: "kids", words: ["kid", "kids", "children", "ponyclub"] },
    { id: "bags", kind: "act", interest: "Spooking at bags", label: "plastic bags", words: ["bag", "bags", "spook", "spooking", "spooky"] },
    { id: "sun", kind: "act", interest: "Sunbathing", label: "sunbathing", words: ["sunbathing", "sunbathe", "tan", "sunshine"] },
    { id: "rugs", kind: "act", interest: "Rain rugs", label: "rugs", words: ["rug", "rugs", "blanket", "blankets"] },
    { id: "music", kind: "act", label: "music", words: ["music", "song", "songs", "singing", "sing"] },
    { id: "ride", kind: "act", label: "riding", words: ["ride", "rides", "riding", "canter", "cantering", "trot", "trotting", "saddle"] },

    { id: "hello", kind: "word", words: ["hi", "hey", "hello", "hiya", "howdy", "yo", "heya", "hallo", "greetings", "neigh", "heyy", "heyyy"] },
    { id: "bye", kind: "word", words: ["bye", "goodbye", "goodnight", "gnight", "cya", "farewell", "byee", "gtg"] },
    { id: "thanks", kind: "word", words: ["thanks", "thank", "thx", "ty", "cheers"] },
    { id: "laugh", kind: "word", words: ["haha", "hahaha", "lol", "lmao", "hehe", "rofl", "funny", "hilarious", "xd"] },
    { id: "compliment", kind: "word", words: ["cute", "beautiful", "pretty", "handsome", "gorgeous", "lovely", "stunning", "majestic", "shiny", "sexy", "adorable", "perfect", "amazing", "elegant", "fluffy", "sweet"] },
    { id: "insult", kind: "word", words: ["ugly", "stupid", "dumb", "fat", "idiot", "boring", "smelly", "stinky", "gross", "lame", "donkey", "loser", "annoying", "useless", "mule"] },
    { id: "glue", kind: "word", words: ["glue", "lasagna", "lasagne", "salami", "sausage", "dogfood", "knacker", "slaughter"] },
    { id: "date", kind: "word", words: ["date", "meet", "meetup", "hangout", "visit", "trough", "together", "dinner"] },
    { id: "joke", kind: "word", words: ["joke", "jokes", "pun", "puns"] },
    { id: "sad", kind: "word", words: ["sad", "lonely", "tired", "upset", "depressed", "bored", "stressed", "sick", "hurt", "awful", "terrible", "bad", "exhausted", "lame"] },
    { id: "happy", kind: "word", words: ["happy", "great", "good", "awesome", "excited", "well", "fantastic", "wonderful", "brilliant", "okay", "ok", "alright"] },
    { id: "yes", kind: "word", words: ["yes", "yeah", "yep", "yup", "sure", "ofc", "definitely", "absolutely", "totally", "aye", "yea", "ya", "always", "course", "obviously", "sometimes"] },
    { id: "no", kind: "word", words: ["no", "nope", "nah", "never", "not", "nay"] },
    { id: "kiss", kind: "word", words: ["kiss", "kisses", "nuzzle", "nuzzles", "hug", "hugs", "cuddle", "cuddles", "boop", "smooch"] },
    { id: "weather", kind: "word", words: ["weather", "rain", "raining", "rainy", "sunny", "cold", "windy", "storm", "stormy", "hot", "warm"] },
    { id: "human", kind: "word", words: ["human", "owner", "rider", "person", "humans", "farrier", "vet", "mum", "mom", "dad"] },
    { id: "bot", kind: "word", words: ["bot", "robot", "ai", "fake", "catfish", "chatbot"] },
    { id: "morning", kind: "word", words: ["morning", "early", "sunrise", "dawn", "breakfast"] },
    { id: "night", kind: "word", words: ["night", "nighttime", "evening", "late", "owl", "nocturnal", "midnight"] },
    { id: "both", kind: "word", words: ["both", "either", "all"] },
    { id: "whinny", kind: "word", words: ["whinny", "whinnies", "nicker", "nickers", "neighs", "snort", "snorts"] },
  ];

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
      .replace(/\bfavo[a-z]*\b/g, "favourite").replace(/\bgonna\b/g, "going to");
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

  const BREED_FACTS = {
    "Arabian": "We have one fewer vertebra than other horses. Aerodynamic.",
    "Thoroughbred": "Every single one of us has a birthday on January 1st. Weird, right?",
    "Quarter Horse": "We're named after the quarter-mile races we used to win.",
    "Friesian": "The hair takes about two hours to brush. Every day.",
    "Shetland pony": "Pound for pound, we're the strongest horse breed there is.",
    "Miniature horse": "Some of us work as guide animals. We live longer than dogs.",
    "Clydesdale": "My hooves are about the size of a dinner plate.",
    "Shire": "Shires hold the record for the tallest horse ever.",
    "Haflinger": "Every Haflinger is chestnut with a flaxen mane. We're a matching set.",
    "Fjord": "My mane is cut short so the black stripe down the middle shows.",
    "Icelandic": "I have a fifth gait called the tölt. Very smooth.",
    "Akhal-Teke": "Our coats really are metallic. It's the hair structure.",
    "Appaloosa": "No two of us have the same spots.",
    "Lipizzaner": "We're born dark and go white as we get older.",
    "Mustang": "My ancestors ran wild in the American West.",
    "Paso Fino": "People ride us holding full glasses of water to show off how smooth we are.",
    "Percheron": "We came from France. Very chic, very large.",
  };
  function breedFact(h) {
    if (BREED_FACTS[h.breed]) return BREED_FACTS[h.breed];
    const build = (h.art && h.art.build) || "light";
    return build === "draft" ? "We're known for being strong and very calm."
      : build === "pony" ? "Small, clever and a little bit mischievous. That's us."
      : "Athletic, sensitive, occasionally dramatic.";
  }

  const JOKES = [
    ["Why did the horse cross the road?", "Someone shouted \"Hay!\""],
    ["What do you call a horse that lives next door?", "Your neigh-bour."],
    ["Why did the pony need a glass of water?", "Because it was a little horse."],
    ["What's a horse's favourite sport?", "Stable tennis."],
    ["What did the horse say when it fell over?", "\"I've fallen and I can't giddy-up.\""],
    ["Why are horses bad at dancing?", "Two left feet. And two right feet."],
    ["What do you call a horse with no legs?", "Doesn't matter, it won't come when you call it anyway."],
  ];

  // Questions a horse asks to keep things going. `about` ties the answer to a concept.
  const QUESTIONS = [
    { id: "fav_food", text: "What's your favourite snack?", type: "fav_food" },
    { id: "fun", text: "What do you like doing on weekends?", type: "fun" },
    { id: "gallop_nap", text: "Galloping or napping?", type: "choice", a: "gallop", b: "nap" },
    { id: "beach_snow", text: "Beach rides or snow days?", type: "choice", a: "beach", b: "snow" },
    { id: "mud", text: "Have you ever rolled in a really good mud puddle?", type: "yesno", about: "mud" },
    { id: "jump", text: "Do you jump?", type: "yesno", about: "jump" },
    { id: "swim", text: "Can you swim?", type: "yesno", about: "swim" },
    { id: "groom", text: "Do you like being brushed?", type: "yesno", about: "groom" },
    { id: "morning", text: "Are you a morning horse or a night horse?", type: "morning_night" },
    { id: "human", text: "What's your human like?", type: "human" },
    { id: "mood", text: "How's your day going?", type: "mood" },
  ];

  // ---------- Personality ----------
  const OPENERS = {
    posh: ["Well, ", "Darling, ", "Indeed. "], sassy: ["Ugh, ", "Okay, ", "Listen. "], chill: ["Eh, ", "Hmm, ", "Yeah, "],
    hyper: ["OMG ", "Oh oh oh ", "WAIT "], gentle: ["Oh, ", "Aw, ", "Well now, "], foodie: ["mmm ", "ooh ", "ok so "],
    guarded: [], tiny: [],
  };
  /* Text emoticons (kaomoji and classic ASCII), never emoji. Picked by the mood of the
     reply first, then by personality. Characters stick to scripts Android 7 has fonts for. */
  const FACES = {
    love: ["<3", "(´∀`)<3", "(*˘︶˘*)", "(✿◠‿◠)", "(*^‿^*)"],
    laugh: ["XD", ":D", "(≧▽≦)", "ヽ(´▽`)ノ", "^_^"],
    angry: [">:(", "(ಠ_ಠ)", "(╬ Ò﹏Ó)", "-_-", "(¬_¬)"],
    shock: ["O_O", "(⊙_⊙)", "o.O", "(°ロ°)"],
    sad: [":(", "(´；ω；`)", "(._.)", "(╥﹏╥)"],
    shy: ["(〃▽〃)", ">///<", "(*/ω＼*)", "(⁄ ⁄•⁄ω⁄•⁄ ⁄)"],
    food: ["(っ˘ڡ˘ς)", ":9", "nom nom", "(*￣▽￣)b"],
    shrug: ["¯\\_(ツ)_/¯", "(・_・;)", "(-_-)zzz"],
  };
  const VOICE_FACES = {
    posh: [":)", "(ˆ⌣ˆ)", ";)"],
    sassy: ["(¬‿¬)", ":P", "-_-", "(￢_￢)"],
    chill: ["¯\\_(ツ)_/¯", ":)", "(ᵔᴥᵔ)"],
    hyper: ["XD", "\\(^o^)/", "(ﾉ◕ヮ◕)ﾉ", ":D"],
    gentle: ["(◕‿◕)", "<3", "(´• ω •`)"],
    foodie: ["(っ˘ڡ˘ς)", ":9", "nom"],
    guarded: ["-_-", "(•_•)"],
    tiny: ["(・ω・)", "(｡•‿•｡)", "(ᵔᴥᵔ)"],
  };
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
    if (OPENERS[voice] && OPENERS[voice].length && chance(0.18) && !/^(?:[A-Z]{2}|I\b|I')/.test(out)) {
      const o = rnd(OPENERS[voice]);
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
    upcoming(m.mem);
  }

  const DATE_MINS = 60, DATE_LEAD = 30 * 60000;
  const DATE_TIMES = { "at feeding time": [17, 0], "at sunset": [19, 30], "tomorrow morning": [9, 0], "after training": [16, 0] };

  function dateOver(mem) { return !!(mem.date && mem.dateAt && mem.dateAt + DATE_MINS * 60000 < Date.now()); }

  /* A date that isn't in the calendar yet always points at the future: if its day
     came and went (the chat sat unopened, or it's from an older version), it moves
     to the next day at the same time. */
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

  function nextQuestion(m) {
    const left = QUESTIONS.filter(q => m.mem.asked.indexOf(q.id) < 0);
    if (!left.length) return null;
    // Prefer questions about things this horse cares about
    const h = m.horse;
    const keen = left.filter(q => q.about && ["love", "secret"].indexOf(opinion(h, BY_ID[q.about])) >= 0);
    const q = rnd(keen.length && chance(0.6) ? keen : left);
    m.mem.asked.push(q.id);
    m.mem.pending = { type: q.type, id: q.id, about: q.about, a: q.a, b: q.b };
    return q.text;
  }

  // ---------- Reactions to things you like / dislike ----------
  function aboutStatement(h, ent, likesIt, out, mem) {
    const c = ent.c, X = cap(c.label), x = c.label;
    const op = opinion(h, c);
    if (c.kind === "bad") {
      out.say(rnd([`${cap(ent.word)}? Isn't that bad for horses?`, `You eat ${ent.word}? My vet would faint.`]), -2);
      return;
    }
    if (likesIt) {
      if (op === "hate") {
        out.unmatch = true;
        out.say(rnd([`${X}? You like ${x}? We're done here.`, `Sorry. I can't be with a horse who's into ${x}.`, `*turns around and walks off* ${X}. Unbelievable.`]), -40, "!?");
      } else if (op === "love") {
        mem.told[c.id] = "love";
        learn(mem, "loves", x);
        out.say(rnd([`Same!! I love ${x}.`, `Wait, me too! ${X} is the best.`, `${X}? Okay, you just got a lot more interesting.`]), 10, "♥");
      } else if (op === "secret") {
        mem.told[c.id] = "love";
        learn(mem, "loves", x);
        out.say(rnd([`Hold on. You like ${x}? I've always wanted someone who likes ${x}.`, `${X}?! Nobody ever says ${x}. I love that.`]), 15, "♥");
      } else if (op === "food") {
        out.say(rnd([`Ooh, ${x}. Good taste.`, `${X}. A horse of culture.`]), 4);
      } else if (op === "meh") {
        out.say(rnd([`${X}? Hm. Not really my thing, but okay.`, `Each to their own. ${X} isn't for me.`]), -2);
      } else {
        out.say(rnd([`${X} is fun. I could get into that.`, `Nice. I've done a bit of ${x} myself.`]), 3);
      }
    } else {
      if (op === "hate") learn(mem, "hates", x);
      if (op === "hate") out.say(rnd([`FINALLY someone gets it. ${X} is the worst.`, `Thank you. ${X} should be illegal.`]), 15, "♥");
      else if (op === "love" || op === "secret") out.say(rnd([`What? ${X} is one of my favourite things!`, `Oh. I actually really like ${x}.`]), -6, "!?");
      else out.say(rnd(["Fair enough.", `Yeah, ${x} isn't for everyone.`]), 0);
    }
  }

  function doYouLike(h, ent, out, mem) {
    const c = ent.c, X = cap(c.label), x = c.label;
    const op = opinion(h, c);
    if (op === "bad") { out.say(rnd([`${cap(ent.word)}? No, that's bad for horses. My vet would faint.`, `I'm not allowed ${ent.word}. Colic, apparently.`])); return; }
    if (op === "hate") {
      mem.revealedHate = true;
      learn(mem, "hates", x);
      out.say(rnd([`No. I can't stand ${x}. Please never bring it up again.`, `${X}? Absolutely not.`, `Ugh. ${X}. Next question.`]), -4);
    } else if (op === "love") {
      learn(mem, "loves", x);
      out.say(rnd([`Yes!! I love ${x}.`, `I love ${x}. It's literally on my profile.`]), 3);
      out.say("Do you?");
      mem.pending = { type: "likeback", about: c.id };
    } else if (op === "secret") {
      learn(mem, "loves", x);
      out.say(rnd([`Honestly? I love ${x}. Don't tell anyone.`, `Between us, ${x} is my secret favourite thing.`]), 2);
      out.say("Do you?");
      mem.pending = { type: "likeback", about: c.id };
    } else if (op === "food") out.say(rnd(["It's food, so yes.", `${X}? I'd never say no.`]));
    else if (op === "meh") out.say(rnd(["Not really, if I'm honest.", `${X}? Meh.`]));
    else out.say(rnd(["Sometimes. Depends on the day.", `${X} is alright.`]));
  }

  // ---------- Answers to the horse's own questions ----------
  function answerPending(m, me, a, out) {
    const p = m.mem.pending, h = m.horse, mem = m.mem;
    const ent = a.ents[0];
    const yes = a.words.yes && !a.words.no, no = a.words.no && !a.words.yes;
    mem.pending = null;
    switch (p.type) {
      case "fav_food": {
        const food = a.ents.filter(e => e.c.kind === "food" || e.c.kind === "bad")[0];
        if (!food) { out.say(rnd(["Never heard of it. Is it crunchy?", "Is that a snack? I'll take your word for it."])); return true; }
        mem.told.food = food.c.id;
        if (food.c.kind === "bad") { out.say(`${cap(food.word)}?! You can't eat that, you're a horse.`, -2, "!?"); return true; }
        const mine = D.favouriteFood(h);
        if (opinion(h, food.c) === "love" || food.c.label === mine) out.say(rnd([`Same!! ${cap(food.c.label)} are elite.`, `Okay we have the same favourite snack. This is fate.`]), 10, "♥");
        else if (opinion(h, food.c) === "hate") out.say(`${cap(food.c.label)}? Hm. I can't stand ${food.c.label}.`, -6);
        else out.say(rnd([`${cap(food.c.label)}, nice. I'm more of a ${mine} horse.`, `Good choice. Mine's ${mine}.`]), 3);
        return true;
      }
      case "fun": {
        const act = a.ents.filter(e => e.c.kind === "act")[0];
        if (!act) { out.say(rnd(["Sounds fun. I'd mostly just watch though.", "Ha. Sounds like you."]), 1); return true; }
        aboutStatement(h, act, true, out, mem);
        return true;
      }
      case "likeback":
        if (yes) out.say(rnd(["We're going to get along.", "I knew it. *happy snort*"]), 8, "♥");
        else if (no) out.say(rnd(["Oh. Well, more for me.", "That's okay. Nobody's perfect."]), -3);
        else { mem.pending = p; return false; }
        return true;
      case "yesno": {
        const op = opinion(h, BY_ID[p.about]);
        const x = BY_ID[p.about].label;
        if (!yes && !no) { mem.pending = p; return false; }
        if (yes) {
          if (op === "love" || op === "secret") out.say(rnd([`Yes! Knew I liked you.`, `Okay, we have to do ${x} together.`]), 8, "♥");
          else if (op === "hate") out.say(rnd([`Oh no. I was hoping you'd say no.`, `Ew. ${cap(x)}. Okay.`]), -8);
          else out.say(rnd(["Ha, respect.", "Nice."]), 2);
        } else {
          if (op === "love" || op === "secret") out.say(rnd(["You're missing out!", `No ${x}? I'll have to change that.`]), -1);
          else if (op === "hate") out.say(rnd([`Good. ${cap(x)} is overrated.`, "Correct answer."]), 8, "♥");
          else out.say(rnd(["Fair.", "Smart."]));
        }
        return true;
      }
      case "choice": {
        const picked = a.ents.filter(e => e.c.id === p.a || e.c.id === p.b)[0];
        if (a.words.both) { out.say(rnd(["Greedy. I respect it.", "Both is a valid answer."]), 3); return true; }
        if (!picked) { mem.pending = p; return false; }
        const op = opinion(h, picked.c);
        if (op === "love" || op === "secret") out.say(rnd([`Correct answer.`, `${cap(picked.c.label)}! Good. We can still be friends.`]), 8, "♥");
        else if (op === "hate") out.say(`${cap(picked.c.label)}? Wrong answer. But I'll allow it.`, -5);
        else out.say(rnd(["Interesting choice.", "Noted."]), 1);
        return true;
      }
      case "morning_night": {
        const early = a.words.morning, late = a.words.night;
        if (!early && !late) { mem.pending = p; return false; }
        const mine = A.hashString(h.id) % 2 ? "morning" : "night";
        mem.told.clock = early ? "morning" : "night";
        if ((early && mine === "morning") || (late && mine === "night")) out.say(rnd(["Same! We'd be awake at the same time.", "Me too. We'd get along."]), 6);
        else out.say(early ? "Morning? I'm barely awake before breakfast hay." : "Night? I'm asleep standing up by then.", -1);
        return true;
      }
      case "human":
        out.say(rnd(["They sound nice. Mine keeps trying to put a rug on me.", "Ha. Mine talks to me in a baby voice.", "Good humans are hard to find. Keep them."]), 2);
        return true;
      case "mood":
        if (a.words.sad) out.say(rnd(["*rests head on your shoulder* Want to talk about it?", "Oh no. Do you need a carrot?"]), 4);
        else if (a.words.happy || yes) out.say(rnd(["Love that for you.", "Good! Mine's better now too."]), 2);
        else { out.say(rnd(["Fair enough.", "Days are like that."])); }
        return true;
      default:
        return false;
    }
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
      say(text, dv, react) { this.replies.push(text); this.vibe += dv || 0; if (react) this.react = react; },
    };
    mem.turns++;

    // Ghosting (secret preference). A horse that's really into you keeps replying.
    if (h.prefs && h.prefs.ghostAfter && m.sent > h.prefs.ghostAfter && m.vibe < 80) { out.ignore = true; return out; }

    // Saying the same thing twice
    if (mem.last === t && t.length > 3) {
      out.say(rnd(["You said that already.", "Yes, I heard you the first time.", "*stares* ...again?"]), -2);
      out.ask = false;
      return finish(m, out, voice);
    }
    mem.last = t;

    const ent = a.ents[0];
    const iLike = /\bi(?: really| totally| kinda| also| just| do)? (?:like|love|adore|enjoy|am into|'m into|am a fan of|'m a fan of|'m obsessed with|am obsessed with)\b/.test(t) ||
      /\b(?:is|are) my fav(?:ou?rite)?\b|\bmy fav(?:ou?rite)?(?: \w+)? (?:is|are)\b/.test(t);
    const iHate = /\bi(?: really| totally| kinda| just)? (?:hate|dislike|can't stand|don't like|do not like|am not into|'m not into)\b/.test(t);
    const askLike = /\b(?:do|would|did) you (?:like|love|enjoy|want|fancy|eat|ever)\b|\bare you (?:into|a fan of)\b|\bwhat do you think (?:of|about)\b|\bhow do you feel about\b|\bany good at\b|\bdo you do\b|\bthoughts on\b/.test(t);
    const invite = /\b(?:want to|shall we|should we|let's|lets|wanna|come|join me|would you like to|up for)\b/.test(t);
    const gift = a.action && /^\*\s*(?:gives?|hands?|offers?|brings?|tosses?|throws?|shares?|feeds?)\b/.test(t);

    // 1. Horse-meat jokes land badly
    if (W.glue) { out.say(rnd(["That's not funny.", "Wow. Okay. *pins ears back*", "Do you know how many of my friends went to \"a farm upstate\"?"]), -40, "!?"); out.ask = false; return finish(m, out, voice); }

    // 2. Insults (but "you're not ugly" is fine)
    if (W.insult && !/\bnot\b|\bn't\b/.test(t) && !iHate) {
      mem.insults++;
      if (mem.insults >= 2) { out.unmatch = true; out.say(rnd(["That's it. I'm done.", "Twice? No. Bye."]), -30); return finish(m, out, voice); }
      out.say(rnd(["Excuse me?", "Wow. Rude.", "*pins ears back* Say that again, I dare you."]), -25, "!?");
      out.ask = false;
      return finish(m, out, voice);
    }

    // 3. Gifts
    if (gift) {
      const food = a.ents.filter(e => e.c.kind === "food" || e.c.kind === "bad")[0];
      if (!food) out.say(rnd(["*sniffs it* ...Can I eat this?", "*nudges it with nose* What is it?"]), 1);
      else {
        const op = opinion(h, food.c);
        if (op === "bad") out.say(rnd(["I can't eat that! Are you trying to give me colic?", "*backs away* That's not horse food."]), -8, "!?");
        else if (op === "hate") out.say(`${cap(food.c.label)}? I can't stand ${food.c.label}.` + (mem.revealedHate ? " I told you that." : ""), -10);
        else if (op === "love" || op === "secret") { out.say(rnd(["*munches happily* You remembered!", "*crunch crunch* This is the best day of my life."]), 12, "♥"); out.mood = "food"; }
        else out.say(rnd(["*crunch* Thanks!", "*takes it gently* Ooh, thank you."]), 6, "♥");
      }
      out.ask = false;
      return finish(m, out, voice);
    }

    // 4. Statements: "I love mud", "I hate carrots", "apples are my favourite"
    if ((iLike || iHate) && ent && !a.isQ) {
      aboutStatement(h, ent, iLike && !iHate, out, mem);
      if (mem.pending) mem.pending = null;
      return finish(m, out, voice);
    }

    // 5. Answers to the horse's last question
    // ("hey", "bye", "lol" and the like aren't answers, so they skip this)
    const smallTalk = (W.hello || W.bye || W.laugh || W.thanks || W.compliment || W.kiss || W.joke) && !a.ents.length;
    if (mem.pending && !a.isQ && !smallTalk && answerPending(m, me, a, out)) return finish(m, out, voice);

    // 6. Actions like *nuzzles*
    if (a.action) {
      if (W.kiss) {
        if (m.vibe >= 60) out.say(rnd(["*nuzzles back*", "*rests nose on your neck*", "*soft nicker*"]), 5, "♥");
        else out.say(rnd(["*steps back* Whoa, easy. We just met.", "*flicks ears* Slow down."]), -3);
      } else if (W.whinny) out.say(rnd(["*whinnies back*", "*nickers*", "*snorts playfully*"]), 2);
      else out.say(rnd(["*tilts head*", "*paws the ground*", "*swishes tail*"]), 1);
      out.ask = false;
      return finish(m, out, voice);
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

    if (myName) {
      const orig = /\b(?:my name is|call me|i'm called|i am called)\s+([A-Za-z]+)/i.exec(a.raw);
      mem.nick = cap(orig ? orig[1] : myName[1]);
      out.say(rnd([`Nice to meet you, ${mem.nick}.`, `${mem.nick}. I like it. Very strong name.`]), 2);
      return finish(m, out, voice);
    }
    if (bot) { out.say(rnd(["Last time I checked I had four legs and a tail.", "A bot? I just ate a whole hay net. Can a bot do that?"]), 0); return finish(m, out, voice); }
    if (howAreYou) {
      out.say(rnd([
        "Good! Just had a really satisfying roll.", "Pretty good. The farrier came and I only kicked once.",
        "Tired. Someone left the gate open and I had to explore everything.", "Great, now that you're here.",
      ]), 1);
      out.say(rnd(["How about you?", "You?"]));
      mem.pending = { type: "mood" };
      out.ask = false;
      return finish(m, out, voice);
    }
    if (wyd) {
      const hr = new Date().getHours();
      out.say(hr < 9 ? "Waiting for breakfast hay. It's late. Again." : hr < 13 ? "Standing in the field looking majestic." :
        hr < 18 ? `Just finished some ${h.discipline.toLowerCase()}. Now I'm stuffing my face.` : hr < 22 ? "Dinner, then staring at the stars." :
        "Trying to sleep standing up. Failing, clearly.", 1);
      return finish(m, out, voice);
    }
    if (yourName) { out.say(mem.askedName ? `Still ${h.name}.` : `${h.name}. It's on my profile, silly.`); mem.askedName = true; return finish(m, out, voice); }
    if (yourAge) {
      const gap = me.age - h.age;
      out.say(`I'm ${h.age}.` + (Math.abs(gap) <= 2 ? " Same as you, basically." : gap > 0 ? " You're a bit older. I like that." : " You're younger than me. That's fine."));
      return finish(m, out, voice);
    }
    if (yourBreed) { out.say(`I'm a ${h.breed}. ${breedFact(h)}`, 1); return finish(m, out, voice); }
    if (yourHeight) {
      const diff = me.inches - h.inches;
      out.say(`${D.fmtHeight(h.inches)}.` + (Math.abs(diff) <= 1 ? " Same as you!" : diff > 0 ? " You're taller than me, which is nice." : " So I'd be looking down at you. Sorry."));
      return finish(m, out, voice);
    }
    if (where) { out.say(rnd([`About ${D.plural(h.distance, "furlong")} from you.`, `${D.plural(h.distance, "furlong")} away. Walkable. Trottable, even.`])); return finish(m, out, voice); }
    if (fav) {
      if (/snack|food|treat|eat/.test(t)) out.say(`${cap(D.favouriteFood(h))}. Obviously.`);
      else if (/colou?r|coat/.test(t)) out.say(`${A.COATS[(h.art && h.art.coat) || "bay"].name}. Mine, obviously.`);
      else if (/place|spot|field/.test(t)) out.say("The far corner of the field, under the big oak.");
      else if (/song|music/.test(t)) out.say(h.likes.indexOf("Country music") >= 0 ? "Anything country." : h.likes.indexOf("Classical music") >= 0 ? "Mozart. Always Mozart." : "Anything the radio in the barn plays.");
      else out.say(`${cap(h.likes[0].toLowerCase())}, probably. Then ${h.likes[1].toLowerCase()}.`);
      return finish(m, out, voice);
    }
    if (hobby) { out.say(`${h.discipline}, mostly. And ${h.likes[0].toLowerCase()} and ${h.likes[1].toLowerCase()}.`, 1); return finish(m, out, voice); }

    // 8. "Do you like X?"
    if (askLike && ent && !invite) { doYouLike(h, ent, out, mem); out.ask = false; return finish(m, out, voice); }

    // 9. Dates and invitations
    const act = a.ents.filter(e => e.c.kind === "act")[0];
    if (invite && act && !W.date) {
      const op = opinion(h, act.c);
      if (op === "hate") out.say(rnd([`${cap(act.c.label)}? With me? Absolutely not.`, `Anything but ${act.c.label}.`]), -6);
      else if (op === "love" || op === "secret") out.say(rnd([`YES. When?`, `I thought you'd never ask. ${cap(act.c.label)} it is.`]), 8, "♥");
      else out.say(rnd(["Sure, why not.", "Okay! As long as there are snacks after."]), 3);
      return finish(m, out, voice);
    }
    if (W.date && (invite || a.isQ)) {
      if (dateOver(mem)) { // that one's been and gone, so a new one can be planned
        mem.lastDate = mem.date;
        delete mem.date; delete mem.datePlace; delete mem.dateAt; delete mem.calEventId;
      }
      if (mem.date) out.say(rnd([`We already have a date at ${mem.date}! Don't be late.`, `See you at ${mem.date}. I'll be the one pretending not to look.`]), 2);
      else if (m.vibe >= 62) {
        const likes = h.likes;
        const place = likes.indexOf("Beach rides") >= 0 ? "the beach" : likes.indexOf("Stargazing") >= 0 ? "the top field" :
          likes.indexOf("Hay nets") >= 0 ? "the hay barn" : rnd(["the water trough", "the far paddock gate", "the big oak tree"]);
        const when = rnd(["at feeding time", "at sunset", "tomorrow morning", "after training"]);
        mem.date = `${place} ${when}`;
        mem.datePlace = place;
        mem.dateAt = dateTime(when);
        out.date = mem.date;
        out.say(rnd([`Yes. ${cap(place)}, ${when}?`, `I'd like that. Meet me at ${place}, ${when}.`]), 8, "♥");
        out.ask = false;
      } else if (m.vibe >= 40) out.say(rnd(["Let's chat a bit more first.", "Maybe. Convince me.", "Slow down, cowboy."]), -1);
      else out.say(rnd(["I don't think so.", "Hmm. No."]), -3);
      return finish(m, out, voice);
    }

    // 10. Compliments and affection
    if (W.compliment && !/\bnot\b|n't\b/.test(t)) {
      mem.compliments++;
      if (mem.compliments >= 4) out.say(rnd(["Okay, okay. I get it. I'm gorgeous.", "Keep going, honestly."]), 1);
      else { out.say(rnd(["*flicks ears shyly*", "*swishes tail* You're not so bad yourself.", "Stop it, I'm blushing under all this fur.", "I know. But thank you."]), 6, "♥"); out.mood = "shy"; }
      return finish(m, out, voice);
    }
    if (W.kiss) {
      if (m.vibe >= 60) out.say(rnd(["*nuzzles you back*", "Okay, one boop. *boop*"]), 5, "♥");
      else out.say(rnd(["Whoa, we just met.", "Buy me a carrot first."]), -2);
      return finish(m, out, voice);
    }

    // 11. Small talk
    if (W.joke && (a.isQ || /\btell\b|\bknow\b|\bjoke\b/.test(t))) {
      const j = JOKES[mem.jokes % JOKES.length];
      mem.jokes++;
      out.say(j[0]); out.say(j[1]); out.say("*snorts at own joke*");
      out.ask = false;
      return finish(m, out, voice);
    }
    if (W.laugh) { out.say(rnd(["Glad I amuse you.", "Hehe.", "*proud snort*", "I'm here all week."]), 3, "ha"); return finish(m, out, voice); }
    if (W.thanks) { out.say(rnd(["Any time.", "You're welcome!", "Of course."]), 1); return finish(m, out, voice); }
    if (W.sad && !a.isQ) { out.mood = "sad"; out.say(rnd(["*rests head on your shoulder* Want to talk about it?", "Oh no. Do you need a carrot? I'd share. Probably."]), 4); out.ask = false; return finish(m, out, voice); }
    if (W.weather) {
      const muddy = opinion(h, BY_ID.mud);
      out.say(/rain|storm/.test(t) ? (muddy === "love" || muddy === "secret" ? "Rain means mud. Mud means happiness." : "Rain means rugs. I hate rugs.")
        : /cold|snow/.test(t) ? "Cold is fine. I have a built-in fur coat." : "Perfect weather for standing in the shade doing nothing.", 1);
      return finish(m, out, voice);
    }
    if (W.human) { out.say(rnd(["My human is nice. A bit obsessed with taking photos of me.", "Mine gives the best scratches, but sings while mucking out. Badly."]), 1); if (!mem.pending) { mem.pending = { type: "human" }; out.say("What's yours like?"); } out.ask = false; return finish(m, out, voice); }
    if (W.bye) { out.say(rnd(["Bye! *trots off*", "Night! I sleep standing up, by the way.", "Talk soon. Don't forget me."])); out.ask = false; return finish(m, out, voice); }
    if (W.hello) {
      if (mem.userGreeted) out.say(rnd(["Hi again!", "Hello hello.", "You already said hi. Hi though."]));
      else if (mem.greeted) out.say(rnd(["Hi!", "Hey you.", "There you are."]), 1); // horse spoke first
      else out.say(fill(rnd(v.greet), h, mem));
      mem.greeted = mem.userGreeted = true;
      out.ask = true;
      return finish(m, out, voice);
    }

    // 12. Something mentioned in passing
    if (ent) {
      const op = opinion(h, ent.c);
      const x = ent.c.label;
      if (ent.c.kind === "bad") out.say(`${cap(ent.word)}? Not for horses, sadly.`);
      else if (op === "hate") out.say(rnd([`Can we not talk about ${x}?`, `Ugh. ${cap(x)}.`]), mem.revealedHate ? -10 : -5, "!?");
      else if (op === "love" || op === "secret") out.say(rnd([`${cap(x)}!! You've got my attention.`, `Did someone say ${x}? *ears up*`]), 4);
      else if (ent.c.kind === "food") out.say(fill(rnd(v.snack), h, mem));
      else if (ent.c.id === "ride" || ent.c.id === "jump" || ent.c.id === "dressage") out.say(fill(rnd(v.ride), h, mem));
      else out.say(`${cap(x)}? Tell me more.`);
      return finish(m, out, voice);
    }
    if ((W.yes || W.no) && !a.isQ) { out.say(W.yes ? rnd(["Okay!", "Great.", "Love it."]) : rnd(["Hmm, okay.", "Fair.", "Oh."])); return finish(m, out, voice); }

    // 13. Nothing recognised
    if (a.isQ) out.mood = "shrug";
    if (a.isQ) out.say(rnd(["Hmm. Let me think about that while I chew.", "Neigh. Or yes. I haven't decided.", "Ask me again when I'm not eating.", "Good question. No idea."]));
    else if (mem.told && Object.keys(mem.told).some(k => mem.told[k] === "love") && chance(0.3)) {
      const k = Object.keys(mem.told).filter(k2 => mem.told[k2] === "love")[0];
      out.say(`Still thinking about how you like ${BY_ID[k] ? BY_ID[k].label : "that"}.`, 1);
    } else {
      out.say(fill(v.lines[mem.turns % v.lines.length], h, mem));
    }
    out.ask = true;
    return finish(m, out, voice);
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

  function fill(line, h, mem) {
    return line.replace("{food}", D.favouriteFood(h)).replace("{disc}", h.discipline).replace("{me}", (mem && mem.nick) || "you");
  }

  function finish(m, out, voice) {
    const mem = m.mem;
    m.vibe = Math.max(0, Math.min(100, m.vibe + out.vibe));
    if (!out.unmatch && m.vibe <= 8) {
      out.unmatch = true;
      out.replies.push(rnd(["I don't think this is working out.", "Yeah, no. Good luck out there."]));
    }
    // Keep the conversation going with a question of its own
    if (!out.unmatch && out.ask !== false && !mem.pending && (out.ask === true ? chance(0.7) : chance(0.3))) {
      const q = nextQuestion(m);
      if (q) out.replies.push(q);
    }
    // Now and then, a horse that's into you says so
    if (!out.unmatch && m.vibe >= 85 && !mem.saidLike) { mem.saidLike = true; out.replies.push("I really like talking to you, by the way."); }
    out.replies = out.replies.map(r => style(r, voice));
    addFaces(out, voice);
    delete out.say;
    return out;
  }

  /* First message from the horse when a chat opens empty */
  function opener(m, me) {
    init(m, me);
    const h = m.horse, v = D.voiceFor(h);
    m.mem.greeted = true;
    const lines = [fill(rnd(v.greet), h, m.mem)];
    const shared = me.interests.filter(i => h.likes.indexOf(i) >= 0)[0];
    if (shared && chance(0.6)) lines.push(`I saw you like ${shared.toLowerCase()} too.`);
    const q = nextQuestion(m);
    if (q) lines.push(q);
    return lines.map(l => style(l, h.voice));
  }

  /* Quick replies that fit what the horse just asked */
  function suggestions(m, me) {
    init(m, me);
    const p = m.mem.pending;
    if (p) {
      switch (p.type) {
        case "fav_food": return ["Carrots", "Apples", "Peppermints", "Sugar cubes", "Chocolate"];
        case "choice": return [cap(BY_ID[p.a].label), cap(BY_ID[p.b].label), "Both!"];
        case "yesno": case "likeback": return ["Yes!", "No", "Sometimes"];
        case "morning_night": return ["Morning horse", "Night horse"];
        case "fun": return ["Long gallops", "Napping", "Jumping", "Rolling in mud", "Trail rides"];
        case "mood": return ["Great, thanks!", "Bit tired", "Pretty bored"];
        case "human": return ["They're lovely", "They're a lot", "They sing badly"];
      }
    }
    const h = m.horse;
    const topic = rnd(D.INTERESTS).toLowerCase();
    const mine = me.interests.length ? rnd(me.interests).toLowerCase() : "long gallops";
    const pool = [
      "How are you?", "What do you do for fun?", `Do you like ${topic}?`, `I love ${mine}`, "How tall are you?",
      "Tell me a joke", "Want to meet up?", "You're gorgeous", "What's your favourite snack?", "What breed are you?",
      "*nuzzles*", "What are you up to?",
    ];
    const out = [];
    while (out.length < 5 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    if (m.vibe >= 62 && !m.mem.date && out.indexOf("Want to meet up?") < 0) out[0] = "Want to meet up?";
    if (!m.messages || !m.messages.length) out.unshift("*whinnies*");
    return out;
  }

  const GIFTS = [
    { label: "Carrot", text: "*gives you a carrot*" },
    { label: "Apple", text: "*gives you an apple*" },
    { label: "Peppermint", text: "*gives you a peppermint*" },
    { label: "Sugar cube", text: "*gives you a sugar cube*" },
    { label: "Watermelon", text: "*gives you a slice of watermelon*" },
    { label: "Chocolate", text: "*gives you some chocolate*" },
  ];

  window.HorseChat = { init, respond, opener, suggestions, analyze, opinion, GIFTS, settings, FACES, upcoming };
})();
