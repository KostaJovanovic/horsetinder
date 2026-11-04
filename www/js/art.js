/* Horse portraits: every horse picture in the app is drawn from a small "spec" object.
   Plain ES2017, no optional chaining: this has to run in the Sunmi V2's Chrome 62 WebView. */
(function () {
  "use strict";

  // ---------- Options ----------
  const COATS = {
    bay:        { name: "Bay",             coat: "#6B3A1F", mane: "#1E130B" },
    chestnut:   { name: "Chestnut",        coat: "#A4502A", mane: "#8A3F1E" },
    liver:      { name: "Liver chestnut",  coat: "#5A2E1C", mane: "#4A2416" },
    flaxen:     { name: "Flaxen chestnut", coat: "#A85A2C", mane: "#EAD6A8" },
    black:      { name: "Black",           coat: "#1F1A17", mane: "#0B0907" },
    seal:       { name: "Seal brown",      coat: "#3E2718", mane: "#150E09" },
    grey:       { name: "Grey",            coat: "#B9BCB8", mane: "#E9EAE6" },
    white:      { name: "White",           coat: "#F0EEE8", mane: "#FAF8F2" },
    palomino:   { name: "Palomino",        coat: "#D9A441", mane: "#F6E7C1" },
    buckskin:   { name: "Buckskin",        coat: "#C9A165", mane: "#1E150E" },
    dun:        { name: "Dun",             coat: "#B89A6E", mane: "#3B2A1A" },
    cremello:   { name: "Cremello",        coat: "#EBDDBF", mane: "#F5ECD6" },
    silver:     { name: "Silver dapple",   coat: "#4A3C34", mane: "#D8D2C8" },
  };

  const MANE_COLORS = [
    { name: "Natural", hex: null },
    { name: "Black", hex: "#0B0907" },
    { name: "Flaxen", hex: "#F2DFAE" },
    { name: "Red", hex: "#8A3F1E" },
    { name: "Silver", hex: "#E4E4DE" },
    { name: "Brown", hex: "#5B3A22" },
    { name: "Party pink", hex: "#E6789E" },
  ];

  const MARKINGS = { none: "None", star: "Star", snip: "Snip", stripe: "Stripe", blaze: "Blaze", bald: "Bald face" };
  const PATTERNS = { none: "Solid", spots: "Leopard spots", dapples: "Dapples", pinto: "Pinto", roan: "Roan" };
  const MANES = { short: "Pulled", long: "Flowing", braided: "Braided", roached: "Roached", wild: "Wild" };
  const BUILDS = { light: "Light", draft: "Draft", pony: "Pony" };
  const ACCESSORIES = {
    none: "None", halter: "Halter", flowers: "Flower crown", bow: "Bow", cowboy: "Cowboy hat",
    flymask: "Fly mask", rosette: "Rosette", shades: "Sunglasses",
  };
  const SCENES = {
    meadow: "Meadow", sunset: "Sunset", beach: "Beach", snow: "Snow",
    night: "Night", barn: "Barn", arena: "Arena", studio: "Studio",
    forest: "Forest trail", showring: "Show ring", stable: "Stable door", rain: "Rainy field",
    livingroom: "Living room", lab: "Science lab",
  };
  const INDOORS = { studio: 1, stable: 1, livingroom: 1, lab: 1 }; // nothing to graze on

  // ---------- Small helpers ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
  function weighted(rand, table) {
    const keys = Object.keys(table);
    let total = 0;
    keys.forEach(k => { total += table[k]; });
    let r = rand() * total;
    for (let i = 0; i < keys.length; i++) {
      r -= table[keys[i]];
      if (r <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(rgb) {
    return "#" + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  }
  function mix(a, b, t) { return [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t); }
  function lum(rgb) { return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255; }
  function shade(hex, amt) {
    const c = hexToRgb(hex);
    return rgbToHex(mix(c, amt < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(amt)));
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Geometry (viewBox 240 x 240) ----------
  /* The head is drawn once, side-on and facing right, in "head space". Each pose places
     it with a rotation about the poll plus a shift, and brings its own neck (and body).
     Everything on the head (ears, eye, markings, forelock, most tack) is drawn in head
     space, so it follows the head into every pose. */
  const HEAD_SHAPE =
    "M96 70 C106 60 120 60 130 66" +           // poll and forehead
    " C150 80 174 110 188 140" +               // face, down the nasal bone
    " C195 152 199 164 195 173" +              // front of the muzzle
    " C192 180 186 182 180 181" +              // upper lip
    " C177 187 170 190 162 187" +              // chin
    " C152 183 146 176 138 175" +              // under the jaw
    " C122 179 108 170 106 154" +              // round of the cheek (jowl)
    " C104 130 98 100 96 70 Z";                // back of the head, hidden by the neck
  const EAR_BACK = "M98 72 C88 58 86 40 92 24 C103 34 112 50 114 66 Z";
  const EAR_FRONT = "M110 68 C106 50 108 32 118 16 C128 32 132 50 128 70 Z";
  const EAR_INNER = "M114 64 C112 50 114 36 119 26 C124 38 125 52 123 64 Z";
  const EYE = [142, 102];
  const POLL = [100, 66];   // the head rotates about this point
  const CHIN_RING = [160, 187], ROSETTE_AT = [106, 80], BOW_AT = [124, 66], MUZZLE = [176, 184];

  const POSES = { side: "Side on", graze: "Grazing", back: "Looking back" };
  /* Per pose: where the head goes (rot degrees about POLL, then dx/dy), the neck outline
     (it reaches under the head so no seam shows), the crest from poll to withers for the
     mane, an optional body, the throat shadow, pinto patches, and how builds scale. */
  const POSE = {
    side: {
      head: { rot: 0, dx: 0, dy: 0 },
      neck: "M28 240 C36 170 58 112 96 70 C112 66 126 96 124 124 C122 140 112 150 106 154 C104 176 118 208 134 240 Z",
      crest: [[96, 70], [58, 112], [36, 170], [28, 240]],
      throat: "M106 154 C104 176 118 208 134 240",
      pinto: ["M20 240 C26 214 44 196 66 200 C80 186 96 186 104 200 C116 196 128 214 122 226 C130 232 134 236 136 240 Z",
        "M58 132 C66 116 84 112 92 124 C104 120 110 134 102 144 C106 156 92 166 80 158 C68 164 54 154 58 142 Z"],
      build: { draft: [1.1, 1.06, 160, 33], pony: [0.84, 0.84, 137.5, 250] },
    },
    graze: {
      // Neck runs down from the withers (off the top left) and the head carries on the
      // same line to the grass, the way a horse stretches down to graze
      head: { rot: 25, dx: 20, dy: 20 },
      // Under the neck the chest and shoulder carry on down out of the frame, so the neck
      // doesn't float in from the edge with sky beneath it
      neck: "M-14 8 C40 20 80 50 115 88 C132 110 130 140 108 160 L88 168 C72 178 56 204 48 252 L-14 252 Z",
      crest: [[115, 88], [80, 50], [40, 20], [-14, 8]],
      throat: "M88 168 C72 178 56 204 48 252",
      pinto: ["M4 40 C20 26 46 32 52 50 C60 68 44 86 26 82 C8 86 -2 70 4 40 Z",
        "M60 92 C72 82 92 88 94 102 C96 116 82 122 70 118 C58 116 52 104 60 92 Z"],
      build: { draft: [1.1, 1.06, 140, 226], pony: [0.84, 0.84, 140, 232] },
    },
    back: {
      // Drawn with the body facing left (chest off the left edge, rump and tail on the right)
      // and the head turned back over its own back, then mirrored: the horse looks left
      mirror: true,
      head: { rot: 0, dx: -30, dy: -8 },
      // The back runs on out of the frame: a whole horse is about 2.5 heads long
      body: "M-10 250 L-10 214 C20 200 60 182 96 176 C124 182 150 190 180 188 C210 186 236 180 262 178 L262 250 Z",
      neck: "M-10 214 C14 160 40 100 66 62 C80 54 100 70 104 96 C106 120 92 140 76 146 C84 160 92 170 100 178 C98 204 84 230 62 252 L-10 252 Z",
      crest: [[66, 62], [40, 100], [14, 160], [-10, 214]],
      // The throat runs right along the jaw here, so a throat band looked like a tube round
      // the jaw. Instead the head casts one flat shadow on the neck and back, and the barrel,
      // further from the viewer than the neck, is a shade darker.
      throat: "",
      headShadow: [-4, 9],
      bodyShade: -0.07,
      pinto: ["M130 250 C132 222 150 200 172 204 C192 196 210 204 214 222 C220 234 222 244 222 250 Z",
        "M10 170 C18 154 36 152 42 166 C50 180 38 196 24 192 C10 192 4 180 10 170 Z"],
      build: { draft: [1.1, 1.06, 120, 120], pony: [0.84, 0.84, 120, 250] },
    },
  };
  function headTransform(pose) {
    const h = POSE[pose].head;
    return `translate(${h.dx} ${h.dy}) rotate(${h.rot} ${POLL[0]} ${POLL[1]})`;
  }
  /* A head-space point in frame space, for things that hang straight down whatever the pose */
  function mapPt(pose, p) {
    const h = POSE[pose].head, a = h.rot * Math.PI / 180, x = p[0] - POLL[0], y = p[1] - POLL[1];
    return [POLL[0] + x * Math.cos(a) - y * Math.sin(a) + h.dx, POLL[1] + x * Math.sin(a) + y * Math.cos(a) + h.dy];
  }
  function buildTransform(s) {
    const P = POSE[s.pose], b = P.build[s.build];
    return (P.mirror ? "translate(240 0) scale(-1 1) " : "") +
      (b ? `translate(${b[2]} ${b[3]}) scale(${b[0]} ${b[1]}) translate(${-b[2]} ${-b[3]})` : "");
  }

  /* A point on a crest at t (0 = poll, 1 = withers), pushed `off` units into the neck
     (negative = up and out, above the crest line) */
  function crestPt(p, t, off) {
    const u = 1 - t;
    const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
    const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
    const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
    const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return [x + dy / len * off, y - dx / len * off];
  }
  function pt(p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }

  // Stable pseudo-random dots, generated once
  // Patterns cover the whole frame; the neck or head clip decides where they show
  function scatter(seed, step, jitter, r0, r1) {
    const r = mulberry32(seed), out = [];
    for (let y = -10; y < 250; y += step) for (let x = -20; x < 250; x += step) out.push([x + r() * jitter, y + r() * jitter, r0 + r() * (r1 - r0)]);
    return out;
  }
  const ROAN_DOTS = scatter(7, 7, 5, 0.8, 1.9);
  const SPOTS = scatter(19, 19, 12, 2.5, 7);
  const DAPPLES = scatter(23, 24, 8, 7, 10);
  const STARS = (function () {
    const r = mulberry32(11), out = [];
    for (let i = 0; i < 26; i++) out.push([r() * 240, r() * 150, 0.5 + r() * 1.2]);
    return out;
  })();
  const FLAKES = (function () {
    const r = mulberry32(5), out = [];
    for (let i = 0; i < 30; i++) out.push([r() * 240, r() * 200, 1 + r() * 2]);
    return out;
  })();

  let uid = 0;

  // ---------- Scene backgrounds ----------
  function grad(id, a, b) {
    return `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="240" height="240" fill="url(#${id}s)"/>`;
  }
  /* Small pieces of scenery, each a few shapes */
  function cloud(x, y, k, op) {
    const e = (cx, cy, rx, ry) => `<ellipse cx="${(x + cx * k).toFixed(1)}" cy="${(y + cy * k).toFixed(1)}" rx="${(rx * k).toFixed(1)}" ry="${(ry * k).toFixed(1)}"/>`;
    return `<g fill="#FFF" opacity="${op}">${e(0, 0, 20, 7)}${e(-12, 2, 12, 6)}${e(12, 1, 13, 6)}${e(2, -5, 11, 7)}</g>`;
  }
  function pine(x, base, h, fill) {
    const w = h * 0.34;
    return `<path d="M${x} ${base - h} L${x + w * 0.7} ${base - h * 0.45} L${x + w * 0.4} ${base - h * 0.45} L${x + w} ${base} L${x - w} ${base} L${x - w * 0.4} ${base - h * 0.45} L${x - w * 0.7} ${base - h * 0.45} Z" fill="${fill}"/>`;
  }
  function roundTree(x, base, r, fill) {
    return `<rect x="${x - 1.5}" y="${base - r}" width="3" height="${r}" fill="${shade(fill, -0.3)}"/><circle cx="${x}" cy="${base - r * 1.4}" r="${r}" fill="${fill}"/>`;
  }
  const RAIN = (function () {
    const r = mulberry32(17), out = [];
    for (let i = 0; i < 70; i++) out.push([r() * 260, r() * 250, 8 + r() * 8]);
    return out;
  })();
  const CROWD = (function () {
    const r = mulberry32(29), cols = ["#C8504A", "#3E6FA8", "#E8C14E", "#F4F1E6", "#4E8A5A", "#8A5AA8", "#2E2A28"], out = [];
    for (let y = 104; y < 146; y += 7) for (let x = -4; x < 246; x += 7) out.push([x + r() * 3, y + r() * 2, pick(r, cols)]);
    return out;
  })();
  const dots = (list, fill, op) => list.map(f => `<circle cx="${f[0].toFixed(1)}" cy="${f[1].toFixed(1)}" r="${f[2].toFixed(1)}" fill="${fill}"${op ? ` opacity="${op}"` : ""}/>`).join("");

  /* Behind the horse. Ground lines sit around y 180-200; keep anything that matters
     between x 30 and 210, which is what a tall card shows. */
  function scene(s, id) {
    switch (s.scene) {
      case "sunset":
        return grad(id, "#E9876A", "#F8D9A4") +
          '<circle cx="176" cy="138" r="56" fill="#FFE7B0" opacity=".25"/><circle cx="176" cy="138" r="34" fill="#FFE7B0" opacity=".9"/>' +
          '<ellipse cx="60" cy="62" rx="44" ry="4" fill="#F6B48E" opacity=".7"/><ellipse cx="160" cy="40" rx="52" ry="5" fill="#F6B48E" opacity=".6"/>' +
          '<path d="M40 74 q5 -4 10 0 q5 -4 10 0 M70 88 q3 -3 7 0 q3 -3 7 0" stroke="#6B4A3A" stroke-width="1.4" fill="none"/>' +
          '<path d="M0 170 C40 156 90 164 130 156 C170 148 210 160 240 152 L240 240 L0 240 Z" fill="#B97C66" opacity=".75"/>' +
          '<path d="M0 186 C60 174 120 182 240 170 L240 240 L0 240 Z" fill="#9C7848"/>' +
          '<path d="M0 196 C70 178 140 192 240 176 L240 240 L0 240 Z" fill="#8C7A44"/>';
      case "beach":
        return grad(id, "#7FC3E2", "#E3F3F5") +
          '<circle cx="200" cy="40" r="16" fill="#FFF8DA"/>' + cloud(70, 46, 0.9, 0.85) + cloud(160, 70, 0.6, 0.7) +
          '<path d="M140 166 C150 156 166 152 184 166 Z" fill="#6E9A9E"/>' +
          '<rect y="164" width="240" height="30" fill="#4FA3C4"/><rect y="164" width="240" height="6" fill="#74BBD6"/>' +
          '<path d="M0 176 q15 -4 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke="#E8F6FA" stroke-width="2" fill="none" opacity=".8"/>' +
          '<path d="M0 192 C80 182 160 196 240 186 L240 240 L0 240 Z" fill="#EBD6A3"/>' +
          '<path d="M0 192 C80 182 160 196 240 186 L240 196 C160 206 80 192 0 202 Z" fill="#D9C08A" opacity=".6"/>' +
          '<path d="M0 190 q15 -5 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke="#FFF" stroke-width="2.4" fill="none" opacity=".8"/>' +
          '<path d="M40 214 l2 5 5 0 -4 3 2 5 -5 -3 -5 3 2 -5 -4 -3 5 0 Z" fill="#E39A6C"/>';
      case "snow":
        return grad(id, "#AFC2D4", "#EDF1F5") +
          '<path d="M0 160 L40 118 L70 146 L110 100 L150 150 L190 112 L240 158 L240 240 L0 240 Z" fill="#D6E0EA"/>' +
          '<path d="M110 100 L98 114 L106 112 L112 118 L118 110 L124 114 Z M190 112 L180 122 L188 121 L194 126 L200 120 Z M40 118 L32 128 L40 126 L46 130 L50 126 Z" fill="#FFF"/>' +
          pine(22, 190, 44, "#4F6B70") + pine(40, 194, 30, "#5E7A80") + pine(200, 186, 48, "#4F6B70") + pine(220, 190, 34, "#5E7A80") +
          '<path d="M0 190 C60 178 140 188 240 176 L240 240 L0 240 Z" fill="#F2F5F8"/>' +
          dots(FLAKES, "#FFF", ".9") +
          '<path d="M0 196 C70 184 150 198 240 182 L240 240 L0 240 Z" fill="#FFF"/>';
      case "night":
        return grad(id, "#0F1830", "#34466A") + dots(STARS, "#F4EBCB") +
          '<circle cx="196" cy="46" r="30" fill="#F4EBCB" opacity=".12"/>' +
          '<circle cx="196" cy="46" r="16" fill="#F4EBCB"/><circle cx="204" cy="40" r="14" fill="#152037"/>' +
          '<path d="M0 176 C50 160 100 170 140 162 C180 154 210 166 240 158 L240 240 L0 240 Z" fill="#1C2A44"/>' +
          '<path d="M0 200 C70 188 150 198 240 186 L240 240 L0 240 Z" fill="#22311D"/>' +
          '<circle cx="34" cy="198" r="1.6" fill="#F6E58A"/><circle cx="62" cy="208" r="1.3" fill="#F6E58A"/><circle cx="196" cy="200" r="1.6" fill="#F6E58A"/>';
      case "barn": {
        let planks = "";
        for (let x = 12; x < 240; x += 24) planks += `<path d="M${x} 0 V204" stroke="#7E2E21" stroke-width="2"/>`;
        return '<rect width="240" height="240" fill="#9A3A2A"/>' + planks +
          `<defs><linearGradient id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs><rect width="240" height="204" fill="url(#${id}d)"/>` +
          '<path d="M150 20 H230 V110 H150 Z M150 20 L230 110 M230 20 L150 110" stroke="#F1E6D2" stroke-width="5" fill="none"/>' +
          '<circle cx="56" cy="52" r="26" fill="#FFD27A" opacity=".22"/><path d="M56 0 V36" stroke="#3A2515" stroke-width="1.5"/>' +
          '<path d="M49 38 H63 L61 58 H51 Z" fill="#3A2515"/><rect x="52" y="41" width="8" height="14" fill="#FFD27A"/>' +
          '<rect y="200" width="240" height="40" fill="#D8B45C"/>' +
          '<path d="M10 206 l14 -4 M60 214 l18 3 M120 208 l12 -5 M180 216 l16 2 M210 206 l10 -3" stroke="#B8923A" stroke-width="2"/>' +
          '<rect x="-4" y="178" width="58" height="30" rx="4" fill="#E0BE62"/><path d="M-4 188 H54 M-4 198 H54" stroke="#C49A3E" stroke-width="2"/>';
      }
      case "arena": {
        let posts = "";
        for (let x = 10; x < 240; x += 46) posts += `<rect x="${x}" y="146" width="7" height="46" fill="#FFFFFF"/>`;
        return grad(id, "#B9D8EC", "#E8F0F2") + cloud(60, 40, 0.8, 0.8) +
          roundTree(20, 128, 9, "#7E9E62") + roundTree(44, 126, 11, "#6E8F52") + roundTree(186, 126, 10, "#7E9E62") + roundTree(214, 128, 12, "#6E8F52") +
          '<path d="M0 132 C80 124 170 130 240 122 L240 190 L0 190 Z" fill="#8BAA6A"/>' + posts +
          '<path d="M0 156 H240 M0 174 H240" stroke="#FFFFFF" stroke-width="5"/>' +
          '<rect x="150" y="150" width="5" height="34" fill="#F4F1E6"/><rect x="205" y="150" width="5" height="34" fill="#F4F1E6"/>' +
          '<path d="M152 164 H208" stroke="#F4F1E6" stroke-width="5"/><path d="M152 164 H208" stroke="#C8504A" stroke-width="5" stroke-dasharray="7 7"/>' +
          '<rect y="188" width="240" height="52" fill="#CFAF80"/>';
      }
      case "studio":
        return `<defs><radialGradient id="${id}r" cx=".55" cy=".4" r=".8"><stop offset="0" stop-color="#E6DED4"/><stop offset="1" stop-color="#A39A90"/></radialGradient></defs><rect width="240" height="240" fill="url(#${id}r)"/>` +
          '<ellipse cx="40" cy="20" rx="70" ry="34" fill="#FFF" opacity=".22"/>' +
          '<path d="M0 196 C80 186 160 186 240 196 L240 240 L0 240 Z" fill="#B8AEA3" opacity=".55"/>';
      case "forest": {
        let trunks = "";
        [[14, 6], [60, 7], [98, 5], [176, 6], [214, 8]].forEach(t => { trunks += `<rect x="${t[0]}" y="30" width="${t[1]}" height="170" fill="#6E8458" opacity=".7"/>`; });
        return grad(id, "#A9C48F", "#557A42") + trunks +
          '<rect x="-2" y="0" width="18" height="210" fill="#4A3826"/><rect x="222" y="0" width="20" height="210" fill="#4A3826"/>' +
          '<g fill="#3F6B35"><circle cx="20" cy="10" r="40"/><circle cx="80" cy="-6" r="38"/><circle cx="150" cy="0" r="40"/><circle cx="220" cy="14" r="42"/></g>' +
          '<g fill="#4F7D3F"><circle cx="50" cy="24" r="22"/><circle cx="190" cy="30" r="24"/></g>' +
          '<g fill="#F6E9A8" opacity=".25"><circle cx="44" cy="120" r="7"/><circle cx="130" cy="80" r="5"/><circle cx="196" cy="140" r="8"/><circle cx="90" cy="170" r="6"/></g>' +
          '<path d="M0 198 C60 192 180 194 240 198 L240 240 L0 240 Z" fill="#4E6B36"/>' +
          '<path d="M70 240 C90 214 110 202 128 198 C146 202 166 214 186 240 Z" fill="#A0825A"/>' +
          '<path d="M24 200 q6 -10 12 0 M200 202 q6 -10 12 0" stroke="#6E9A4E" stroke-width="2" fill="none"/>';
      }
      case "showring": {
        let bunting = "";
        const cols = ["#C8504A", "#3E6FA8", "#E8C14E", "#4E8A5A"];
        for (let i = 0; i < 12; i++) {
          const x = 4 + i * 20, y = 22 + Math.sin(i / 11 * Math.PI) * 14;
          bunting += `<path d="M${x} ${y.toFixed(1)} L${x + 14} ${(y + 1).toFixed(1)} L${x + 7} ${(y + 13).toFixed(1)} Z" fill="${cols[i % 4]}"/>`;
        }
        return grad(id, "#A9D0EA", "#E8F0F2") +
          '<rect y="96" width="240" height="54" fill="#8D99A6"/><rect y="92" width="240" height="6" fill="#5E6A76"/>' +
          CROWD.map(c => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="2.6" fill="${c[2]}" opacity=".85"/>`).join("") +
          '<path d="M0 20 Q120 50 240 20" stroke="#5E6A76" stroke-width="1.2" fill="none"/>' + bunting +
          '<rect y="150" width="240" height="40" fill="#8BAA6A"/>' +
          '<path d="M0 162 H240 M0 178 H240" stroke="#FFF" stroke-width="4"/>' +
          '<rect x="20" y="152" width="6" height="34" fill="#FFF"/><rect x="214" y="152" width="6" height="34" fill="#FFF"/>' +
          '<rect y="188" width="240" height="52" fill="#D9BB85"/>';
      }
      case "stable": {
        let planks = "";
        for (let x = 6; x < 240; x += 20) planks += `<path d="M${x} 0 V240" stroke="#5E3820" stroke-width="2"/>`;
        return '<rect width="240" height="240" fill="#7A4A2A"/>' + planks +
          // The open top half of the door: the dark stable behind, warm light inside
          `<defs><linearGradient id="${id}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A3020"/><stop offset="1" stop-color="#1E140C"/></linearGradient></defs>` +
          `<rect x="34" y="24" width="172" height="216" fill="url(#${id}i)"/>` +
          '<circle cx="170" cy="60" r="30" fill="#FFD27A" opacity=".12"/>' +
          '<path d="M34 24 H206 V240 M34 240 V24" stroke="#4A2A16" stroke-width="8" fill="none"/>' +
          '<path d="M60 70 H120 M60 80 H120" stroke="#3A2414" stroke-width="3"/>';
      }
      case "rain":
        return grad(id, "#7E8A96", "#C3CCD3") +
          '<g fill="#6A7480" opacity=".75"><ellipse cx="40" cy="20" rx="60" ry="22"/><ellipse cx="140" cy="10" rx="70" ry="24"/><ellipse cx="220" cy="26" rx="50" ry="20"/></g>' +
          '<path d="M0 170 C50 158 100 166 150 160 C190 156 220 162 240 158 L240 240 L0 240 Z" fill="#8E9E8C"/>' +
          '<path d="M0 186 C60 176 140 184 240 174 L240 240 L0 240 Z" fill="#6F8A5E"/>' +
          '<path d="M0 198 C70 188 150 198 240 186 L240 240 L0 240 Z" fill="#5F7A4A"/>' +
          '<ellipse cx="50" cy="216" rx="24" ry="4.5" fill="#A7B6C2" opacity=".8"/><ellipse cx="184" cy="226" rx="30" ry="5" fill="#A7B6C2" opacity=".8"/>' +
          '<ellipse cx="50" cy="216" rx="10" ry="2" fill="none" stroke="#DCE4EA" stroke-width=".8"/><ellipse cx="184" cy="226" rx="12" ry="2.2" fill="none" stroke="#DCE4EA" stroke-width=".8"/>';
      case "livingroom": {
        let stripes = "", boards = "";
        for (let x = 0; x < 240; x += 20) stripes += `<rect x="${x}" y="0" width="7" height="196" fill="#E0D0B4"/>`;
        for (let x = 0; x < 240; x += 34) boards += `<path d="M${x} 202 L${x - 14} 240" stroke="#8E5E3E" stroke-width="1.5"/>`;
        return '<rect width="240" height="240" fill="#E9DCC6"/>' + stripes +
          // A framed picture (of a horse, obviously), a window with curtains, a lamp
          '<rect x="36" y="36" width="54" height="42" fill="#6B4A2E"/><rect x="41" y="41" width="44" height="32" fill="#9CC3D9"/>' +
          '<path d="M41 73 L54 58 L64 66 L72 56 L85 73 Z" fill="#7FA05A"/><path d="M58 60 l3 -6 2 4 3 -1 -1 5 Z" fill="#6B3A1F"/>' +
          '<rect x="158" y="22" width="66" height="76" fill="#F5EFE4"/><rect x="163" y="27" width="56" height="66" fill="#A9D0EA"/>' +
          '<path d="M191 27 V93 M163 60 H219" stroke="#F5EFE4" stroke-width="3"/>' +
          '<path d="M152 16 C160 50 156 80 164 104 L150 104 C146 70 150 40 148 16 Z M230 16 C222 50 226 80 218 104 L232 104 C236 70 232 40 234 16 Z" fill="#C9504A"/>' +
          '<path d="M146 14 H236" stroke="#6B4A2E" stroke-width="3"/>' +
          '<circle cx="18" cy="110" r="26" fill="#FFE6A8" opacity=".3"/><path d="M8 96 H28 L32 116 H4 Z" fill="#F2D9A0"/><path d="M18 116 V196" stroke="#6B4A2E" stroke-width="3"/>' +
          '<rect y="194" width="240" height="8" fill="#F5EFE4"/><rect y="202" width="240" height="38" fill="#A9744E"/>' + boards +
          '<ellipse cx="128" cy="228" rx="112" ry="18" fill="#B5484A"/><ellipse cx="128" cy="228" rx="96" ry="13" fill="none" stroke="#E2C27A" stroke-width="2"/>';
      }
      case "lab": {
        let tiles = "";
        for (let x = 0; x <= 240; x += 24) tiles += `<path d="M${x} 0 V190" stroke="#CFDCE2" stroke-width="1"/>`;
        for (let y = 0; y <= 190; y += 24) tiles += `<path d="M0 ${y} H240" stroke="#CFDCE2" stroke-width="1"/>`;
        const flask = (x, c) => `<path d="M${x - 3} 34 H${x + 3} V44 L${x + 10} 60 H${x - 10} L${x - 3} 44 Z" fill="#E8F2F6" stroke="#9AA8B0" stroke-width="1.2"/><path d="M${x - 7} 54 H${x + 7} L${x + 10} 60 H${x - 10} Z" fill="${c}"/>`;
        return '<rect width="240" height="240" fill="#E4EEF2"/>' + tiles +
          '<rect x="34" y="28" width="90" height="58" fill="#FFF" stroke="#9AA8B0" stroke-width="3"/>' +
          '<text x="42" y="52" font-family="DM Mono, monospace" font-size="11" fill="#3A6EA5">hay = mc&#178;</text>' +
          '<path d="M42 64 q8 -8 16 0 t16 0 t16 0 M42 74 H86" stroke="#C8504A" stroke-width="1.5" fill="none"/>' +
          '<path d="M146 60 H232" stroke="#9AA8B0" stroke-width="4"/>' + flask(160, "#6CC3A0") + flask(186, "#E86A8A") + flask(212, "#F2C14E") +
          '<rect y="190" width="240" height="8" fill="#59666E"/><rect y="198" width="240" height="42" fill="#3E4A52"/>' +
          '<path d="M190 176 H206 V190 H190 Z" fill="#E8F2F6" stroke="#9AA8B0" stroke-width="1.2"/><rect x="191" y="182" width="14" height="7" fill="#6CC3A0"/>' +
          '<circle cx="196" cy="172" r="2" fill="#6CC3A0" opacity=".6"/><circle cx="200" cy="166" r="1.5" fill="#6CC3A0" opacity=".5"/>';
      }
      case "photo": {
        const sky = s.skyHex || ["#D6D2CC", "#EDEAE4"];
        return grad(id, sky[0], sky[1]) +
          `<circle cx="196" cy="54" r="26" fill="${sky[0]}" opacity=".6"/>` +
          `<path d="M0 198 C70 182 150 196 240 180 L240 240 L0 240 Z" fill="${s.groundHex || "#8C8A7E"}"/>`;
      }
      default: // meadow
        return grad(id, "#A9D0EA", "#E8F1E0") +
          '<circle cx="196" cy="44" r="30" fill="#FFF6DA" opacity=".25"/><circle cx="196" cy="44" r="18" fill="#FFF6DA" opacity=".9"/>' +
          cloud(60, 40, 1, 0.85) + cloud(150, 64, 0.7, 0.7) +
          '<path d="M0 168 C40 150 80 158 120 150 C160 142 200 156 240 146 L240 240 L0 240 Z" fill="#B5CDA6"/>' +
          roundTree(22, 166, 6, "#7E9E62") + roundTree(36, 164, 7, "#6E8F52") + roundTree(176, 158, 7, "#7E9E62") + roundTree(196, 156, 8, "#6E8F52") +
          '<path d="M0 186 C50 172 110 180 160 172 C200 166 220 170 240 166 L240 240 L0 240 Z" fill="#93B26E"/>' +
          '<path d="M0 200 C60 185 130 195 240 180 L240 240 L0 240 Z" fill="#7FA05A"/>' +
          '<g fill="#FFF"><circle cx="30" cy="214" r="1.6"/><circle cx="62" cy="226" r="1.6"/><circle cx="196" cy="218" r="1.6"/></g>' +
          '<g fill="#F2C94C"><circle cx="46" cy="222" r="1.6"/><circle cx="214" cy="230" r="1.6"/></g>';
    }
  }
  /* In front of the horse: the stable's half-door, and rain */
  function sceneFront(s) {
    if (s.scene === "stable") {
      let boards = "";
      for (let x = 44; x < 200; x += 16) boards += `<path d="M${x} 204 V240" stroke="#6E4224" stroke-width="1.5"/>`;
      return '<rect x="30" y="200" width="180" height="40" fill="#8A5530"/>' + boards +
        '<path d="M38 236 L202 206" stroke="#6E4224" stroke-width="6"/><rect x="26" y="194" width="188" height="9" rx="2" fill="#5A341C"/>';
    }
    if (s.scene === "rain") return `<g stroke="#E6EEF5" stroke-width="1.2" opacity=".5">${RAIN.map(r => `<path d="M${r[0].toFixed(1)} ${r[1].toFixed(1)} l-4 ${r[2].toFixed(1)}"/>`).join("")}</g>`;
    return "";
  }

  // ---------- Accessories ----------
  function flower(x, y, c, r) {
    let petals = "";
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 + x * 7) * Math.PI / 180;
      petals += `<circle cx="${(Math.cos(a) * r * 0.75).toFixed(1)}" cy="${(Math.sin(a) * r * 0.75).toFixed(1)}" r="${(r * 0.6).toFixed(1)}"/>`;
    }
    return `<g transform="translate(${x} ${y})" fill="${c}" stroke="${shade(c, -0.18)}" stroke-width=".8">${petals}<circle r="${(r * 0.38).toFixed(1)}" fill="#F2B632" stroke="none"/></g>`;
  }
  function leaf(x, y, a) {
    return `<ellipse cx="${x}" cy="${y}" rx="6" ry="2.6" fill="#5E8F48" transform="rotate(${a} ${x} ${y})"/>`;
  }
  const BRIDLE = '<g fill="none" stroke="#3A2515" stroke-width="4" stroke-linecap="round">' +
    '<path d="M104 76 C112 82 124 84 134 80"/><path d="M106 78 C120 112 148 150 172 176"/><path d="M182 124 C178 146 170 166 162 186"/></g>';

  /* Returns the pieces to draw at four depths. `back`, `under` and `over` are in head
     space: right after the far ear, before the near ear (so the ear pokes out in front),
     and on top of the head. `frame` is in frame space, for things that hang straight down
     whatever the pose (rope, ribbons) and is drawn last. */
  function accessory(s, id) {
    const out = { back: "", under: "", over: "", frame: "" };
    switch (s.accessory) {
      case "halter": {
        const strap = '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M182 122 C177 146 169 166 160 186 M168 166 C150 146 128 114 104 74 M110 86 C100 112 100 140 110 164" stroke="#B8322A" stroke-width="5.5"/>' +
          '<path d="M182 122 C177 146 169 166 160 186 M168 166 C150 146 128 114 104 74 M110 86 C100 112 100 140 110 164" stroke="#E2675C" stroke-width="1" stroke-dasharray="2 3"/></g>';
        out.over = strap +
          '<circle cx="168" cy="166" r="5" fill="none" stroke="#D9BE6C" stroke-width="2.6"/>' +
          `<circle cx="${CHIN_RING[0]}" cy="${CHIN_RING[1]}" r="4" fill="none" stroke="#D9BE6C" stroke-width="2.4"/>`;
        const c = mapPt(s.pose, CHIN_RING), rope = `M${pt([c[0], c[1] + 4])} c-8 17 8 31 -2 51`;
        out.frame = `<path d="${rope}" stroke="#8C6A3C" stroke-width="5" fill="none" stroke-linecap="round"/>` +
          `<path d="${rope}" stroke="#B89462" stroke-width="1.4" stroke-dasharray="4 4" fill="none"/>`;
        break;
      }
      case "flowers": {
        // A crown resting behind the ears and across the forehead
        const spots = [[96, 84, "#F28DB2"], [100, 72, "#FFFFFF"], [108, 64, "#F6C945"], [118, 62, "#B9A3F0"], [128, 66, "#F28DB2"], [136, 74, "#FFFFFF"], [140, 84, "#F6C945"]];
        out.over = leaf(92, 92, 70) + leaf(104, 60, -40) + leaf(124, 58, 20) + leaf(144, 78, 60) +
          spots.map((f, i) => flower(f[0], f[1], f[2], i % 2 ? 6 : 7)).join("");
        break;
      }
      case "bow": {
        const b = mapPt(s.pose, BOW_AT);
        out.frame = `<g transform="translate(${pt(b)}) rotate(18)">` +
          '<path d="M-2 4 L-8 26 L-3 22 L0 28 Z M2 4 L10 25 L4 22 L2 28 Z" fill="#C23C6E"/>' +
          '<path d="M0 0 C-10 -14 -24 -14 -24 -2 C-24 10 -10 10 0 0 Z M0 0 C10 -14 24 -14 24 -2 C24 10 10 10 0 0 Z" fill="#E6528A"/>' +
          '<path d="M-3 -1 C-10 -7 -17 -8 -19 -3 M3 -1 C10 -7 17 -8 19 -3" stroke="#F59AB9" stroke-width="2" fill="none" stroke-linecap="round"/>' +
          '<ellipse rx="5" ry="6" fill="#C23C6E"/></g>';
        break;
      }
      case "cowboy":
        // A hat stays closer to level than the head does, or it hangs off a grazing horse's forehead
        out.under = `<g transform="rotate(${12 - POSE[s.pose].head.rot * 0.6} 112 54)">` +
          '<ellipse cx="112" cy="58" rx="46" ry="10" fill="#6E4524"/>' +
          '<path d="M90 56 C88 36 94 24 104 22 C108 26 116 26 120 22 C130 24 136 36 134 56 C120 60 104 60 90 56 Z" fill="#8A5A2E"/>' +
          '<path d="M104 22 C108 28 116 28 120 22" stroke="#6E4524" stroke-width="2.4" fill="none"/>' +
          '<path d="M90 48 C104 52 120 52 134 48 L134 55 C120 60 104 60 90 55 Z" fill="#3A2515"/>' +
          '<path d="M66 58 C80 66 144 66 158 58" stroke="#8A5A2E" stroke-width="3" fill="none" stroke-linecap="round"/></g>';
        break;
      case "flymask": {
        const mesh = `url(#${id}m)`;
        const mask = "M90 66 L140 44 L206 112 L182 124 L144 184 L108 176 L94 84 Z";
        out.back = `<path d="${EAR_BACK}" transform="translate(-2 -3) scale(1.02)" fill="#D6DEE2" opacity=".88"/><path d="${EAR_BACK}" transform="translate(-2 -3) scale(1.02)" fill="${mesh}"/>`;
        out.over = `<defs><pattern id="${id}m" width="3.5" height="3.5" patternUnits="userSpaceOnUse"><path d="M0 0 L3.5 3.5 M3.5 0 L0 3.5" stroke="#6C7A80" stroke-width=".55"/></pattern></defs>` +
          `<g clip-path="url(#${id}h)"><path d="${mask}" fill="#D6DEE2" opacity=".8"/><path d="${mask}" fill="${mesh}"/>` +
          '<path d="M184 122 L144 184 M108 176 L94 84" stroke="#4E6470" stroke-width="5" fill="none"/></g>' +
          `<path d="${EAR_FRONT}" fill="#D6DEE2" opacity=".9" stroke="#4E6470" stroke-width="1.6"/><path d="${EAR_FRONT}" fill="${mesh}"/>`;
        break;
      }
      case "rosette": {
        // The bridle follows the head; the rosette hangs from it, ribbons straight down
        const c = mapPt(s.pose, ROSETTE_AT);
        out.over = BRIDLE;
        out.frame = `<g transform="translate(${pt(c)})">` +
          '<path d="M-6 8 L-18 44 L-10 38 L-8 48 L2 12 Z M2 10 L6 48 L10 39 L18 44 L8 8 Z" fill="#2F5DA8"/>' +
          '<circle r="15" fill="#2F5DA8"/><circle r="15" fill="none" stroke="#5A82C8" stroke-width="2.4" stroke-dasharray="2.4 2.4"/>' +
          '<circle r="9" fill="#F4F1E6"/><circle r="5.5" fill="#D9BE6C"/></g>';
        break;
      }
      case "shades":
        // Side on, only the near lens shows: the far one is behind the nose, with just
        // the bridge poking past the face line
        out.over = `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A4552"/><stop offset="1" stop-color="#0D0F12"/></linearGradient></defs>` +
          '<path d="M131 92 C121 86 112 80 106 74" stroke="#15161A" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
          '<g transform="translate(144 100) rotate(32)">' +
          `<path d="M-15 -9 L15 -9 C16 -2 14 6 8 9 L-8 9 C-14 6 -16 -2 -15 -9 Z" fill="url(#${id}g)" stroke="#15161A" stroke-width="2.4" stroke-linejoin="round"/>` +
          '<path d="M-16 -9.5 L16 -9.5 M16 -8.5 L23 -9" stroke="#15161A" stroke-width="3.6" stroke-linecap="round"/>' +
          '<path d="M-9 -4 L-2 -4" stroke="#FFF" stroke-width="2" opacity=".5" stroke-linecap="round"/>' +
          '<path d="M-10 4 L5 -5" stroke="#FFF" stroke-width="1.2" opacity=".22" stroke-linecap="round"/></g>';
        break;
    }
    return out;
  }

  // ---------- Portrait ----------
  function normalize(spec) {
    const s = Object.assign({
      coat: "bay", maneHex: null, marking: "none", pattern: "none",
      mane: "short", build: "light", accessory: "none", scene: "meadow", pose: "side",
    }, spec || {});
    if (!COATS[s.coat]) s.coat = "bay";
    if (!POSE[s.pose]) s.pose = "side";
    return s;
  }

  function coatHex(s) { return s.coatHex || COATS[s.coat].coat; }
  function maneHex(s) { return s.maneHex || COATS[s.coat].mane; }

  const WHITE = "#F7F3EA";
  /* `onHead`: the same pattern on the head, in head space. Roans and dapples keep a
     plain head, like the real thing; pinto patches sit on the neck and body. */
  function patternSVG(s, coat, onHead) {
    const light = lum(hexToRgb(coat)) > 0.55;
    switch (s.pattern) {
      case "spots": {
        const c = light ? "#3A2A1E" : WHITE;
        return SPOTS.map(d => `<ellipse cx="${d[0].toFixed(1)}" cy="${d[1].toFixed(1)}" rx="${d[2].toFixed(1)}" ry="${(d[2] * 0.85).toFixed(1)}" fill="${c}"/>`).join("");
      }
      case "dapples": {
        if (onHead) return "";
        const fill = shade(coat, light ? 0.3 : 0.16), ring = shade(coat, light ? -0.18 : -0.12);
        return DAPPLES.map(r => `<circle cx="${r[0].toFixed(1)}" cy="${r[1].toFixed(1)}" r="${r[2].toFixed(1)}" fill="${fill}" stroke="${ring}" stroke-width="3.5" opacity=".7"/>`).join("");
      }
      case "pinto":
        return onHead ? "" : POSE[s.pose].pinto.map(d => `<path d="${d}" fill="${WHITE}"/>`).join("");
      case "roan":
        return onHead ? "" : ROAN_DOTS.map(d => `<circle cx="${d[0].toFixed(1)}" cy="${d[1].toFixed(1)}" r="${d[2].toFixed(1)}" fill="#F2EFE8" opacity=".5"/>`).join("");
      default:
        return "";
    }
  }

  /* White face markings are thick strokes laid along the front of the face; the head
     clip trims them, so they hug the profile on every build. */
  const FACE = "M136 68 C152 82 174 110 188 140 C195 152 199 164 195 173 C192 180 186 182 180 181";
  function markingSVG(m) {
    switch (m) {
      case "star": return `<path d="M147 72 L152 81 L161 82 L154 88 L156 98 L147 92 L139 97 L141 88 L134 82 L143 81 Z" fill="${WHITE}"/>`;
      case "snip": return `<ellipse cx="193" cy="160" rx="9" ry="13" fill="${WHITE}" transform="rotate(-28 193 160)"/>`;
      case "stripe": return `<path d="M150 84 C166 100 180 120 190 142 C196 154 198 164 196 170" stroke="${WHITE}" stroke-width="14" fill="none" stroke-linecap="round"/>`;
      case "blaze": return `<path d="${FACE}" stroke="${WHITE}" stroke-width="30" fill="none" stroke-linecap="round"/>`;
      case "bald": return `<path d="${FACE}" stroke="${WHITE}" stroke-width="58" fill="none" stroke-linecap="round"/>`;
      default: return "";
    }
  }

  /* The mane is a band along the crest: `outer` sticks up above it, `inner` lies on the
     neck, and the lower edge breaks into `locks` that hang `len` long. */
  function maneBand(cr, outer, inner, locks, len, rand) {
    const N = 24;
    let d = "M" + pt(crestPt(cr, -0.03, -outer));
    for (let k = 0; k <= N; k++) d += " L" + pt(crestPt(cr, k / N * 1.04, -outer));
    if (!locks) {
      for (let k = N; k >= 0; k--) d += " L" + pt(crestPt(cr, k / N * 1.04, inner));
    } else {
      d += " L" + pt(crestPt(cr, 1.04, inner));
      for (let i = locks - 1; i >= 0; i--) {
        const ta = i / locks * 1.04 - 0.03, tb = (i + 1) / locks * 1.04 - 0.03, span = tb - ta, L = len * (0.7 + rand() * 0.6);
        // Each lock trails down along the neck and tapers, its tip past the root of the next
        const tip = crestPt(cr, tb + span * 1.1, inner + L * 0.6);
        d += ` C${pt(crestPt(cr, tb + span * 0.2, inner + L * 0.2))} ${pt(crestPt(cr, tb + span * 0.9, inner + L * 0.45))} ${pt(tip)}` +
          ` C${pt(crestPt(cr, tb + span * 0.5, inner + L * 0.6))} ${pt(crestPt(cr, ta + span * 0.6, inner + L * 0.4))} ${pt(crestPt(cr, ta, inner))}`;
      }
    }
    return d + " Z";
  }
  function strands(cr, offs, edge) {
    return offs.map(o => {
      let d = "M" + pt(crestPt(cr, 0.02, o));
      for (let k = 1; k <= 12; k++) d += " L" + pt(crestPt(cr, 0.02 + k / 12 * 0.98, o));
      return `<path d="${d}" stroke="${edge}" stroke-width="1.3" fill="none" opacity=".4"/>`;
    }).join("");
  }

  function maneSVG(s, mane) {
    const edge = shade(mane, lum(hexToRgb(mane)) > 0.5 ? -0.28 : 0.22);
    const r = mulberry32(hashString(s.mane)), cr = POSE[s.pose].crest;
    switch (s.mane) {
      case "braided": {
        let knobs = "";
        for (let t = 0.05; t < 1; t += 0.095) {
          const c = crestPt(cr, t, 6);
          knobs += `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="6.4" fill="${mane}" stroke="${edge}" stroke-width="1.4"/>` +
            `<path d="M${(c[0] - 3).toFixed(1)} ${(c[1] - 2).toFixed(1)} l6 4" stroke="${edge}" stroke-width="1.2"/>`;
        }
        return `<path d="${maneBand(cr, 2, 3, 0, 0, r)}" fill="${mane}"/>` + knobs;
      }
      case "roached":
        return `<path d="${maneBand(cr, 6, 1, 0, 0, r)}" fill="${mane}"/>` + strands(cr, [-3], edge);
      case "wild": {
        let curls = "";
        for (let t = 0; t < 1.02; t += 0.07) {
          const c = crestPt(cr, t, -4 + r() * 6);
          curls += `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(6 + r() * 5).toFixed(1)}" fill="${mane}"/>`;
        }
        return `<path d="${maneBand(cr, 5, 18, 10, 18, r)}" fill="${mane}"/>` + curls + strands(cr, [4, 10], edge);
      }
      case "long":
        return `<path d="${maneBand(cr, 6, 24, 8, 24, r)}" fill="${mane}"/>` + strands(cr, [2, 9, 17], edge);
      default: // short (pulled)
        return `<path d="${maneBand(cr, 4, 11, 14, 7, r)}" fill="${mane}"/>` + strands(cr, [3, 8], edge);
    }
  }

  function forelockSVG(s, mane) {
    const edge = shade(mane, lum(hexToRgb(mane)) > 0.5 ? -0.28 : 0.22);
    switch (s.mane) {
      case "roached": return "";
      case "wild": // a tousled tuft of pointed locks, not round blobs
        return `<path d="M104 60 C112 54 124 58 130 66 C136 70 141 78 140 88 C136 84 132 84 130 89 C128 82 124 81 121 86 C120 79 116 77 112 80 C113 72 110 66 104 60 Z" fill="${mane}"/>` +
          `<path d="M112 64 C120 66 128 74 132 82 M116 70 C120 74 122 78 123 82" stroke="${edge}" stroke-width="1.2" fill="none" opacity=".45" stroke-linecap="round"/>`;
      case "braided": // one plait of overlapping links, kept high: round dark dots by the eye read as extra eyes
        return `<g fill="${mane}" stroke="${edge}" stroke-width="1"><ellipse cx="112" cy="63" rx="5.6" ry="3.4" transform="rotate(50 112 63)"/>` +
          `<ellipse cx="117" cy="69" rx="5.2" ry="3.2" transform="rotate(50 117 69)"/><ellipse cx="122" cy="75" rx="4.8" ry="3" transform="rotate(50 122 75)"/></g>` +
          `<path d="M124 78 l3 5 l2 -1 Z" fill="${mane}"/>`;
      case "long": // falls toward the eye but stops above it
        return `<path d="M108 62 C120 61 131 69 138 80 C140 84 140 88 138 92 C135 88 132 87 129 87 C128 91 126 93 123 95 C122 86 117 74 108 62 Z" fill="${mane}"/>` +
          `<path d="M114 66 C122 72 128 80 131 88" stroke="${edge}" stroke-width="1.2" fill="none" opacity=".45"/>`;
      default:
        return `<path d="M108 62 C118 62 128 72 136 86 C132 86 128 84 126 82 C126 88 126 92 124 96 C120 86 114 74 108 62 Z" fill="${mane}"/>`;
    }
  }

  /* opts.plain: flat background (for small round avatars). opts.label: accessible name.
     Settings > Horse art > Classic swaps in the original drawings from art-classic.js. */
  // Ground colour per scene, for the grass a grazing horse has its nose in
  const GROUND = { meadow: "#7FA05A", sunset: "#8C7A44", beach: "#EBD6A3", snow: "#FFFFFF", night: "#22311D", barn: "#D8B45C", arena: "#CFAF80", studio: "#8C8478",
    forest: "#4E6B36", showring: "#D9BB85", stable: "#8A5530", rain: "#5F7A4A", livingroom: "#B5484A", lab: "#3E4A52" };
  // Flat background for round avatars
  const PLAIN = { night: "#34466A", barn: "#9A3A2A", stable: "#7A4A2A", forest: "#6E8F52", rain: "#9AA6B0", livingroom: "#E9DCC6", lab: "#E4EEF2", sunset: "#F2B48A" };
  function tufts(s) {
    const g = s.scene === "photo" ? (s.groundHex || "#8C8A7E") : (GROUND[s.scene] || GROUND.meadow);
    const m = mapPt(s.pose, MUZZLE), blade = shade(g, -0.18);
    let out = `<ellipse cx="${m[0].toFixed(1)}" cy="${(m[1] + 10).toFixed(1)}" rx="40" ry="12" fill="${g}"/>`;
    [-30, -18, -6, 6, 18, 30].forEach((dx, i) => {
      const x = m[0] + dx, y = m[1] + 6, h = 12 + (i % 3) * 5, lean = (i % 2 ? 1 : -1) * 4;
      out += `<path d="M${(x - 3).toFixed(1)} ${y.toFixed(1)} Q${(x + lean).toFixed(1)} ${(y - h).toFixed(1)} ${(x + lean * 1.5).toFixed(1)} ${(y - h - 2).toFixed(1)} Q${(x + 1).toFixed(1)} ${(y - h / 2).toFixed(1)} ${(x + 3).toFixed(1)} ${y.toFixed(1)} Z" fill="${i % 2 ? g : blade}"/>`;
    });
    return out;
  }

  function render(spec, opts) {
    const S = window.HorseSettings;
    if (S && S.get().classicArt && window.HorseArtClassic) return window.HorseArtClassic.render(spec, opts);
    opts = opts || {};
    const s = normalize(spec);
    if (opts.plain) s.pose = "side"; // round avatars are too small for anything but side-on
    const P = POSE[s.pose];
    const id = "hz" + (uid++);
    const coat = coatHex(s);
    const mane = maneHex(s);
    const dark = shade(coat, -0.4);
    const bg = opts.plain
      ? `<rect width="240" height="240" fill="${PLAIN[s.scene] || "#CFDCC4"}"/>`
      : scene(s, id);
    const acc = accessory(s, id);
    const throat = (P.throat ? `<path d="${P.throat}" stroke="#000" stroke-width="24" fill="none" opacity=".05" stroke-linecap="round"/>` +
      `<path d="${P.throat}" stroke="#000" stroke-width="12" fill="none" opacity=".06" stroke-linecap="round"/>` : "") +
      // The head's own outline, shifted away from the light and drawn under the head:
      // only the part that falls past the jaw and cheek shows
      (P.headShadow ? `<path d="${HEAD_SHAPE}" fill="#000" opacity=".13" transform="translate(${P.headShadow[0]} ${P.headShadow[1]}) ${headTransform(s.pose)}"/>` : "");

    return `<svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMax slice" role="img" aria-label="${esc(opts.label || "Horse portrait")}">` +
      bg +
      `<defs><clipPath id="${id}h"><path d="${HEAD_SHAPE}"/></clipPath>` +
        `<clipPath id="${id}n"><path d="${P.neck}"/>${P.body ? `<path d="${P.body}"/>` : ""}</clipPath>` +
        `<linearGradient id="${id}v" x1="0.9" y1="0.1" x2="0.2" y2="0.9"><stop offset="0" stop-color="#FFF" stop-opacity=".16"/><stop offset=".5" stop-color="#FFF" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>` +
      `<g transform="${buildTransform(s)}">` +
        // Body, tail and neck, in frame space
        (P.body ? `<path d="${P.body}" fill="${P.bodyShade ? shade(coat, P.bodyShade) : coat}"/>` : "") +
        (P.tail ? `<path d="${P.tail}" fill="${mane}"/>` + `<path d="M212 190 C222 204 224 226 220 246" stroke="${shade(mane, lum(hexToRgb(mane)) > 0.5 ? -0.28 : 0.22)}" stroke-width="1.3" fill="none" opacity=".4"/>` : "") +
        `<path d="${P.neck}" fill="${coat}"/>` +
        `<g clip-path="url(#${id}n)">` + patternSVG(s, coat, false) +
          `<rect x="-40" y="-40" width="320" height="320" fill="url(#${id}v)"/>` + throat + `</g>` +
        maneSVG(s, mane) +
        // The head, in head space
        `<g transform="${headTransform(s.pose)}">` +
          `<path d="${EAR_BACK}" fill="${shade(coat, -0.22)}"/>` + acc.back +
          `<path d="${HEAD_SHAPE}" fill="${coat}"/>` +
          `<g clip-path="url(#${id}h)">` +
            patternSVG(s, coat, true) + markingSVG(s.marking) +
            // Volume: light from the top right, the muzzle and jaw in shadow
            `<rect width="240" height="240" fill="url(#${id}v)"/>` +
            '<ellipse cx="184" cy="164" rx="19" ry="15" transform="rotate(40 184 164)" fill="#000" opacity=".13"/>' +
            '<path d="M128 72 C148 86 168 112 182 138" stroke="#FFF" stroke-width="7" fill="none" opacity=".1" stroke-linecap="round"/>' +
            `<path d="M116 124 C110 148 120 168 142 172" stroke="${dark}" stroke-width="2.6" fill="none" opacity=".35" stroke-linecap="round"/>` +
            `<path d="M134 116 C140 128 152 140 166 150" stroke="${dark}" stroke-width="1.8" fill="none" opacity=".22" stroke-linecap="round"/>` +
          `</g>` +
          forelockSVG(s, mane) +
          acc.under +
          `<path d="${EAR_FRONT}" fill="${coat}"/><path d="${EAR_INNER}" fill="${shade(coat, -0.32)}"/>` +
          `<path d="${EAR_FRONT}" fill="url(#${id}v)"/>` +
          // Eye: the original simple dark eye with one catchlight
          `<ellipse cx="${EYE[0]}" cy="${EYE[1]}" rx="6.5" ry="6" fill="#140E09"/><circle cx="${EYE[0] + 2}" cy="${EYE[1] - 2}" r="1.8" fill="#FFFFFF"/>` +
          // Nostril and mouth
          '<path d="M181 152 C188 148 194 154 192 162 C190 168 184 167 185 161 C186 157 184 155 181 152 Z" fill="#140E09" opacity=".55"/>' +
          '<path d="M164 181 C170 183 177 183 184 180" stroke="#140E09" stroke-width="1.8" fill="none" opacity=".4" stroke-linecap="round"/>' +
          acc.over +
        `</g>` +
        acc.frame +
        (s.pose === "graze" ? tufts(s) : "") +
      `</g>` + (opts.plain ? "" : sceneFront(s)) + `</svg>`;
  }

  // ---------- Random horses ----------
  /* o.coats / o.patterns restrict choices to what fits a breed; o.build forces a body type */
  function randomSpec(rand, o) {
    o = o || {};
    const s = {
      coat: pick(rand, o.coats || Object.keys(COATS)),
      maneHex: rand() < 0.06 ? pick(rand, MANE_COLORS.slice(1)).hex : null,
      marking: weighted(rand, { none: 4, star: 2, snip: 1, stripe: 2, blaze: 2, bald: 1 }),
      pattern: o.patterns ? pick(rand, o.patterns) : weighted(rand, { none: 12, spots: 1, dapples: 2, pinto: 2, roan: 1 }),
      mane: o.mane || weighted(rand, { short: 5, long: 3, braided: 2, roached: 1, wild: 1 }),
      build: o.build || weighted(rand, { light: 5, draft: 2, pony: 2 }),
      accessory: weighted(rand, { none: 7, halter: 3, flowers: 1, bow: 1, cowboy: 1, flymask: 1, rosette: 1, shades: 1 }),
      scene: pick(rand, Object.keys(SCENES)),
    };
    s.pose = poseFor(s, 0);
    return s;
  }
  /* The pose comes from a hash of the photo, not from `rand`: drawing an extra number would
     change every horse and secret preference dealt after it from existing deck seeds. */
  function poseFor(s, n) {
    const p = weighted(mulberry32(hashString(s.coat + s.scene + s.mane + s.accessory + s.marking + n)), { side: 6, graze: 2, back: 2 });
    return p === "graze" && INDOORS[s.scene] ? "side" : p;
  }

  /* Extra "photos" of the same horse: same body, different day out */
  function variants(spec, rand, count) {
    const out = [spec];
    const scenes = Object.keys(SCENES).filter(k => k !== spec.scene);
    for (let i = 1; i < count; i++) {
      const v = Object.assign({}, spec, {
        scene: scenes.splice(Math.floor(rand() * scenes.length), 1)[0],
        accessory: rand() < 0.5 ? weighted(rand, { none: 3, halter: 2, flowers: 1, bow: 1, cowboy: 1, flymask: 1, rosette: 1, shades: 1 }) : spec.accessory,
      });
      v.pose = poseFor(v, i);
      out.push(v);
    }
    return out;
  }

  // ---------- One horse, many photos ----------
  /* The "body" is what makes a horse that horse. Photos of the same horse share it and
     only differ in mane style, accessory and background. */
  const BODY_KEYS = ["coat", "coatHex", "maneHex", "marking", "pattern", "build"];
  function bodyOf(spec) {
    const s = normalize(spec), out = {};
    BODY_KEYS.forEach(k => { out[k] = s[k] === undefined ? null : s[k]; });
    return out;
  }
  function withBody(spec, body) {
    return body ? Object.assign({}, spec, body) : Object.assign({}, spec);
  }

  // ---------- Photo -> horse ----------
  function nearestCoat(rgb) {
    let best = "bay", bestD = Infinity;
    Object.keys(COATS).forEach(k => {
      const c = hexToRgb(COATS[k].coat);
      const d = Math.pow(c[0] - rgb[0], 2) + Math.pow(c[1] - rgb[1], 2) + Math.pow(c[2] - rgb[2], 2);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  }
  function nearestMane(rgb) {
    let best = null, bestD = Infinity;
    MANE_COLORS.slice(1, 6).forEach(m => {
      const c = hexToRgb(m.hex);
      const d = Math.pow(c[0] - rgb[0], 2) + Math.pow(c[1] - rgb[1], 2) + Math.pow(c[2] - rgb[2], 2);
      if (d < bestD) { bestD = d; best = m.hex; }
    });
    return best;
  }
  function avg(px) {
    const s = [0, 0, 0];
    px.forEach(p => { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; });
    return s.map(v => v / Math.max(1, px.length));
  }

  /* Reads an uploaded image and returns a horse spec built from its colours.
     The original image is never stored; only the horse survives.
     With `body`, the photo keeps that horse and only borrows the background colours,
     plus a mane style and accessory picked from the image. */
  function horsify(file, body) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || "")) { reject(new Error("not-image")); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const size = 24;
          const c = document.createElement("canvas");
          c.width = c.height = size;
          const ctx = c.getContext("2d");
          ctx.drawImage(img, 0, 0, size, size);
          const d = ctx.getImageData(0, 0, size, size).data;
          URL.revokeObjectURL(url);

          const px = [];
          let h = 2166136261;
          for (let i = 0; i < d.length; i += 4) {
            px.push([d[i], d[i + 1], d[i + 2]]);
            h = Math.imul(h ^ (d[i] + d[i + 1] * 3 + d[i + 2] * 7), 16777619);
          }
          px.sort((a, b) => lum(a) - lum(b));
          const q = Math.floor(px.length / 4);
          const dark = avg(px.slice(0, q)), mid = avg(px.slice(q, 3 * q)), light = avg(px.slice(3 * q));

          const spec = randomSpec(mulberry32(h >>> 0));
          spec.coat = nearestCoat(mid);
          spec.maneHex = nearestMane(dark);
          spec.scene = "photo";
          spec.skyHex = [rgbToHex(mix(light, [255, 255, 255], 0.15)), rgbToHex(mix(light, mid, 0.45))];
          spec.groundHex = rgbToHex(mix(mid, dark, 0.55));
          spec.fromPhoto = true;
          resolve(withBody(spec, body));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  window.HorseArt = {
    COATS, MANE_COLORS, MARKINGS, PATTERNS, MANES, BUILDS, ACCESSORIES, SCENES, POSES,
    render, randomSpec, variants, horsify, normalize, bodyOf, withBody,
    mulberry32, hashString, pick, weighted, esc, shade, lum, hexToRgb,
  };
})();
