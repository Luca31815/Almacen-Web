// Compras.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { Link } from "react-router-dom";
import { useToast } from "./ToastProvider";
import ImportarPDF from "./ImportarPDF";

export default function Compras() {
  const toast = useToast();

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [categoriasStock, setCategoriasStock] = useState([]);
  const [productosStock, setProductosStock] = useState([]);
  const [proveedores, setProveedores] = useState([]);

  const [cantidad, setCantidad] = useState("");
  const [costeUnidad, setCosteUnidad] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [formaPago, setFormaPago] = useState("");

  // EAN del ítem actual
  const [currentEan, setCurrentEan] = useState("");

  // Fechas
  const hoyISO = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const [fechaCompra, setFechaCompra] = useState(hoyISO());
  const [fechaVencimiento, setFechaVencimiento] = useState("");

  // Modo "lotes"
  const [modoLotes, setModoLotes] = useState(false);
  const [compraActualId, setCompraActualId] = useState(null);

  const almacenId = localStorage.getItem("almacen_id");

  // --- Cola de importación desde PDF ---
  const [importQueue, setImportQueue] = useState([]); // [{nombre, cantidad, precioUnitario, total, ean}, ...]
  const prevCompraIdRef = useRef(compraActualId);

  // --- Autorrelleno de categoría a partir de nombre/EAN ---
  const autofillCategoria = useCallback(
    async (nombreArg, eanArg) => {
      const n = (nombreArg || "").trim();
      const e = (eanArg || "").trim();
      if (!almacenId || (!n && !e)) return;

      // 1) Exacto por nombre
      try {
        const { data: byName } = await supabase
          .from("Stock")
          .select("id,categoria")
          .eq("almacen_id", almacenId)
          .eq("nombre", n)
          .maybeSingle();

        if (byName && byName.categoria) {
          setCategoria(byName.categoria);
          return;
        }
      } catch {}

      // 2) Por EAN (si hay columna y valor)
      if (e) {
        try {
          const { data: byEan } = await supabase
            .from("Stock")
            .select("id,categoria")
            .eq("almacen_id", almacenId)
            .eq("ean", e)
            .maybeSingle();

          if (byEan && byEan.categoria) {
            setCategoria(byEan.categoria);
            return;
          }
        } catch {}
      }

      // 3) Fallback aproximado
      if (n && n.length >= 4) {
        try {
          const { data: approx } = await supabase
            .from("Stock")
            .select("id,categoria")
            .eq("almacen_id", almacenId)
            .ilike("nombre", `%${n}%`)
            .limit(1);

          if (approx && approx.length && approx[0]?.categoria) {
            setCategoria(approx[0].categoria);
          }
        } catch {}
      }
    },
    [almacenId]
  );

  // helper para inyectar una fila en los inputs
  const injectRowToInputs = useCallback(
    (row) => {
      if (!row) return;
      const qty = Number.isFinite(Number(row.cantidad))
        ? Math.max(0, Math.floor(Number(row.cantidad)))
        : row.total && row.precioUnitario
        ? Math.max(0, Math.floor(Number(row.total / row.precioUnitario)))
        : 0;
      const cost = Number.isFinite(Number(row.precioUnitario))
        ? Math.max(0, Number(row.precioUnitario))
        : qty > 0 && row.total
        ? Math.max(0, Number(row.total) / qty)
        : 0;

      setNombre(row.nombre || "");
      setCantidad(String(qty));
      setCosteUnidad(String(cost));
      setCurrentEan(row.ean || "");
      if (row.nombre || row.ean) autofillCategoria(row.nombre, row.ean);
    },
    [autofillCategoria]
  );

  // intenta inyectar el siguiente ítem de la cola (si no hay compra por lotes abierta)
  const tryInjectNext = useCallback(
    () => {
      if (modoLotes && compraActualId) {
        toast.info("Tenés una compra por lotes abierta. Finalizala para continuar con la importación.");
        return;
      }
      setImportQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        injectRowToInputs(next);
        if (rest.length === 0) {
          toast.success("Importación completada. No hay más ítems en la cola.");
        }
        return rest;
      });
    },
    [modoLotes, compraActualId, injectRowToInputs, toast]
  );

  // Omitir el ítem cargado e inyectar el siguiente
  const handleSkipCurrent = () => {
    if (modoLotes && compraActualId) {
      toast.info("Tenés una compra por lotes abierta. Finalizala para continuar.");
      return;
    }
    if (importQueue.length === 0) {
      toast.info("No hay más ítems en la cola.");
      return;
    }
    tryInjectNext();
  };

  // Cancelar toda la cola de importación
  const handleCancelImport = () => {
    if (importQueue.length === 0) return;
    setImportQueue([]);
    toast.success("Importación cancelada.");
  };

  // --- RELOAD de listas (productos, categorías, proveedores) ---
  const reloadLookups = useCallback(async () => {
    if (!almacenId) return;

    // Productos + categorías del Stock
    const { data: productos, error: errorProd } = await supabase
      .from("Stock")
      .select("nombre, categoria")
      .eq("almacen_id", almacenId);

    if (!errorProd && productos) {
      setProductosStock(productos.map((p) => p.nombre));
      const categoriasUnicas = [
        ...new Set(productos.map((p) => p.categoria).filter(Boolean)),
      ];
      setCategoriasStock(categoriasUnicas);
    }

    // Proveedores históricos del almacén (desde Compras)
    const { data: provs, error: provErr } = await supabase
      .from("Compras")
      .select("proveedor")
      .eq("almacen_id", almacenId)
      .not("proveedor", "is", null)
      .neq("proveedor", "")
      .limit(1000);

    if (!provErr && provs) {
      const unicos = [...new Set(provs.map((r) => (r.proveedor || "").trim()).filter(Boolean))];
      unicos.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      setProveedores(unicos);
    }
  }, [almacenId]);

  useEffect(() => {
    reloadLookups();
  }, [reloadLookups]);

  // Reanudar cola al cerrar compra por lotes
  useEffect(() => {
    const prev = prevCompraIdRef.current;
    const justClosed = prev && !compraActualId;
    if (justClosed && importQueue.length > 0) {
      setTimeout(() => {
        tryInjectNext();
      }, 0);
    }
    prevCompraIdRef.current = compraActualId;
  }, [compraActualId, importQueue.length, tryInjectNext]);

  const limpiarTodo = () => {
    setNombre("");
    setCategoria("");
    setCantidad("");
    setCosteUnidad("");
    // NO tocar proveedor/formaPago: se mantienen para toda la factura/importación
    setFechaCompra(hoyISO());
    setFechaVencimiento("");
    setCompraActualId(null);
    setCurrentEan("");
  };

  const finalizarCompra = () => {
    setCompraActualId(null);
    limpiarTodo();
    tryInjectNext();
  };

  const guardarCompra = async () => {
    const cantidadNumero = parseInt(cantidad, 10);
    const costeNumero = parseFloat(costeUnidad);
    const total = (cantidadNumero || 0) * (costeNumero || 0);

    if (
      !nombre ||
      !categoria ||
      isNaN(cantidadNumero) ||
      cantidadNumero <= 0 ||
      isNaN(costeNumero) ||
      !fechaCompra
    ) {
      toast.error("Completá todos los campos correctamente.");
      return;
    }

    if (modoLotes && !fechaVencimiento) {
      toast.error("Ingresá la fecha de vencimiento (modo lotes).");
      return;
    }

    try {
      // 1) Crear o reutilizar la compra
      let compraId = compraActualId;

      if (!modoLotes || !compraActualId) {
        const nuevaCompra = {
          nombre,
          costoUnidad: costeNumero,
          cantidad: cantidadNumero,
          total,
          proveedor,
          formaPago,
          categoria,
          almacen_id: almacenId,
          fecha_compra: fechaCompra,
        };

        const { data: compraInsert, error: comprasError } = await supabase
          .from("Compras")
          .insert([nuevaCompra])
          .select("id")
          .single();

        if (comprasError) {
          console.error("Error al guardar compra:", comprasError);
          toast.error("Error al guardar en compras.");
          return;
        }

        compraId = compraInsert?.id ?? null;

        if (modoLotes && compraId) {
          setCompraActualId(compraId);
        }
      }

      // 2) Obtener/crear producto en Stock (preferir EAN)
      let stockId = null;
      let cantidadActual = 0;

      let stockRow = null;

      // 2.a) si tengo EAN, intento por EAN
      if (currentEan) {
        const { data: byEan, error: errEan } = await supabase
          .from("Stock")
          .select("id,cantidad,categoria,ean")
          .eq("almacen_id", almacenId)
          .eq("ean", currentEan)
          .maybeSingle();
        if (!errEan && byEan) stockRow = byEan;
      }

      // 2.b) si no encontré por EAN, busco por nombre
      if (!stockRow) {
        const { data: byName, error: errName } = await supabase
          .from("Stock")
          .select("id,cantidad,categoria,ean")
          .eq("almacen_id", almacenId)
          .eq("nombre", nombre)
          .maybeSingle();
        if (!errName && byName) stockRow = byName;
      }

      if (stockRow) {
        stockId = stockRow.id;
        cantidadActual = stockRow.cantidad || 0;

        // si el producto existe pero NO tiene ean y ahora lo tenemos, lo completamos
        const updatePayload = {
          cantidad: cantidadActual + cantidadNumero,
          categoria,
          ...(currentEan && !stockRow.ean ? { ean: currentEan } : {}),
        };

        const { error: updError } = await supabase
          .from("Stock")
          .update(updatePayload)
          .eq("id", stockId);

        if (updError) {
          console.error("Error al actualizar stock:", updError);
          toast.error("Error al actualizar stock.");
          return;
        }
      } else {
        // 2.c) no existe: crear con ean
        const { data: nuevoStock, error: insStockError } = await supabase
          .from("Stock")
          .insert([
            {
              nombre,
              cantidad: cantidadNumero,
              categoria,
              almacen_id: almacenId,
              ean: currentEan || null,
            },
          ])
          .select("id")
          .single();

        if (insStockError) {
          console.error("Error al crear producto en stock:", insStockError);
          toast.error("Error al crear producto en stock.");
          return;
        }
        stockId = nuevoStock.id;
      }

      // 3) Insertar Lote (guardando ean también)
      const lote = {
        stock_id: stockId,
        cantidad: cantidadNumero,
        costoUnidad: costeNumero,
        fecha_compra: fechaCompra,
        fecha_vencimiento: fechaVencimiento || null,
        compra_id: compraId,
        ean: currentEan || null,
      };

      const { error: loteError } = await supabase.from("Lotes").insert([lote]);
      if (loteError) {
        console.error("Error al crear lote:", loteError);
        toast.error("La compra se guardó, pero falló el lote.");
        return;
      }

      // 4) Reload de listas para datalists
      await reloadLookups();

      // 5) Limpieza / avanzar cola
      if (modoLotes) {
        setCantidad("");
        setFechaVencimiento("");
        toast.success("Lote agregado. Podés cargar otro.");
      } else {
        limpiarTodo();
        toast.success("Compra guardada correctamente.");
        tryInjectNext();
      }

      // 6) Enriquecer proveedores locales si hay uno nuevo
      if (proveedor && !proveedores.includes(proveedor)) {
        setProveedores((prev) => {
          const next = [...prev, proveedor.trim()].filter(Boolean);
          next.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
          return [...new Set(next)];
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Ocurrió un error inesperado.");
    }
  };

  const totalCalculado =
    (parseInt(cantidad, 10) || 0) * (parseFloat(costeUnidad) || 0);

  const camposProductoBloqueados = Boolean(modoLotes && compraActualId);

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full max-w-full sm:max-w-lg mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        <Link
          to="/"
          className="inline-block text-sm text-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition"
        >
          ← Volver al menú
        </Link>

        <h1 className="text-2xl text-gray-700 font-bold text-center">
          Cargar Compra
        </h1>
        <div className="flex items-center justify-end gap-2">
          <ImportarPDF
            onPick={({ nombre, cantidad, costoUnidad, ean }) => {
              setNombre(nombre || "");
              const qty = Number.isFinite(Number(cantidad)) ? Math.max(0, Math.floor(Number(cantidad))) : 0;
              const cost = Number.isFinite(Number(costoUnidad)) ? Math.max(0, Number(costoUnidad)) : 0;
              setCantidad(String(qty));
              setCosteUnidad(String(cost));
              setCurrentEan(ean || "");
              if (nombre || ean) autofillCategoria(nombre, ean);
            }}
            proveedores={proveedores}
            proveedorInicial={proveedor}
            formaPagoInicial={formaPago}
            onQueue={(rows, meta) => {
              if (!rows?.length) {
                toast.error("No hay filas válidas para importar.");
                return;
              }
              if (meta?.proveedor !== undefined) setProveedor(meta.proveedor || "");
              if (meta?.formaPago !== undefined) setFormaPago(meta.formaPago || "");

              setImportQueue(rows);

              if (modoLotes && compraActualId) {
                toast.info("Cola preparada. Finalizá la compra por lotes actual para continuar.");
                return;
              }
              const [first, ...rest] = rows;
              injectRowToInputs(first);
              setImportQueue(rest);
              toast.success(`Cola de importación lista (${rows.length} ítems).`);
            }}
          />

          {importQueue.length > 0 && (
            <>
              <span className="text-xs px-2 py-1 rounded bg-indigo-100 text-indigo-700">
                En cola: {importQueue.length}
              </span>
              <button
                onClick={handleSkipCurrent}
                className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 hover:bg-amber-200"
                title="Saltar este item e inyectar el siguiente"
              >
                Omitir actual
              </button>
              <button
                onClick={handleCancelImport}
                className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                title="Vaciar toda la cola de importación"
              >
                Cancelar cola
              </button>
            </>
          )}
        </div>

        {/* Toggle modo lotes */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={modoLotes}
              onChange={(e) => {
                setModoLotes(e.target.checked);
                if (!e.target.checked) {
                  setCompraActualId(null);
                }
              }}
            />
            Lotes con vencimiento (misma compra, varias fechas)
          </label>

          {compraActualId && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                Compra abierta: #{compraActualId}
              </span>
              <button
                onClick={() => {
                  finalizarCompra();
                  toast.success("Compra finalizada. Ya podés cambiar los datos del producto.");
                }}
                className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                title="Cerrar compra y desbloquear campos"
              >
                Finalizar compra
              </button>
            </div>
          )}
        </div>

        {modoLotes && (
          <p className="text-xs text-gray-500">
            Se conservarán: producto, categoría, costo unidad, proveedor y forma de pago.
            Solo cambiá <b>cantidad</b> y <b>fecha de vencimiento</b> por cada lote.
          </p>
        )}

        {/* Producto y Categoría */}
        <div className="space-y-4">
          <input
            list="productos"
            placeholder="Producto"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => {
              if (nombre) autofillCategoria(nombre, currentEan);
            }}
            disabled={camposProductoBloqueados}
            title={camposProductoBloqueados ? "Compra abierta: no se puede cambiar el producto hasta finalizar" : ""}
            className={`w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              camposProductoBloqueados ? "opacity-70 cursor-not-allowed" : "text-gray-700"
            }`}
          />
          <datalist id="productos">
            {productosStock.map((prod) => (
              <option key={prod} value={prod} />
            ))}
          </datalist>

          <input
            list="categorias"
            placeholder="Categoría"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            disabled={camposProductoBloqueados}
            title={camposProductoBloqueados ? "Compra abierta: no se puede cambiar la categoría hasta finalizar" : ""}
            className={`w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              camposProductoBloqueados ? "opacity-70 cursor-not-allowed" : "text-gray-700"
            }`}
          />
          <datalist id="categorias">
            {categoriasStock.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
        </div>

        {/* Cantidad y Coste unidad — responsive row */}
        <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="Cantidad"
            value={cantidad}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") { setCantidad(""); return; }
              if (raw.trim().startsWith("-")) { setCantidad("0"); return; }
              const n = Math.floor(Number(raw));
              if (!Number.isFinite(n)) { setCantidad(""); return; }
              setCantidad(String(Math.max(0, n)));
            }}
            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
          />

          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="Coste unidad"
            value={costeUnidad}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") { setCosteUnidad(""); return; }
              if (raw.trim().startsWith("-")) { setCosteUnidad("0"); return; }
              const n = Number(raw);
              if (!Number.isFinite(n)) { setCosteUnidad(""); return; }
              setCosteUnidad(String(Math.max(0, n)));
            }}
            disabled={camposProductoBloqueados}
            title={camposProductoBloqueados ? "Compra abierta: no se puede cambiar el costo unitario hasta finalizar" : ""}
            className={`flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              camposProductoBloqueados ? "opacity-70 cursor-not-allowed" : "text-gray-700"
            }`}
          />
        </div>

        {/* Total calculado */}
        <div className="text-right text-lg font-semibold text-gray-700">
          Total: ${totalCalculado.toFixed(2)}
        </div>

        {/* Fechas */}
        <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Fecha de compra</label>
            <input
              type="date"
              value={fechaCompra}
              onChange={(e) => setFechaCompra(e.target.value)}
              disabled={camposProductoBloqueados}
              title={camposProductoBloqueados ? "Compra abierta: no se puede cambiar la fecha de compra hasta finalizar" : ""}
              className={`w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                camposProductoBloqueados ? "opacity-70 cursor-not-allowed" : "text-gray-700"
              }`}
            />
          </div>

          {modoLotes && (
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Fecha de vencimiento</label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                required={modoLotes}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
              />
            </div>
          )}
        </div>

        {/* Proveedor (datalist) + Forma de pago */}
        <div className="flex flex-col sm:flex-row sm:space-x-4 sm:space-y-0 space-y-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Proveedor</label>
            <input
              list="proveedores"
              type="text"
              placeholder="Proveedor"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              disabled={camposProductoBloqueados}
              title={camposProductoBloqueados ? "Compra abierta: no se puede cambiar el proveedor hasta finalizar" : ""}
              className={`w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                camposProductoBloqueados ? "opacity-70 cursor-not-allowed" : "text-gray-700"
              }`}
            />
            <datalist id="proveedores">
              {proveedores.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">Forma de pago</label>
            <select
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value)}
              disabled={camposProductoBloqueados}
              title={camposProductoBloqueados ? "Compra abierta: no se puede cambiar la forma de pago hasta finalizar" : ""}
              className={`w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                camposProductoBloqueados ? "opacity-70 cursor-not-allowed" : "text-gray-700"
              }`}
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

        {/* Botón Guardar */}
        <div className="flex gap-3">
          <button
            onClick={guardarCompra}
            className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Guardar
          </button>
          {compraActualId && (
            <button
              onClick={() => {
                finalizarCompra();
                toast.success("Compra finalizada. Ya podés cambiar los datos del producto.");
              }}
              className="px-4 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              title="Cerrar compra abierta"
            >
              Finalizar compra
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
