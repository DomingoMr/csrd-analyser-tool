# CSRD ESG Matcher

Aplicación sencilla para subir un PDF de una memoria de sostenibilidad, analizar su contenido y devolver los bloques E, S y G del catálogo ESRS que aplican según el CSV proporcionado.

## Arquitectura

- `frontend/`: landing page en React + Vite.
- `backend/`: API Express para recibir el PDF, extraer texto y consultar OpenAI.
- `backend/src/services/esgAnalyzer.js`: módulo encapsulado con toda la lógica de análisis. Está aislado para poder reutilizarlo en futuros desarrollos.
- `backend/data/esrs-resumen.csv`: catálogo base ESRS cargado desde tu CSV adjunto.

## Flujo funcional

1. El usuario entra en la landing.
2. Sube un PDF.
3. El frontend muestra un estado de carga.
4. El backend extrae el texto del PDF.
5. `esgAnalyzer.js` carga el catálogo ESRS desde el CSV y construye el prompt.
6. Se hace la llamada a la API de OpenAI.
7. La respuesta vuelve al frontend agrupada en E, S y G.

## Puesta en marcha

### 1) Instalar dependencias

```bash
npm install
npm run install:all
```

### 2) Configurar variables de entorno

Backend:

```bash
cp backend/.env.example backend/.env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
```

Añade tu clave en `backend/.env`:

```env
OPENAI_API_KEY=tu_clave
```

### 3) Ejecutar en local

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Consideraciones importantes

- Aunque pedías una aplicación front sencilla, la llamada a OpenAI **no debería hacerse directamente desde el navegador** porque expondría la API key. Por eso he dejado un backend mínimo y muy ligero.
- El análisis está encapsulado en `backend/src/services/esgAnalyzer.js`, listo para migrarse a otro backend, cola, microservicio o endpoint futuro.
- Actualmente se usa `pdf-parse` para extraer texto. Si en el futuro llegan PDFs escaneados, convendrá añadir OCR.
- El prompt ya está preparado para devolver un JSON estructurado y fácil de reutilizar.

## Mejoras recomendadas para siguientes iteraciones

- Añadir puntuación de confianza por bloque.
- Mostrar los bloques no aplicables o dudosos por separado.
- Guardar histórico de análisis.
- Añadir autenticación.
- Permitir analizar DOCX además de PDF.
