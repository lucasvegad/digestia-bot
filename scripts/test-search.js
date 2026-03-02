import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.SUPABASE_URL || 'TU_SUPABASE_URL',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'TU_SERVICE_ROLE_KEY'
);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'TU_GEMINI_KEY');

async function testSearch(query) {
  console.log(`\n🔍 Buscando: "${query}"`);

  // Generar embedding
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(query);
  const embedding = result.embedding.values;

  // Buscar
  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    match_threshold: 0.3,
    match_count: 3
  });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ Sin resultados');
    return;
  }

  console.log(`✅ ${data.length} resultados:\n`);
  for (const match of data) {
    console.log(`  📋 Ordenanza ${match.libro}-N° ${match.numero} | ${match.articulo || 'completa'}`);
    console.log(`  📊 Similitud: ${(match.similarity * 100).toFixed(1)}%`);
    console.log(`  📝 ${match.contenido.substring(0, 150)}...`);
    console.log();
  }
}

// Tests con las 3 ordenanzas cargadas
async function main() {
  console.log('🧪 DigestIA - Test de búsqueda semántica\n');

  await testSearch('requisitos para habilitar un consultorio médico');
  await testSearch('uso de vehículos municipales fuera de horario');
  await testSearch('alimentos artesanales registro');
  await testSearch('qué profesiones necesitan registro municipal');
}

main().catch(console.error);
