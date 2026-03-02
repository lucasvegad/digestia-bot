const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * Enviar mensaje de texto por Telegram
 */
export async function sendMessage(chatId, text, options = {}) {
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
    ...options
  };

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    // Si falla Markdown, reintentar sin parse_mode
    const body2 = { ...body };
    delete body2.parse_mode;
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body2)
    });
  }
}

/**
 * Enviar indicador de "escribiendo..."
 */
export async function sendTyping(chatId) {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action: 'typing'
    })
  });
}

/**
 * Obtener archivo de audio de Telegram (para transcripción futura)
 */
export async function getFileUrl(fileId) {
  const res = await fetch(`${TELEGRAM_API}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId })
  });
  const data = await res.json();
  if (data.ok) {
    return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
  }
  return null;
}
