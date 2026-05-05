const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const tesseract = require('tesseract.js');
const pdf2img = require('pdf-img-convert');

const app = express();
app.use(cors());
app.use(express.json());

// फोल्डर्स सेटअप
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');
fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(PROCESSED_DIR);

app.use('/download', express.static(PROCESSED_DIR));

// फाइल अपलोड लिमिट - 25MB
const upload = multer({ 
    dest: UPLOADS_DIR,
    limits: { fileSize: 25 * 1024 * 1024 } 
});

app.get('/', (req, res) => {
    res.send('Smart PDF Backend is Live and Running!');
});

// --- 1. MERGE PDF ---
app.post('/merge', upload.array('files'), async (req, res) => {
    try {
        const mergedPdf = await PDFDocument.create();
        for (const file of req.files) {
            const pdfBytes = fs.readFileSync(file.path);
            const pdf = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
            fs.removeSync(file.path);
        }
        const fileName = `merged-${Date.now()}.pdf`;
        const filePath = path.join(PROCESSED_DIR, fileName);
        fs.writeFileSync(filePath, await mergedPdf.save());
        res.json({ downloadUrl: `https://${req.get('host')}/download/${fileName}` });
    } catch (err) { res.status(500).json({ error: "Merge failed" }); }
});

// --- 2. COMPRESS PDF ---
app.post('/compress', upload.single('file'), async (req, res) => {
    try {
        const pdfDoc = await PDFDocument.load(fs.readFileSync(req.file.path));
        const compressedBytes = await pdfDoc.save({ useObjectStreams: true });
        const fileName = `compressed-${Date.now()}.pdf`;
        fs.writeFileSync(path.join(PROCESSED_DIR, fileName), compressedBytes);
        fs.removeSync(req.file.path);
        res.json({ downloadUrl: `https://${req.get('host')}/download/${fileName}` });
    } catch (err) { res.status(500).json({ error: "Compression failed" }); }
});

// --- 3. SPLIT PDF ---
app.post('/split', upload.single('file'), async (req, res) => {
    try {
        const pdfDoc = await PDFDocument.load(fs.readFileSync(req.file.path));
        const zipName = `split-${Date.now()}.zip`;
        const output = fs.createWriteStream(path.join(PROCESSED_DIR, zipName));
        const archive = archiver('zip');
        archive.pipe(output);
        for (let i = 0; i < pdfDoc.getPageCount(); i++) {
            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(pdfDoc, [i]);
            newPdf.addPage(page);
            archive.append(Buffer.from(await newPdf.save()), { name: `page-${i+1}.pdf` });
        }
        await archive.finalize();
        fs.removeSync(req.file.path);
        res.json({ downloadUrl: `https://${req.get('host')}/download/${zipName}` });
    } catch (err) { res.status(500).json({ error: "Split failed" }); }
});

// --- 4. IMAGE TO TEXT (OCR) ---
app.post('/ocr', upload.single('file'), async (req, res) => {
    try {
        const result = await tesseract.recognize(req.file.path, 'eng');
        const fileName = `text-${Date.now()}.txt`;
        fs.writeFileSync(path.join(PROCESSED_DIR, fileName), result.data.text);
        fs.removeSync(req.file.path);
        res.json({ downloadUrl: `https://${req.get('host')}/download/${fileName}` });
    } catch (err) { res.status(500).json({ error: "OCR failed" }); }
});

// --- 5. PDF TO JPG ---
app.post('/pdf-to-jpg', upload.single('file'), async (req, res) => {
    try {
        const images = await pdf2img.convert(req.file.path);
        const zipName = `images-${Date.now()}.zip`;
        const output = fs.createWriteStream(path.join(PROCESSED_DIR, zipName));
        const archive = archiver('zip');
        archive.pipe(output);
        images.forEach((img, i) => {
            archive.append(img, { name: `page-${i+1}.jpg` });
        });
        await archive.finalize();
        fs.removeSync(req.file.path);
        res.json({ downloadUrl: `https://${req.get('host')}/download/${zipName}` });
    } catch (err) { res.status(500).json({ error: "Conversion failed" }); }
});

// ऑटो-डिलीट पुरानी फाइल्स
setInterval(() => {
    fs.emptyDirSync(UPLOADS_DIR);
}, 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server live on port ${PORT}`));
