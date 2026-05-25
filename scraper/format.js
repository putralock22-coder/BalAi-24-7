const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'tour_packages.json');
const outPath  = path.join(__dirname, '..', 'data', 'balai_knowledge.txt');

if (!fs.existsSync(dataPath)) {
  console.error('❌ Jalankan dulu: node scraper/scrape.js');
  process.exit(1);
}

const packages = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
console.log(`📦 Memformat ${packages.length} paket tour...\n`);

const bySource = packages.reduce((acc, p) => {
  const src = p.source || 'Unknown';
  if (!acc[src]) acc[src] = [];
  acc[src].push(p);
  return acc;
}, {});

let output = `KATALOG PAKET TOUR BALI — DATA DARI BERBAGAI PLATFORM
Diperbarui: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
Total Paket: ${packages.length}
${'═'.repeat(60)}\n\n`;

for (const [source, pkgs] of Object.entries(bySource)) {
  output += `\n▌ SUMBER: ${source.toUpperCase()} (${pkgs.length} paket)\n`;
  output += '─'.repeat(50) + '\n\n';

  pkgs.forEach((p, i) => {
    output += `${i + 1}. ${p.title || 'Paket Tour Bali'}\n`;
    if (p.price)       output += `   💰 Harga    : ${p.price}\n`;
    if (p.duration)    output += `   ⏱ Durasi   : ${p.duration}\n`;
    if (p.rating)      output += `   ⭐ Rating   : ${p.rating}\n`;
    if (p.description) output += `   📝 Deskripsi: ${p.description.substring(0, 150)}...\n`;
    if (p.link)        output += `   🔗 Link     : ${p.link}\n`;
    output += '\n';
  });
}

fs.writeFileSync(outPath, output, 'utf-8');

console.log('✅ Knowledge base berhasil dibuat!');
console.log(`📁 File: data/balai_knowledge.txt`);
console.log(`📊 Total: ${packages.length} paket dari ${Object.keys(bySource).length} sumber\n`);

// Tampilkan preview
console.log('─── PREVIEW (50 baris pertama) ───');
console.log(output.split('\n').slice(0, 50).join('\n'));
