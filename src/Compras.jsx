// Compras.jsx
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { Link } from "react-router-dom";
import { useToast } from "./ToastProvider";

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

  const limpiarTodo = () => {
    setNombre("");
    setCategoria("");
    setCantidad("");
    setCosteUnidad("");
    setProveedor("");
    setFormaPago("");
    setFechaCompra(hoyISO());
    setFechaVencimiento("");
    setCompraActualId(null);
  };

  const finalizarCompra = () => {
    setCompraActualId(null);
    limpiarTodo();
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

      // 2) Obtener/crear producto en Stock
      let stockId = null;
      let cantidadActual = 0;

      const { data: prodExistente, error: prodSelError } = await supabase
        .from("Stock")
        .select("id, cantidad")
        .eq("nombre", nombre)
        .eq("almacen_id", almacenId)
        .single();

      if (!prodSelError && prodExistente) {
        stockId = prodExistente.id;
        cantidadActual = prodExistente.cantidad || 0;

        const { error: updError } = await supabase
          .from("Stock")
          .update({ cantidad: cantidadActual + cantidadNumero, categoria })
          .eq("id", stockId);

        if (updError) {
          console.error("Error al actualizar stock:", updError);
          toast.error("Error al actualizar stock.");
          return;
        }
      } else {
        const { data: nuevoStock, error: insStockError } = await supabase
          .from("Stock")
          .insert([
            {
              nombre,
              cantidad: cantidadNumero,
              categoria,
              almacen_id: almacenId,
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

      // 3) Insertar Lote
      const lote = {
        stock_id: stockId,
        cantidad: cantidadNumero,
        costoUnidad: costeNumero,
        fecha_compra: fechaCompra,
        fecha_vencimiento: fechaVencimiento || null,
        compra_id: compraId,
      };

      const { error: loteError } = await supabase.from("Lotes").insert([lote]);
      if (loteError) {
        console.error("Error al crear lote:", loteError);
        toast.error("La compra se guardó, pero falló el lote.");
        return;
      }

      // 4) Reload de listas para que aparezcan los nuevos en los datalist/select
      await reloadLookups();

      // 5) Limpieza según modo
      if (modoLotes) {
        setCantidad("");
        setFechaVencimiento("");
        toast.success("Lote agregado. Podés cargar otro.");
      } else {
        limpiarTodo();
        toast.success("Compra guardada correctamente.");
      }

      // 6) Enriquecer proveedores locales si hay uno nuevo (por UX)
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
