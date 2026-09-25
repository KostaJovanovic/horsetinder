/* Profile setup (Tinder-style steps), the horse designer, and photo uploads. */
(function () {
  "use strict";
  const A = window.HorseArt;
  const D = window.HorseData;
  const esc = A.esc;
  const MAX_PHOTOS = 6;

  // ---------- Toast (shared with app.js) ----------
  const toastEl = document.getElementById("toast");
  let toastTimer = 0;
  function toast(html, ms) {
    toastEl.innerHTML = html;
    toastEl.hidden = false;
    toastEl.classList.remove("show");
    void toastEl.offsetWidth; // restart the animation
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 2600);
  }

  // ---------- Horse designer ----------
  const creatorEl = document.getElementById("creator");
  const crPreview = document.getElementById("cr-preview");
  const crOptions = document.getElementById("cr-options");
  let crSpec = null, crDone = null, crLocked = false;

  const GROUPS = [
    { key: "coat", label: "Coat", body: true, type: "swatch", items: () => Object.keys(A.COATS).map(k => ({ value: k, label: A.COATS[k].name, color: A.COATS[k].coat })) },
    { key: "maneHex", label: "Mane colour", body: true, type: "swatch", items: () => A.MANE_COLORS.map(m => ({ value: m.hex, label: m.name, color: m.hex || A.COATS[crSpec.coat].mane })) },
    { key: "mane", label: "Mane style", items: () => toItems(A.MANES) },
    { key: "marking", label: "Face marking", body: true, items: () => toItems(A.MARKINGS) },
    { key: "pattern", label: "Pattern", body: true, items: () => toItems(A.PATTERNS) },
    { key: "build", label: "Build", body: true, items: () => toItems(A.BUILDS) },
    { key: "accessory", label: "Accessory", items: () => toItems(A.ACCESSORIES) },
    { key: "scene", label: "Background", items: () => {
      const list = toItems(A.SCENES);
      if (crSpec.skyHex) list.unshift({ value: "photo", label: "From your photo" });
      return list;
    } },
  ];
  function toItems(obj) { return Object.keys(obj).map(k => ({ value: k, label: obj[k] })); }

  function renderCreator() {
    crPreview.innerHTML = A.render(crSpec, { label: "Your horse design" });
    const note = crLocked
      ? `<p class="cr-note">Same horse as your main photo. To change the coat, markings or build, edit your main photo.</p>`
      : "";
    crOptions.innerHTML = note + GROUPS.filter(g => !(crLocked && g.body)).map(g => {
      const items = g.items().map((it, i) => {
        const on = crSpec[g.key] === it.value || (it.value === null && !crSpec[g.key]);
        if (g.type === "swatch") {
          return `<button type="button" class="swatch${on ? " on" : ""}" data-g="${g.key}" data-i="${i}" aria-pressed="${on}" aria-label="${esc(it.label)}" title="${esc(it.label)}"><span style="background:${it.color}"></span></button>`;
        }
        return `<button type="button" class="chip${on ? " on" : ""}" data-g="${g.key}" data-i="${i}" aria-pressed="${on}">${esc(it.label)}</button>`;
      }).join("");
      const current = g.items().filter(it => crSpec[g.key] === it.value || (it.value === null && !crSpec[g.key]))[0];
      return `<section class="cr-group"><h3>${g.label}${current && g.type === "swatch" ? ` <span>${esc(current.label)}</span>` : ""}</h3><div class="cr-items">${items}</div></section>`;
    }).join("");
  }

  crOptions.addEventListener("click", e => {
    const b = e.target.closest("button[data-g]");
    if (!b) return;
    const g = GROUPS.filter(x => x.key === b.dataset.g)[0];
    const item = g.items()[Number(b.dataset.i)];
    crSpec[g.key] = item.value;
    const scroll = crOptions.scrollTop;
    renderCreator();
    crOptions.scrollTop = scroll;
  });

  document.getElementById("cr-random").addEventListener("click", () => {
    const fresh = A.randomSpec(Math.random);
    // A locked horse keeps its body; only the look of the photo changes
    crSpec = crLocked ? A.withBody(fresh, A.bodyOf(crSpec)) : fresh;
    renderCreator();
  });
  document.getElementById("cr-cancel").addEventListener("click", closeCreator);
  document.getElementById("cr-save").addEventListener("click", () => {
    const done = crDone, spec = Object.assign({}, crSpec);
    closeCreator();
    if (done) done(spec);
  });

  /* opts.lockBody: this photo belongs to an existing horse, so only its mane style,
     accessory and background can change. */
  function openCreator(spec, onSave, opts) {
    crLocked = !!(opts && opts.lockBody);
    crSpec = Object.assign({}, A.normalize(spec || A.randomSpec(Math.random)));
    crDone = onSave;
    document.getElementById("cr-title").textContent = crLocked ? "New look" : "Design your horse";
    creatorEl.hidden = false;
    renderCreator();
    crOptions.scrollTop = 0;
  }
  function closeCreator() {
    creatorEl.hidden = true;
    crDone = null;
  }

  // ---------- Add-photo sheet ----------
  const sheetEl = document.getElementById("sheet");
  const fileInput = document.getElementById("photo-input");
  let sheetTarget = null;

  function openSheet(target) {
    sheetTarget = target;
    const hasHorse = target.hasHorse();
    document.getElementById("sheet-upload-hint").textContent = hasHorse
      ? "Your horse, with the photo's colours as the background"
      : "It will be saved as a horse picture";
    document.getElementById("sheet-design-label").textContent = hasHorse ? "New look for your horse" : "Design your horse";
    document.getElementById("sheet-design-hint").textContent = hasHorse
      ? "Change the mane style, accessory and background"
      : "Pick the coat, mane, markings and more";
    sheetEl.hidden = false;
  }
  function closeSheet() { sheetEl.hidden = true; }

  document.getElementById("sheet-design").addEventListener("click", () => {
    closeSheet();
    const t = sheetTarget;
    openCreator(t.seed(), spec => t.add(spec), { lockBody: t.hasHorse() });
  });
  document.getElementById("sheet-cancel").addEventListener("click", closeSheet);
  sheetEl.addEventListener("click", e => { if (e.target === sheetEl) closeSheet(); });

  fileInput.addEventListener("change", () => {
    closeSheet();
    const files = Array.prototype.slice.call(fileInput.files || []);
    fileInput.value = "";
    if (sheetTarget) sheetTarget.upload(files);
  });

  // ---------- Horse terms, explained ----------
  const infoEl = document.getElementById("info");
  function terms(list) {
    return `<dl class="terms">` + list.map(t => `<dt>${t[0]}</dt><dd>${t[1]}</dd>`).join("") + `</dl>`;
  }
  const COAT_INFO = {
    title: "Coats, markings and builds",
    html: `<p>Your first photo decides what your horse looks like. After that, new photos only change the mane style, accessory and background. It's still you, just with a different hat.</p>` +
      terms([
        ["Bay", "Brown body with black mane, tail and legs. The little black dress of horses."],
        ["Chestnut", "Reddish all over, mane included. Chestnut mares have a reputation. It's deserved."],
        ["Palomino", "Golden coat, pale mane. Looks like a shampoo advert."],
        ["Buckskin", "Golden body with black points. Very cowboy."],
        ["Dun", "Sandy coat with a dark stripe down the back, like a racing stripe you were born with."],
        ["Grey", "Born dark, goes white with age. So yes, a \u201cwhite\u201d horse is usually grey. Don't argue with it."],
        ["Star, snip, stripe, blaze, bald face", "White on the face, from a small forehead spot (star) to nearly the whole face (bald). A snip sits between the nostrils."],
        ["Pinto, roan, dapples", "Pinto is big patches. Roan is white hairs mixed through the coat. Dapples are rings of lighter and darker hair, like your coat is doing polka dots."],
        ["Draft, light, pony", "Draft horses are the big strong ones. Light horses are the athletes. Ponies are small and firmly believe they're in charge."],
      ]),
  };
  const INFO = {
    welcome: {
      title: "What is this?",
      html: `<p>Horse Tinder is a dating app for horses. You make a profile, swipe on horses nearby, and chat when you both say yay.</p>
        <p>Every horse has secret preferences: an age range, a coat colour it can't stand, one interest that's a dealbreaker. Some will say nay. That's showbiz.</p>`,
    },
    name: {
      title: "Horse names",
      html: `<p>Show horses often have a long registered name (\u201cDuke of Dappleford III\u201d) and a short barn name everyone actually uses (\u201cDave\u201d).</p>
        <p>Put your barn name here. Nobody wants to yell \u201cDuke of Dappleford III\u201d across a muddy field at feeding time.</p>`,
    },
    age: {
      title: "Horse ages",
      html: terms([
        ["Foal", "Under a year old. Mostly legs, zero coordination."],
        ["Yearling", "One year old. Teenager energy, without the phone."],
        ["Filly / colt", "A young female or male, under about four."],
        ["Birthdays", "Many breeds officially turn a year older on 1 January, whenever they were actually born. One big birthday party for everyone."],
      ]) + `<p>Most horses live 25 to 30 years. Enter regular years; \u201chorse years\u201d aren't a thing, we checked.</p>`,
    },
    sex: {
      title: "Mare, stallion or gelding?",
      html: terms([
        ["Mare", "A grown-up female horse. Famous for opinions, and usually right."],
        ["Stallion", "A grown-up male who hasn't been gelded. Loud, dramatic and very into himself."],
        ["Gelding", "A male who's been neutered. Usually the calmest horse in the field and quietly proud of it."],
      ]) + `<p>Under four? Technically you're a filly or a colt. Pick the grown-up word. We won't tell.</p>`,
    },
    showme: {
      title: "Who you'll see",
      html: `<p>This only changes whose cards show up. Whether they like you back is up to them, and some of them are extremely picky.</p>
        <p>\u201cEveryone\u201d gives you the biggest paddock to choose from.</p>`,
    },
    basics: {
      title: "Breeds, hands and disciplines",
      html: terms([
        ["Breed", "Your family tree. \u201cMixed breed\u201d is perfectly respectable and usually the most fun at parties."],
        ["Hands (hh)", "Horses are measured in hands. One hand is 4 inches (about 10 cm), measured from the ground to the withers, the bump where the neck meets the back."],
        ["15.2 hh", "Means 15 hands and 2 inches, not \u201cfifteen point two\u201d. The number after the dot only goes up to 3, because the 4th inch is a whole new hand."],
        ["Pony", "Anything under 14.2 hh. Ponies will fight you about this. Miniature horses are measured in plain inches instead."],
        ["Dressage", "Horse ballet. Very precise. Very sparkly jackets."],
        ["Eventing", "Dressage, then cross-country jumping, then show jumping, all in one competition, because one sport wasn't enough."],
        ["Western pleasure", "Looking calm, slow and effortless. It's harder than it looks."],
        ["Barrel racing / reining", "Sprinting around three barrels as tight as you can, or spins and sliding stops. Both are basically drifting."],
        ["Professional grazing", "Eating grass as a career. We don't judge. We're a little jealous."],
      ]),
    },
    looking: {
      title: "What you're looking for",
      html: terms([
        ["Long-term paddock mate", "Someone to share a field, a hay net and many years with."],
        ["A trail buddy", "Someone to go out on rides with. No pressure. Some carrots."],
        ["Something casual", "A hack here and there. A \u201chack\u201d is a relaxed ride out, not a crime."],
        ["Just here to graze", "Mostly browsing. Very relatable."],
        ["Still figuring it out", "Honest, and most horses find that charming."],
      ]) + `<p>A few horses care a lot about this. They won't tell you which ones.</p>`,
    },
    interests: {
      title: "Interests",
      html: `<p>Pick 3 to 5 things you genuinely love. Horses who share them will like you more.</p>
        <p>Careful, though: some horses have one thing they can't stand, and you won't know which until you bring it up.</p>` +
        terms([
          ["Hay nets", "A net of hay that makes you eat slower. Deeply frustrating. Still delicious."],
          ["Mutual grooming", "Two horses scratching each other's withers with their teeth. The highest form of friendship."],
          ["Rain rugs", "Waterproof coats for horses. Some love them; some take them off and hide them in the mud."],
          ["Spooking at bags", "Jumping sideways at things that aren't dangerous, like bags, leaves or your own shadow."],
          ["Pony Club", "Where kids learn to ride, fall off, get back on, and bribe you with sugar."],
        ]),
    },
    photos: COAT_INFO,
    bio: {
      title: "Writing a bio",
      html: `<p>Some horses won't swipe right on an empty bio, so give them something.</p>
        <p>Say what you like doing, what you're like in the field, and one thing that makes you you. \u201cLikes carrots\u201d is fine. \u201cLikes carrots, fears tarps, once opened a gate with my lips\u201d is better.</p>`,
    },
  };

  function openInfo(info) {
    document.getElementById("info-title").textContent = info.title;
    document.getElementById("info-text").innerHTML = info.html;
    infoEl.hidden = false;
    document.getElementById("info-text").scrollTop = 0;
  }
  function closeInfo() { infoEl.hidden = true; }
  document.getElementById("info-close").addEventListener("click", closeInfo);
  infoEl.addEventListener("click", e => { if (e.target === infoEl) closeInfo(); });
  document.getElementById("cr-info").addEventListener("click", () => openInfo(COAT_INFO));

  // ---------- Setup steps ----------
  const obEl = document.getElementById("onboard");
  const obBody = document.getElementById("ob-body");
  const obBar = document.getElementById("ob-bar");
  const obBack = document.getElementById("ob-back");
  const obNext = document.getElementById("ob-next");
  const obError = document.getElementById("ob-error");
  let draft = null, stepIndex = 0, steps = [], onFinish = null, editing = false, uploading = 0;

  function options(name, map, value, multi) {
    return `<div class="ob-options">` + Object.keys(map).map(k => {
      const on = multi ? value.indexOf(k) >= 0 : value === k;
      return `<button type="button" class="ob-option${on ? " on" : ""}" data-${name}="${k}" aria-pressed="${on}">${esc(map[k])}</button>`;
    }).join("") + `</div>`;
  }

  function heightOptions(sel) {
    let out = "";
    for (let i = 26; i <= 76; i++) out += `<option value="${i}"${i === sel ? " selected" : ""}>${D.fmtHeight(i)}</option>`;
    return out;
  }

  const STEPS = {
    welcome: {
      render() {
        const r = A.mulberry32(Date.now() >>> 0);
        const trio = [0, 1, 2].map(() => `<div class="welcome-photo">${A.render(A.randomSpec(r), { label: "A horse on Horse Tinder" })}</div>`).join("");
        return `<div class="welcome">
          <div class="welcome-fan">${trio}</div>
          <h1 class="logo welcome-logo">Horse Tinder</h1>
          <p class="welcome-lede">Swipe on horses near you. Find your stable relationship.</p>
          <p class="ob-hint">Every horse has its own secret taste. Not every horse will like you back.</p>
        </div>`;
      },
      next: "Create a profile",
    },
    name: {
      render: () => `<h1>My name is</h1>
        <input class="ob-input" id="ob-name" type="text" maxlength="24" autocomplete="off" placeholder="Horse name" value="${esc(draft.name)}">
        <p class="ob-hint">This is how it will appear on your profile.</p>`,
      bind() {
        const i = document.getElementById("ob-name");
        i.addEventListener("input", () => { draft.name = i.value; });
        focusSoon(i);
      },
      valid: () => draft.name.trim() ? "" : "Enter a name.",
    },
    age: {
      render: () => `<h1>My age is</h1>
        <input class="ob-input" id="ob-age" type="number" inputmode="numeric" min="1" max="40" placeholder="Age in years" value="${draft.age || ""}">
        <p class="ob-hint">Regular years, not horse years. Most horses live 25 to 30 years.</p>`,
      bind() {
        const i = document.getElementById("ob-age");
        i.addEventListener("input", () => { draft.age = parseInt(i.value, 10) || 0; });
        focusSoon(i);
      },
      valid: () => draft.age >= 1 && draft.age <= 40 ? "" : "Enter an age from 1 to 40.",
    },
    sex: {
      render: () => `<h1>I am a</h1>` + options("sex", D.SEXES, draft.sex),
      bind() { bindOptions("sex", v => { draft.sex = v; }); },
      valid: () => draft.sex ? "" : "Choose one.",
    },
    showme: {
      render: () => `<h1>Show me</h1>` + options("show", { mare: "Mares", stallion: "Stallions", gelding: "Geldings", everyone: "Everyone" }, draft.showMe),
      bind() { bindOptions("show", v => { draft.showMe = v; }); },
      valid: () => draft.showMe ? "" : "Choose who you want to see.",
    },
    basics: {
      render: () => `<h1>The basics</h1>
        <label class="ob-label" for="ob-breed">Breed</label>
        <select class="ob-input" id="ob-breed">${D.BREEDS.map(b => b.name).concat(["Hanoverian", "Connemara", "Andalusian", "Mixed breed"]).sort().map(n => `<option${n === draft.breed ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>
        <label class="ob-label" for="ob-height">Height</label>
        <select class="ob-input" id="ob-height">${heightOptions(draft.inches)}</select>
        <label class="ob-label" for="ob-disc">What I do</label>
        <select class="ob-input" id="ob-disc">${D.DISCIPLINES.map(n => `<option${n === draft.discipline ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`,
      bind() {
        const b = document.getElementById("ob-breed"), h = document.getElementById("ob-height"), d = document.getElementById("ob-disc");
        draft.breed = b.value; draft.inches = Number(h.value); draft.discipline = d.value;
        b.addEventListener("change", () => { draft.breed = b.value; });
        h.addEventListener("change", () => { draft.inches = Number(h.value); });
        d.addEventListener("change", () => { draft.discipline = d.value; });
      },
    },
    looking: {
      render: () => `<h1>I'm looking for</h1>` + options("look", D.LOOKING, draft.lookingFor),
      bind() { bindOptions("look", v => { draft.lookingFor = v; }); },
      valid: () => draft.lookingFor ? "" : "Choose what you're looking for.",
    },
    interests: {
      render: () => {
        const map = {};
        D.INTERESTS.forEach(i => { map[i] = i; });
        return `<h1>Interests</h1><p class="ob-sub">Pick 3 to 5. <b id="ob-count">${draft.interests.length}/5</b></p>` +
          options("int", map, draft.interests, true).replace("ob-options", "ob-options chips");
      },
      bind() {
        obBody.querySelectorAll("[data-int]").forEach(b => b.addEventListener("click", () => {
          const v = b.dataset.int, at = draft.interests.indexOf(v);
          if (at >= 0) draft.interests.splice(at, 1);
          else if (draft.interests.length < 5) draft.interests.push(v);
          else { showError("You can pick up to 5."); return; }
          showError("");
          b.classList.toggle("on", draft.interests.indexOf(v) >= 0);
          b.setAttribute("aria-pressed", String(draft.interests.indexOf(v) >= 0));
          document.getElementById("ob-count").textContent = draft.interests.length + "/5";
        }));
      },
      valid: () => draft.interests.length >= 3 ? "" : "Pick at least 3 interests.",
    },
    photos: {
      render: () => `<h1>Add photos</h1>
        <p class="ob-sub">Add at least 2. Every photo you upload is saved as a horse picture. We never keep the original.</p>
        <div class="ob-photos" id="ob-photos"></div>`,
      bind() { renderSlots(); },
      valid: () => uploading ? "Still turning your photo into a horse..." : draft.photos.length >= 2 ? "" : "Add at least 2 photos.",
    },
    bio: {
      render: () => `<h1>About me</h1>
        <p class="ob-sub">Optional, but some horses won't swipe right on an empty bio.</p>
        <textarea class="ob-input ob-bio" id="ob-bio" maxlength="300" rows="5" placeholder="What makes you a good paddock mate?">${esc(draft.bio)}</textarea>
        <p class="ob-hint"><span id="ob-bio-count">${draft.bio.length}</span>/300</p>`,
      bind() {
        const t = document.getElementById("ob-bio");
        t.addEventListener("input", () => {
          draft.bio = t.value;
          document.getElementById("ob-bio-count").textContent = t.value.length;
        });
      },
    },
  };

  function focusSoon(el) {
    // Don't pop the keyboard over the screen on touch devices
    if (window.matchMedia && window.matchMedia("(hover: hover)").matches) setTimeout(() => el.focus(), 60);
  }

  function bindOptions(name, set) {
    obBody.querySelectorAll(`[data-${name}]`).forEach(b => b.addEventListener("click", () => {
      set(b.getAttribute(`data-${name}`));
      obBody.querySelectorAll(`[data-${name}]`).forEach(o => {
        const on = o === b;
        o.classList.toggle("on", on);
        o.setAttribute("aria-pressed", String(on));
      });
      showError("");
    }));
  }

  /* All profile photos show the same horse: the first photo (uploaded or designed)
     decides the body, later ones only change mane style, accessory and background. */
  function mainBody() { return draft.photos.length ? A.bodyOf(draft.photos[0]) : null; }
  function addPhoto(spec) {
    if (draft.photos.length >= MAX_PHOTOS) return;
    draft.photos.push(A.withBody(spec, mainBody()));
  }

  const photoTarget = {
    hasHorse: () => draft.photos.length > 0,
    seed: () => {
      const body = mainBody();
      return body ? A.withBody(A.randomSpec(Math.random), body) : null;
    },
    add(spec) {
      addPhoto(spec);
      renderSlots();
    },
    upload(files) {
      files = files.slice(0, MAX_PHOTOS - draft.photos.length - uploading);
      files.forEach(f => {
        uploading++;
        renderSlots();
        const hadHorse = draft.photos.length > 0;
        A.horsify(f, mainBody()).then(spec => {
          uploading--;
          addPhoto(spec); // re-applies the body in case another upload finished first
          renderSlots();
          toast(hadHorse
            ? `<b>Photo saved as your horse.</b> The original was not kept.`
            : `<b>Photo saved as a horse.</b> This is your horse now. The original was not kept.`);
        }, () => {
          uploading--;
          renderSlots();
          toast("Couldn't read that image. Try a JPG or PNG.");
        });
      });
    },
  };

  function renderSlots() {
    const grid = document.getElementById("ob-photos");
    if (!grid) return;
    let html = "";
    for (let i = 0; i < MAX_PHOTOS; i++) {
      const p = draft.photos[i];
      if (p) {
        html += `<div class="ob-slot filled">${A.render(p, { label: "Your photo " + (i + 1) })}
          ${i === 0 ? `<span class="slot-main">Main</span>` : ""}
          ${p.fromPhoto ? `<span class="slot-tag">Uploaded</span>` : ""}
          <button type="button" class="slot-btn slot-edit" data-edit="${i}" aria-label="Edit photo ${i + 1}">Edit</button>
          <button type="button" class="slot-btn slot-x" data-remove="${i}" aria-label="Remove photo ${i + 1}">&times;</button>
        </div>`;
      } else if (i < draft.photos.length + uploading) {
        html += `<div class="ob-slot busy"><span>Turning it into a horse&hellip;</span></div>`;
      } else {
        // Buttons ignore the padding-based sizing on some engines, so the button sits inside a sized div
        html += `<div class="ob-slot slot-empty"><button type="button" class="slot-add" data-add aria-label="Add a photo"><span class="plus">+</span></button></div>`;
      }
    }
    grid.innerHTML = html;
  }

  obBody.addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    const rm = e.target.closest("[data-remove]");
    const ed = e.target.closest("[data-edit]");
    if (add) openSheet(photoTarget);
    if (rm) { draft.photos.splice(Number(rm.dataset.remove), 1); renderSlots(); }
    if (ed) {
      const i = Number(ed.dataset.edit);
      if (i === 0) {
        // The main photo defines the horse: body changes carry over to every photo
        openCreator(draft.photos[0], spec => {
          const body = A.bodyOf(spec);
          draft.photos = draft.photos.map((p, j) => j === 0 ? spec : A.withBody(p, body));
          renderSlots();
        });
      } else {
        openCreator(draft.photos[i], spec => { draft.photos[i] = A.withBody(spec, mainBody()); renderSlots(); }, { lockBody: true });
      }
    }
  });

  function showError(msg) {
    obError.textContent = msg;
    obError.hidden = !msg;
  }

  function renderStep() {
    const key = steps[stepIndex];
    const step = STEPS[key];
    obEl.className = "onboard step-" + key;
    document.getElementById("ob-info").hidden = !INFO[key];
    obBody.innerHTML = step.render();
    if (step.bind) step.bind();
    const shown = steps.filter(s => s !== "welcome");
    const pos = shown.indexOf(key);
    obBar.style.width = pos < 0 ? "0%" : ((pos + 1) / shown.length * 100) + "%";
    obBack.style.visibility = stepIndex === 0 && !editing ? "hidden" : "visible";
    obBack.setAttribute("aria-label", stepIndex === 0 ? "Close" : "Back");
    const last = stepIndex === steps.length - 1;
    obNext.textContent = step.next || (last ? (editing ? "Save profile" : "Start swiping") : "Continue");
    showError("");
    obBody.scrollTop = 0;
  }

  obNext.addEventListener("click", () => {
    const step = STEPS[steps[stepIndex]];
    const err = step.valid ? step.valid() : "";
    if (err) { showError(err); return; }
    if (stepIndex < steps.length - 1) { stepIndex++; renderStep(); return; }
    const done = onFinish, result = clean(draft);
    closeWizard();
    if (done) done(result);
  });

  obBack.addEventListener("click", back);
  document.getElementById("ob-info").addEventListener("click", () => {
    const info = INFO[steps[stepIndex]];
    if (info) openInfo(info);
  });
  function back() {
    if (stepIndex > 0) { stepIndex--; renderStep(); }
    else if (editing) closeWizard();
  }

  obBody.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); obNext.click(); }
  });

  function clean(d) {
    return {
      name: d.name.trim(), age: d.age, sex: d.sex, showMe: d.showMe, breed: d.breed, inches: d.inches,
      discipline: d.discipline, lookingFor: d.lookingFor, interests: d.interests.slice(),
      photos: d.photos.slice(), bio: d.bio.trim(),
    };
  }

  function openWizard(existing, done) {
    editing = !!existing;
    draft = existing ? unifyPhotos(JSON.parse(JSON.stringify(existing))) : {
      name: "", age: 0, sex: "", showMe: "", breed: "Mixed breed", inches: 60, discipline: "Trail riding",
      lookingFor: "", interests: [], photos: [], bio: "",
    };
    steps = ["name", "age", "sex", "showme", "basics", "looking", "interests", "photos", "bio"];
    if (!editing) steps.unshift("welcome");
    stepIndex = 0;
    uploading = 0;
    onFinish = done;
    obEl.hidden = false;
    renderStep();
  }
  /* Profiles made before photos shared one horse: make every photo match the main one */
  function unifyPhotos(profile) {
    if (profile && profile.photos && profile.photos.length > 1) {
      const body = A.bodyOf(profile.photos[0]);
      profile.photos = profile.photos.map(p => A.withBody(p, body));
    }
    return profile;
  }

  function closeWizard() { obEl.hidden = true; onFinish = null; }

  /* Called by the Android back button / Escape. Returns true if it handled it. */
  function handleBack() {
    if (!infoEl.hidden) { closeInfo(); return true; }
    if (!sheetEl.hidden) { closeSheet(); return true; }
    if (!creatorEl.hidden) { closeCreator(); return true; }
    if (!obEl.hidden) {
      if (stepIndex > 0 || editing) { back(); return true; }
      return false; // first setup screen: let Android minimise the app
    }
    return false;
  }
  function isOpen() { return !obEl.hidden || !creatorEl.hidden || !sheetEl.hidden || !infoEl.hidden; }

  window.HorseProfile = { openWizard, openCreator, handleBack, isOpen, toast, unifyPhotos };
})();
