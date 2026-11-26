// Generates the original Heavy Metal "Hellfire Stage" SVG art (flames, crest, amp stack).
// Original vector art only. Run: node scripts/gen-hellfire-art.mjs
import { writeFileSync } from 'node:fs';

const OUT = new URL('../src/skins/polished/assets/', import.meta.url);
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const f = (n) => Math.round(n * 10) / 10;

/** One flame layer: tongues along the base, each a leaning teardrop. */
function tongues(W, H, count, minH, maxH, wMin, wMax) {
  let d = '';
  let x = -wMin;
  while (x < W + wMin) {
    const w = wMin + rnd() * (wMax - wMin);
    const h = minH + rnd() * (maxH - minH);
    const lean = (rnd() - 0.5) * w * 0.9;
    const tipX = x + w / 2 + lean;
    const tipY = H - h;
    d += `M${f(x)},${H + 4} C${f(x + w * 0.05)},${f(H - h * 0.35)} ${f(tipX - w * 0.28)},${f(H - h * 0.62)} ${f(tipX)},${f(tipY)} C${f(tipX + w * 0.1)},${f(H - h * 0.5)} ${f(x + w * 0.98)},${f(H - h * 0.28)} ${f(x + w)},${H + 4}Z`;
    x += w * (0.45 + rnd() * 0.25);
  }
  return d;
}

