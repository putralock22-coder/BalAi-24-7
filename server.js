require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createPayment, verifyPayment, PLANS } = require('./payment');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Load market intelligence data jika tersedia
let marketIntel = '';
const marketIntelPath = path.join(__dirname, 'data', 'market_intel.txt');
if (fs.existsSync(marketIntelPath)) {
  marketIntel = '\n\n' + fs.readFileSync(marketIntelPath, 'utf-8');
  console.log('[BalAI] Market intelligence data loaded ✓');
}

const SYSTEM_PROMPT = `Kamu adalah BalAI, asisten virtual travel agent "Bali Top Holiday" yang ramah dan profesional.

PAKET TOUR TERSEDIA:
1. Paket 3H2M (Kode: BTH-3D2N)
   - Destinasi: Uluwatu, Penglipuran, Kintamani, Tanah Lot, Tirta Empul
   - Harga: Hubungi untuk harga terbaik
   - Fasilitas: Hotel, Makan Siang, Driver, Tiket Masuk

2. Paket 4H3M Bali & Nusa Penida (Kode: BTH 477B) — Terlaris!
   - Hari 1: Jemput Bandara → Tanah Lot → Seminyak
   - Hari 2: Nusa Penida via Fastboat (Kelingking Beach, Diamond Beach, Broken Beach)
   - Hari 3: Penglipuran → Kintamani → Tirta Empul
   - Hari 4: Oleh-oleh → Antar Bandara
   - Harga: Rp 2.595.000/orang (min. 5 pax, dengan hotel)
   - Fasilitas: Hotel, Fastboat Nusa Penida, Driver, Makan Siang, Tiket Masuk

3. Paket Keluarga 5H4M
   - Destinasi: Pandawa, Tanjung Benoa, Penglipuran, Kintamani, Tanah Lot, Oleh-oleh
   - Harga: Rp 10.950.000 / keluarga (2 dewasa + 2 anak)
   - Fasilitas: 4x Sarapan, 4x Makan Siang, 3x Makan Malam, Mobil AC, Tiket Masuk, Asuransi

4. Paket Honeymoon 3H2M
   - Destinasi: Sunset Dinner Jimbaran, Spa Ubud, Pantai Melasti, Uluwatu, Foto Profesional
   - Harga: Spesial — tanya langsung ke tim
   - Fasilitas: Romantic Setup, Private Car

5. Full Day Tour (10-11 jam) — Private
   - Rute Uluwatu: Pandawa → Uluwatu → Kecak Dance → Dinner Jimbaran
   - Rute Ubud: Tegallalang → Tirta Empul → Ubud Market → Monkey Forest
   - Rute Kintamani: Penglipuran → Kopi Luwak → Kintamani → Toya Devasya
   - Harga: Mulai Rp 450.000/orang
   - Fasilitas: Makan Siang & Malam, Guide, Tiket Masuk

6. Paket Group/Rombongan (BALIjoy)
   - Cocok untuk: gathering kantor, reuni, study tour
   - Harga: Rp 1.835.000/pax (makin banyak makin murah)
   - Fasilitas: Bus AC, Guide, Harga Grup

FASILITAS STANDAR SEMUA PAKET:
- Penjemputan bandara dengan kalungan bunga
- Mobil ber-AC + driver berbahasa Inggris
- Air mineral
- Parkir & tol Bali Mandara
- Asuransi Jasa Raharja

AREA PICKUP: Seminyak, Legian, Kuta, Ubud, Sanur, Nusa Dua, Canggu, Jimbaran, Bukit

ATURAN PENTING:
- Deteksi bahasa pengguna dan BALAS DALAM BAHASA YANG SAMA
- Jika bahasa Inggris → balas Inggris, jika Indonesia → balas Indonesia
- Gunakan emoji yang relevan untuk membuat pesan lebih menarik
- Jika ditanya hal di luar paket tour Bali, arahkan kembali ke layanan BalAI
- Selalu tanyakan: berapa hari, berapa orang, tanggal, budget — untuk rekomendasi yang tepat
- Untuk booking, minta nama dan nomor WhatsApp mereka
- Tutup setiap balasan dengan pertanyaan yang mendorong engagement
- Jika turis menyebut kompetitor atau minta perbandingan harga, gunakan data riset pasar di bawah untuk jelaskan nilai terbaik Bali Top Holiday${marketIntel}`;

async function callOllama(messages) {
  const response = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: false,
      options: { temperature: 0.7, num_predict: 400 }
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
  const data = await response.json();
  return data.message?.content || data.response;
}

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
];

