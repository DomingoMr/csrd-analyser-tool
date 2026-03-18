function escapeCsvValue(value) {
    const stringValue = value == null ? '' : String(value);
    const escapedValue = stringValue.replace(/"/g, '""');
    return `"${escapedValue}"`;
}

function buildCsvContent(result) {
    const lines = [];

    // 1. RESUMEN PRIMERO
    lines.push(['Resumen', 'Motivo'].join(','));
    lines.push([
        escapeCsvValue('Resumen'),
        escapeCsvValue(result?.summary || '')
    ].join(','));

    lines.push('');

    // 2. BLOQUES
    lines.push(['Bloque', 'Motivo'].join(','));

    (result?.matches || []).forEach((item) => {
        lines.push([
            escapeCsvValue(item?.bloque || ''),
            escapeCsvValue(item?.motivo || '')
        ].join(','));
    });

    lines.push('');

    // 3. FOOTER
    lines.push(escapeCsvValue('Mas información en info@etreeenergy.es'));

    return '\uFEFF' + lines.join('\n');
}

function downloadCsv(result) {
    const csvContent = buildCsvContent(result);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const safeFileName = (result?.fileName || 'resultado-esrs')
        .replace(/\.pdf$/i, '')
        .replace(/[^\w\-]+/g, '_');

    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName}_analisis_esrs.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export default function CsvDownloadButton({ result }) {
    const hasMatches = Array.isArray(result?.matches) && result.matches.length > 0;

    return (
        <button
            type="button"
            className="downloadCsvButton"
            onClick={() => downloadCsv(result)}
            disabled={!result || !hasMatches}
        >
            Descargar CSV
        </button>
    );
}