import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../lib/gemini.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jjnpesjtqymxlnfnmlxc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'TU_SERVICE_ROLE_KEY';
const PDF_DIR = process.env.PDF_DIR || './pdfs';
const PROGRESS_FILE = './ingest-progress.json';
const DELAY_BETWEEN_EMBEDDINGS = 4000; // 4 seg entre embeddings (seguro para free tier)
const MAX_RETRIES = 5;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return { completed: [], skipped: [], failed: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function parseOrdenanza(text) {
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

  const ordenanzaMatch = cleaned.match(
    /ORDENANZA\s+([IVX]+)\s*[-–—]?\s*N[°º]?\s*(\d+)/i
  );
  const libro = ordenanzaMatch ? ordenanzaMatch[1].toUpperCase() : null;
  const numero = ordenanzaMatch ? ordenanzaMatch[2] : null;

  const anteriorMatch = cleaned.match(/\(Antes\s+Ordenanza\s+([\d/]+)\)/i);
  const anterior = anteriorMatch ? `Antes Ordenanza ${anteriorMatch[1]}` : null;

  const articulos = [];
  const parts = cleaned.split(/(?=Art[íi]culo\s+\d+\.-)/i);

  for (const part of parts) {
    const artMatch = part.match(/^Art[íi]culo\s+(\d+)\.-\s*([\s\S]*)/i);
    if (artMatch) {
      const artText = artMatch[2].trim();
      if (artText.length > 10) {
        articulos.push({ numero: `Artículo ${artMatch[1]}`, texto: artText });
      }
    }
  }

  return { libro, numero, anterior, textoCompleto: cleaned, articulos };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateEmbeddingWithRetry(text) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const embedding = await generateEmbedding(text);
      return embedding;
    } catch (err) {
      const isRateLimit = err.message?.includes('429') || 
                          err.message?.includes('RESOURCE_EXHAUSTED') ||
                          err.message?.includes('quota');
      
      if (isRateLimit && attempt < MAX_RETRIES) {
        // Esperar progresivamente más: 20s, 40s, 60s, 80s
        const waitTime = attempt * 20000;
        console.log(`  ⏳ Rate limit (intento ${attempt}/${MAX_RETRIES}). Esperando ${waitTime / 1000}s...`);
        await sleep(waitTime);
      } else {
        throw err;
      }
    }
  }
}

async function ingestPDF(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n📄 Procesando: ${fileName}`);

  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  const text = data.text;

  if (!text || text.trim().length < 50) {
    console.log(`  ⚠️ PDF sin texto suficiente, saltando`);
    return { status: 'skipped', reason: 'sin_texto' };
  }

  const parsed = parseOrdenanza(text);

  if (!parsed.numero) {
    console.log(`  ⚠️ No se pudo extraer número de ordenanza`);
    console.log(`  Texto inicio: ${text.substring(0, 300)}`);
    return { status: 'skipped', reason: 'sin_numero', preview: text.substring(0, 300) };
  }

  console.log(`  📋 Ordenanza ${parsed.libro}-N° ${parsed.numero} ${parsed.anterior || ''}`);
  console.log(`  📝 Artículos encontrados: ${parsed.articulos.length}`);

  const { data: existing } = await supabase
    .from('ordenanzas')
    .select('id')
    .eq('numero', parsed.numero)
    .eq('libro', parsed.libro)
    .single();

  let ordenanzaId;

  if (existing) {
    console.log(`  ℹ️ Ya existe (id: ${existing.id}), actualizando chunks...`);
    ordenanzaId = existing.id;
    await supabase.from('chunks').delete().eq('ordenanza_id', ordenanzaId);
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('ordenanzas')
      .insert({
        numero: parsed.numero,
        libro: parsed.libro,
        titulo: null,
        texto_completo: parsed.textoCompleto,
        estado: 'vigente',
        ordenanza_anterior: parsed.anterior,
        url_pdf: null
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error(`  ❌ Error insertando ordenanza:`, insertErr);
      return { status: 'failed', reason: insertErr.message };
    }
    ordenanzaId = inserted.id;
  }

  if (parsed.articulos.length === 0) {
    console.log(`  ⚠️ Sin artículos, chunk único`);
    const embedding = await generateEmbeddingWithRetry(parsed.textoCompleto);
    await sleep(DELAY_BETWEEN_EMBEDDINGS);
    await supabase.from('chunks').insert({
      ordenanza_id: ordenanzaId,
      contenido: parsed.textoCompleto,
      articulo: null,
      numero_chunk: 1,
      embedding
    });
  } else if (parsed.articulos.length <= 3) {
    console.log(`  📦 Ordenanza corta (${parsed.articulos.length} arts), chunk unificado`);
    const fullText = parsed.articulos.map(a => `${a.numero}: ${a.texto}`).join('\n\n');
    const contextText = `Ordenanza ${parsed.libro}-N° ${parsed.numero}. ${parsed.anterior || ''}. ${fullText}`;
    const embedding = await generateEmbeddingWithRetry(contextText);
    await sleep(DELAY_BETWEEN_EMBEDDINGS);
    await supabase.from('chunks').insert({
      ordenanza_id: ordenanzaId,
      contenido: fullText,
      articulo: parsed.articulos.map(a => a.numero).join(', '),
      numero_chunk: 1,
      embedding
    });
  } else {
    for (let i = 0; i < parsed.articulos.length; i++) {
      const art = parsed.articulos[i];
      const contextText = `Ordenanza ${parsed.libro}-N° ${parsed.numero}. ${parsed.anterior || ''}. ${art.numero}: ${art.texto}`;
      console.log(`  📦 Chunk ${i + 1}/${parsed.articulos.length}: ${art.numero}`);
      const embedding = await generateEmbeddingWithRetry(contextText);
      await sleep(DELAY_BETWEEN_EMBEDDINGS);
      await supabase.from('chunks').insert({
        ordenanza_id: ordenanzaId,
        contenido: art.texto,
        articulo: art.numero,
        numero_chunk: i + 1,
        embedding
      });
    }
  }

  const chunkCount = Math.max(parsed.articulos.length, 1);
  console.log(`  ✅ Completado: ${chunkCount} chunk(s)`);
  return { status: 'ok', chunks: chunkCount };
}

async function main() {
  console.log('🚀 DigestIA - Ingesta de PDFs');
  console.log(`📂 Directorio: ${PDF_DIR}`);

  if (!fs.existsSync(PDF_DIR)) {
    console.error(`❌ El directorio ${PDF_DIR} no existe.`);
    process.exit(1);
  }

  const allFiles = (function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(f =>
      f.isDirectory()
        ? walk(path.join(dir, f.name))
        : f.name.toLowerCase().endsWith('.pdf')
        ? [path.join(dir, f.na
