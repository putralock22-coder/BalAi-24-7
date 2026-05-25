const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tour_packages.json')));

// Kata yang menandakan bukan paket tour
const JUNK_KEYWORDS = [
  'about us', 'contact', 'home', 'login', 'register', 'sign in', 'privacy',
  'cookie', 'terms', 'flexible itinerary', 'english speaking', 'local recommendations',
  'comfortable private', 'google', 'facebook', 'instagram', 'whatsapp', 'trip advisor'
];

// Nama orang (dari review) — panjang <20 karakter & tidak ada kata "tour/bali/paket"
function isPersonName(title) {
  const words = title.trim().split(/\s+/);
  if (words.length <= 3 && !/(tour|bali|paket|trip|day|night|package|ubud|nusa|temple)/i.test(title)) return true;
  return false;
}

function isTourPackage(p) {
  const t = p.title?.toLowerCase() || '';
  if (t.length < 8) return false;
  if (isPersonName(p.title)) return false;
  if (JUNK_KEYWORDS.some(k => t.includes(k))) return false;
  // Harus punya kata terkait tour
  if (!/(tour|bali|paket|trip|day|night|package|ubud|nusa|temple|beach|waterfall|volcano|sunset|safari|snorkel|dive|rafting|trekking|temple|kintamani|uluwatu|tanah lot|seminyak)/i.test(t)) return false;
  return true;
}

const clean = raw.filter(isTourPackage);

console.log(`🧹 Cleaning: ${raw.length} → ${clean.length} paket valid\n`);

clean.forEach((p, i) => {
  console.log(`${i + 1}. [${p.source}] ${p.title}`);
  if (p.price) console.log(`   💰 ${p.price}`);
});

// Simpan data bersih
fs.writeFileSync(
  path.join(__dirname, '..', 'data', 'tour_packages_clean.json'),
  JSON.stringify(clean, null, 2)
);

// Generate knowledge text untuk sistem prompt BalAI
let knowledge = `\n\n${'═'.repeat(60)}\nDATA PAKET TOUR TAMBAHAN (dari riset kompetitor)\n${'═'.repeat(60)}\n\n`;

const bySource = clean.reduce((a, p) => { (a[p.source] = a[p.source] || []).push(p); return a; }, {});

for (const [src, pkgs] of Object.entries(bySource)) {
  knowledge += `\n▌ ${src.toUpperCase()}\n`;
  pkgs.forEach((p, i) => {
    knowledge += `${i + 1}. ${p.title}\n`;
    if (p.price)       knowledge += `   Harga: ${p.price}\n`;
    if (p.description) knowledge += `   Info: ${p.description.substring(0, 120)}\n`;
    if (p.link)        knowledge += `   Ref: ${p.link}\n`;
    knowledge += '\n';
  });
}

fs.writeFileSync(path.join(__dirname, '..', 'data', 'competitor_knowledge.txt'), knowledge);

console.log(`\n✅ Tersimpan:`);
console.log(`   data/tour_packages_clean.json  (${clean.length} paket)`);
console.log(`   data/competitor_knowledge.txt  (siap dipakai BalAI)`);
