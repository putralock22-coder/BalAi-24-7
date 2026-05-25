const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// ── Target: website lokal travel agent Bali ───────────────────────────────
const TARGETS = [
  {
    name: 'Nice Tour Bali',
    url: 'https://nicetourbali.com/',
    selectors: { card: 'article, .tour-item, [class*="tour"]', title: 'h2,h3,h4', price: '[class*="price"],.price,ins', desc: 'p', link: 'a' }
  },
  {
    name: 'Ubud Center',
    url: 'https://www.ubudcenter.com/',
    selectors: { card: 'article,.tour,.product', title: 'h2,h3', price: '.price,[class*="price"]', desc: 'p,.description', link: 'a' }
  },
  {
    name: 'Inclusive Bali Tour',
    url: 'https://inclusivebalitour.com/',
    selectors: { card: 'article,.tour-card,[class*="tour"]', title: 'h2,h3', price: '.price,[class*="price"]', desc: 'p', link: 'a' }
  },
  {
    name: 'Bali Full Day Tour',
    url: 'https://www.balifulldaytour.com/',
    selectors: { card: 'article,.tour,.package', title: 'h2,h3', price: '.price,[class*="price"]', desc: 'p', link: 'a' }
  },
  {
    name: 'Private Bali Tours',
    url: 'https://privatebalitours.com/',
    selectors: { card: 'article,.card,.tour', title: 'h2,h3', price: '.price,[class*="price"]', desc: 'p', link: 'a' }
  },
  {
    name: 'Bali Nusa Tour',
    url: 'https://balinusatour.id/',
    selectors: { card: 'article,.tour,.paket', title: 'h2,h3', price: '.price,[class*="price"],[class*="harga"]', desc: 'p', link: 'a' }
  },
  {
    name: 'Bagus Tour Service',
    url: 'https://bagustourservice.com/',
    selectors: { card: 'article,.tour-box,.package', title: 'h2,h3,h4', price: '.price,[class*="price"]', desc: 'p', link: 'a' }
  },
  {
    name: 'Forever Vacation Bali',
    url: 'https://forevervacation.com/tours-in-bali',
    selectors: { card: 'article,.activity,[class*="card"]', title: 'h2,h3', price: '[class*="price"],.price', desc: 'p', link: 'a' }
  },
];

const results = [];

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanText(str) {
  return str ? str.replace(/\s+/g, ' ').trim().substring(0, 300) : '';
}

function saveProgress() {
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'tour_packages.json'), JSON.stringify(results, null, 2));
  console.log(`   💾 Total tersimpan: ${results.length} paket`);
}

async function scrapeSite(target) {
  console.log(`\n📡 Scraping: ${target.name}`);
  console.log(`   URL: ${target.url}`);

  const response = await axios.get(target.url, { headers, timeout: 20000 });
  const $ = cheerio.load(response.data);
  const { card, title, price, desc, link } = target.selectors;

  const cards = $(card);
  console.log(`   Ditemukan ${cards.length} card dengan selector "${card}"`);

  if (cards.length === 0) {
    // Fallback: cari semua artikel/kartu
    const fallback = $('article, .post, .product, [class*="package"], [class*="tour"]');
    console.log(`   Fallback: ${fallback.length} elemen`);
    fallback.slice(0, 20).each((_, el) => {
      const t = $(el).find('h1,h2,h3,h4').first().text();
      const p = $(el).find('[class*="price"],ins,.price').first().text();
      const d = $(el).find('p').first().text();
      const l = $(el).find('a').first().attr('href');
      if (t.trim().length > 5) {
        results.push({ source: target.name, title: cleanText(t), price: cleanText(p) || null, description: cleanText(d), link: l, category: 'local' });
      }
    });
    return;
  }

  cards.slice(0, 20).each((_, el) => {
    const t = $(el).find(title).first().text();
    const p = $(el).find(price).first().text();
    const d = $(el).find(desc).first().text();
    const l = $(el).find(link).first().attr('href');
    if (t.trim().length > 5) {
      results.push({ source: target.name, title: cleanText(t), price: cleanText(p) || null, description: cleanText(d), link: l, category: 'local' });
    }
  });

  console.log(`   ✓ Diambil: ${results.filter(r => r.source === target.name).length} paket`);
}

async function main() {
  console.log('🌴 BalAI Tour Scraper — Local Travel Agent Sites\n');
  console.log('═'.repeat(55));

  for (const target of TARGETS) {
    try {
      await scrapeSite(target);
      saveProgress();
    } catch (err) {
      if (err.response) {
        console.log(`   ✗ HTTP ${err.response.status}: ${target.url}`);
      } else {
        console.log(`   ✗ Error: ${err.message.substring(0, 70)}`);
      }
    }
    await sleep(2000);
  }

  console.log('\n═'.repeat(55));
  console.log(`\n✅ Selesai! Total ${results.length} paket dari ${TARGETS.length} website`);

  const bySrc = results.reduce((a, p) => { a[p.source] = (a[p.source]||0)+1; return a; }, {});
  Object.entries(bySrc).forEach(([s, c]) => console.log(`   ${s}: ${c} paket`));

  if (results.length > 0) {
    console.log('\n💡 Jalankan selanjutnya: node scraper/format.js');
  } else {
    console.log('\n⚠️  Tidak ada data — website mungkin menggunakan JavaScript rendering');
    console.log('   Coba jalankan: node scraper/scrape-browser.js (butuh Playwright)');
  }
}

main().catch(console.error);