function flames() {
  const W = 1600;
  const H = 320;
  seed = 20261126;
  const back = tongues(W, H, 0, 150, 300, 90, 170);
  const mid = tongues(W, H, 0, 100, 220, 70, 130);
  const front = tongues(W, H, 0, 50, 130, 50, 100);
  const core = tongues(W, H, 0, 24, 70, 40, 80);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
<defs>
<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0503" stop-opacity="0"/><stop offset=".35" stop-color="#8c0f06"/><stop offset="1" stop-color="#d9220a"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9220a" stop-opacity=".2"/><stop offset=".4" stop-color="#ff5a0a"/><stop offset="1" stop-color="#ff8a1a"/></linearGradient>
<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a1a" stop-opacity=".3"/><stop offset=".45" stop-color="#ffb81f"/><stop offset="1" stop-color="#ffd84a"/></linearGradient>
<linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".2"/><stop offset="1" stop-color="#fff6d8"/></linearGradient>
</defs>
<path d="${back}" fill="url(#a)"/>
<path d="${mid}" fill="url(#b)"/>
<path d="${front}" fill="url(#c)"/>
<path d="${core}" fill="url(#d)"/>
</svg>
`;
}

function crest() {
  // 400 x 200, drawn as the left half and mirrored.
  const half = `
<path d="M178,62 C132,14 52,18 30,78 C18,114 44,150 82,146 C60,130 58,104 80,88 C104,70 146,80 176,106Z" fill="url(#iron)" stroke="#050506" stroke-width="3" stroke-linejoin="round"/>
<path d="M170,66 C130,26 62,30 44,80 C36,106 50,128 70,134" fill="none" stroke="url(#rim)" stroke-width="3" stroke-linecap="round"/>
<path d="M176,116 L52,150 L66,160 L180,134Z M176,138 L74,176 L90,184 L182,154Z M178,158 L104,196 L124,200 L184,172Z" fill="url(#iron)" stroke="#050506" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M170,118 L60,148 M172,140 L80,174 M174,160 L108,194" stroke="url(#rim)" stroke-width="1.8" fill="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
<defs>
<linearGradient id="iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4d55"/><stop offset=".45" stop-color="#16171b"/><stop offset=".55" stop-color="#2c2e34"/><stop offset="1" stop-color="#08080a"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset=".5" stop-color="#ff6a14"/><stop offset="1" stop-color="#b3140a"/></linearGradient>
<radialGradient id="gem" cx=".5" cy=".62" r=".6"><stop offset="0" stop-color="#fff2b0"/><stop offset=".3" stop-color="#ffb21f"/><stop offset=".7" stop-color="#e2370c"/><stop offset="1" stop-color="#5a0704"/></radialGradient>
<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff6a14" stop-opacity=".55"/><stop offset="1" stop-color="#ff6a14" stop-opacity="0"/></radialGradient>
</defs>
<ellipse cx="200" cy="108" rx="150" ry="80" fill="url(#halo)"/>
<g>${half}</g>
<g transform="translate(400,0) scale(-1,1)">${half}</g>
<path d="M200,26 L246,92 L200,182 L154,92Z" fill="url(#iron)" stroke="#050506" stroke-width="4" stroke-linejoin="round"/>
<path d="M200,32 L240,92 L200,174 L160,92Z" fill="none" stroke="url(#rim)" stroke-width="3" stroke-linejoin="round"/>
<path d="M200,64 C190,84 176,92 178,112 C180,134 196,146 200,152 C204,146 220,134 222,112 C224,92 210,84 200,64Z" fill="url(#gem)" stroke="#050506" stroke-width="2.5"/>
<path d="M200,92 C196,104 190,110 192,122 C194,132 199,136 200,138 C201,136 206,132 208,122 C210,110 204,104 200,92Z" fill="#fff4c8" opacity=".9"/>
<circle cx="200" cy="40" r="4" fill="#ffd27a"/>
</svg>
`;
}

function amp() {
  // One stack: head on top, two 4x12 cabinets below. No brand marks.
  const W = 220;
  const H = 520;
  let grille = '';
  const cab = (y) => {
    let s = `<rect x="10" y="${y}" width="200" height="195" rx="6" fill="#0c0c0e" stroke="#2f3238" stroke-width="3"/>
<rect x="20" y="${y + 10}" width="180" height="175" rx="3" fill="url(#grille)" stroke="#050506" stroke-width="2"/>`;
    for (const [cx, cy] of [[65, 52], [155, 52], [65, 143], [155, 143]]) {
      s += `<circle cx="${cx}" cy="${y + cy}" r="38" fill="#050506" opacity=".55" stroke="#4a4d55" stroke-width="2"/><circle cx="${cx}" cy="${y + cy}" r="10" fill="#1a1b1f" stroke="#5a5e66"/>`;
    }
    return s;
  };
  grille = cab(120) + cab(322);
  let knobs = '';
  for (let i = 0; i < 6; i++) knobs += `<circle cx="${34 + i * 30}" cy="62" r="9" fill="url(#knob)" stroke="#050506" stroke-width="1.5"/><rect x="${33 + i * 30}" y="54" width="2" height="8" fill="#ffb21f"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<defs>
<pattern id="grille" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#141418"/><path d="M0,0 H9 M0,0 V9" stroke="#2a2c32" stroke-width="2"/></pattern>
<radialGradient id="knob" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d8dbe0"/><stop offset=".5" stop-color="#5a5e66"/><stop offset="1" stop-color="#0b0b0d"/></radialGradient>
<linearGradient id="rimL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff6a14" stop-opacity=".9"/><stop offset=".08" stop-color="#ff6a14" stop-opacity="0"/></linearGradient>
</defs>
<rect x="10" y="8" width="200" height="106" rx="8" fill="#101114" stroke="#2f3238" stroke-width="3"/>
<rect x="18" y="16" width="184" height="90" rx="4" fill="#0a0a0c" stroke="#3b3e45"/>
<rect x="18" y="16" width="184" height="12" fill="#17181c"/>
${knobs}
<circle cx="190" cy="62" r="5" fill="#ff3b1a"/><circle cx="190" cy="62" r="9" fill="#ff3b1a" opacity=".25"/>
<rect x="30" y="84" width="150" height="8" rx="2" fill="#1a1b1f"/>
${grille}
<rect x="6" y="8" width="26" height="500" fill="url(#rimL)"/>
</svg>
`;
}

writeFileSync(new URL('hellfire-flames.svg', OUT), flames());
writeFileSync(new URL('hellfire-crest.svg', OUT), crest());
writeFileSync(new URL('hellfire-amp.svg', OUT), amp());
console.log('wrote hellfire-flames.svg, hellfire-crest.svg, hellfire-amp.svg');
