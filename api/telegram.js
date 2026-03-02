import { processQuery } from '../lib/rag.js';
import { sendMessage, sendTyping } from '../lib/telegram.js';

export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  try {
    const update = req.body;

    // Solo procesar mensajes de texto (audio en fase 2)
    const message = update?.message;
    if (!message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const userId = message.from?.id;
    const username = message.from?.username || message.from?.first_name || 'anon';

    // Comando /start
    if (message.text === '/start') {
      await sendMessage(chatId,
        `👋 ¡Hola! Soy *DigestIA*, asistente de IA del Digesto Municipal de Montecarlo.

Contame tu consulta sobre normativa municipal y te ayudo. Por ejemplo:
- _¿Qué requisitos necesito para habilitar un local profesional?_
- _¿Qué dice la normativa sobre vehículos oficiales?_
- _¿Existe alguna ordenanza sobre alimentos artesanales?_

Escribí tu consulta y busco en las ordenanzas municipales 📚`
      );
      return res.status(200).json({ ok: true });
    }

    // Comando /ayuda
    if (message.text === '/ayuda' || message.text === '/help') {
      await sendMessage(chatId,
        `ℹ️ *¿Cómo usar DigestIA?*

Simplemente escribí tu consulta sobre normativa municipal en lenguaje natural. Yo busco en el Digesto Municipal y te respondo con la ordenanza y artículo relevante.

*Comandos:*
/start - Iniciar conversación
/ayuda - Ver esta ayuda

*Sobre DigestIA:*
Soy un proyecto de IA del Honorable Concejo Deliberante de Montecarlo. Mis respuestas son orientativas y no constituyen asesoramiento legal.

📞 Contacto HCD: 03751-480025`
      );
      return res.status(200).json({ ok: true });
    }

    // Mensaje de voz (audio) — MVP: informar que aún no está disponible
    if (message.voice || message.audio) {
      await sendMessage(chatId,
        `🎤 Por ahora solo proceso consultas de texto. La función de audio estará disponible próximamente.

Por favor, escribí tu consulta y te ayudo.`
      );
      return res.status(200).json({ ok: true });
    }

    // Mensaje de texto — procesar consulta RAG
    if (message.text) {
      // Mostrar "escribiendo..."
      await sendTyping(chatId);

      // Procesar con RAG
      const response = await processQuery(
        message.text,
        userId,
        username,
        false // no es audio
      );

      // Enviar respuesta
      await sendMessage(chatId, response);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error en webhook:', error);

    // Intentar notificar al usuario del error
    try {
      const chatId = req.body?.message?.chat?.id;
      if (chatId) {
        await sendMessage(chatId,
          `⚠️ Ocurrió un error procesando tu consulta. Por favor, intentá de nuevo en unos segundos.

Si el problema persiste, contactá al HCD: 03751-480025`
        );
      }
    } catch (e) {
      console.error('Error enviando mensaje de error:', e);
    }

    return res.status(200).json({ ok: true }); // Siempre 200 para Telegram
  }
}
