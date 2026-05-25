const midtransClient = require('midtrans-client');
const { v4: uuidv4 } = require('uuid');

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_ENV === 'production',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

const PLANS = {
  starter: {
    name: 'BalAI Starter',
    price: 750000,
    desc: 'Chatbot website · 500 percakapan/bulan · 3 bahasa',
    features: ['Chatbot website', '500 percakapan/bulan', '3 bahasa (ID, EN, ZH)', 'Laporan mingguan'],
  },
  professional: {
    name: 'BalAI Professional',
    price: 1800000,
    desc: 'WhatsApp + Instagram + Website · Unlimited · 10+ bahasa',
    features: ['WhatsApp + Instagram + Website', 'Percakapan tidak terbatas', '10+ bahasa', 'Auto-leads ke spreadsheet', 'Notifikasi WA real-time', 'Support prioritas 7 hari'],
  },
  enterprise: {
    name: 'BalAI Enterprise',
    price: 4500000,
    desc: 'Semua fitur + integrasi custom + dedicated manager',
    features: ['Semua fitur Professional', 'Integrasi sistem booking', 'Branding & persona custom', 'Dedicated account manager', 'Training tim'],
  },
};

async function createPayment(planId, customerData) {
  const plan = PLANS[planId];
  if (!plan) throw new Error('Paket tidak ditemukan');

  const orderId = `BALAI-${planId.toUpperCase()}-${uuidv4().substring(0, 8).toUpperCase()}`;
  const now = new Date();
  const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 jam

  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: plan.price,
    },
    item_details: [{
      id: planId,
      price: plan.price,
      quantity: 1,
      name: `${plan.name} — ${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
    }],
    customer_details: {
      first_name: customerData.name,
      email: customerData.email || `${customerData.phone}@balaiapp.com`,
      phone: customerData.phone,
    },
    expiry: {
      start_time: now.toISOString().replace('T', ' ').substring(0, 19) + ' +0700',
      unit: 'hour',
      duration: 24,
    },
    callbacks: {
      finish: `https://balaiapp.com/payment/success?order_id=${orderId}`,
    },
    notification_url: 'https://balaiapp.com/api/payment/webhook',
  };

  const token = await snap.createTransactionToken(parameter);
  return { token, orderId, plan, amount: plan.price };
}

async function verifyPayment(orderId) {
  const status = await snap.transaction.status(orderId);
  return {
    orderId: status.order_id,
    status: status.transaction_status,
    paymentType: status.payment_type,
    amount: status.gross_amount,
    paidAt: status.settlement_time || status.transaction_time,
  };
}

module.exports = { createPayment, verifyPayment, PLANS };
