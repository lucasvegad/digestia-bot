const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8619614233:AAFjdxrgRmqJb5Glpj53birHSz3zelR9uVo';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://TU-PROYECTO.vercel.app/api/telegram';

async function setWebhook() {
  console.log(`🔗 Configurando webhook de Telegram...`);
  console.log(`   URL: ${WEBHOOK_URL}`);

  const res = await fetch(
    `https://api.telegram.org/bot${TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        allowed_updates: ['message'],
        drop_pending_updates: true
      })
    }
  );

  const data = await res.json();
  console.log('Respuesta:', JSON.stringify(data, null, 2));

  if (data.ok) {
    console.log('✅ Webhook configurado correctamente');
  } else {
    console.error('❌ Error configurando webhook');
  }
}

setWebhook().catch(console.error);
