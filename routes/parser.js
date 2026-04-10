const express = require('express');
const multer = require('multer');
const { parseResumeWithGemini } = require('../services/geminiParser');
const auth = require('../middleware/auth');

const router = express.Router();

// Memory storage for multer (we process the buffer instantly)
const upload = multer({ storage: multer.memoryStorage() });

router.post('/parse', auth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Usually users pass API key from frontend or via an environment variable
    const apiKey = req.body.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ message: 'Gemini API key is required' });
    }

    const mimeType = req.file.mimetype;

    // Check if it's pdf or docx, google gemini ideally reads pdf well
    if (mimeType !== 'application/pdf') {
      console.warn("Mime type is not pdf, it might have lower accuracy:", mimeType);
    }

    const parsedJson = await parseResumeWithGemini(req.file.buffer, mimeType, apiKey);

    res.json(parsedJson);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error processing resume', error: err.message });
  }
});

module.exports = router;
