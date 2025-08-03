import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Link } from 'react-router-dom';

export default function Compras() {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [categoriasStock, setCategoriasStock] = useState([]);
  const [productosStock, setProductosStock] = useState([]);
  const [cantidad, setCantidad] = useState("");
  const [costeUnidad, setCosteUnidad] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [formaPago, setFormaPago] = useState("");

  // Cargar productos y categorías al montar el componente
  useEffect(() => {
    const cargarDatos = async () => {
      const { data: productos, error: errorProd } = await supabase.from("Stock").select("nombre, categoria");

      if (!errorProd) {
        setProductosStock(productos.map(p => p.nombre));

        const categoriasUnicas = [...new Set(productos.map(p => p.categoria).filter(Boolean))];
        setCategoriasStock(categoriasUnicas);
      }
    };

    cargarDatos();
  }, []);

  const guardarCompra = async () => {
    const cantidadNumero = parseInt(cantidad);
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
    };

    const { error: comprasError } = await supabase.from("Compras").insert([nuevaCompra]);

    if (comprasError) {
      console.error("Error al guardar compra:", comprasError);
      alert("Error al guardar en compras: " + comprasError.message);
      return;
    }

    const { data: productoExistente } = await supabase
      .from("Stock")
      .select("*")
      .eq("nombre", nombre)
      .single();

    if (productoExistente) {
      const nuevaCantidad = productoExistente.cantidad + cantidadNumero;
      await supabase.from("Stock").update({ cantidad: nuevaCantidad }).eq("nombre", nombre);
    } else {
      await supabase.from("Stock").insert([{ nombre, cantidad: cantidadNumero, categoria }]);
    }

    setNombre("");
    setCategoria("");
    setCantidad("");
    setCosteUnidad("");
    setProveedor("");
    setFormaPago("");
  };

  const totalCalculado = cantidad && costeUnidad ? parseInt(cantidad || 0) * parseFloat(costeUnidad || 0) : 0;

  return (
    <div className="min-h-screen flex justify-center bg-gray-100 px-4">
      <div className="w-1/2 max-w-sm lg:w-1/4 bg-white shadow-xl rounded-2xl p-6 space-y-[16px]">
        <Link to="/" className="inline-block mb-4 bg-blue-500 text-white px-4 py-2 rounded">
          Volver al menú
        </Link>

        <h1 className="text-xl font-bold mb-4">Cargar Compra</h1>

        {/* NOMBRE */}
        <input
          list="productos"
          placeholder="Seleccionar o escribir producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="border p-2 w-full h-[30px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <datalist id="productos">
          {productosStock.map((prod) => (
            <option key={prod} value={prod} />
          ))}
        </datalist>

        {/* CATEGORÍA */}
        <input
          list="categorias"
          placeholder="Seleccionar o escribir categoría"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="border p-2 w-full h-[30px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <datalist id="categorias">
          {categoriasStock.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>

        {/* CANTIDAD Y COSTO */}
        <div className="flex gap-4 mb-4 justify-between">
          <input
            type="number"
            placeholder="Cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="border p-2 w-5/11 h-[30px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="number"
            placeholder="Coste por unidad"
            value={costeUnidad}
            onChange={(e) => setCosteUnidad(e.target.value)}
            className="border p-2 w-5/11 h-[30px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* TOTAL */}
        <div className="mb-4">
          <span className="text-gray-700">Total: </span>
          <span className="font-semibold">${totalCalculado.toFixed(2)}</span>
        </div>

        {/* PROVEEDOR Y FORMA DE PAGO */}
        <div className="flex gap-4 mb-4 justify-between">
          <input
            type="text"
            placeholder="Proveedor"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            className="border p-2 w-5/11 h-[30px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="text"
            placeholder="Forma de pago"
            value={formaPago}
            onChange={(e) => setFormaPago(e.target.value)}
            className="border p-2 w-5/11 h-[30px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* GUARDAR */}
        <button
          onClick={guardarCompra}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Guardar compra
        </button>
      </div>
    </div>
  );
}
