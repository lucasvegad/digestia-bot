import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI = null;

function getGenAI() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Genera embedding de un texto usando Gemini
 * Modelo: text-embedding-004 (768 dimensiones, gratis)
 */
export async function generateEmbedding(text) {
  const model = getGenAI().getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Genera respuesta usando Gemini Flash con contexto RAG
 */
export async function generateResponse(question, context) {
  const model = getGenAI().getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.3, // Bajo para precisión normativa
      maxOutputTokens: 1500,
    }
  });

  const systemPrompt = `Sos DigestIA, el asistente de IA del Digesto Municipal de Montecarlo, Misiones, Argentina.
Tu función es ayudar a ciudadanos, funcionarios y profesionales a consultar normativa municipal.

REGLAS ESTRICTAS:
1. SOLO respondé basándote en el contexto normativo proporcionado abajo. Si la información no está en el contexto, decí: "No encontré información sobre eso en el Digesto Municipal. Te sugiero consultar directamente al Honorable Concejo Deliberante."
2. SIEMPRE citá el número de ordenanza y artículo específico.
3. Usá lenguaje claro y accesible, pero preciso jurídicamente.
4. Máximo 4 párrafos de explicación + bullet points si es necesario.
5. NUNCA inventes normativa, artículos o números de ordenanza que no estén en el contexto.
6. Si hay ambigüedad en la consulta, pedí aclaración con UNA pregunta concreta.

FORMATO DE RESPUESTA:
📋 **Ordenanza [LIBRO]-N° [NÚMERO]** (Antes Ordenanza [ANTERIOR])
📌 **Artículo(s) relevante(s):** [número(s)]

[Resumen claro de lo que establece la normativa]

[Bullet points si hay varios requisitos o condiciones]

🔗 [Link al PDF si está disponible]

⚠️ _La información brindada es orientativa y no constituye asesoramiento legal. Para confirmación oficial, consultá al Honorable Concejo Deliberante de Montecarlo._`;

  const prompt = `${systemPrompt}

CONTEXTO NORMATIVO (ordenanzas recuperadas del Digesto):
---
${context}
---

CONSULTA DEL CIUDADANO:
${question}

Respondé siguiendo las reglas y formato indicados:`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
