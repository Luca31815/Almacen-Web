// ImportarPDF.jsx — PDF rápido (igual) + OCR: filas editables, Total calculado (qty*price), scroll modal y botón Eliminar fila
import { useRef, useState, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";
import { createWorker } from "tesseract.js";

const LOCAL_LANG = `${window.location.origin}/tessdata`; // /public/tessdata/spa.traineddata.gz
const CDN_LANG = "https://tessdata.projectnaptha.com/4.0.0"; // fallback gratuito

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/* ---------- helpers numéricos/texto ---------- */
function parseNumberSmart(s) {
  if (!s) return null;
  const txt = String(s).trim().replace(/\s+/g, "");
  const lastDot = txt.lastIndexOf(".");
  const lastComma = txt.lastIndexOf(",");
  if (lastDot === -1 && lastComma === -1) {
    const n = Number(txt);
    return Number.isFinite(n) ? n : null;
  }
  let decimalSep = lastComma > lastDot ? "," : ".";
  if (decimalSep === ".") {
    const cleaned = txt.replace(/,/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  } else {
    const cleaned = txt.replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
}

const PACK_WORDS = /^(?:un|u|unid(?:ad(?:es)?)?|pack)$/i;
const PACK_TOKEN = /^(?:x\s*\d+|\d+\s*x)$/i;
const DECIMAL_TOK = /[.,]\d{2}$/;
const NUMERIC_LIKE = /^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+(?:[.,]\d+)?|\d+)$/;
const UNIT_WORD = /^(?:gr|g|kg|ml|l|lts?)$/i;

function cleanName(str) {
  return str
    .replace(/\b\d+\s*(?:un|u|unid(?:ad(?:es)?)?|pack)\b/gi, "")
    .replace(/\b(?:un|u|unid(?:ad(?:es)?)?|pack)\s*\d+\b/gi, "")
    .replace(/\b(?:x\s*\d+|\d+\s*x)\b/gi, "")
    .replace(/\b(\d+)\s*(gr|g|ml|kg|l|lts?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- CSV ---------- */
function toCSVValue(v) {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}
function buildCSV(rows) {
  const header = ["ean", "nombre", "cantidad", "precioUnitario", "total", "raw"].map(toCSVValue).join(",");
  const body = rows
    .map((r) =>
      [
        toCSVValue(r.ean ?? ""),
        toCSVValue(r.nombre ?? ""),
        toCSVValue(r.cantidad ?? ""),
        toCSVValue(r.precioUnitario ?? ""),
        toCSVValue(r.total ?? ""),
        toCSVValue(r.raw ?? ""),
      ].join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}
function downloadCSV(text, filename) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =========================================================
   ===============  OCR core + mapeo manual  ===============
   ========================================================= */
async function upscaleDataUrl(dataUrl, scale = 1.5) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(img.width * scale, 1400);
      const h = (w / img.width) * img.height;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = w;
      canvas.height = h;
      ctx.filter = "contrast(1.15) brightness(1.05)";
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function recognizeAllImages(imgUrls, psm = 6, dpi = 300) {
  const attempts = [
    { langPath: LOCAL_LANG, label: "tessdata local" },
    { langPath: CDN_LANG, label: "tessdata CDN" },
  ];
  let lastErr = null;

  for (const cfg of attempts) {
    let worker;
    try {
      worker = await createWorker({ langPath: cfg.langPath });
      await worker.loadLanguage("spa");
      await worker.initialize("spa");
      await worker.setParameters({
        tessedit_pageseg_mode: String(psm),
        preserve_interword_spaces: "1",
        user_defined_dpi: String(dpi),
      });

      const allLines = [];
      let fullText = "";

      for (const url of imgUrls) {
        const { data } = await worker.recognize(url);
        fullText += (data?.text || "") + "\n";
        const words = data?.words || [];
        const groups = new Map();
        for (const w of words) {
          const t = (w?.text || "").replace(/\s+/g, " ").trim();
          if (!t) continue;
          const x = w?.bbox?.x0 ?? w?.bbox?.x ?? 0;
          const y = w?.bbox?.y0 ?? w?.bbox?.y ?? 0;
          const yBin = Math.round((y || 0) / 14) * 14;
          if (!groups.has(yBin)) groups.set(yBin, []);
          groups.get(yBin).push({ x, text: t });
        }
        const ys = Array.from(groups.keys()).sort((a, b) => a - b);
        for (const yBin of ys) {
          const toks = groups.get(yBin).sort((a, b) => a.x - b.x);
          const joined = toks.map(t => t.text).join(" ").replace(/\s{2,}/g, " ").trim();
          if (joined) allLines.push({ y: yBin, tokens: toks, text: joined });
        }
      }

      await worker.terminate();
      return { fullText, lines: allLines };
    } catch (e) {
      lastErr = e;
      console.warn(`[OCR] intento ${cfg.label} falló:`, e);
      try { await worker?.terminate(); } catch {}
    }
  }
  throw lastErr || new Error("No se pudo inicializar Tesseract.");
}

function buildBandsFromLines(lines) {
  const eanRegex = /^\d{8,14}$/;
  const candidates = [];

  lines.forEach((ln, li) => {
    const toks = ln.tokens;
    toks.forEach((t, ti) => {
      const raw = t.text.replace(/\$/g, "");
      if (!NUMERIC_LIKE.test(raw)) return;
      const val = parseNumberSmart(raw);
      if (val == null) return;
      const isDecimal = DECIMAL_TOK.test(raw);
      const isEan = eanRegex.test(raw);
      const isInt = !isDecimal && !isEan;
      const right = toks[ti + 1]?.text || "";
      const unitLike = UNIT_WORD.test(right);
      candidates.push({
        x: t.x, text: raw, isDecimal, isEan, isInt, unitLike, numVal: val, lineIdx: li, idxInLine: ti
      });
    });
  });
  if (!candidates.length) return [];

  candidates.sort((a, b) => a.x - b.x);
  const clusters = [];
  const XTH = 36;
  for (const c of candidates) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(last.xAvg - c.x) > XTH) {
      clusters.push({ xAvg: c.x, items: [c] });
    } else {
      last.items.push(c);
      last.xAvg = (last.xAvg * (last.items.length - 1) + c.x) / last.items.length;
    }
  }

  const bands = clusters.map((cl, idx) => {
    const decCount = cl.items.filter(i => i.isDecimal).length;
    const intCount = cl.items.filter(i => i.isInt).length;
    const eanCount = cl.items.filter(i => i.isEan).length;
    const unitCount = cl.items.filter(i => i.unitLike).length;
    const intVals = cl.items.filter(i => i.isInt).map(i => i.numVal);
    const medianInt = intVals.length
      ? intVals.sort((a,b)=>a-b)[Math.floor(intVals.length/2)]
      : null;
    return {
      id: `band_${idx}`,
      x: Math.round(cl.xAvg),
      stats: { decCount, intCount, eanCount, unitCount, total: cl.items.length, medianInt },
      sample: cl.items.slice(0, 6).map(i => i.text)
    };
  });

  return bands.sort((a, b) => a.x - b.x);
}

/* -------------- 🔧 Heurística de mapeo corregida --------------
   Si hay ≥2 columnas decimales, usamos la SEGUNDA más a la derecha
   como “Precio unitario” (la más a la derecha suele ser el Total).  */
function guessMapping(bands) {
  const mapping = {};
  if (!bands || !bands.length) return mapping;

  const decs = bands.filter(b => b.stats.decCount > 0).sort((a,b)=>a.x-b.x);
  const ints = bands.filter(b => b.stats.intCount > 0 && b.stats.decCount === 0).sort((a,b)=>a.x-b.x);
  const eans = bands.filter(b => b.stats.eanCount > 0).sort((a,b)=>b.stats.eanCount - a.stats.eanCount || a.x - b.x);

  // Precio unitario: segunda más a la derecha si existe, si no, la única decimal
  if (decs.length >= 2) mapping.precio = decs[decs.length - 2].id;
  else if (decs.length === 1) mapping.precio = decs[0].id;

  // Cantidad: entero sin unidades, mediana baja
  const goodInts = ints.filter(b => (b.stats.unitCount / (b.stats.total || 1)) < 0.15);
  const sortedByMedian = [...goodInts].sort((a,b) => (a.stats.medianInt ?? 9999) - (b.stats.medianInt ?? 9999));
  const pick = sortedByMedian.find(b => (b.stats.medianInt ?? 9999) <= 60) || goodInts[0] || ints[0];
  if (pick) mapping.cantidad = pick.id;

  if (eans.length) mapping.ean = eans[0].id;

  return mapping;
}

// genera filas (total siempre = cantidad*precio)
function rowsFromMapping(lines, bands, mapping) {
  const pickBandIdForX = (x) => {
    let best = null, bestDist = Infinity;
    for (const b of bands) {
      const d = Math.abs(b.x - x);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best?.id || null;
  };
  const eanRegexLine = /\b(\d{8,14})\b/;

  const rows = [];
  for (const ln of lines) {
    const perBand = {};
    ln.tokens.forEach(t => {
      const s = t.text.replace(/\$/g, "");
      const id = pickBandIdForX(t.x);
      if (!id) return;
      if (!perBand[id]) perBand[id] = [];
      perBand[id].push({ text: s, x: t.x });
    });

    const pickNum = (id) => {
      const list = perBand[id] || [];
      if (!list.length) return null;
      const last = list[list.length - 1].text;
      const n = parseNumberSmart(last);
      return Number.isFinite(n) ? n : null;
    };
    const pickText = (id) => {
      const list = perBand[id] || [];
      const last = list[list.length - 1]?.text || "";
      return last;
    };

    const cantidad = mapping.cantidad ? Math.round(pickNum(mapping.cantidad) ?? 0) || null : null;
    const precioUnitario = mapping.precio ? pickNum(mapping.precio) : null;
    const eanToken = mapping.ean ? pickText(mapping.ean) : null;
    const ean = eanToken && /^\d{8,14}$/.test(eanToken) ? eanToken : (ln.text.match(eanRegexLine)?.[1] ?? null);

    const usedBandIds = new Set(Object.values(mapping).filter(Boolean));
    const nameParts = ln.tokens
      .filter(t => !usedBandIds.has(pickBandIdForX(t.x)))
      .map(t => t.text);
    let nombre = cleanName(nameParts.join(" ").replace(/\s{2,}/g, " ").trim());
    if (!nombre && ln.text) nombre = cleanName(ln.text);

    if (nombre && (precioUnitario || cantidad)) {
      let total = null;
      if (Number.isFinite(cantidad) && Number.isFinite(precioUnitario)) {
        total = Math.round(cantidad * precioUnitario * 100) / 100;
      }
      rows.push({
        ean: ean || null,
        nombre,
        cantidad: Number.isFinite(cantidad) ? cantidad : null,
        precioUnitario: Number.isFinite(precioUnitario) ? precioUnitario : null,
        total,
        raw: ln.text,
      });
    }
  }
  return rows;
}

/* =========================================================
   ===============   Componente principal    ===============
   ========================================================= */
export default function ImportarPDF({
  onPick,
  onQueue,
  proveedores = [],
  proveedorInicial = "",
  formaPagoInicial = "",
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("pdf");

  // Parser Tabla (rápido)
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");

  // Globales
  const [provValue, setProvValue] = useState(proveedorInicial || "");
  const [pagoValue, setPagoValue] = useState(formaPagoInicial || "");
  const fileRef = useRef(null);

  // OCR
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrErr, setOcrErr] = useState("");
  const [ocrRows, setOcrRows] = useState([]);
  const ocrFileRef = useRef(null);
  const [ocrSelectedFileName, setOcrSelectedFileName] = useState("");
  const [ocrLines, setOcrLines] = useState([]);
  const [ocrBands, setOcrBands] = useState([]);
  const [ocrMap, setOcrMap] = useState({});
  const [ocrScale, setOcrScale] = useState(1.6);
  const MAX_OCR_PAGES = 3;

  // Persistencia mapeo OCR por proveedor
  useEffect(() => {
    if (!provValue) return;
    const key = `ocrMap::${provValue}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try { setOcrMap(JSON.parse(saved) || {}); } catch {}
    }
  }, [provValue]);
  useEffect(() => {
    if (!provValue) return;
    const key = `ocrMap::${provValue}`;
    localStorage.setItem(key, JSON.stringify(ocrMap || {}));
  }, [ocrMap, provValue]);

  /* ---------------- Parser PDF rápido (igual que antes) ---------------- */
  async function handleFile(file) {
    if (!file) return;
    setLoading(true); setErr("");
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

      const lines = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        const groups = new Map();
        for (const it of tc.items) {
          const y = Math.round(it.transform?.[5] ?? 0);
          const x = it.transform?.[4] ?? 0;
          const str = (it.str ?? "").replace(/\s+/g, " ");
          if (!groups.has(y)) groups.set(y, []);
          groups.get(y).push({ x, str });
        }
        const ys = Array.from(groups.keys()).sort((a, b) => b - a);
        for (const y of ys) {
          const toks = groups.get(y).sort((a, b) => a.x - b.x);
          const text = toks.map((t) => t.str).join(" ").replace(/\s+/g, " ").trim();
          if (text) lines.push({ text, tokens: toks, y });
        }
      }

      let headerIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const L = norm(lines[i].text);
        const hasHeader =
          L.includes("CODIGO") &&
          L.includes("DESCRIPCION") &&
          L.includes("UNIDAD") &&
          L.includes("CANTIDAD") &&
          L.includes("IMPORTE") &&
          L.includes("TOTAL");
        if (hasHeader) { headerIdx = i; break; }
      }
      const startI = headerIdx >= 0 ? headerIdx + 1 : 0;

      const parsed = [];
      const eanRegex = /\b(\d{8,14})\b/;

      for (let i = startI; i < lines.length; i++) {
        const line = lines[i];
        const { text, tokens } = line;

        const L = norm(text);
        if (
          L.includes("CODIGO") &&
          L.includes("DESCRIPCION") &&
          L.includes("UNIDAD") &&
          L.includes("CANTIDAD") &&
          L.includes("IMPORTE") &&
          L.includes("TOTAL")
        ) continue;

        const eanM = text.match(eanRegex);
        if (!eanM) continue;

        let eanIdxTok = -1;
        for (let k = 0; k < tokens.length; k++) {
          if (tokens[k].str.includes(eanM[0])) { eanIdxTok = k; break; }
        }
        if (eanIdxTok === -1) continue;

        let nameTokens = [];
        for (let k = eanIdxTok + 1; k < tokens.length; k++) {
          const s = tokens[k].str.trim();
          if (!s) continue;
          if (PACK_WORDS.test(s) || PACK_TOKEN.test(s) || NUMERIC_LIKE.test(s)) break;
          nameTokens.push(tokens[k]);
        }
        while (nameTokens.length) {
          const last = nameTokens[nameTokens.length - 1].str.trim();
          if (PACK_WORDS.test(last) || PACK_TOKEN.test(last)) nameTokens.pop();
          else break;
        }
        let nombre = cleanName(nameTokens.map((t) => t.str).join(" ").replace(/\s{2,}/g, " ").trim());
        if (!nombre || nombre.length < 2) {
          const prev = lines[i - 1];
          if (prev && !eanRegex.test(prev.text)) {
            nombre = cleanName(prev.text);
          }
        }

        const numToks = [];
        for (let k = 0; k < tokens.length; k++) {
          const raw = tokens[k].str.trim();
          if (!raw) continue;
          const m = raw.match(/^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d{1,6})$/);
          if (m) {
            const val = parseNumberSmart(raw);
            if (val !== null) {
              numToks.push({ i: k, x: tokens[k].x, raw, val, isDecimal: DECIMAL_TOK.test(raw) });
            }
          }
        }

        let totalTok = null;
        let priceTok = null;
        const decimals = numToks.filter((t) => t.isDecimal);
        if (decimals.length) {
          totalTok = decimals.reduce((acc, t) => (acc === null || t.val > acc.val ? t : acc), null);
          const decimalsNoTotal = decimals.filter((d) => d.i !== totalTok.i);
          const decimalsNoZero = decimalsNoTotal.filter((d) => d.val !== 0);
          priceTok =
            decimalsNoZero
              .filter((d) => d.val < (totalTok?.val ?? Number.MAX_VALUE))
              .sort((a, b) => a.x - b.x)
              .pop() ||
            decimalsNoZero.sort((a, b) => b.val - a.val)[0] ||
            decimalsNoTotal.sort((a, b) => b.val - a.val)[0] ||
            null;
        }

        let qtyTok = null;
        const refIdx = priceTok ? priceTok.i : (totalTok ? totalTok.i : null);
        if (refIdx !== null) {
          const leftNums = numToks.filter((t) => t.i < refIdx);
          if (leftNums.length) {
            const candidate = leftNums[leftNums.length - 1];
            const left = tokens[candidate.i - 1]?.str?.trim() || "";
            const right = tokens[candidate.i + 1]?.str?.trim() || "";
            const badNeighbor =
              PACK_WORDS.test(left) || PACK_WORDS.test(right) || PACK_TOKEN.test(left) || PACK_TOKEN.test(right);
            qtyTok = badNeighbor ? (leftNums[leftNums.length - 2] ?? null) : candidate;
          }
        }

        const precioUnitario = priceTok ? priceTok.val : null;
        const total = totalTok ? totalTok.val : null;
        let cantidad = qtyTok ? qtyTok.val : null;
        if ((!cantidad || cantidad <= 0) && precioUnitario && total && precioUnitario > 0) {
          const calc = total / precioUnitario;
          const rounded = Math.round(calc * 100) / 100;
          cantidad = Math.abs(rounded - Math.round(rounded)) < 0.01 ? Math.round(rounded) : rounded;
        }

        if (!nombre) continue;
        parsed.push({
          ean: eanM[0],
          nombre,
          cantidad: Number.isFinite(cantidad) ? cantidad : null,
          precioUnitario: Number.isFinite(precioUnitario) ? precioUnitario : null,
          total: Number.isFinite(total) ? total : null,
          raw: text,
        });
      }

      setRows(parsed);
      if (!parsed.length) setErr("No se detectaron filas de productos después del encabezado.");
    } catch (e) {
      console.error(e);
      setErr("No se pudo leer el PDF.");
    } finally {
      setLoading(false);
    }
  }

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };
  const updateCell = (idx, key, value) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: key === "nombre" ? value : (value === "" ? null : Number(value)) };
      return copy;
    });
  };
  const deletePdfRow = (idx) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ---------------- OCR ---------------- */
  async function rasterizePdfToDataUrls(file, scale = 2.4) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const urls = [];
    const pages = Math.min(pdf.numPages, MAX_OCR_PAGES);

    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      urls.push(await upscaleDataUrl(dataUrl, 1.0));
    }
    return urls;
  }

  function imageFileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  async function runOcrOnFile(file) {
    setOcrLoading(true);
    setOcrErr("");
    setOcrRows([]);
    setOcrLines([]);
    setOcrBands([]);

    try {
      const type = file.type || "";
      let dataUrls = [];

      if (type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf")) {
        dataUrls = await rasterizePdfToDataUrls(file, 2.6);
      } else if (type.startsWith("image/")) {
        const url = await imageFileToDataUrl(file);
        dataUrls = [await upscaleDataUrl(url, ocrScale)];
      } else {
        throw new Error("Formato no soportado para OCR (subí PDF o imagen).");
      }

      const { lines } = await recognizeAllImages(dataUrls, 6, 300);
      setOcrLines(lines);

      const bands = buildBandsFromLines(lines);
      setOcrBands(bands);

      let mapping = {};
      if (provValue) {
        const saved = localStorage.getItem(`ocrMap::${provValue}`);
        if (saved) {
          try { mapping = JSON.parse(saved) || {}; } catch {}
        }
      }
      if (!mapping || !Object.keys(mapping).length) mapping = guessMapping(bands);
      setOcrMap(mapping);

      const parsed = rowsFromMapping(lines, bands, mapping);
      if (!parsed.length) {
        setOcrErr("OCR listo. Ajustá el mapeo (Cantidad/Precio/EAN) y aplicá para ver filas.");
      }
      setOcrRows(parsed);
    } catch (e) {
      console.error(e);
      const msg =
        /loadLanguage|initialize|traineddata|TESSDATA_PREFIX|couldn.?t load/i.test(String(e?.message || e))
          ? "No se pudo cargar el idioma 'spa'. Verificá /public/tessdata/spa.traineddata.gz. Ya intenté el CDN automáticamente."
          : (e?.message || "Falló el OCR.");
      setOcrErr(msg);
    } finally {
      setOcrLoading(false);
    }
  }

  const updateOcrCell = (idx, key, value) => {
    setOcrRows((prev) => {
      const copy = [...prev];
      const r = { ...copy[idx] };
      if (key === "nombre" || key === "ean") {
        r[key] = value;
      } else if (key === "cantidad" || key === "precioUnitario") {
        const num = value === "" ? null : Number(value);
        r[key] = Number.isFinite(num) ? num : null;
      }
      r.total =
        Number.isFinite(r.cantidad) && Number.isFinite(r.precioUnitario)
          ? Math.round(r.cantidad * r.precioUnitario * 100) / 100
          : null;
      copy[idx] = r;
      return copy;
    });
  };
  const deleteOcrRow = (idx) => {
    setOcrRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const importAsQueue = () => {
    if (!rows.length) return;
    onQueue?.(rows, { proveedor: provValue, formaPago: pagoValue });
    setOpen(false);
  };

  const ocrRowsWithTotal = () =>
    ocrRows.map((r) => ({
      ...r,
      total:
        Number.isFinite(r.cantidad) && Number.isFinite(r.precioUnitario)
          ? Math.round(r.cantidad * r.precioUnitario * 100) / 100
          : null,
    }));

  const importOcrAsQueue = () => {
    if (!ocrRows.length) return;
    onQueue?.(ocrRowsWithTotal(), { proveedor: provValue, formaPago: pagoValue });
    setOpen(false);
  };

  const close = () => {
    setOpen(false);
    setRows([]); setErr(""); setLoading(false); setSelectedFileName(""); if (fileRef.current) fileRef.current.value = "";
    setOcrRows([]); setOcrErr(""); setOcrLoading(false); setOcrSelectedFileName(""); if (ocrFileRef.current) ocrFileRef.current.value = "";
    setOcrLines([]); setOcrBands([]); setOcrMap({});
  };

  // UI OCR: mapeo (sin "total")
  const roleLabels = { cantidad: "Cantidad", precio: "Precio unitario", ean: "EAN" };
  const bandOptions = [
    { value: "", label: "Ignorar" },
    { value: "cantidad", label: "Cantidad" },
    { value: "precio", label: "Precio unitario" },
    { value: "ean", label: "EAN" },
  ];
  const roleByBandId = (id) => Object.entries(ocrMap).find(([, v]) => v === id)?.[0] || "";
  function setRoleForBand(bandId, role) {
    const inv = Object.fromEntries(Object.entries(ocrMap).map(([k, v]) => [v, k]));
    const copy = { ...ocrMap };
    const existingRole = inv[bandId];
    if (existingRole) delete copy[existingRole];
    if (!role) { setOcrMap(copy); return; }
    for (const k of Object.keys(copy)) if (k !== role && copy[k] === bandId) delete copy[k];
    copy[role] = bandId;
    setOcrMap(copy);
  }
  function recalcFromMap() {
    if (!ocrLines.length || !ocrBands.length) return;
    const parsed = rowsFromMapping(ocrLines, ocrBands, ocrMap);
    setOcrRows(parsed);
    setOcrErr(parsed.length ? "" : "No se pudieron generar filas con ese mapeo. Ajustá las columnas y reintentá.");
  }

  /* ---------------- UI ---------------- */
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setProvValue(proveedorInicial || "");
          setPagoValue(formaPagoInicial || "");
          setTab("pdf");
          setOpen(true);
        }}
        className="text-sm text-gray-900 px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
      >
        Importar comprobante
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />

          {/* MODAL: header fijo + cuerpo scrolleable */}
          <div className="relative bg-white w-[95%] max-w-5xl max-h-[90vh] rounded-2xl shadow-xl text-gray-900 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 p-4 border-b bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Importar comprobante</h2>
                <div className="flex items-center gap-2">
                  {tab === "pdf" ? (
                    <button
                      onClick={() => {
                        if (!rows.length) return;
                        const csv = buildCSV(rows);
                        const fname = `import_pdf_edit_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
                        downloadCSV(csv, fname);
                      }}
                      disabled={!rows.length}
                      className={`text-sm px-3 py-1 rounded-lg ${
                        rows.length ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-600 cursor-not-allowed"
                      }`}
                    >
                      Descargar CSV
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (!ocrRows.length) return;
                        const csv = buildCSV(ocrRowsWithTotal());
                        const fname = `import_ocr_edit_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
                        downloadCSV(csv, fname);
                      }}
                      disabled={!ocrRows.length}
                      className={`text-sm px-3 py-1 rounded-lg ${
                        ocrRows.length ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-600 cursor-not-allowed"
                      }`}
                    >
                      Descargar CSV
                    </button>
                  )}
                  <button onClick={close} className="text-sm text-gray-800 px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200">
                    Cerrar
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-3 border-b">
                <nav className="flex gap-2">
                  <button
                    className={`px-3 py-2 rounded-t-lg ${tab === "pdf" ? "bg-white border border-b-0 text-gray-900" : "bg-gray-100 text-gray-800"}`}
                    onClick={() => setTab("pdf")}
                  >
                    Parser Tabla
                  </button>
                  <button
                    className={`px-3 py-2 rounded-t-lg ${tab === "ocr" ? "bg-white border border-b-0 text-gray-900" : "bg-gray-100 text-gray-800"}`}
                    onClick={() => setTab("ocr")}
                  >
                    Parser OCR (beta)
                  </button>
                </nav>
              </div>
            </div>

            {/* Cuerpo */}
            <div className="grow overflow-y-auto p-4">
              {/* Controles globales */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Proveedor (global)</label>
                  <input
                    list="imp_proveedores"
                    type="text"
                    placeholder="Proveedor"
                    value={provValue}
                    onChange={(e) => setProvValue(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-gray-300 bg-white text-gray-900"
                  />
                  <datalist id="imp_proveedores">
                    {proveedores.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">Forma de pago (global)</label>
                  <select
                    value={pagoValue}
                    onChange={(e) => setPagoValue(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-gray-300 bg-white text-gray-900"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Débito">Débito</option>
                    <option value="Crédito">Crédito</option>
                    <option value="Transferencia bancaria">Transferencia bancaria</option>
                    <option value="Mercado Pago">Mercado Pago</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              {tab === "pdf" && (
                <>
                  {/* PDF rápido */}
                  <div className="flex items-center gap-3 mb-4">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setSelectedFileName(f?.name || "");
                        onFileChange(e);
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Subir PDF
                    </button>
                    <span className="text-xs text-gray-700 truncate max-w-[40ch]">
                      {selectedFileName || "Ningún archivo seleccionado"}
                    </span>
                    {loading && <span className="text-sm text-gray-600">Leyendo PDF…</span>}
                    {err && <span className="text-sm text-red-700 bg-red-100 px-2 py-1 rounded">{err}</span>}
                  </div>

                  <div className="overflow-auto border rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-800">
                          <th className="px-3 py-2">EAN</th>
                          <th className="px-3 py-2">Nombre</th>
                          <th className="px-3 py-2">Cantidad</th>
                          <th className="px-3 py-2">Precio unitario</th>
                          <th className="px-3 py-2">Total</th>
                          <th className="px-3 py-2 w-52"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2 text-gray-800">{r.ean}</td>
                            <td className="px-3 py-2">
                              <input
                                value={r.nombre}
                                onChange={(e) => updateCell(i, "nombre", e.target.value)}
                                className="w-full px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="1"
                                value={r.cantidad ?? ""}
                                onChange={(e) => updateCell(i, "cantidad", e.target.value)}
                                className="w-28 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={r.precioUnitario ?? ""}
                                onChange={(e) => updateCell(i, "precioUnitario", e.target.value)}
                                className="w-28 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={r.total ?? ""}
                                onChange={(e) => updateCell(i, "total", e.target.value)}
                                className="w-28 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                              />
                            </td>
                            <td className="px-3 py-2 flex gap-2">
                              <button
                                onClick={() => {
                                  const cantidad =
                                    r.cantidad ??
                                    (r.total && r.precioUnitario ? Math.round((r.total / r.precioUnitario) * 100) / 100 : 0);
                                  const costo =
                                    r.precioUnitario ?? (r.total && r.cantidad ? r.total / r.cantidad : 0);
                                  onPick?.({
                                    nombre: r.nombre,
                                    cantidad,
                                    costoUnidad: costo,
                                    ean: r.ean,
                                    total: r.total ?? null,
                                  });
                                  setOpen(false);
                                }}
                                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                              >
                                Usar en formulario
                              </button>
                              <button
                                onClick={() => deletePdfRow(i)}
                                className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                title="Eliminar fila"
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                        {rows.length === 0 && !loading && (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-gray-600">
                              Seleccioná un PDF para previsualizar los ítems.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={importAsQueue}
                      disabled={!rows.length}
                      className={`text-sm px-4 py-2 rounded-lg ${
                        !rows.length ? "bg-gray-200 text-gray-600 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                      title="Preparar cola (PDF rápido)"
                    >
                      Importar tabla
                    </button>
                  </div>
                </>
              )}

              {tab === "ocr" && (
                <>
                  {/* Controles OCR */}
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      ref={ocrFileRef}
                      type="file"
                      accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        setOcrSelectedFileName(f?.name || "");
                        if (f) await runOcrOnFile(f);
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => ocrFileRef.current?.click()}
                      className="text-sm px-3 py-2 rounded-lg bg-purple-700 text-white hover:bg-purple-800"
                    >
                      Subir PDF/Imagen
                    </button>
                    <span className="text-xs text-gray-700 truncate max-w-[38ch]">
                      {ocrSelectedFileName || "Ningún archivo seleccionado"}
                    </span>
                    {ocrLoading && <span className="text-sm text-gray-600">Ejecutando OCR…</span>}
                    {ocrErr && <span className="text-sm text-red-700 bg-red-100 px-2 py-1 rounded">{ocrErr}</span>}
                  </div>

                  {/* Ajuste de escala para imágenes */}
                  <div className="mb-3 flex items-center gap-3">
                    <label className="text-xs text-gray-700">Escala imagen OCR</label>
                    <input
                      type="range"
                      min="1.0"
                      max="2.2"
                      step="0.1"
                      value={ocrScale}
                      onChange={(e) => setOcrScale(parseFloat(e.target.value))}
                    />
                    <span className="text-xs text-gray-600">{ocrScale.toFixed(1)}×</span>
                    <span className="text-[11px] text-gray-500">(si la foto es chica, subí este valor y reintentá)</span>
                  </div>

                  {/* Mapeo manual (sin Total) */}
                  {ocrBands.length > 0 && (
                    <div className="mb-3 border rounded-lg p-3 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">Mapeo manual de columnas (OCR)</h3>
                        <button
                          onClick={recalcFromMap}
                          className="text-sm px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          Aplicar mapeo
                        </button>
                      </div>
                      <div className="overflow-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="bg-white text-gray-800">
                              {ocrBands.map((b) => (
                                <th key={b.id} className="px-2 py-2 border">
                                  <div className="text-[11px] text-gray-600">x≈{b.x}px</div>
                                  <select
                                    className="mt-1 w-full border rounded px-1 py-1 text-gray-900 bg-white"
                                    value={roleByBandId(b.id)}
                                    onChange={(e) => setRoleForBand(b.id, e.target.value)}
                                  >
                                    {[
                                      { value: "", label: "Ignorar" },
                                      { value: "cantidad", label: "Cantidad" },
                                      { value: "precio", label: "Precio unitario" },
                                      { value: "ean", label: "EAN" },
                                    ].map(opt => (
                                      <option key={opt.value || "none"} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                  <div className="mt-1 text-[10px] text-gray-500">
                                    dec:{b.stats.decCount} · int:{b.stats.intCount} · unit:{b.stats.unitCount} {b.stats.medianInt!=null ? `· medInt:${b.stats.medianInt}` : ""}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="bg-gray-100 text-gray-700">
                              {ocrBands.map((b) => (
                                <td key={b.id} className="px-2 py-2 border align-top">
                                  <div className="font-medium">{(roleLabels[roleByBandId(b.id)] || "Ignorar")}</div>
                                  <div className="mt-1 text-[11px]">
                                    {b.sample.length ? b.sample.join(", ") : <span className="text-gray-400">—</span>}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-[11px] text-gray-600">
                        Elegí qué representa cada columna detectada (por posición horizontal). Se guarda por proveedor y aplica automáticamente la próxima vez.
                      </p>
                    </div>
                  )}

                  {/* Tabla OCR editable con botón Eliminar: total calculado */}
                  <div className="overflow-auto border rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-gray-800">
                          <th className="px-3 py-2">EAN</th>
                          <th className="px-3 py-2">Nombre</th>
                          <th className="px-3 py-2">Cantidad</th>
                          <th className="px-3 py-2">Precio unitario</th>
                          <th className="px-3 py-2">Total</th>
                          <th className="px-3 py-2 w-52"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ocrRows.map((r, i) => {
                          const totalCalc =
                            Number.isFinite(r.cantidad) && Number.isFinite(r.precioUnitario)
                              ? Math.round(r.cantidad * r.precioUnitario * 100) / 100
                              : "";
                          return (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">
                                <input
                                  value={r.ean ?? ""}
                                  onChange={(e) => updateOcrCell(i, "ean", e.target.value)}
                                  className="w-32 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  value={r.nombre ?? ""}
                                  onChange={(e) => updateOcrCell(i, "nombre", e.target.value)}
                                  className="w-full px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="1"
                                  value={r.cantidad ?? ""}
                                  onChange={(e) => updateOcrCell(i, "cantidad", e.target.value)}
                                  className="w-24 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={r.precioUnitario ?? ""}
                                  onChange={(e) => updateOcrCell(i, "precioUnitario", e.target.value)}
                                  className="w-28 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                                />
                              </td>
                              <td className="px-3 py-2 text-gray-900">{totalCalc}</td>
                              <td className="px-3 py-2 flex gap-2">
                                <button
                                  onClick={() => {
                                    const cantidad = Number.isFinite(r.cantidad) ? r.cantidad : 0;
                                    const costo = Number.isFinite(r.precioUnitario) ? r.precioUnitario : 0;
                                    const total = Number.isFinite(cantidad) && Number.isFinite(costo)
                                      ? Math.round(cantidad * costo * 100) / 100
                                      : null;
                                    onPick?.({
                                      nombre: r.nombre,
                                      cantidad,
                                      costoUnidad: costo,
                                      ean: r.ean ?? null,
                                      total,
                                    });
                                    setOpen(false);
                                  }}
                                  className="text-xs px-2 py-1 rounded bg-purple-700 text-white hover:bg-purple-800"
                                >
                                  Usar en formulario
                                </button>
                                <button
                                  onClick={() => deleteOcrRow(i)}
                                  className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                  title="Eliminar fila"
                                >
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {ocrRows.length === 0 && !ocrLoading && (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-gray-600">
                              Subí un PDF/imagen, ajustá el mapeo (Cantidad/Precio/EAN) y aplicá para ver filas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={importOcrAsQueue}
                      disabled={!ocrRows.length}
                      className={`text-sm px-4 py-2 rounded-lg ${
                        !ocrRows.length ? "bg-gray-200 text-gray-600 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                      title="Preparar cola desde OCR"
                    >
                      Importar tabla OCR
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
