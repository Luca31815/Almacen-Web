// ImportarPDF.jsx — previsualiza PDF y arma cola + proveedor/forma de pago globales
import { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// --- Helpers numéricos ---
function parseNumberSmart(s) {
  if (!s) return null;
  const txt = String(s).trim().replace(/\s+/g, "");
  const lastDot = txt.lastIndexOf(".");
  const lastComma = txt.lastIndexOf(",");
  if (lastDot === -1 && lastComma === -1) {
    const n = Number(txt);
    return Number.isFinite(n) ? n : null;
  }
  let decimalSep = ".";
  if (lastComma > lastDot) decimalSep = ",";
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

// --- Tokens comunes ---
const PACK_WORDS = /^(?:un|u|unid(?:ad(?:es)?)?|pack)$/i;
const PACK_TOKEN = /^(?:x\s*\d+|\d+\s*x)$/i;
const DECIMAL_TOK = /[.,]\d{2}$/;
const NUMERIC_LIKE = /^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+(?:[.,]\d+)?|\d+)$/;

// Limpieza ligera final del nombre
function cleanName(str) {
  return str
    .replace(/\b\d+\s*(?:un|u|unid(?:ad(?:es)?)?|pack)\b/gi, "")
    .replace(/\b(?:un|u|unid(?:ad(?:es)?)?|pack)\s*\d+\b/gi, "")
    .replace(/\b(?:x\s*\d+|\d+\s*x)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Normaliza para matching de encabezado
function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ---- CSV helpers ----
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
        toCSVValue(r.ean),
        toCSVValue(r.nombre),
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

export default function ImportarPDF({
  onPick,
  onQueue,
  // NEW: datos para prellenar y datalist
  proveedores = [],
  proveedorInicial = "",
  formaPagoInicial = "",
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]); // {ean, nombre, cantidad, precioUnitario, total, raw}
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // NEW: controles globales para toda la importación
  const [provValue, setProvValue] = useState(proveedorInicial || "");
  const [pagoValue, setPagoValue] = useState(formaPagoInicial || "");
  const [selectedFileName, setSelectedFileName] = useState("");


  const fileRef = useRef(null);

  const close = () => {
    setOpen(false);
    setRows([]);
    setErr("");
    setLoading(false);
    if (fileRef.current) fileRef.current.value = "";
    // mantenemos provValue/pagoValue por si reabrís sin cerrar pantalla
  };

  async function handleFile(file) {
    if (!file) return;
    setLoading(true);
    setErr("");
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

      // 1) líneas con tokens ordenados por X
      const lines = []; // { text, tokens: [{x, str}], y }
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();

        const groups = new Map(); // y -> tokens[]
        for (const it of tc.items) {
          const y = Math.round(it.transform?.[5] ?? 0);
          const x = it.transform?.[4] ?? 0;
          const str = (it.str ?? "").replace(/\s+/g, " ");
          if (!groups.has(y)) groups.set(y, []);
          groups.get(y).push({ x, str });
        }

        const ys = Array.from(groups.keys()).sort((a, b) => b - a); // top->bottom
        for (const y of ys) {
          const toks = groups.get(y).sort((a, b) => a.x - b.x);
          const text = toks.map((t) => t.str).join(" ").replace(/\s+/g, " ").trim();
          if (text) lines.push({ text, tokens: toks, y });
        }
      }

      // 2) localizar el encabezado de la tabla
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
        if (hasHeader) {
          headerIdx = i;
          break;
        }
      }

      // 3) parseo SOLO desde la línea siguiente al encabezado (si existe)
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
        ) {
          continue; // saltea encabezados repetidos
        }

        const eanM = text.match(eanRegex);
        if (!eanM) continue;

        // ubicar token EAN
        let eanIdxTok = -1;
        for (let k = 0; k < tokens.length; k++) {
          if (tokens[k].str.includes(eanM[0])) {
            eanIdxTok = k;
            break;
          }
        }
        if (eanIdxTok === -1) continue;

        // --- Nombre a la derecha del EAN hasta token numérico/pack
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

        // --- Números: precio/total/cantidad
        const numToks = [];
        for (let k = 0; k < tokens.length; k++) {
          const raw = tokens[k].str.trim();
          if (!raw) continue;
          const m = raw.match(/^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d{1,6})$/);
          if (m) {
            const val = parseNumberSmart(raw);
            if (val !== null) {
              numToks.push({
                i: k,
                x: tokens[k].x,
                raw,
                val,
                isDecimal: DECIMAL_TOK.test(raw),
              });
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

        // Cantidad = último número a la izquierda del precio (o total si no hay precio)
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
      if (parsed.length) {
        const csv = buildCSV(parsed);
        const fname = `import_pdf_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
//        downloadCSV(csv, fname);
      } else {
        setErr("No se detectaron filas de productos después del encabezado.");
      }
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
      copy[idx] = { ...copy[idx], [key]: key === "nombre" ? value : Number(value) };
      return copy;
    });
  };

  const manualDownload = () => {
    if (!rows.length) return;
    const csv = buildCSV(rows);
    const fname = `import_pdf_edit_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    downloadCSV(csv, fname);
  };

  const importAsQueue = () => {
    if (!rows.length) return;
    onQueue?.(rows, { proveedor: provValue, formaPago: pagoValue });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // actualizar defaults cuando se abre
          setProvValue(proveedorInicial || "");
          setPagoValue(formaPagoInicial || "");
          setOpen(true);
        }}
        className="text-sm px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
      >
        Importar desde PDF (beta)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          {/* panel */}
          <div className="relative bg-white w-[95%] max-w-4xl max-h-[85vh] rounded-2xl shadow-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Importar desde PDF</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={manualDownload}
                  disabled={!rows.length}
                  className={`text-sm px-3 py-1 rounded-lg ${
                    rows.length ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  Descargar CSV
                </button>
                <button onClick={() => setOpen(false)} className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200">
                  Cerrar
                </button>
              </div>
            </div>

            {/* NEW: Proveedor / Forma de pago globales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Proveedor (global)</label>
                <input
                  list="imp_proveedores"
                  type="text"
                  placeholder="Proveedor"
                  value={provValue}
                  onChange={(e) => setProvValue(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 bg-gray-50 text-gray-800"
                />
                <datalist id="imp_proveedores">
                  {proveedores.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Forma de pago (global)</label>
                <select
                  value={pagoValue}
                  onChange={(e) => setPagoValue(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 bg-gray-50 text-gray-800"
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
            <div className="flex items-center gap-3 mb-4">
                {/* input oculto, lo dispara el botón */}
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

                <span className="text-xs text-gray-600 truncate max-w-[40ch]">
                    {selectedFileName || "Ningún archivo seleccionado"}
                </span>

                {loading && <span className="text-sm text-gray-600">Leyendo PDF…</span>}
                {err && <span className="text-sm text-red-700 bg-red-100 px-2 py-1 rounded">{err}</span>}
            </div>

            <div className="overflow-auto border rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-3 py-2">EAN</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Cantidad</th>
                    <th className="px-3 py-2">Precio unitario</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 text-gray-700">{r.ean}</td>
                      <td className="px-3 py-2">
                        <input
                          value={r.nombre}
                          onChange={(e) => updateCell(i, "nombre", e.target.value)}
                          className="w-full px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-800"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={r.cantidad ?? ""}
                          onChange={(e) => updateCell(i, "cantidad", e.target.value)}
                          className="w-28 px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-800"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.precioUnitario ?? ""}
                          onChange={(e) => updateCell(i, "precioUnitario", e.target.value)}
                          className="w-28 px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-800"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.total ?? ""}
                          onChange={(e) => updateCell(i, "total", e.target.value)}
                          className="w-28 px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-800"
                        />
                      </td>
                      <td className="px-3 py-2">
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
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                        Seleccioná un PDF para previsualizar los ítems.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Botón: enviar toda la tabla como cola + proveedor/forma de pago */}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={importAsQueue}
                disabled={!rows.length}
                className={`text-sm px-4 py-2 rounded-lg ${
                  !rows.length ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"
                }`}
                title="Preparar cola: se inyectarán filas y se conservarán Proveedor/Forma de pago en cada guardado"
              >
                Importar tabla
              </button>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Si corregís celdas, tocá “Descargar CSV” para que el archivo refleje tus cambios.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