async function callGroq(messages) {
  const key = process.env.GROQ_API_KEY || '';
  if (!key) throw new Error('GROQ_API_KEY belum diset');

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 500,
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (response.status === 429) {
        console.log(`[BalAI] Groq model ${model} rate-limited, trying next...`);
        continue;
      }
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq ${response.status}: ${err}`);
      }
      const data = await response.json();
      const reply = data.choices[0]?.message?.content;
      if (reply) {
        console.log(`[BalAI] Replied via groq/${model}`);
        return reply;
      }
    } catch (err) {
      if (err.message.includes('rate-limited')) continue;
      throw err;
    }
  }
  throw new Error('Semua model Groq tidak tersedia');
}

async function callOpenRouter(messages) {
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!key || key.includes('your-openrouter-key')) {
    throw new Error('OpenRouter API key belum diset');
  }
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://balai-24-7-production.up.railway.app',
      'X-Title': 'BalAI Travel Assistant'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 500,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${err}`);
  }
  const data = await response.json();
  return data.choices[0]?.message?.content;
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  let reply = null;
  let provider = null;

  try {
    reply = await callOllama(messages);
    provider = 'ollama';
  } catch (ollamaErr) {
    console.log('[BalAI] Ollama unavailable, trying Groq:', ollamaErr.message);
    try {
      reply = await callGroq(messages);
      provider = 'groq';
    } catch (groqErr) {
      console.log('[BalAI] Groq unavailable, trying OpenRouter:', groqErr.message);
      try {
        reply = await callOpenRouter(messages);
        provider = 'openrouter';
      } catch (orErr) {
        console.error('[BalAI] All providers failed:', orErr.message);
        return res.status(503).json({ error: `Semua AI provider tidak tersedia: ${orErr.message}` });
      }
    }
  }

  console.log(`[BalAI] Replied via ${provider}`);
  res.json({ reply, provider });
});

app.get('/api/health', (req, res) => {
  const orKey = process.env.OPENROUTER_API_KEY || '';
  const groqKey = process.env.GROQ_API_KEY || '';
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    groq_key: groqKey ? `${groqKey.substring(0, 12)}...` : 'NOT SET',
    openrouter_key: orKey ? `${orKey.substring(0, 12)}...` : 'NOT SET',
    openrouter_model: process.env.OPENROUTER_MODEL || 'not set',
    ollama_url: process.env.OLLAMA_URL || 'not set',
  });
});

// ── Payment endpoints ─────────────────────────────────────────────────────

// Get available plans
app.get('/api/plans', (req, res) => {
  res.json(PLANS);
});

// Create payment token
app.post('/api/payment/create', async (req, res) => {
  const { planId, name, phone, email, businessName } = req.body;
  if (!planId || !name || !phone) {
    return res.status(400).json({ error: 'planId, name, dan phone wajib diisi' });
  }
  if (!process.env.MIDTRANS_SERVER_KEY) {
    return res.status(503).json({ error: 'Payment belum dikonfigurasi' });
  }
  try {
    const result = await createPayment(planId, { name, phone, email, businessName });
    console.log(`[Payment] Order created: ${result.orderId} — ${result.plan.name}`);
    res.json(result);
  } catch (err) {
    console.error('[Payment] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Midtrans webhook — auto-notifikasi setelah client bayar
app.post('/api/payment/webhook', async (req, res) => {
  const { order_id, transaction_status, gross_amount, payment_type, customer_details } = req.body;
  console.log(`[Webhook] ${order_id} — ${transaction_status}`);

  if (['capture', 'settlement'].includes(transaction_status)) {
    const planId = order_id.split('-')[1]?.toLowerCase();
    const name   = customer_details?.first_name || '-';
    const phone  = customer_details?.phone || '-';
    const amount = parseInt(gross_amount).toLocaleString('id-ID');

    // Log ke console (bisa disambungkan ke database/spreadsheet)
    console.log(`\n✅ PEMBAYARAN DITERIMA`);
    console.log(`   Order  : ${order_id}`);
    console.log(`   Client : ${name} (${phone})`);
    console.log(`   Paket  : ${planId}`);
    console.log(`   Jumlah : Rp ${amount}`);
    console.log(`   Metode : ${payment_type}\n`);

    // Kirim notifikasi WA ke kamu via Fonnte/WA Gateway (opsional)
    if (process.env.WA_NOTIFY_NUMBER && process.env.FONNTE_TOKEN) {
      const msg = `🎉 *PEMBAYARAN MASUK!*\n\nClient: ${name}\nWA: ${phone}\nPaket: BalAI ${planId}\nJumlah: Rp ${amount}\nMetode: ${payment_type}\nOrder: ${order_id}\n\n_Segera setup BalAI untuk client ini!_`;
      fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { 'Authorization': process.env.FONNTE_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: process.env.WA_NOTIFY_NUMBER, message: msg })
      }).catch(e => console.log('WA notify failed:', e.message));
    }
  }

  res.json({ status: 'ok' });
});

// Payment success page redirect
app.get('/payment/success', (req, res) => {
  const { order_id } = req.query;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pembayaran Berhasil</title>
  <meta http-equiv="refresh" content="5;url=/">
  <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#F7F1E6;margin:0}
  .box{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.08);max-width:440px}
  h1{color:#0D3B38;font-size:28px} p{color:#4A4A4A;line-height:1.6} .badge{font-size:60px;margin-bottom:16px}</style></head>
  <body><div class="box"><div class="badge">🎉</div>
  <h1>Pembayaran Berhasil!</h1>
  <p>Terima kasih! Tim BalAI akan menghubungi kamu via WhatsApp dalam <strong>1 jam</strong> untuk mulai setup.</p>
  <p style="color:#8A8A8A;font-size:13px;margin-top:16px">Order: ${order_id || '-'}<br>Mengalihkan ke halaman utama...</p>
  </div></body></html>`);
});

// ─────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌴 BalAI Server running at http://localhost:${PORT}`);
  console.log(`   Ollama model  : ${process.env.OLLAMA_MODEL || 'llama3.2'}`);
  console.log(`   OR model      : ${process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free'}`);
  console.log(`   OpenRouter key: ${process.env.OPENROUTER_API_KEY?.startsWith('sk-') ? '✓ set' : '✗ not set'}\n`);
});
