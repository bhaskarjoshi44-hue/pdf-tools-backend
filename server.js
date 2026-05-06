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

// RAM बचाने के लिए Memory Storage
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB Limit
});

// 1. --- MERGE PDF ---
app.post('/merge-pdf', upload.array('files'), async (req, res) => {
    try {
        const mergedPdf = await PDFDocument.create();
        for (const file of req.files) {
            const pdf = await PDFDocument.load(file.buffer);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        const pdfBytes = await mergedPdf.save();
        res.contentType("application/pdf");
        res.send(Buffer.from(pdfBytes));
    } catch (err) { res.status(500).send("Merge Error: " + err.message); }
});

// 2. --- SPLIT PDF (First 5 pages for example) ---
app.post('/split-pdf', upload.single('file'), async (req, res) => {
    try {
        const pdf = await PDFDocument.load(req.file.buffer);
        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(pdf, [0]); // सिर्फ पहला पेज उदहारण के लिए
        newPdf.addPage(pages[0]);
        const pdfBytes = await newPdf.save();
        res.contentType("application/pdf");
        res.send(Buffer.from(pdfBytes));
    } catch (err) { res.status(500).send("Split Error"); }
});

// 3. --- COMPRESS PDF (Basic Optimization) ---
app.post('/compress-pdf', upload.single('file'), async (req, res) => {
    try {
        const pdf = await PDFDocument.load(req.file.buffer);
        // pdf-lib में compression सीमित है, यह उसे दोबारा सेव करके ऑप्टिमाइज़ करता है
        const pdfBytes = await pdf.save({ useObjectStreams: true });
        res.contentType("application/pdf");
        res.send(Buffer.from(pdfBytes));
    } catch (err) { res.status(500).send("Compress Error"); }
});

// 4. --- IMAGE TO OCR (Text) ---
app.post('/ocr', upload.single('file'), async (req, res) => {
    try {
        const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'eng');
        res.json({ text });
    } catch (err) { res.status(500).send("OCR Error"); }
});

// 5. --- PDF TO JPG (The one causing Timeout) ---
app.post('/pdf-to-jpg', upload.single('file'), async (req, res) => {
    try {
        console.log("Conversion started...");
        // Scale 1.2 रखने से RAM कम खर्च होगी और Timeout नहीं होगा
        const images = await pdf2img.convert(req.file.buffer, { scale: 1.2 });
        
        const zip = new AdmZip();
        images.forEach((img, i) => {
            zip.addFile(`page_${i + 1}.jpg`, img);
        });

        const zipBuffer = zip.toBuffer();
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename=images.zip',
            'Content-Length': zipBuffer.length
        });
        res.send(zipBuffer);
    } catch (err) { 
        console.error(err);
        res.status(500).send("PDF to JPG Error"); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
