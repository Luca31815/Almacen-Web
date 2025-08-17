// Ventas.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Link } from "react-router-dom";
import { useToast } from "./ToastProvider"; // ← NEW

export default function Ventas() {
  const toast = useToast(); // ← NEW

  const [nombre, setNombre] = useState("");
  const [productosStock, setProductosStock] = useState([]);

  const [stockId, setStockId] = useState(null);
  const [cantidadDisponible, setCantidadDisponible] = useState(0);

  const [cantidadVentas, setCantidadVentas] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");

  // Fechas de vencimiento (info)
  const [fechasVencimiento, setFechasVencimiento] = useState([]); // [{fecha, cantidad}]
  const [fechaSeleccionada, setFechaSeleccionada] = useState("");

  // Fecha de venta y forma de pago
  const hoyISO = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const [fechaVenta, setFechaVenta] = useState(hoyISO());
  const [formaPago, setFormaPago] = useState("");

  const almacenId = localStorage.getItem("almacen_id");

  useEffect(() => {
    const cargarProductos = async () => {
      if (!almacenId) return;
      const { data, error } = await supabase
        .from("Stock")
        .select("nombre")
        .eq("almacen_id", almacenId);
      if (!error && data) setProductosStock(data.map((p) => p.nombre));
    };
    cargarProductos();
  }, [almacenId]);

  // Cargar info del producto seleccionado
  useEffect(() => {
    const obtenerStock = async () => {
      setFechasVencimiento([]);
      setFechaSeleccionada("");
      setStockId(null);
      setCantidadDisponible(0);

      if (!nombre || !almacenId) return;

      const { data, error } = await supabase
        .from("Stock")
        .select("id, cantidad")
        .eq("nombre", nombre)
        .eq("almacen_id", almacenId)
        .single();

      if (!error && data) {
        setStockId(data.id);
        setCantidadDisponible(data.cantidad || 0);
      }
    };
    obtenerStock();
  }, [nombre, almacenId]);

  // Traer lotes (informativo)
  useEffect(() => {
    const obtenerFechasVencimiento = async () => {
      setFechasVencimiento([]);
      setFechaSeleccionada("");
      if (!stockId) return;

      const { data, error } = await supabase
        .from("Lotes")
        .select("fecha_vencimiento, cantidad")
        .eq("stock_id", stockId)
        .not("fecha_vencimiento", "is", null)
        .gt("cantidad", 0)
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

      if (error) return;

      const map = new Map();
      for (const l of data || []) {
        const f = l.fecha_vencimiento;
        map.set(f, (map.get(f) || 0) + (l.cantidad || 0));
      }
      let agrupado = Array.from(map.entries()).map(([fecha, cantidad]) => ({ fecha, cantidad }));
      agrupado.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

      setFechasVencimiento(agrupado);

      if (agrupado.length > 0) {
        const toDate = (s) => new Date(`${s}T00:00:00`);
        const today = new Date(hoyISO() + "T00:00:00");

        const futuros = agrupado.filter((x) => toDate(x.fecha) >= today);
        let elegida;
        if (futuros.length > 0) {
          elegida = futuros.reduce((best, x) => (toDate(x.fecha) < toDate(best.fecha) ? x : best));
        } else {
          elegida = agrupado[agrupado.length - 1];
        }
        setFechaSeleccionada(elegida.fecha);
      }
    };

    obtenerFechasVencimiento();
  }, [stockId]);

  const handleCantidadChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value) || value <= 0) setCantidadVentas("");
    else if (value > cantidadDisponible) setCantidadVentas(cantidadDisponible.toString());
    else setCantidadVentas(value.toString());
  };

  const totalVenta = () => {
    const qty = parseInt(cantidadVentas, 10) || 0;
    const price = parseFloat(precioVenta) || 0;
    return qty * price;
  };

  const guardarVenta = async () => {
    const qty = parseInt(cantidadVentas, 10);
    const price = parseFloat(precioVenta);

    if (!nombre || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
      toast.error("Completá todos los campos correctamente.");
      return;
    }
    if (!almacenId) {
      toast.error("No hay almacén seleccionado.");
      return;
    }
    if (!fechaVenta) {
      toast.error("Seleccioná la fecha de venta.");
      return;
    }
    if (!stockId) {
      toast.error("Producto no encontrado en este almacén.");
      return;
    }

    try {
      // 1) Lotes para FIFO
      const { data: lotes, error: lotesErr } = await supabase
        .from("Lotes")
        .select("id, cantidad, costoUnidad, fecha_vencimiento")
        .eq("stock_id", stockId)
        .gt("cantidad", 0)
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

      if (lotesErr) {
        toast.error("No se pudieron obtener los lotes.");
        return;
      }

      const totalEnLotes = (lotes || []).reduce((acc, l) => acc + (l.cantidad || 0), 0);
      if (qty > totalEnLotes) {
        toast.error(`Stock insuficiente por lotes. Disponible: ${totalEnLotes}.`);
        return;
      }

      // 2) Cabecera en Ventas
      const ventaCabecera = {
        nombre,
        cantidad: qty,
        precioVenta: price,
        total: totalVenta(),
        almacen_id: almacenId,
        fecha_venta: fechaVenta,
        formaPago: formaPago || null,
      };

      const { data: ventaIns, error: ventaErr } = await supabase
        .from("Ventas")
        .insert([ventaCabecera])
        .select("id")
        .single();

      if (ventaErr) {
        toast.error("Error al guardar en Ventas.");
        return;
      }

      const ventaId = ventaIns.id;

      // 3) Item
      const ventaItem = {
        venta_id: ventaId,
        stock_id: stockId,
        nombre,
        cantidad: qty,
        precio_unitario: price,
        subtotal: qty * price,
      };
      const { data: viIns, error: viErr } = await supabase
        .from("VentaItems")
        .insert([ventaItem])
        .select("id")
        .single();

      if (viErr) {
        toast.error("Error al guardar los items de la venta.");
        return;
      }
      const ventaItemId = viIns.id;

      // 4) Descontar FIFO + vínculos
      let porVender = qty;

      for (const lote of lotes) {
        if (porVender <= 0) break;
        const tomar = Math.min(porVender, lote.cantidad);

        const vil = {
          venta_item_id: ventaItemId,
          lote_id: lote.id,
          cantidad: tomar,
          costo_unitario: lote.costoUnidad ?? null,
          fecha_vencimiento: lote.fecha_vencimiento ?? null,
        };
        const { error: vilErr } = await supabase.from("VentaItemsLotes").insert([vil]);
        if (vilErr) {
          toast.error("Error al vincular lote en la venta.");
          return;
        }

        const { error: updLoteErr } = await supabase
          .from("Lotes")
          .update({ cantidad: lote.cantidad - tomar })
          .eq("id", lote.id);
        if (updLoteErr) {
          toast.error("Error al actualizar lote.");
          return;
        }

        porVender -= tomar;
      }

      // 5) Actualizar Stock total
      const nuevaCantidad = (cantidadDisponible || 0) - qty;
      const { error: updStockErr } = await supabase
        .from("Stock")
        .update({ cantidad: nuevaCantidad })
        .eq("id", stockId);
      if (updStockErr) {
        toast.error("Error al actualizar stock.");
        return;
      }

      // 6) Limpiar
      setNombre("");
      setCantidadVentas("");
      setPrecioVenta("");
      setCantidadDisponible(0);
      setFechaVenta(hoyISO());
      setFormaPago("");
      setFechasVencimiento([]);
      setFechaSeleccionada("");
      setStockId(null);

      toast.success("Venta guardada correctamente.");
    } catch (e) {
      console.error(e);
      toast.error("Ocurrió un error inesperado al guardar la venta.");
    }
  };

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full max-w-full sm:max-w-lg mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        <Link
          to="/"
          className="inline-block text-sm bg-white text-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition"
        >
          ← Volver al menú
        </Link>

        <h1 className="text-2xl font-bold text-center text-gray-700">Cargar Venta</h1>

        <div className="space-y-4">
          <input
            list="productos"
            placeholder="Seleccionar o escribir producto"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <datalist id="productos">
            {productosStock.map((prod) => (
              <option key={prod} value={prod} />
            ))}
          </datalist>

          {/* Select de fechas de vencimiento (solo si hay) */}
          {fechasVencimiento.length > 0 && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Fechas de vencimiento disponibles
              </label>
              <select
                value={fechaSeleccionada}
                onChange={(e) => setFechaSeleccionada(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {fechasVencimiento.map((f) => (
                  <option key={f.fecha} value={f.fecha}>
                    {f.fecha} ({f.cantidad} u)
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                * Informativo. La venta descuenta por orden de vencimiento (FIFO).
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
            <input
              type="number"
              placeholder={`Cantidad (máx ${cantidadDisponible})`}
              value={cantidadVentas}
              onChange={handleCantidadChange}
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="number"
              placeholder="Precio de venta por producto"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Fecha de venta y forma de pago */}
          <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Fecha de venta</label>
              <input
                type="date"
                value={fechaVenta}
                onChange={(e) => setFechaVenta(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Forma de pago</label>
              <select
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
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

          <div className="text-right text-lg font-semibold text-gray-700">
            Total: ${totalVenta().toFixed(2)}
          </div>
        </div>

        <button
          onClick={guardarVenta}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Guardar Venta
        </button>
      </div>
    </div>
  );
}
