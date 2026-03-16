import { processQuery } from '../lib/rag.js';
import { sendMessage, sendTyping } from '../lib/telegram.js';

const SALUDOS = [
  'hola', 'buenas', 'buen dia', 'buen día', 'buenos dias', 'buenos días',
  'buenas tardes', 'buenas noches', 'que tal', 'qué tal', 'hey', 'ey',
  'ola', 'wenas', 'holis', 'holaa', 'hi', 'hello'
];

const AGRADECIMIENTOS = [
  'gracias', 'gracia', 'muchas gracias', 'genial', 'perfecto',
  'dale', 'ok', 'okay', 'buenisimo', 'buenísimo', 'excelente',
  'barbaro', 'bárbaro', 'joya', 'copado', 'piola'
];

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function esSaludo(text) {
  const norm = normalize(text);
  return SALUDOS.some(s => norm === s || norm === s + 's');
}

function esAgradecimiento(text) {
  const norm = normalize(text);
  return AGRADECIMIENTOS.some(a => norm.includes(a));
}

function esMuyCorto(text) {
  return text.trim().length < 8 && !esSaludo(text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  try {
    const update = req.body;
    const message = update?.message;
    if (!message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const userId = message.from?.id;
    const username = message.from?.username || message.from?.first_name || 'anon';

    if (message.text === '/start') {
      await sendMessage(chatId,
        `👋 ¡Hola! Soy *DigestIA*, tu asistente para consultar las ordenanzas municipales de Montecarlo.

Preguntame lo que necesites sobre normativa municipal, por ejemplo:

- _¿Qué necesito para abrir un negocio?_
- _¿Hay alguna ordenanza sobre mascotas?_
- _¿Qué dice la normativa sobre construcción?_
- _¿Cuáles son las tasas municipales?_

Escribí tu pregunta y busco en el Digesto Municipal 📚`
      );
      return res.status(200).json({ ok: true });
    }

    if (message.text === '/ayuda' || message.text === '/help') {
      await sendMessage(chatId,
        `ℹ️ *¿Cómo usar DigestIA?*

Escribí tu consulta como si le preguntaras a un vecino que sabe de normativa. No hace falta usar palabras técnicas.

*Ejemplos de preguntas:*
- _¿Puedo poner un quiosco en mi casa?_
- _¿Qué pasa si mi vecino hace ruido?_
- _¿Necesito permiso para construir?_
- _¿Cómo funciona lo de las tasas?_

*Comandos:*
/start - Iniciar conversación
/ayuda - Ver esta ayuda

Soy un proyecto del Honorable Concejo Deliberante de Montecarlo. Mis respuestas son orientativas, no reemplazan asesoramiento legal.

📞 HCD Montecarlo: 03751-480025`
      );
      return res.status(200).json({ ok: true });
    }

    if (message.voice || message.audio) {
      await sendMessage(chatId,
        `🎤 Todavía no puedo escuchar audios, pero estamos trabajando en eso. Por ahora, escribime tu consulta y te ayudo.`
      );
      return res.status(200).json({ ok: true });
    }

    if (message.text) {
      if (esSaludo(message.text)) {
        await sendMessage(chatId,
          `👋 ¡Hola! Soy DigestIA, tu asistente del Digesto Municipal de Montecarlo.

Preguntame lo que necesites sobre normativa municipal. Por ejemplo:
- _¿Qué necesito para abrir un comercio?_
- _¿Hay alguna ordenanza sobre animales sueltos?_
- _¿Qué dice la normativa sobre obras en la vía pública?_`
        );
        return res.status(200).json({ ok: true });
      }

      if (esAgradecimiento(message.text)) {
        await sendMessage(chatId,
          `😊 ¡De nada! Si tenés otra consulta sobre normativa municipal, preguntame cuando quieras.`
        );
        return res.status(200).json({ ok: true });
      }

      if (esMuyCorto(message.text)) {
        await sendMessage(chatId,
          `🤔 Tu mensaje es un poco corto para buscar normativa. Probá con una pregunta más completa, por ejemplo:
- _¿Qué necesito para habilitar un local?_
- _¿Existe alguna ordenanza sobre ruidos molestos?_`
        );
        return res.status(200).json({ ok: true });
      }

      await sendTyping(chatId);
      const response = await processQuery(
        message.text,
        userId,
        username,
        false
      );
      await sendMessage(chatId, response);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    try {
      const chatId = req.body?.message?.chat?.id;
      if (chatId) {
        await sendMessage(chatId,
          `😅 Perdón, tuve un problema procesando tu consulta. Probá de nuevo en unos segundos.

Si el problema sigue, podés consultar directamente al HCD: 📞 03751-480025`
        );
      }
    } catch (e) {
      console.error('Error enviando mensaje de error:', e);
    }
    return res.status(200).json({ ok: true });
  }
}
