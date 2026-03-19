import { useMemo, useRef, useState } from 'react';
import { analyzePdf } from './api';
import CsvDownloadButton from './components/CsvDownloadButton';

const categoryOrder = ['E', 'S', 'G'];
const MAX_FILES = 4;
const MAX_USES = 1;
const EMAIL_CONTACT = 'jgil@etreeenergy.es';
// Límite conservador para evitar cuelgues masivos y sobrepasar el límite de tokens de OpenAI en informes muy densos
const MAX_FILE_SIZE_MB = 15;

// Mensajes base, el primero se sustituirá dinámicamente con la estimación
const baseLoadingMessages = [
  "Analizando documento...",
  "Admirando los colores y las imagenes...",
  "Aprovecha para tomarte un café o un té",
  "Te diría que te relajes, pero no quiero que te duermas",
  "Vamos por la mitad, unos minutitos mas...",
  "Ya casi lo tenemos, no te vayas...",
  "Listo en un minutito..."
];

const categoryConfig = {
  E: { label: 'Environmental' },
  S: { label: 'Social' },
  G: { label: 'Governance' }
};

const faqItems = [
  {
    question: '¿Cómo saber qué ESRS aplican a mi empresa?',
    answer:
      'Una forma práctica es analizar el contenido de tu memoria de sostenibilidad, informe ESG o documentación interna para detectar los temas ambientales, sociales y de gobernanza más presentes. Esta herramienta automatiza esa primera revisión y te ayuda a identificar bloques ESRS potencialmente relevantes.'
  },
  {
    question: '¿Puedo subir una memoria de sostenibilidad ya publicada?',
    answer:
      'Sí. Puedes analizar memorias de sostenibilidad, informes ESG, estados no financieros, políticas corporativas y otros documentos en PDF para detectar qué puntos ESRS aparecen con más relación en el contenido.'
  },
  {
    question: '¿La herramienta sirve si mi informe aún no está adaptado a la CSRD?',
    answer:
      'Sí. También resulta útil en fases tempranas, cuando la empresa quiere entender qué estándares ESRS pueden afectarle antes de rehacer su reporting.'
  },
  {
    question: '¿Qué diferencia hay entre CSRD y ESRS?',
    answer:
      'La CSRD es la directiva europea que establece obligaciones de reporting de sostenibilidad. Los ESRS son los estándares que concretan qué información debe reportarse.'
  },
  {
    question: '¿Puedo analizar varios PDFs a la vez?',
    answer: `Sí. La herramienta permite analizar hasta ${MAX_FILES} documentos PDF y combinar los resultados para obtener una visión consolidada.`
  },
  {
    question: '¿Qué obtengo al finalizar el análisis?',
    answer:
      'Obtienes una clasificación preliminar de puntos E, S y G detectados en los documentos, junto con la explicación de por qué cada bloque ESRS puede ser relevante y la opción de exportar resultados.'
  },
  {
    question: '¿Sustituye esta herramienta un análisis de doble materialidad o una revisión regulatoria?',
    answer:
      'No. El analizador ESRS está pensado como apoyo preliminar para acelerar la revisión documental. Los resultados deben complementarse con criterio experto, análisis de doble materialidad y validación regulatoria.'
  }
];

const documentTypes = [
  'Memorias de sostenibilidad',
  'Informes ESG',
  'Estados de información no financiera',
  'Políticas de sostenibilidad',
  'Códigos éticos y de conducta',
  'Informes de impacto y documentación corporativa'
];

const useCases = [
  {
    title: 'Preparar la adaptación a CSRD',
    description:
      'Analiza una memoria de sostenibilidad existente y detecta qué bloques ESRS aparecen ya cubiertos y cuáles requieren revisión posterior.'
  },
  {
    title: 'Revisar documentación dispersa',
    description:
      'Combina políticas, informes ESG y otros PDFs para obtener una visión consolidada de los temas E, S y G presentes en la documentación corporativa.'
  },
  {
    title: 'Acelerar una primera revisión documental',
    description:
      'Útil para consultoras ESG, responsables de sostenibilidad y equipos de compliance que necesitan una clasificación inicial antes de entrar en análisis más profundo.'
  }
];

