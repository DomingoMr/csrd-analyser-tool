import express from 'express';
import multer from 'multer';
import { analyzeSustainabilityPdf } from '../services/esgAnalyzer.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('report'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Debes subir un PDF.' });
    }

    const result = await analyzeSustainabilityPdf(req.file.buffer, req.file.originalname);
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: 'No se pudo analizar el informe.',
      error: error.message
    });
  }
});

export default router;
