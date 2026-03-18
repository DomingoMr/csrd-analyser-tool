import OpenAI from 'openai';
import { loadEsrsCatalog } from '../utils/loadEsrsCatalog.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function buildPrompt(esrsCatalog) {
  const catalogText = esrsCatalog
    .map((item, index) => {
      return `${index + 1}. ${item.Bloque}
Descripción: ${item['Descripción resumida']}
Sectores clave: ${item['Sectores clave']}`;
    })
    .join('\n\n');

  return `
Eres un analista experto en sostenibilidad ESG y CSRD/ESRS.

Tu objetivo es revisar el informe de sostenibilidad adjunto (PDF) y otros archivos PDFs adjuntos y determinar qué bloques del catálogo ESRS aplican a la empresa según la información disponible.

Instrucciones:
1. Usa únicamente los bloques incluidos en el catálogo.
2. Selecciona solo los bloques realmente aplicables o claramente sugeridos por el contenido.
3. Clasifica cada bloque en E, S o G.
4. Devuelve una respuesta JSON válida, sin markdown, con esta estructura exacta:
{
  "matches": [
    {
      "bloque": "E1-1 – ...",
      "categoria": "E",
      "motivo": "Explicación breve de por qué aplica"
    }
  ],
  "summary": "Resumen ejecutivo de 2-3 frases"
}

Catálogo ESRS:
${catalogText}
`;
}

export async function analyzeSustainabilityPdf(pdfBuffer, fileName = 'informe.pdf') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Falta la variable OPENAI_API_KEY en el backend.');
  }

  console.log(`[ANALYSIS] Subiendo PDF a OpenAI: ${fileName}`);

  // 1. Subir archivo a OpenAI
  const file = await openai.files.create({
    file: new File([pdfBuffer], fileName, { type: 'application/pdf' }),
    purpose: 'assistants'
  });

  console.log(`[ANALYSIS] File uploaded: ${file.id}`);

  // 2. Cargar catálogo
  const esrsCatalog = await loadEsrsCatalog();

  // 3. Construir prompt (SIN texto del PDF)
  const prompt = buildPrompt(esrsCatalog);

  console.log('[ANALYSIS] Enviando análisis a OpenAI...');

  // 4. Llamada con input_file
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt
          },
          {
            type: 'input_file',
            file_id: file.id
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'esrs_match_response',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            matches: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  bloque: { type: 'string' },
                  categoria: { type: 'string', enum: ['E', 'S', 'G'] },
                  motivo: { type: 'string' }
                },
                required: ['bloque', 'categoria', 'motivo']
              }
            },
            summary: { type: 'string' }
          },
          required: ['matches', 'summary']
        }
      }
    }
  });

  console.log('[ANALYSIS] Respuesta recibida');

  if (!response.output_text) {
    throw new Error('OpenAI no devolvió output_text');
  }

  const payload = JSON.parse(response.output_text);

  return {
    fileName,
    ...payload
  };
}