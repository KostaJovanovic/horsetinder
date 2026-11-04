/* The original horse portraits, kept as-is for Settings > Appearance > Horse art: Classic.
   Same spec objects as art.js; art.js hands render() over to this file when Classic is on.
   Plain ES2017 for the Sunmi V2 (Chrome 62). Load after art.js. */
(function () {
  "use strict";
  const A = window.HorseArt;
  const COATS = A.COATS, mulberry32 = A.mulberry32, shade = A.shade, lum = A.lum, hexToRgb = A.hexToRgb, esc = A.esc;

  // ---------- Geometry (viewBox 240 x 240, horse faces right) ----------
  const HEAD = "M40 240 C45 190 55 150 75 115 C80 100 85 85 92 72 L86 38 L104 63 L112 34 L119 68 C140 78 165 105 190 140 C202 156 204 172 192 180 C180 188 162 184 150 176 C138 168 128 162 122 168 C116 190 140 215 150 240 Z";

  const BUILD_T = {
    light: "",
    draft: "translate(-10 -6) scale(1.1 1.03)",
    pony: "translate(14 34) scale(0.9 0.86)",
  };

  const MANE_BACK = {
    short: "M92 72 C70 100 50 150 40 240 L22 240 C30 170 52 108 88 62 Z",
    long: "M94 70 C66 100 44 150 38 240 L2 240 C8 200 20 170 26 150 C18 160 14 172 10 180 C20 140 44 96 86 58 Z",
    roached: "M92 72 C72 100 54 150 46 240 L36 240 C44 160 62 106 88 64 Z",
  };
  const FORELOCK = {
    short: "M104 63 C110 80 118 90 130 94 C120 82 117 74 119 68 Z",
    long: "M102 62 C102 86 112 104 132 114 C124 96 120 82 120 68 Z",
    braided: "M106 64 C110 74 114 80 120 82 C116 76 116 70 118 67 Z",
  };
  const BRAIDS = [[84, 78], [74, 96], [65, 116], [57, 138], [50, 160], [45, 184], [41, 208], [38, 230]];
  const CURLS = [[82, 72], [70, 92], [60, 114], [52, 138], [46, 162], [40, 188], [36, 214], [32, 236]];

  const MARK_PATHS = {
    star: '<ellipse cx="136" cy="82" rx="8" ry="5.5" transform="rotate(40 136 82)"/>',
    snip: '<ellipse cx="195" cy="160" rx="6" ry="10" transform="rotate(-30 195 160)"/>',
    stripe: '<path d="M126 76 C150 98 172 126 190 158 L185 163 C167 131 145 105 121 82 Z"/>',
    blaze: '<path d="M124 80 C150 100 175 130 193 164 L184 174 C165 142 140 112 118 88 Z"/>',
    bald: '<path d="M116 70 C150 92 182 124 204 162 L186 188 C160 152 134 120 106 94 Z"/>',
  };

  // Stable pseudo-random dots, generated once
  const ROAN_DOTS = (function () {
    const r = mulberry32(7), out = [];
    for (let y = 40; y < 240; y += 8) for (let x = 20; x < 210; x += 8) out.push([x + r() * 6, y + r() * 6, 1 + r() * 1.3]);
    return out;
  })();
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
  function scene(s, id) {
    switch (s.scene) {
      case "sunset":
        return grad(id, "#F09A6B", "#F8D9A4") +
          '<circle cx="182" cy="150" r="36" fill="#FFE7B0" opacity=".85"/>' +
          '<path d="M0 196 C70 178 140 192 240 176 L240 240 L0 240 Z" fill="#8C7A44"/>';
      case "beach":
        return grad(id, "#8FCBE3", "#E3F3F5") +
          '<rect y="166" width="240" height="26" fill="#4FA3C4"/>' +
          '<path d="M0 172 q15 -4 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke="#E8F6FA" stroke-width="2" fill="none"/>' +
          '<path d="M0 192 C80 182 160 196 240 186 L240 240 L0 240 Z" fill="#EBD6A3"/>';
      case "snow":
        return grad(id, "#BFCEDC", "#EDF1F5") +
          FLAKES.map(f => `<circle cx="${f[0].toFixed(1)}" cy="${f[1].toFixed(1)}" r="${f[2].toFixed(1)}" fill="#FFFFFF" opacity=".9"/>`).join("") +
          '<path d="M0 196 C70 184 150 198 240 182 L240 240 L0 240 Z" fill="#FFFFFF"/>';
      case "night":
        return grad(id, "#16203A", "#34466A") +
          STARS.map(f => `<circle cx="${f[0].toFixed(1)}" cy="${f[1].toFixed(1)}" r="${f[2].toFixed(1)}" fill="#F4EBCB"/>`).join("") +
          '<circle cx="196" cy="46" r="16" fill="#F4EBCB"/><circle cx="204" cy="40" r="14" fill="#17213C"/>' +
          '<path d="M0 200 C70 188 150 198 240 186 L240 240 L0 240 Z" fill="#22311D"/>';
      case "barn": {
        let planks = "";
        for (let x = 12; x < 240; x += 24) planks += `<path d="M${x} 0 V204" stroke="#7E2E21" stroke-width="2"/>`;
        return '<rect width="240" height="240" fill="#9A3A2A"/>' + planks +
          '<path d="M150 20 H230 V110 H150 Z M150 20 L230 110 M230 20 L150 110" stroke="#F1E6D2" stroke-width="5" fill="none"/>' +
          '<rect y="200" width="240" height="40" fill="#D8B45C"/>' +
          '<path d="M10 206 l14 -4 M60 214 l18 3 M120 208 l12 -5 M180 216 l16 2 M210 206 l10 -3" stroke="#B8923A" stroke-width="2"/>';
      }
      case "arena": {
        let posts = "";
        for (let x = 10; x < 240; x += 46) posts += `<rect x="${x}" y="146" width="7" height="46" fill="#FFFFFF"/>`;
        return grad(id, "#B9D8EC", "#E8F0F2") +
          '<path d="M0 132 C80 124 170 130 240 122 L240 190 L0 190 Z" fill="#8BAA6A"/>' + posts +
          '<path d="M0 156 H240 M0 174 H240" stroke="#FFFFFF" stroke-width="5"/>' +
          '<rect y="188" width="240" height="52" fill="#CFAF80"/>';
      }
      case "studio":
        return `<defs><radialGradient id="${id}r" cx=".55" cy=".4" r=".8"><stop offset="0" stop-color="#E6DED4"/><stop offset="1" stop-color="#A39A90"/></radialGradient></defs><rect width="240" height="240" fill="url(#${id}r)"/>`;
      case "photo": {
        const sky = s.skyHex || ["#D6D2CC", "#EDEAE4"];
        return grad(id, sky[0], sky[1]) +
          `<circle cx="196" cy="54" r="26" fill="${sky[0]}" opacity=".6"/>` +
          `<path d="M0 198 C70 182 150 196 240 180 L240 240 L0 240 Z" fill="${s.groundHex || "#8C8A7E"}"/>`;
      }
      default: // meadow
        return grad(id, "#BFD9EA", "#E8F1E0") +
          '<circle cx="200" cy="48" r="20" fill="#FFF6DA" opacity=".85"/>' +
          '<path d="M0 200 C60 185 130 195 240 180 L240 240 L0 240 Z" fill="#7FA05A"/>';
    }
  }

  // ---------- Accessories ----------
  function flower(x, y, c) {
    return `<g transform="translate(${x} ${y})"><circle cx="0" cy="-4" r="3.6" fill="${c}"/><circle cx="4" cy="0" r="3.6" fill="${c}"/><circle cx="0" cy="4" r="3.6" fill="${c}"/><circle cx="-4" cy="0" r="3.6" fill="${c}"/><circle r="2.4" fill="#F4C542"/></g>`;
  }
  function accessory(s, id) {
    switch (s.accessory) {
      case "halter":
        return '<g fill="none" stroke="#B8322A" stroke-width="5" stroke-linecap="round"><path d="M152 146 L198 152"/><path d="M152 146 L116 72"/><path d="M152 146 C144 158 136 166 126 170"/></g>' +
          '<circle cx="152" cy="146" r="5" fill="none" stroke="#D2B86A" stroke-width="3"/>' +
          '<path d="M146 170 C140 196 160 214 152 240" stroke="#8C6A3C" stroke-width="5" fill="none"/>';
      case "flowers":
        return '<ellipse cx="90" cy="66" rx="6" ry="3" fill="#5E8F48" transform="rotate(-30 90 66)"/><ellipse cx="124" cy="68" rx="6" ry="3" fill="#5E8F48" transform="rotate(30 124 68)"/>' +
          flower(82, 60, "#F28DB2") + flower(95, 55, "#FFFFFF") + flower(108, 55, "#F6C945") + flower(120, 61, "#F28DB2") + flower(130, 70, "#B9A3F0");
      case "bow":
        return '<path d="M116 70 L99 59 L101 81 Z M116 70 L133 61 L129 83 Z" fill="#E6528A"/>' +
          '<path d="M114 72 L108 92 M118 72 L124 91" stroke="#E6528A" stroke-width="4" stroke-linecap="round"/>' +
          '<circle cx="116" cy="70" r="4.6" fill="#C23C6E"/>';
      case "cowboy":
        return '<g transform="rotate(-10 104 50)"><path d="M80 52 C79 30 88 20 104 20 C120 20 129 30 128 50 Z" fill="#8A5A2E"/>' +
          '<path d="M96 22 C100 30 108 30 112 22" stroke="#6E4524" stroke-width="3" fill="none"/>' +
          '<path d="M80 44 C94 48 114 48 128 42 L128 50 C114 56 94 56 80 52 Z" fill="#3A2515"/>' +
          '<ellipse cx="104" cy="54" rx="46" ry="9" fill="#6E4524"/></g>';
      case "flymask":
        return `<defs><pattern id="${id}m" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0 L4 4 M4 0 L0 4" stroke="#6C7A80" stroke-width=".6"/></pattern></defs>` +
          '<path d="M84 34 L106 64 L90 72 Z M112 30 L122 68 L102 64 Z" fill="#D6DEE2" stroke="#6C7A80" stroke-width="1.5"/>' +
          '<path d="M94 68 C124 70 160 100 180 132 C170 142 160 146 150 142 C136 128 116 124 102 118 C94 104 92 86 94 68 Z" fill="#D6DEE2" opacity=".82" stroke="#6C7A80" stroke-width="1.5"/>' +
          `<path d="M94 68 C124 70 160 100 180 132 C170 142 160 146 150 142 C136 128 116 124 102 118 C94 104 92 86 94 68 Z" fill="url(#${id}m)"/>`;
      case "rosette":
        return '<path d="M112 120 L104 152 L112 146 L116 156 L120 124 Z M122 120 L124 154 L130 146 L137 152 L128 120 Z" fill="#2F5DA8"/>' +
          '<circle cx="118" cy="116" r="14" fill="#2F5DA8"/><circle cx="118" cy="116" r="9.5" fill="#F4F1E6"/><circle cx="118" cy="116" r="6" fill="#2F5DA8"/>';
      case "shades":
        return '<path d="M108 90 L128 96" stroke="#111" stroke-width="3"/><path d="M152 98 L160 102" stroke="#111" stroke-width="3"/>' +
          '<ellipse cx="140" cy="100" rx="15" ry="10" fill="#15161A"/><path d="M131 96 L140 94" stroke="#FFFFFF" stroke-width="2" opacity=".6" stroke-linecap="round"/>';
      default:
        return "";
    }
  }

  // ---------- Portrait ----------
  function patternSVG(s, coat) {
    const light = lum(hexToRgb(coat)) > 0.55;
    switch (s.pattern) {
      case "spots": {
        const c = light ? "#3A2A1E" : "#F4EFE4";
        const dots = [[70, 190, 7], [95, 150, 5], [60, 225, 6], [110, 205, 8], [132, 225, 5], [88, 120, 4], [150, 150, 4], [120, 130, 3], [165, 165, 3.5], [80, 160, 4], [140, 195, 5]];
        return dots.map(d => `<circle cx="${d[0]}" cy="${d[1]}" r="${d[2]}" fill="${c}"/>`).join("");
      }
      case "dapples": {
        const c = shade(coat, light ? -0.22 : 0.25);
        const rings = [[75, 200], [105, 180], [60, 160], [130, 215], [95, 225], [115, 145], [80, 132], [140, 180]];
        return rings.map(r => `<circle cx="${r[0]}" cy="${r[1]}" r="9" fill="none" stroke="${c}" stroke-width="3" opacity=".65"/>`).join("");
      }
      case "pinto":
        return '<path d="M20 240 C34 200 80 186 108 208 C126 224 146 222 160 240 Z" fill="#F7F3EA"/>' +
          '<path d="M96 120 C112 110 132 124 128 142 C124 158 102 160 94 146 C88 136 88 126 96 120 Z" fill="#F7F3EA"/>';
      case "roan":
        return ROAN_DOTS.map(d => `<circle cx="${d[0].toFixed(1)}" cy="${d[1].toFixed(1)}" r="${d[2].toFixed(1)}" fill="#F2EFE8" opacity=".45"/>`).join("");
      default:
        return "";
    }
  }

  function maneSVG(s, mane) {
    const edge = shade(mane, lum(hexToRgb(mane)) > 0.5 ? -0.25 : 0.2);
    if (s.mane === "braided") {
      return `<path d="${MANE_BACK.roached}" fill="${mane}"/>` +
        BRAIDS.map(b => `<circle cx="${b[0]}" cy="${b[1]}" r="6.5" fill="${mane}" stroke="${edge}" stroke-width="1.5"/>`).join("");
    }
    if (s.mane === "wild") {
      return `<path d="${MANE_BACK.short}" fill="${mane}"/>` +
        CURLS.map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="10" fill="${mane}"/>`).join("");
    }
    return `<path d="${MANE_BACK[s.mane] || MANE_BACK.short}" fill="${mane}"/>`;
  }

  function forelockSVG(s, mane) {
    if (s.mane === "roached") return "";
    if (s.mane === "wild") {
      return `<circle cx="110" cy="66" r="9" fill="${mane}"/><circle cx="121" cy="78" r="7" fill="${mane}"/><circle cx="104" cy="77" r="7" fill="${mane}"/>`;
    }
    return `<path d="${FORELOCK[s.mane] || FORELOCK.short}" fill="${mane}"/>`;
  }

  /* opts.plain: flat background (for small round avatars). opts.label: accessible name. */
  function render(spec, opts) {
    opts = opts || {};
    const s = A.normalize(spec);
    const id = "hc" + (uid++);
    const coat = s.coatHex || COATS[s.coat].coat;
    const mane = s.maneHex || COATS[s.coat].mane;
    const bg = opts.plain
      ? `<rect width="240" height="240" fill="${s.scene === "night" ? "#34466A" : s.scene === "barn" ? "#9A3A2A" : "#CFDCC4"}"/>`
      : scene(s, id);

    const marking = MARK_PATHS[s.marking] ? `<g fill="#F7F3EA">${MARK_PATHS[s.marking]}</g>` : "";

    return `<svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMax slice" role="img" aria-label="${esc(opts.label || "Horse portrait")}">` +
      bg +
      `<g transform="${BUILD_T[s.build] || ""}">` +
        `<clipPath id="${id}c"><path d="${HEAD}"/></clipPath>` +
        maneSVG(s, mane) +
        `<path d="${HEAD}" fill="${coat}"/>` +
        `<g clip-path="url(#${id}c)">` +
          patternSVG(s, coat) + marking +
          '<ellipse cx="128" cy="150" rx="30" ry="22" fill="#000" opacity=".08"/>' +
          '<path d="M40 240 C45 190 55 150 75 115 L90 120 C80 160 70 200 64 240 Z" fill="#000" opacity=".07"/>' +
        `</g>` +
        '<path d="M92 60 L88 45 L100 60 Z M113 62 L113 42 L117 64 Z" fill="#000" opacity=".22"/>' +
        forelockSVG(s, mane) +
        '<ellipse cx="138" cy="100" rx="6.5" ry="6" fill="#140E09"/><circle cx="140" cy="98" r="1.8" fill="#FFFFFF"/>' +
        '<ellipse cx="188" cy="166" rx="4.5" ry="3" transform="rotate(40 188 166)" fill="#140E09" opacity=".7"/>' +
        '<path d="M160 178 C168 182 178 183 186 180" stroke="#140E09" stroke-width="2" fill="none" opacity=".4" stroke-linecap="round"/>' +
        accessory(s, id) +
      `</g></svg>`;
  }

  window.HorseArtClassic = { render };
})();
