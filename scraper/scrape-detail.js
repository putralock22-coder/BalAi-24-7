const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function cleanText(s) { return s ? s.replace(/\s+/g, ' ').trim() : ''; }

const results = [];

// ── Subpages dari Bali Full Day Tour ─────────────────────────────────────
const BFD_PAGES = [
  { url: 'https://www.balifulldaytour.com/bali-half-day-tours.php',   cat: 'Half Day' },
  { url: 'https://www.balifulldaytour.com/bali-full-day-tours.php',   cat: 'Full Day' },
  { url: 'https://www.balifulldaytour.com/bali-tour-packages.php',    cat: 'Package' },
  { url: 'https://www.balifulldaytour.com/bali-honeymoon-packages.php', cat: 'Honeymoon' },
  { url: 'https://www.balifulldaytour.com/bali-combination-tours.php', cat: 'Combination' },
];

// ── Subpages dari Private Bali Tours ─────────────────────────────────────
const PBT_PAGES = [
  'https://privatebalitours.com/ubud-waterfalls-and-rice-terrace-tour/',
  'https://privatebalitours.com/south-bali-beach-and-uluwatu-temple-tour/',
  'https://privatebalitours.com/tanah-lot-and-unesco-heritage-tour/',
  'https://privatebalitours.com/bali-instagram-tour-to-gate-of-heaven/',
  'https://privatebalitours.com/north-bali-instagram-and-nature-tour/',
  'https://privatebalitours.com/ubud-monkey-forest-and-rice-terrace-tour/',
];

async function scrapeBFDPage(url, category) {
  const res = await axios.get(url, { headers, timeout: 15000 });
  const $ = cheerio.load(res.data);

  // Cari tabel/list harga di halaman
  const priceText = $('body').text().match(/IDR[\s\d,.]+(per person|pax|orang)?|USD[\s\d,.]+/gi) || [];

  // Cari nama-nama tour
  $('h2, h3, h4, .tour-title, .tour-name, strong').each((_, el) => {
    const title = cleanText($(el).text());
    if (title.length < 8 || title.length > 100) return;
    if (!/(tour|trip|package|bali|ubud|nusa|temple|beach|volcano|sunset|waterfall)/i.test(title)) return;

    // Cari harga terdekat
    const parent = $(el).closest('div, tr, li, article');
    const price = parent.find('[class*="price"], .price, ins, strong').not(el).first().text() ||
                  parent.text().match(/IDR[\s\d,.]+|USD[\s\d,.]+/i)?.[0];

    const desc = parent.find('p').first().text().substring(0, 200);

    results.push({
      source: 'Bali Full Day Tour',
      category,
      title: cleanText(title),
      price: price ? cleanText(price.toString()).substring(0, 60) : null,
      description: cleanText(desc),
      link: url
    });
  });

  // Juga ambil dari teks harga yang terdeteksi
  if (priceText.length > 0) {
    const pageTitle = cleanText($('h1').first().text()) || category + ' Bali Tour';
    if (!results.find(r => r.link === url && r.price)) {
      results.push({
        source: 'Bali Full Day Tour',
        category,
        title: pageTitle,
        price: priceText[0],
        description: cleanText($('p').first().text()).substring(0, 200),
        link: url
      });
    }
  }
}

