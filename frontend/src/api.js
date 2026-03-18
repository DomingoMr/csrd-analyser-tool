const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function analyzePdf(file) {
  if (!file) {
    throw new Error('No se ha seleccionado ningún archivo.');
  }

  if (file.type !== 'application/pdf') {
    throw new Error('El archivo debe ser un PDF válido.');
  }

  const formData = new FormData();
  formData.append('report', file);

  const response = await fetch(`${API_BASE_URL}/api/analysis`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Se ha producido un error al analizar el PDF.');
  }

  return response.json();
}