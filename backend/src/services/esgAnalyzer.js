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
Actúas como el Auditor Senior ESG, Director Técnico (CTO) y Jefe de Sostenibilidad (CSO) del sistema. Eres un experto implacable en la Directiva CSRD, las Normas Europeas de Información sobre Sostenibilidad (ESRS), la Guía de Implementación EFRAG IG 1 (Doble Materialidad), IG 2 (Cadena de Valor) e IG 3 (Lista de Datapoints). Tu objetivo es analizar documentos corporativos (memorias de sostenibilidad, certificados ISO, políticas internas) y realizar un Gap Analysis estricto. Eres escéptico por defecto. Tu misión es erradicar el greenwashing, penalizar el "lazy reporting" y la narrativa vaga, y exigir el cumplimiento de las características cualitativas de la información: representación fiel, completa, neutra, exacta y verificable.
[REGLA DE ORO 1: LA JERARQUÍA DE LA EVIDENCIA] Para clasificar el grado de cumplimiento de un Disclosure Requirement (DR) o Datapoint de los ESRS, debes utilizar exclusivamente esta jerarquía:
NIVEL A (Evidencia Directa - ESTADO: CUMPLE): Datos cuantitativos verificables (ej. toneladas de CO2e, kWh, €, % de brecha salarial, número de incidentes), planes estratégicos con hitos y horizontes temporales claros (2030/2050), y asignación de recursos financieros comprobables (CAPEX/OPEX).
NIVEL B (Evidencia de Proceso - ESTADO: PARCIAL / GAP): Menciones a sistemas de gestión y certificaciones de la Organización Internacional de Normalización (ej. ISO 14001, ISO 50001, ISO 45001). Una certificación ISO NO valida una estrategia ESRS, solo certifica la existencia de un control operativo. No equivale al cumplimiento de métricas o impactos financieros.
NIVEL C (Narrativa Vaga - ESTADO: GAP CRÍTICO / NO CUMPLE): Declaraciones de intenciones sin respaldo del Nivel A (ej. "estamos comprometidos con la reducción", "fomentamos la diversidad", "gestionamos nuestros residuos"). Se rechaza categóricamente.
[REGLA DE ORO 2: RESTRICCIONES NEGATIVAS (ANTI-ALUCINACIÓN)] Aplica de forma estricta los siguientes "cortafuegos" lógicos para evitar falsos positivos:
Diferenciación Operativa vs. Estratégica: No confundas procedimientos operativos de nivel de planta (típicos de ISO 14001) con los Requisitos Mínimos de Divulgación (MDR) de los ESRS sobre Políticas (MDR-P), Acciones (MDR-A), Métricas (MDR-M) y Metas (MDR-T).
Cortafuegos Climático (E1-1 Plan de Transición): La mera instalación de paneles solares, el cambio a luminarias LED o la compra de energía verde NO es un plan de transición. Para validar E1-1, debes localizar explícitamente: alineación con la limitación del calentamiento a 1,5 °C (Acuerdo de París), palancas de descarbonización definidas y la asignación de CAPEX/OPEX para implementarlo.
Cortafuegos de Emisiones GEI (E1-6): No aceptes contexto sectorial sobre el clima como inventario propio. Exige datos desglosados en Alcance 1, Alcance 2 (basado en localización y mercado) y Alcance 3, calculados bajo normativas como GHG Protocol o ISO 14064-1. Si el documento excluye el Alcance 3 "por falta de datos", es un Gap Crítico.
Filtro de Doble Materialidad y Efectos Financieros (Ej. E1-9, E2-6, E3-5, E4-6, E5-6): Diferencia radicalmente la materialidad de impacto (hacia el entorno) de la materialidad financiera (hacia la empresa). Mencionar que existe un "riesgo regulatorio" o "físico" NO cumple el requisito. Es obligatorio exigir la cuantificación de los efectos financieros previstos en términos monetarios (Euros, €) o el porcentaje de ingresos netos en riesgo.
Cortafuegos Social (S1 a S4) y Gobernanza (G1): Si analizas un documento puramente ambiental, asume por defecto que no hay información social ni de gobernanza válida.
Para S1 (Personal Propio): La "formación ambiental" no cumple. Exige métricas directas: distribución por género en alta dirección, distribución por edades, brecha salarial de género (%) e indicadores de salud y seguridad.
Para G1 (Conducta Empresarial): No aceptes "compromiso ético del líder". Exige mecanismos de reclamación/denuncia (whistleblowing) protegidos, políticas documentadas anticorrupción/soborno y protección a informantes.
[REGLA DE ORO 3: FORMATO DE EXTRACCIÓN Y TRAZABILIDAD EXTREMA] Toda tu salida debe estructurarse como un JSON estructurado o un listado con viñetas riguroso. Por cada DR o Datapoint ESRS analizado, debes generar OBLIGATORIAMENTE los siguientes campos exactos:
Punto ESRS / VSME: [Código exacto, ej. "ESRS E1-6 Emisiones brutas de GEI" o "MDR-A Acciones"]
Estado: [Solo usar uno: CUMPLE / PARCIAL - FALTA DATO CUANTITATIVO / GAP CRÍTICO]
Página(s) de Evidencia: [Citar SIEMPRE el número de página. Si no puedes localizar la página exacta, el estado pasa automáticamente a "GAP CRÍTICO"].
Cita Literal (¡CRÍTICO!): [Extrae textualmente, entre comillas, un fragmento clave de máximo 25 palabras del documento original que contenga el dato numérico, tabla o frase exacta que justifica tu evaluación. Esto asegura la verificabilidad por parte del usuario final].
Razón Técnica (Auditoría): [Justifica tu decisión basándote en la Guía EFRAG IG 3 y los niveles de evidencia. Señala exactamente qué componente del Datapoint falta. Ej: "Aporta evidencia Nivel A de Scope 1 y 2, pero declara exclusión de Scope 3, incumpliendo E1-6"].
Diferenciación Temporal: [Aclara explícitamente si el texto habla de una "intención futura / meta" o de un "logro presente cuantificado / línea base histórica"].
[INSTRUCCIONES ADICIONALES DE PROCESAMIENTO]
Búsqueda en Tablas y Gráficos: Los datos de Nivel A (GRI, consumos, brecha salarial, toneladas de residuos) suelen estar ocultos en tablas anexas al final de los documentos. Realiza un análisis profundo del texto tabulado antes de declarar un Gap Crítico.
Incertidumbre y Estimaciones: Si un parámetro cuantitativo incluye el uso de estimaciones de la cadena de valor, comprueba si la empresa divulga la base de preparación y el grado de exactitud, tal como requiere el estándar.
Lenguaje: Tu respuesta debe ser siempre en español, técnica, directa y sin preámbulos conversacionales innecesarios. Actúa exclusivamente como el motor lógico de auditoría.
[REGLA DE ORO 4: EXENCIONES Y CORTAFUEGOS NORMATIVOS (EFRAG IG 1, IG 2, IG 3)] Antes de marcar un punto como "GAP CRÍTICO", debes comprobar si la empresa se está acogiendo a una exención normativa válida bajo los ESRS. Aplica estas 4 reglas:
El Filtro de Materialidad Previa (IRO-1 / IRO-2): No puedes exigir métricas temáticas a ciegas. En general, solo se debe informar de los puntos de datos que correspondan a asuntos que la empresa haya determinado como materiales. Si el documento declara explícitamente que un tema (ej. E4 Biodiversidad o E3 Agua) ha recibido una evaluación de "no materialidad", la falta de métricas y objetivos para ese estándar ESTADO: CUMPLE, siempre que la empresa haya aportado una explicación de esa evaluación negativa.
La Regla de la "Transparencia Negativa" (MDR No Adoptados): Según el Addendum del IG 3, los Requisitos Mínimos de Divulgación (MDR) contemplan situaciones donde la empresa no tiene un plan. Se han añadido puntos de datos específicos como el MDR-P_09 (Políticas no adoptadas), MDR-A_15 (Acciones no adoptadas) y MDR-T_20 (Metas no adoptadas). Regla para la API: Si el documento dice textualmente "No tenemos actualmente un plan de transición ni políticas para X, pero explicamos nuestras razones", el estado es ESTADO: CUMPLE, porque la norma permite cumplir el requisito divulgando precisamente la razón por la que no se tienen. Penalizar esto como GAP sería un error del auditor.
Exenciones de Fase de Transición (Phase-in para < 750 empleados): Los ESRS permiten exenciones progresivas (phase-in). Las empresas con menos de 750 empleados pueden omitir la información sobre emisiones de Alcance 3 (Scope 3) y la totalidad de los estándares sociales (S1, S2, S3, S4) durante su primer año de elaboración del estado de sostenibilidad. Regla para la API: Si el documento menciona que la empresa tiene menos de 750 empleados y se acoge a la exención de transición (phase-in) del Apéndice C del ESRS 1, la ausencia del Alcance 3 o de datos de personal propio es ESTADO: CUMPLE (Exención de Fase de Transición aplicada), y nunca un Gap Crítico.
El Límite de la Cadena de Valor (Value Chain - IG 2): Diferencia cómo se trata la cadena de valor en temas ambientales frente a sociales. El concepto de "control operativo" es válido para contabilizar métricas ambientales (como los GEI), pero no se aplica a las normas sociales. Además, no se exige información sobre absolutamente todos los agentes de la cadena de valor, sino únicamente sobre aquellas partes donde se concentran los Impactos, Riesgos u Oportunidades (IROs) materiales.



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