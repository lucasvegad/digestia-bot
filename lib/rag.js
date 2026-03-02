import { getClient, getAdminClient } from './supabase.js';
import { generateEmbedding, generateResponse } from './gemini.js';

/**
 * Pipeline RAG completo:
 * 1. Genera embedding de la pregunta
 * 2. Busca chunks similares en Supabase/pgvector
 * 3. Construye contexto con los chunks relevantes
 * 4. Genera respuesta con Gemini
 * 5. Loguea la consulta
 */
export async function processQuery(question, telegramUserId, telegramUsername, wasAudio = false) {
  const supabase = getClient();
  
  // 1. Generar embedding de la pregunta
  const queryEmbedding = await generateEmbedding(question);

  // 2. Buscar chunks similares
  const { data: matches, error: searchError } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: 0.3,
    match_count: 5
  });

  if (searchError) {
    console.error('Error en búsqueda semántica:', searchError);
    throw new Error('Error buscando en el Digesto');
  }

  // 3. Si no hay resultados relevantes
  if (!matches || matches.length === 0) {
    const noResultResponse = `No encontré normativa relacionada con tu consulta en el Digesto Municipal de Montecarlo.

Te sugiero:
- Reformular tu pregunta con otros términos
- Consultar directamente al Honorable Concejo Deliberante (Tel: 03751-480025)

⚠️ _La información brindada es orientativa y no constituye asesoramiento legal._`;

    await logQuery(supabase, telegramUserId, telegramUsername, question, noResultResponse, [], wasAudio);
    return noResultResponse;
  }

  // 4. Construir contexto
  const context = matches.map(m => {
    return `ORDENANZA ${m.libro || ''}-N° ${m.numero} ${m.ordenanza_anterior ? `(${m.ordenanza_anterior})` : ''}
${m.titulo ? `Título: ${m.titulo}` : ''}
${m.articulo ? `${m.articulo}: ` : ''}${m.contenido}
(Similitud: ${(m.similarity * 100).toFixed(1)}%)`;
  }).join('\n\n---\n\n');

  // 5. Generar respuesta con Gemini
  const response = await generateResponse(question, context);

  // 6. Loguear consulta
  const ordenanzaIds = [...new Set(matches.map(m => m.ordenanza_id))];
  await logQuery(supabase, telegramUserId, telegramUsername, question, response, ordenanzaIds, wasAudio);

  return response;
}

async function logQuery(supabase, telegramUserId, telegramUsername, question, response, ordenanzaIds, wasAudio) {
  try {
    // Usamos admin client para insertar (RLS)
    const admin = getAdminClient();
    await admin.from('consultas').insert({
      telegram_user_id: telegramUserId?.toString(),
      telegram_username: telegramUsername,
      pregunta: question,
      respuesta: response,
      ordenanza_ids: ordenanzaIds,
      fue_audio: wasAudio,
      canal: 'telegram'
    });
  } catch (err) {
    // No fallar si el log falla
    console.error('Error logueando consulta:', err);
  }
}