export default function App() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [estimatedTotalMinutes, setEstimatedTotalMinutes] = useState(5);
  const [modalConfig, setModalConfig] = useState(null); // Nuevo estado para el modal

  const inputRef = useRef(null);

  const groupedMatches = useMemo(() => {
    const matches = Array.isArray(result?.matches) ? result.matches : [];

    return categoryOrder.map((category) => ({
      category,
      label: categoryConfig[category].label,
      items: matches.filter((match) => match.categoria === category)
    }));
  }, [result]);

  const animateProgressTo = (target, step = 1, intervalMs = 120) => {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= target) {
            clearInterval(timer);
            resolve();
            return prev;
          }

          const next = Math.min(prev + step, target);
          if (next >= target) {
            clearInterval(timer);
            resolve();
          }
          return next;
        });
      }, intervalMs);
    });
  };

  const checkDailyLimit = () => {
    const today = new Date().toISOString().split('T')[0];
    let usage = JSON.parse(localStorage.getItem('csrd_usage') || '{}');

    if (usage.date !== today) {
      usage = { date: today, count: 0 };
    }

    if (usage.count >= MAX_USES) {
      return false;
    }

    usage.count += 1;
    localStorage.setItem('csrd_usage', JSON.stringify(usage));
    return true;
  };

  const setSelectedFiles = (selectedFiles) => {
    const incomingFiles = Array.from(selectedFiles || []).filter(
      (file) => file.type === 'application/pdf'
    );

    if (incomingFiles.length === 0) {
      setError('Solo se permiten archivos PDF.');
      return;
    }

    setFiles((prevFiles) => {
      const mergedFiles = [...prevFiles];

      for (const incomingFile of incomingFiles) {
        const alreadyExists = mergedFiles.some(
          (existingFile) =>
            existingFile.name === incomingFile.name &&
            existingFile.size === incomingFile.size &&
            existingFile.lastModified === incomingFile.lastModified
        );

        if (!alreadyExists) {
          // Límite de tamaño: 15MB
          const sizeInMB = incomingFile.size / (1024 * 1024);
          if (sizeInMB > MAX_FILE_SIZE_MB) {
            setModalConfig({
              title: "Archivo demasiado pesado",
              message: `El archivo "${incomingFile.name}" supera el límite gratuito de la plataforma (${MAX_FILE_SIZE_MB}MB). No te preocupes, envíanos el documento directamente por email y nuestros expertos te harán una primera propuesta de análisis de forma totalmente gratuita y sin compromiso.`
            });
            continue;
          }
          mergedFiles.push(incomingFile);
        }
      }

      if (mergedFiles.length > MAX_FILES) {
        setError(`Máximo ${MAX_FILES} PDFs permitidos.`);
        return prevFiles;
      }

      setError('');
      setResult(null);

      return mergedFiles;
    });
  };

  const handleFileChange = (event) => {
    setSelectedFiles(event.target.files);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    setSelectedFiles(event.dataTransfer.files);
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleAnalyze = async (event) => {
    event.preventDefault();

    if (!files.length) {
      setError('Selecciona al menos un PDF.');
      return;
    }

    if (!checkDailyLimit()) {
      setModalConfig({
        title: "Límite diario alcanzado",
        message: "Has superado el número de pruebas gratuitas por hoy. Si necesitas seguir analizando documentos, envíanos un correo ahora mismo y realizaremos un primer análisis de forma completamente gratuita."
      });
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setProgress(0);
    setCurrentFileName('');
    setLoadingMessageIndex(0);

    const totalSizeInMB = files.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024);
    // 2 MB = ~5 minutos -> 2.5 mins por MB
    const totalMinutes = Math.max(1, Math.ceil(totalSizeInMB * 2.5));
    setEstimatedTotalMinutes(totalMinutes);

    // El progreso se actualizará para rellenarse a lo largo del total estimado
    // 100% de la barra = totalMinutes * 60 segundos
    const msPerPercent = (totalMinutes * 60000) / 100;

    const messageInterval = setInterval(() => {
      setLoadingMessageIndex((prev) => Math.min(prev + 1, baseLoadingMessages.length - 1));
    }, Math.max(60000, (totalMinutes * 60000) / baseLoadingMessages.length));

    try {
      const results = [];

      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];
        setCurrentFileName(currentFile.name);

        const baseProgress = Math.round((i / files.length) * 100);
        const maxSimulatedProgress = Math.round(((i + 0.85) / files.length) * 100);
        const realCompletedProgress = Math.round(((i + 1) / files.length) * 100);

        setProgress(baseProgress);

        const progressInterval = setInterval(() => {
          setProgress((prev) => {
            if (prev >= maxSimulatedProgress) return prev;
            return prev + 1;
          });
        }, msPerPercent / files.length); // Ajustado para avanzar al compás de la estimación total

        const data = await analyzePdf(currentFile);
        results.push(data);

        clearInterval(progressInterval);
        setProgress(realCompletedProgress);
      }

      const combinedMatches = results.flatMap((r) => r.matches || []);

      const uniqueMatches = Array.from(
        new Map(combinedMatches.map((item) => [item.bloque, item])).values()
      );

      const combinedResult = {
        fileName: `${files.length} documentos`,
        matches: uniqueMatches,
        summary: `Análisis combinado de ${files.length} documentos.`
      };

      setProgress(100);
      setResult(combinedResult);
    } catch (err) {
      setError(err.message || 'Se ha producido un error durante el análisis.');
    } finally {
      clearInterval(messageInterval);
      setLoading(false);
      setCurrentFileName('');
    }
  };

  const handleSelectClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="page">
      {modalConfig && (
        <div className="modalOverlay" onClick={() => setModalConfig(null)}>
          <div className="modalCard" onClick={e => e.stopPropagation()}>
            <h2>{modalConfig.title}</h2>
            <p>{modalConfig.message}</p>
            <div className="modalActions">
              <a
                href={`mailto:${EMAIL_CONTACT}?subject=Solicitud de análisis CSRD gratuito`}
                className="primaryButton"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}
              >
                Enviar correo a {EMAIL_CONTACT}
              </a>
              <button type="button" className="secondaryButton" onClick={() => setModalConfig(null)}>
                Volver a la aplicación
              </button>
            </div>
          </div>
        </div>
      )}

      <main>
        <header className="hero">
          <div className="hero__content">
            <span className="badge">CSRD • ESRS • ESG</span>

            <h1>
              Analiza tu informe de sostenibilidad y detecta qué estándares ESRS
              pueden aplicar a tu empresa
            </h1>

            <p>
              Sube tu memoria de sostenibilidad, informe ESG o documentación corporativa
              en PDF y obtén una clasificación preliminar de los bloques Environmental,
              Social y Governance más relevantes para tu análisis CSRD.
            </p>

            <div className="heroHighlights" aria-label="Beneficios principales">
              <span>Analiza tus PDFs</span>
              <span>Detección de puntos E, S y G</span>
              <span>Exportación en CSV</span>
              <span>Orientado a reporting CSRD</span>
            </div>

            <form className="uploadCard" onSubmit={handleAnalyze}>
              <label
                className={`uploadBox ${isDragging ? 'uploadBox--dragging' : ''}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={handleFileChange}
                />

                <strong>
                  {files.length > 0
                    ? 'PDFs preparados para analizar'
                    : 'Arrastra aquí tus informes de sostenibilidad en PDF'}
                </strong>

                <span>
                  {files.length > 0
                    ? `${files.length} archivo(s) seleccionados`
                    : 'También puedes hacer clic en el botón para seleccionar memorias de sostenibilidad, informes ESG, estados no financieros o guías internas desde tus archivos'}
                </span>

                <div className="uploadActions">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={handleSelectClick}
                    disabled={loading}
                  >
                    Seleccionar PDF
                  </button>

                  <button type="submit" className="primaryButton" disabled={loading}>
                    {loading ? 'Analizando...' : 'Analizar informe'}
                  </button>
                </div>
              </label>

              <div className="trustRow" aria-label="Características principales">
                <div className="trustItem">
                  <strong>Formato PDF</strong>
                  Analiza varios documentos y combina resultados.
                </div>
                <div className="trustItem">
                  <strong>Clasificación E, S y G</strong>
                  Detecta criterios ambientales, sociales y de gobernanza.
                </div>
                <div className="trustItem">
                  <strong>Exportación CSV</strong>
                  Descarga los hallazgos para seguir trabajando el análisis.
                </div>
                <div className="trustItem">
                  <strong>Uso preliminar</strong>
                  Pensada para acelerar la revisión documental ESG y CSRD.
                </div>
              </div>

              {files.length > 0 && (
                <div className="selectedFile">
                  <strong>{files.length} documento(s) seleccionados:</strong>
                  <ul>
                    {files.map((f, i) => (
                      <li key={i}>{f.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </form>

            {loading && (
              <div className="loaderWrap" aria-live="polite">
                <div className="loader" />
                <div style={{ width: '100%' }}>
                  <p>
                    {loadingMessageIndex === 0
                      ? `Analizando... Tiempo estimado: ${estimatedTotalMinutes} minuto${estimatedTotalMinutes > 1 ? 's' : ''}`
                      : baseLoadingMessages[loadingMessageIndex]} ({progress}%)
                  </p>
                  <div className="progressBar">
                    <div
                      className="progressBar__fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && <div className="errorBox">{error}</div>}
          </div>
        </header>

        {result && (
          <section className="results" aria-labelledby="resultados-analisis">
            <div className="results__header">
              <h2 id="resultados-analisis">Resultados del análisis ESRS</h2>
              <p>{result.summary}</p>
              <small>
                Documento: <strong>{result.fileName}</strong>
              </small>

              <div className="results__actions">
                <CsvDownloadButton result={result} />
              </div>
            </div>

            <div className="resultsColumns">
              {groupedMatches.map((group) => (
                <section key={group.category} className="resultsColumn">
                  <div className="resultsColumn__header">
                    <div
                      className={`resultsColumn__badge resultsColumn__badge--${group.category}`}
                    >
                      {group.category}
                    </div>

                    <div className="resultsColumn__title">
                      <strong>{group.label}</strong>
                      <span>{group.items.length} puntos detectados</span>
                    </div>
                  </div>

                  {group.items.length > 0 ? (
                    group.items.map((item, index) => (
                      <article
                        key={`${group.category}-${item.bloque}-${index}`}
                        className="resultCard"
                      >
                        <h3>{item.bloque}</h3>
                        <p>{item.motivo}</p>
                      </article>
                    ))
                  ) : (
                    <div className="emptyColumnCard">
                      No se han detectado puntos para esta categoría en el análisis actual.
                    </div>
                  )}
                </section>
              ))}
            </div>
          </section>
        )}

        <section className="contentSection">
          <section id="que-hace" className="sectionCard" aria-labelledby="que-hace-title">
            <h2 id="que-hace-title">¿Qué hace esta herramienta ESRS?</h2>
            <p className="sectionIntro">
              Esta herramienta permite analizar informes de sostenibilidad en PDF para
              detectar estándares ESRS potencialmente aplicables a una empresa. Revisa
              el contenido documental y clasifica hallazgos en tres dimensiones:
              Environmental, Social y Governance.
            </p>
            <p>
              Está pensada para acelerar la revisión inicial de memorias de sostenibilidad,
              informes ESG y otra documentación corporativa, ayudando a priorizar el trabajo
              de reporting de sostenibilidad bajo CSRD.
            </p>

            <div className="featureGrid">
              <article className="miniCard">
                <h3>Sube memorias e informes ESG</h3>
                <p>
                  Analiza memorias de sostenibilidad, estados no financieros, políticas ESG
                  y otra documentación corporativa relevante.
                </p>
              </article>
              <article className="miniCard">
                <h3>Detecta bloques E, S y G</h3>
                <p>
                  La herramienta revisa el contenido y agrupa coincidencias según criterios
                  ambientales, sociales y de gobernanza alineados con el análisis ESRS.
                </p>
              </article>
              <article className="miniCard">
                <h3>Prioriza tu análisis CSRD</h3>
                <p>
                  Obtén una primera capa de orientación para identificar qué estándares ESRS
                  pueden merecer revisión más profunda.
                </p>
              </article>
            </div>
          </section>

          <section id="documentos" className="sectionCard" aria-labelledby="documentos-title">
            <h2 id="documentos-title">Qué documentos puedes analizar</h2>
            <p className="sectionIntro">
              El analizador ESRS está pensado para trabajar con distintos tipos de documentación
              de sostenibilidad y reporting corporativo en formato PDF.
            </p>

            <div className="documentsList">
              {documentTypes.map((item, index) => (
                <div key={index} className="documentPill">
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section id="como-funciona" className="sectionCard" aria-labelledby="como-funciona-title">
            <h2 id="como-funciona-title">Cómo funciona</h2>
            <p className="sectionIntro">
              El proceso está diseñado para que cualquier equipo pueda obtener una primera
              lectura documental de sus ESRS potencialmente relevantes en pocos pasos.
            </p>

            <div className="stepsGrid">
              <article className="miniCard">
                <h3>1. Sube tus PDFs</h3>
                <p>
                  Arrastra o selecciona informes de sostenibilidad, memorias ESG,
                  estados no financieros o políticas corporativas en PDF.
                </p>
              </article>
              <article className="miniCard">
                <h3>2. Analizamos el contenido</h3>
                <p>
                  El sistema procesa los documentos y detecta referencias relevantes
                  asociadas a bloques ESRS y criterios E, S y G.
                </p>
              </article>
              <article className="miniCard">
                <h3>3. Revisa y exporta resultados</h3>
                <p>
                  Obtén los hallazgos clasificados por Environmental, Social y Governance,
                  con explicación y descarga en CSV.
                </p>
              </article>
            </div>
          </section>

          <section id="que-obtienes" className="sectionCard" aria-labelledby="que-obtienes-title">
            <h2 id="que-obtienes-title">Qué obtienes al analizar un informe de sostenibilidad</h2>
            <p className="sectionIntro">
              La herramienta está orientada a generar un resultado claro, accionable y fácil
              de revisar por equipos ESG, sostenibilidad, compliance y consultoría.
            </p>

            <div className="resultsGrid">
              <article className="miniCard">
                <h3>Clasificación preliminar por E, S y G</h3>
                <p>
                  Identifica qué bloques ambientales, sociales y de gobernanza aparecen con
                  mayor relevancia en el contenido analizado.
                </p>
              </article>
              <article className="miniCard">
                <h3>Bloques ESRS detectados</h3>
                <p>
                  Obtén una lista de puntos y estándares potencialmente aplicables en función
                  de la presencia temática del documento.
                </p>
              </article>
              <article className="miniCard">
                <h3>Motivo de relevancia y exportación</h3>
                <p>
                  Cada hallazgo incorpora contexto explicativo y puede exportarse en CSV para
                  continuar el análisis fuera de la herramienta.
                </p>
              </article>
            </div>
          </section>

          <section className="sectionCard" aria-labelledby="para-quien-title">
            <h2 id="para-quien-title">¿Para quién es útil esta herramienta?</h2>
            <p className="sectionIntro">
              El analizador ESRS está diseñado para organizaciones y profesionales que necesitan
              revisar documentación de sostenibilidad con rapidez, criterio y foco en CSRD.
            </p>

            <div className="audienceGrid">
              <article className="miniCard">
                <h3>Empresas sujetas a CSRD</h3>
                <p>
                  Ideal para compañías que preparan o revisan su reporting de sostenibilidad
                  bajo marco europeo.
                </p>
              </article>
              <article className="miniCard">
                <h3>Consultoras ESG y CSRD</h3>
                <p>
                  Útil para equipos que analizan documentación de clientes y necesitan una
                  primera clasificación ágil.
                </p>
              </article>
              <article className="miniCard">
                <h3>Responsables de sostenibilidad y compliance</h3>
                <p>
                  Ayuda a detectar temas relevantes antes de entrar en una revisión técnica
                  más detallada o en un ejercicio de doble materialidad.
                </p>
              </article>
            </div>
          </section>

          <section id="casos-de-uso" className="sectionCard" aria-labelledby="casos-de-uso-title">
            <h2 id="casos-de-uso-title">Casos de uso frecuentes</h2>
            <p className="sectionIntro">
              Estas son algunas situaciones en las que una herramienta para analizar ESRS
              y documentación ESG puede aportar valor inmediato.
            </p>

            <div className="useCaseGrid">
              {useCases.map((item, index) => (
                <article key={index} className="miniCard">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="sectionCard" aria-labelledby="contexto-title">
            <h2 id="contexto-title">ESRS, CSRD y reporting ESG: contexto rápido</h2>
            <p>
              La CSRD establece nuevas exigencias de reporte de sostenibilidad para miles de
              empresas en Europa. Los ESRS son el marco de estándares que concreta qué
              información debe reportarse y cómo estructurarla. Identificar correctamente qué
              estándares pueden afectar a una organización es uno de los primeros pasos para
              ordenar el trabajo de cumplimiento y reporting.
            </p>
            <p>
              Esta herramienta no sustituye el análisis regulatorio o un ejercicio de doble
              materialidad, pero sí agiliza la revisión documental y permite detectar de forma
              preliminar qué temas de sostenibilidad aparecen con mayor presencia en la
              documentación corporativa.
            </p>

            <div className="methodologyBox">
              <p>
                <strong>Uso recomendado:</strong> emplea el resultado como apoyo preliminar
                para priorizar tu revisión documental, identificar áreas ESG cubiertas y
                preparar una evaluación posterior más detallada.
              </p>
              <p>
                <strong>Importante:</strong> los hallazgos deben complementarse con análisis
                experto, doble materialidad y validación regulatoria antes de utilizarlos
                como base final de reporting.
              </p>
            </div>
          </section>

          <section id="faq" className="sectionCard" aria-labelledby="faq-title">
            <h2 id="faq-title">Preguntas frecuentes</h2>
            <div className="faqList">
              {faqItems.map((item, index) => (
                <article key={index} className="faqItem">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          </section>
        </section>

        <footer className="footerNote">
          <div className="footerNote__card">
            Herramienta orientada a la detección preliminar de estándares ESRS a partir de
            documentación de sostenibilidad en PDF. Recomendable complementar los resultados
            con análisis experto, doble materialidad y validación regulatoria.
          </div>
        </footer>
      </main>
    </div>
  );
}