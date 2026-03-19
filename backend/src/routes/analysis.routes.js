import express from 'express';
import multer from 'multer';
import { analyzeSustainabilityPdf } from '../services/esgAnalyzer.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('report'), async (req, res) => {
  let intervalId;
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Debes subir un PDF.' });
    }

    // Iniciamos la respuesta para evitar el Timeout (504)
    res.setHeader('Content-Type', 'application/json');
    res.status(200);

    // Mandamos un espacio en blanco cada 15 segundos para mantener la conexión "viva"
    // Esto engaña al Load Balancer de Koyeb/Hostinger haciéndole creer que estamos enviando un archivo muy grande
    intervalId = setInterval(() => {
      res.write(' ');
    }, 15000);

    const result = await analyzeSustainabilityPdf(req.file.buffer, req.file.originalname);
    
    // Al terminar de analizar, limpiamos el temporizador y enviamos el JSON final real
    clearInterval(intervalId);
    res.write(JSON.stringify(result));
    res.end();
  } catch (error) {
    console.error(error);
    if (intervalId) clearInterval(intervalId);
    
    // Si ya habíamos enviado Headers de 200, devolvemos el error dentro del JSON
    if (!res.headersSent) {
      return res.status(500).json({
        message: 'No se pudo analizar el informe.',
        error: error.message
      });
    } else {
      res.write(JSON.stringify({
        error: true,
        message: 'No se pudo analizar el informe.',
        details: error.message
      }));
      res.end();
    }
  }
});

export default router;
