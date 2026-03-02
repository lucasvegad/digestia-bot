import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================
// CONFIG — completar con tus valores o usar .env
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'TU_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'TU_SERVICE_ROLE_KEY';
const GEMINI_KEY = process.env.GEMINI_API_KEY || 'TU_GEMINI_KEY';
const PDF_DIR = process.env.PDF_DIR || './pdfs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

// ============================================
// PARSER: Extraer metadata y artículos del PDF
// ============================================
function parseOrdenanza(text) {
  // Limpiar header institucional
  const cleaned = text
    .replace(/.*Sede permanente de la Fiesta.*?\n/gi, '')
    .replace(/.*Honorable Concejo Deliberante.*?\n/gi, '')
    .replace(/.*Ciudad de Montecarlo.*?\n/gi, '')
    .replace(/.*Avda\. El Libertador.*?\n/gi, '')
    .replace(/.*480025.*?\n/gi, '')
    .replace(/.*hcdmontecarlo.*?\n/gi, '')
    .replace(/.*concejodeliberante.*?\n/gi, '')
    .replace(/.*C\.P\. 3384.*?\n/gi, '')
    .replace(/.*Capital Provincial del Deporte.*?\n/gi, '')
    .replace(/.*Nacional de la Orquídea.*?\n/gi, '')
    .replace(/-{5,}/g, '')
    .trim();

  // Extraer número de ordenanza
  // Formatos: "ORDENANZA II - Nº 1", "ORDENANZA I – N° 1", etc.
  const ordenanzaMatch = cleaned.match(/ORDENANZA\s+([IVX]+)\s*[-–]\s*N[°º]\s*(\d+)/i);
  const libro = ordenanzaMatch ? ordenanzaMatch[1].toUpperCase() : null;
  const numero = ordenanzaMatch ? ordenanzaMatch[2] : null;

  // Extraer ordenanza anterior
  const anteriorMatch = cleaned.match(/\(Antes\s+Ordenanza\s+([\d/]+)\)/i);
  const anterior = anteriorMatch ? `Antes Ordenanza ${anteriorMatch[1]}` : null;

  // Extraer artículos
  const articulos = [];
  // Split por "Artículo N.-" o "Artículo N.-"
  const parts = cleaned.split(/(?=Artículo\s+\d+\.-)/i);

  for (const part of parts) {
    const artMatch = part.match(/^Artículo\s+(\d+)\.-\s*([\s\S]*)/i);
    if (artMatch) {
      const artNum = artMatch[1];
      const artText = artMatch[2].trim();
      // Saltar artículos de comunicación vacíos
      if (artText.length > 10) { // "Se comunica al DEM" = ~40 chars, lo incluimos
        articulos.push({
          numero: `Artículo ${artNum}`,
          texto: artText
        });
      }
    }
  }

  return {
    libro,
    numero,
    anterior,
    textoCompleto: cleaned,
    articulos
  };
}

