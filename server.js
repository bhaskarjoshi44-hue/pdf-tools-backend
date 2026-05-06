const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { PDFDocument } = require('pdf-lib');
const pdf2img = require('pdf-img-convert');
const AdmZip = require('adm-zip');
const Tesseract = require('tesseract.js');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// --- 1. MERGE PDF (Updated) ---
app.post('/merge-pdf', upload.array('files'), async (req, res) => {
    try {
        const mergedPdf = await PDFDocument.create();
        for (const file of req.files) {
            const pdf = await PDFDocument.load(file.buffer);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        const pdfBytes = await mergedPdf.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBytes));
    } catch (err) { res.status(500).send("Error merging PDFs"); }
});

// --- 2. COMPRESS PDF ---
app.post('/compress-pdf', upload.single('file'), async (req, res) => {
    try {
        const pdf = await PDFDocument.load(req.file.buffer);
        const pdfBytes = await pdf.save({ useObjectStreams: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBytes));
    } catch (err) { res.status(500).send("Error compressing PDF"); }
});

// --- 3. SPLIT PDF (Extract 1st Page) ---
app.post('/split-pdf', upload.single('file'), async (req, res) => {
    try {
        const pdf = await PDFDocument.load(req.file.buffer);
        const newDoc = await PDFDocument.create();
        const [firstPage] = await newDoc.copyPages(pdf, [0]);
        newDoc.addPage(firstPage);
        const pdfBytes = await newDoc.save();
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBytes));
    } catch (err) { res.status(500).send("Error splitting PDF"); }
});

// --- 4. IMAGE TO OCR (Returns Text JSON) ---
app.post('/ocr', upload.single('file'), async (req, res) => {
    try {
        const result = await Tesseract.recognize(req.file.buffer, 'eng');
        res.json({ text: result.data.text }); // OCR हमेशा JSON देगा
    } catch (err) { res.status(500).json({ error: "OCR Failed" }); }
});

// --- 5. PDF TO JPG ---
app.post('/pdf-to-jpg', upload.single('file'), async (req, res) => {
    try {
        const images = await pdf2img.convert(req.file.buffer, { scale: 1.2 });
        const zip = new AdmZip();
        images.forEach((img, i) => zip.addFile(`page_${i+1}.jpg`, img));
        res.setHeader('Content-Type', 'application/zip');
        res.send(zip.toBuffer());
    } catch (err) { res.status(500).send("Error converting PDF"); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
