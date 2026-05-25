require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
- Tutup setiap balasan dengan pertanyaan yang mendorong engagement`;

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

const FREE_MODELS = [
  'qwen/qwen3-8b:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-8b:free',
];

async function callOpenRouter(messages) {
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!key || key.includes('your-openrouter-key')) {
    throw new Error('OpenRouter API key belum diset');
  }

  const primaryModel = process.env.OPENROUTER_MODEL;
  const models = primaryModel ? [primaryModel, ...FREE_MODELS.filter(m => m !== primaryModel)] : FREE_MODELS;
  let lastError;

  for (const model of models) {
    try {
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
          max_tokens: 400,
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (response.status === 429) {
        console.log(`[BalAI] Model ${model} rate-limited, trying next...`);
        lastError = new Error(`${model} rate limited`);
        continue;
      }
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter ${response.status}: ${err}`);
      }
      const data = await response.json();
      const reply = data.choices[0]?.message?.content;
      if (reply) {
        console.log(`[BalAI] Replied via openrouter/${model}`);
        return reply;
      }
    } catch (err) {
      if (err.message.includes('rate limited')) { lastError = err; continue; }
      throw err;
    }
  }
  throw lastError || new Error('Semua model OpenRouter tidak tersedia');
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
    console.log('[BalAI] Ollama unavailable, falling back to OpenRouter:', ollamaErr.message);
    try {
      reply = await callOpenRouter(messages);
      provider = 'openrouter';
    } catch (orErr) {
      console.error('[BalAI] OpenRouter also failed:', orErr.message);
      return res.status(503).json({ error: `OpenRouter error: ${orErr.message}` });
    }
  }

  console.log(`[BalAI] Replied via ${provider}`);
  res.json({ reply, provider });
});

app.get('/api/health', (req, res) => {
  const key = process.env.OPENROUTER_API_KEY || '';
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    openrouter_key: key ? `${key.substring(0, 12)}...` : 'NOT SET',
    openrouter_model: process.env.OPENROUTER_MODEL || 'not set',
    ollama_url: process.env.OLLAMA_URL || 'not set',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🌴 BalAI Server running at http://localhost:${PORT}`);
  console.log(`   Ollama model  : ${process.env.OLLAMA_MODEL || 'llama3.2'}`);
  console.log(`   OR model      : ${process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free'}`);
  console.log(`   OpenRouter key: ${process.env.OPENROUTER_API_KEY?.startsWith('sk-') ? '✓ set' : '✗ not set'}\n`);
});