async function scrapePBTPage(url) {
  const res = await axios.get(url, { headers, timeout: 15000 });
  const $ = cheerio.load(res.data);

  const title = cleanText($('h1').first().text());
  const price = $('[class*="price"], .price, .tour-price').first().text() ||
                $('body').text().match(/(?:Start From|from|price)[:\s]*USD[\s\d,.]+/i)?.[0] ||
                $('body').text().match(/USD[\s\d,.]+/i)?.[0];

  const duration = $('[class*="duration"], .duration').first().text() ||
                   $('body').text().match(/\d+\s*(hours?|days?|nights?)/i)?.[0];

  // Ambil highlights/inclusions
  const includes = [];
  $('li, .include-item').each((_, el) => {
    const t = cleanText($(el).text());
    if (t.length > 5 && t.length < 80 && /(pickup|hotel|ticket|lunch|driver|guide|mineral|insurance|snack)/i.test(t)) {
      includes.push(t);
    }
  });

  // Ambil itinerary
  const itinerary = [];
  $('li, p').each((_, el) => {
    const t = cleanText($(el).text());
    if (/(temple|beach|waterfall|rice|volcano|market|forest|village|ubud|tanah|nusa|uluwatu|kintamani)/i.test(t) && t.length < 150) {
      itinerary.push(t);
    }
  });

  results.push({
    source: 'Private Bali Tours',
    category: 'Private Day Tour',
    title,
    price: price ? cleanText(price.toString()).substring(0, 60) : 'Contact for price',
    duration: duration ? cleanText(duration.toString()) : null,
    includes: includes.slice(0, 5),
    itinerary: itinerary.slice(0, 6),
    link: url
  });
}

async function main() {
  console.log('🔍 Deep Scraper — Individual Tour Pages\n');

  console.log('📄 Bali Full Day Tour subpages...');
  for (const page of BFD_PAGES) {
    try {
      await scrapeBFDPage(page.url, page.cat);
      console.log(`   ✓ ${page.cat}: ${results.filter(r => r.link === page.url).length} items`);
      await sleep(1500);
    } catch (e) {
      console.log(`   ✗ ${page.cat}: ${e.message.substring(0, 50)}`);
    }
  }

  console.log('\n📄 Private Bali Tours detail pages...');
  for (const url of PBT_PAGES) {
    try {
      const before = results.length;
      await scrapePBTPage(url);
      const name = url.split('/').filter(Boolean).pop().replace(/-/g, ' ');
      console.log(`   ✓ ${name}: ${results.length - before} paket`);
      await sleep(1500);
    } catch (e) {
      console.log(`   ✗ ${url.split('/').pop()}: ${e.message.substring(0, 50)}`);
    }
  }

  // Merge dengan data sebelumnya
  const prevPath = path.join(__dirname, '..', 'data', 'tour_packages_clean.json');
  const prev = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath)) : [];
  const merged = [...prev, ...results];

  const outDir = path.join(__dirname, '..', 'data');
  fs.writeFileSync(path.join(outDir, 'tour_packages_all.json'), JSON.stringify(merged, null, 2));

  // Generate final knowledge base
  let kb = `KATALOG KOMPETITOR PAKET TOUR BALI\nDiperbarui: ${new Date().toLocaleDateString('id-ID')}\nTotal: ${merged.length} paket\n${'═'.repeat(60)}\n`;

  const bySource = merged.reduce((a, p) => { (a[p.source] = a[p.source]||[]).push(p); return a; }, {});
  for (const [src, pkgs] of Object.entries(bySource)) {
    kb += `\n▌ ${src.toUpperCase()} (${pkgs.length} paket)\n${'─'.repeat(50)}\n\n`;
    pkgs.forEach((p, i) => {
      if (!p.title || p.title.length < 5) return;
      kb += `${i+1}. ${p.title}\n`;
      if (p.price)    kb += `   💰 Harga: ${p.price}\n`;
      if (p.duration) kb += `   ⏱ Durasi: ${p.duration}\n`;
      if (p.includes?.length) kb += `   ✅ Termasuk: ${p.includes.join(', ')}\n`;
      if (p.itinerary?.length) kb += `   📍 Destinasi: ${p.itinerary.slice(0,3).join(' → ')}\n`;
      if (p.description) kb += `   📝 ${p.description.substring(0,120)}\n`;
      if (p.link)     kb += `   🔗 ${p.link}\n`;
      kb += '\n';
    });
  }

  fs.writeFileSync(path.join(outDir, 'competitor_knowledge.txt'), kb);

  console.log(`\n✅ Selesai! ${merged.length} paket total`);
  console.log(`   data/tour_packages_all.json`);
  console.log(`   data/competitor_knowledge.txt`);
}

main().catch(console.error);
