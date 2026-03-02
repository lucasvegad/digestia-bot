# DigestIA 🏛️🤖

**Asistente de IA del Digesto Municipal de Montecarlo, Misiones, Argentina**

DigestIA es un chatbot de Telegram que permite a ciudadanos, funcionarios y profesionales consultar normativa municipal en lenguaje natural, utilizando búsqueda semántica (RAG) sobre el corpus de ordenanzas del Honorable Concejo Deliberante.

## 🏗️ Arquitectura
```
Ciudadano → Telegram Bot → Vercel Serverless Function
                                    ↓
                           Gemini Embeddings → pgvector (Supabase)
                                    ↓
                           Gemini 2.0 Flash (respuesta con contexto RAG)
                                    ↓
                           Respuesta estructurada + disclaimer legal
```

## 🛠️ Stack

- **LLM & Embeddings:** Google Gemini 2.0 Flash + text-embedding-004
- **Base de datos:** Supabase (PostgreSQL + pgvector)
- **Canal:** Telegram Bot API
- **Deploy:** Vercel Serverless Functions
- **Lenguaje:** JavaScript (Node.js ESM)

## 📋 Setup

1. Clonar el repositorio
2. `npm install`
3. Copiar `.env.example` a `.env` y completar las credenciales
4. Ejecutar el SQL de schema en Supabase
5. Colocar PDFs en `./pdfs/`
6. `npm run ingest` para procesar las ordenanzas
7. Deploy a Vercel: `vercel --prod`
8. Configurar webhook: `npm run set-webhook`

## 📂 Estructura
```
├── api/telegram.js        # Webhook de Telegram (serverless)
├── lib/
│   ├── supabase.js        # Clientes de Supabase
│   ├── gemini.js          # Embeddings + generación con Gemini
│   ├── rag.js             # Pipeline RAG completo
│   └── telegram.js        # Helpers de Telegram API
├── scripts/
│   ├── ingest-pdfs.js     # Procesamiento de PDFs → chunks → embeddings
│   ├── test-search.js     # Test de búsqueda semántica
│   └── set-webhook.js     # Configurar webhook de Telegram
└── pdfs/                  # Ordenanzas municipales (no se commitean)
```

## 🏛️ Contexto

Proyecto del Honorable Concejo Deliberante de Montecarlo, Misiones, como iniciativa de modernización del acceso a información pública municipal mediante inteligencia artificial.

Desarrollado por Lucas Vega — Secretario de Digesto Jurídico.

## ⚖️ Disclaimer

Las respuestas de DigestIA son orientativas y no constituyen asesoramiento legal. Para confirmación oficial, consultar al Honorable Concejo Deliberante de Montecarlo.

## 📄 Licencia

MIT
