// Ventas.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Link } from "react-router-dom";

export default function Ventas() {
  const [nombre, setNombre] = useState("");
  const [productosStock, setProductosStock] = useState([]);
  const [cantidadDisponible, setCantidadDisponible] = useState(0);
  const [cantidadVentas, setCantidadVentas] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");

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

  useEffect(() => {
    const obtenerStock = async () => {
      if (!nombre || !almacenId) return;
      const { data, error } = await supabase
        .from("Stock")
        .select("cantidad")
        .eq("nombre", nombre)
        .eq("almacen_id", almacenId)
        .single();
      if (!error && data) setCantidadDisponible(data.cantidad || 0);
      else setCantidadDisponible(0);
    };
    obtenerStock();
  }, [nombre, almacenId]);

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
      alert("Por favor completá todos los campos correctamente.");
      return;
    }
    const nuevaVenta = {
      nombre,
      cantidad: qty,
      precioVenta: price,
      total: totalVenta(),
      almacen_id: almacenId,
    };
    const { error: ventasError } = await supabase.from("Ventas").insert([nuevaVenta]);
    if (ventasError) {
      alert("Error al guardar en ventas: " + ventasError.message);
      return;
    }
    const nuevaCantidad = cantidadDisponible - qty;
    const { error: updateError } = await supabase
      .from("Stock")
      .update({ cantidad: nuevaCantidad })
      .eq("nombre", nombre)
      .eq("almacen_id", almacenId);
    if (updateError) {
      alert("Error al actualizar stock: " + updateError.message);
      return;
    }
    setNombre("");
    setCantidadVentas("");
    setPrecioVenta("");
    setCantidadDisponible(0);
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
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <datalist id="productos">
            {productosStock.map((prod) => (
              <option key={prod} value={prod} />
            ))}
          </datalist>
          <input
            type="number"
            placeholder={`Cantidad (máx ${cantidadDisponible})`}
            value={cantidadVentas}
            onChange={handleCantidadChange}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="number"
            placeholder="Precio de venta por producto"
            value={precioVenta}
            onChange={(e) => setPrecioVenta(e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
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
