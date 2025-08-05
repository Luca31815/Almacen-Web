// Compras.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Link } from "react-router-dom";

export default function Compras() {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [categoriasStock, setCategoriasStock] = useState([]);
  const [productosStock, setProductosStock] = useState([]);
  const [cantidad, setCantidad] = useState("");
  const [costeUnidad, setCosteUnidad] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [formaPago, setFormaPago] = useState("");

  const almacenId = localStorage.getItem("almacen_id");

  useEffect(() => {
    const cargarDatos = async () => {
      const { data: productos, error: errorProd } = await supabase
        .from("Stock")
        .select("nombre, categoria")
        .eq("almacen_id", almacenId);

      if (!errorProd) {
        setProductosStock(productos.map(p => p.nombre));
        const categoriasUnicas = [...new Set(
          productos.map(p => p.categoria).filter(Boolean)
        )];
        setCategoriasStock(categoriasUnicas);
      }
    };

    if (almacenId) cargarDatos();
  }, [almacenId]);

  const guardarCompra = async () => {
    const cantidadNumero = parseInt(cantidad, 10);
    const costeNumero = parseFloat(costeUnidad);
    const total = cantidadNumero * costeNumero;

    if (!nombre || !categoria || isNaN(cantidadNumero) || cantidadNumero <= 0 || isNaN(costeNumero)) {
      alert("Por favor completá todos los campos correctamente.");
      return;
    }

    const nuevaCompra = {
      nombre,
      costoUnidad: costeNumero,
      cantidad: cantidadNumero,
      total,
      proveedor,
      formaPago,
      categoria,
      almacen_id: almacenId,
    };

    const { error: comprasError } = await supabase.from("Compras").insert([nuevaCompra]);
    if (comprasError) {
      console.error("Error al guardar compra:", comprasError);
      alert("Error al guardar en compras: " + comprasError.message);
      return;
    }

    const { data: productoExistente } = await supabase
      .from("Stock")
      .select("cantidad")
      .eq("nombre", nombre)
      .eq("almacen_id", almacenId)
      .single();

    if (productoExistente) {
      await supabase.from("Stock").update({
        cantidad: productoExistente.cantidad + cantidadNumero
      })
      .eq("nombre", nombre)
      .eq("almacen_id", almacenId);
    } else {
      await supabase.from("Stock").insert([
        { nombre, cantidad: cantidadNumero, categoria, almacen_id: almacenId }
      ]);
    }

    // Limpiar campos
    setNombre("");
    setCategoria("");
    setCantidad("");
    setCosteUnidad("");
    setProveedor("");
    setFormaPago("");
  };

  const totalCalculado = (parseInt(cantidad, 10) || 0) * (parseFloat(costeUnidad) || 0);

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full max-w-full sm:max-w-lg mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        <Link to="/" className="inline-block text-sm text-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition">
          ← Volver al menú
        </Link>

        <h1 className="text-2xl text-gray-700 font-bold text-center">Cargar Compra</h1>

        {/* Producto y Categoría */}
        <div className="space-y-4">
          <input
            list="productos"
            placeholder="Producto"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-500"
          />
          <datalist id="productos">
            {productosStock.map(prod => <option key={prod} value={prod} />)}
          </datalist>

          <input
            list="categorias"
            placeholder="Categoría"
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-500"
          />
          <datalist id="categorias">
            {categoriasStock.map(cat => <option key={cat} value={cat} />)}
          </datalist>
        </div>

        {/* Cantidad y Coste */}
        <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
          <input
            type="number"
            placeholder="Cantidad"
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-500"
          />
          <input
            type="number"
            placeholder="Coste unidad"
            value={costeUnidad}
            onChange={e => setCosteUnidad(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-500"
          />
        </div>

        {/* Total calculado */}
        <div className="text-right text-lg font-semibold text-gray-700">
          Total: ${totalCalculado.toFixed(2)}
        </div>

        {/* Proveedor y Forma de pago */}
        <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
          <input
            type="text"
            placeholder="Proveedor"
            value={proveedor}
            onChange={e => setProveedor(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-500"
          />
          <input
            type="text"
            placeholder="Forma de pago"
            value={formaPago}
            onChange={e => setFormaPago(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-500"
          />
        </div>

        {/* Botón Guardar */}
        <button
          onClick={guardarCompra}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Guardar Compra
        </button>
      </div>
    </div>
  );
}