// ============================================
// EMBEDDING con rate limiting
// ============================================
async function generateEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// INGESTA PRINCIPAL
// ============================================
async function ingestPDF(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n📄 Procesando: ${fileName}`);

  // 1. Leer PDF
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  if (!text || text.trim().length < 50) {
    console.log(`  ⚠️ PDF sin texto suficiente, saltando`);
    return;
  }

  // 2. Parsear estructura
  const parsed = parseOrdenanza(text);

  if (!parsed.numero) {
    console.log(`  ⚠️ No se pudo extraer número de ordenanza de: ${fileName}`);
    console.log(`  Texto inicio: ${text.substring(0, 200)}`);
    return;
  }

  console.log(`  📋 Ordenanza ${parsed.libro}-N° ${parsed.numero} ${parsed.anterior || ''}`);
  console.log(`  📝 Artículos encontrados: ${parsed.articulos.length}`);

  // 3. Verificar si ya existe
  const { data: existing } = await supabase
    .from('ordenanzas')
    .select('id')
    .eq('numero', parsed.numero)
    .eq('libro', parsed.libro)
    .single();

  let ordenanzaId;

  if (existing) {
    console.log(`  ℹ️ Ordenanza ya existe (id: ${existing.id}), actualizando chunks...`);
    ordenanzaId = existing.id;
    // Eliminar chunks anteriores
    await supabase.from('chunks').delete().eq('ordenanza_id', ordenanzaId);
  } else {
    // 4. Insertar ordenanza
    const { data: inserted, error: insertErr } = await supabase
      .from('ordenanzas')
      .insert({
        numero: parsed.numero,
        libro: parsed.libro,
        titulo: null, // Se puede agregar manualmente después
        texto_completo: parsed.textoCompleto,
        estado: 'vigente',
        ordenanza_anterior: parsed.anterior,
        url_pdf: null
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error(`  ❌ Error insertando ordenanza:`, insertErr);
      return;
    }
    ordenanzaId = inserted.id;
  }

  // 5. Crear chunks por artículo
  if (parsed.articulos.length === 0) {
    // Si no se pudieron parsear artículos, hacer un chunk con todo el texto
    console.log(`  ⚠️ Sin artículos parseados, creando chunk único`);
    const embedding = await generateEmbedding(parsed.textoCompleto);
    await supabase.from('chunks').insert({
      ordenanza_id: ordenanzaId,
      contenido: parsed.textoCompleto,
      articulo: null,
      numero_chunk: 1,
      embedding: embedding
    });
    await sleep(500); // Rate limiting Gemini free tier
  } else if (parsed.articulos.length <= 3) {
    // Ordenanzas cortas: un solo chunk con todo
    console.log(`  📦 Ordenanza corta, creando chunk unificado`);
    const fullText = parsed.articulos.map(a => `${a.numero}: ${a.texto}`).join('\n\n');
    const contextText = `Ordenanza ${parsed.libro}-N° ${parsed.numero}. ${parsed.anterior || ''}. ${fullText}`;
    const embedding = await generateEmbedding(contextText);
    await supabase.from('chunks').insert({
      ordenanza_id: ordenanzaId,
      contenido: fullText,
      articulo: parsed.articulos.map(a => a.numero).join(', '),
      numero_chunk: 1,
      embedding: embedding
    });
    await sleep(500);
  } else {
    // Ordenanzas largas: un chunk por artículo
    for (let i = 0; i < parsed.articulos.length; i++) {
      const art = parsed.articulos[i];
      // Agregar contexto de la ordenanza al chunk para mejor retrieval
      const contextText = `Ordenanza ${parsed.libro}-N° ${parsed.numero}. ${parsed.anterior || ''}. ${art.numero}: ${art.texto}`;

      console.log(`  📦 Chunk ${i + 1}: ${art.numero} (${art.texto.substring(0, 50)}...)`);

      const embedding = await generateEmbedding(contextText);

      await supabase.from('chunks').insert({
        ordenanza_id: ordenanzaId,
        contenido: art.texto,
        articulo: art.numero,
        numero_chunk: i + 1,
        embedding: embedding
      });

      // Rate limiting: 15 RPM en Gemini free tier → 4 seg entre requests
      await sleep(4500);
    }
  }

  console.log(`  ✅ Completado: ${parsed.articulos.length} chunks creados`);
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log('🚀 DigestIA - Ingesta de PDFs');
  console.log(`📂 Directorio: ${PDF_DIR}`);

  if (!fs.existsSync(PDF_DIR)) {
    console.error(`❌ El directorio ${PDF_DIR} no existe.`);
    console.log('Creá la carpeta "pdfs/" y poné tus PDFs de ordenanzas ahí.');
    process.exit(1);
  }

  const files = fs.readdirSync(PDF_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`📄 PDFs encontrados: ${files.length}`);

  if (files.length === 0) {
    console.log('No se encontraron archivos PDF.');
    process.exit(0);
  }

  let processed = 0;
  let errors = 0;

  for (const file of files) {
    try {
      await ingestPDF(path.join(PDF_DIR, file));
      processed++;
    } catch (err) {
      console.error(`❌ Error procesando ${file}:`, err.message);
      errors++;
    }
  }

  console.log(`\n========================================`);
  console.log(`✅ Procesados: ${processed}/${files.length}`);
  if (errors > 0) console.log(`❌ Errores: ${errors}`);
  console.log(`========================================`);
}

main().catch(console.error);
