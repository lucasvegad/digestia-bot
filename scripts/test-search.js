import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../lib/gemini.js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://jjnpesjtqymxlnfnmlxc.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqbnBlc2p0cXlteGxuZm5tbHhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ2OTQ2OSwiZXhwIjoyMDg4MDQ1NDY5fQ.obXvEhztoXs9Z12fa7ICxkdSG4-lBzCBaUJdnwz9fLI'
);

async function testSearch(query) {
  console.log(`\n🔍 Buscando: "${query}"`);

  const embedding = await generateEmbedding(query);

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

async function main() {
  console.log('🧪 DigestIA - Test de búsqueda semántica\n');

  await testSearch('requisitos para habilitar un consultorio médico');
  await testSearch('uso de vehículos municipales fuera de horario');
  await testSearch('alimentos artesanales registro');
  await testSearch('qué profesiones necesitan registro municipal');
}

main().catch(console.error);
