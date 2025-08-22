// src/lib/invoiceParser.js
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min?url';
import { createWorker } from 'tesseract.js';
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/browser';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const zxingHints = new Map();
zxingHints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]);
const zxing = new BrowserMultiFormatReader(zxingHints);

const normalizeNumberAR = (raw) => {
  if (!raw) return null;
  const s = raw.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const guessItemsFromText = (text) => {
  // MVP: separar por líneas y buscar patrones (mejoramos luego)
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    // busca algo tipo: NOMBRE ...  CANT x PRECIO  o  CANT NOMBRE PRECIO
    const m = line.match(/(.+?)\s+(\d+)\s*x\s*([\d.,]+)/i) || line.match(/(\d+)\s+(.+?)\s+([\d.,]+)/i);
    if (m) {
      let nombre, cantStr, precioStr;
      if (m[1] && m[2] && m[3]) {
        // caso 1
        nombre = m[1].trim();
        cantStr = m[2];
        precioStr = m[3];
      } else {
        // fallback
        nombre = m[2]?.trim();
        cantStr = m[1];
        precioStr = m[3];
      }
      const cantidad = Number(cantStr);
      const costoUnidad = normalizeNumberAR(precioStr);
      if (nombre && Number.isInteger(cantidad) && cantidad > 0 && costoUnidad != null) {
        items.push({ nombre, ean: null, cantidad, costoUnidad });
      }
    }
  }
  return items;
};

const decodeEANFromImageEl = async (imgEl) => {
  try {
    const res = await zxing.decodeFromImageElement(imgEl);
    const txt = res?.getText?.() || res?.text || null;
    if (txt && /^\d{8,14}$/.test(txt)) return txt;
  } catch {}
  return null;
};

const ocrImageData = async (canvas) => {
  const worker = await createWorker({ logger: () => {} });
  await worker.loadLanguage('spa');
  await worker.initialize('spa');
  const { data: { text } } = await worker.recognize(canvas);
  await worker.terminate();
  return text || '';
};

const rasterPageToCanvas = async (page, scale=2) => {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
};

export async function parseInvoice(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const out = { items: [], proveedor: null, formaPago: null };

  if (isPdf) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);

      // 1) intento texto "nativo"
      const txtContent = await page.getTextContent();
      const rawText = txtContent.items?.map(it => it.str).join('\n') || '';

      if (rawText.length > 80) {
        out.items.push(...guessItemsFromText(rawText));
      }

      // 2) render para OCR + EAN
      const canvas = await rasterPageToCanvas(page, 2);
      // EAN
      const img = new Image();
      img.src = canvas.toDataURL('image/png');
      await img.decode().catch(()=>{});
      const ean = await decodeEANFromImageEl(img);

      // OCR si texto nativo pobre
      if (rawText.length <= 80) {
        const ocrText = await ocrImageData(canvas);
        out.items.push(...guessItemsFromText(ocrText));
      }

      // agregar EAN a la última línea detectada si existe
      if (ean && out.items.length) {
        const last = out.items[out.items.length - 1];
        if (!last.ean) last.ean = ean;
      }
    }
  } else {
    // Imagen (jpg/png)
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);

    const ean = await decodeEANFromImageEl(img);
    const text = await ocrImageData(canvas);
    out.items.push(...guessItemsFromText(text));
    if (ean && out.items.length) out.items[out.items.length - 1].ean = ean;
  }

  // Normalizaciones finales + filtro básicos
  out.items = out.items
    .map(it => ({ ...it, costoUnidad: Number(it.costoUnidad?.toFixed?.(2) ?? it.costoUnidad) }))
    .filter(it => it.cantidad > 0 && Number.isFinite(it.costoUnidad));

  return out;
}
