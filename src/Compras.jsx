import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Link } from 'react-router-dom'

export default function Compras() {
  const [nombre, setNombre] = useState("");
  const [productosStock, setProductosStock] = useState([]);
  const [cantidad, setCantidad] = useState("");
  const [costeUnidad, setCosteUnidad] = useState("");
  const [total, setTotal] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");

  useEffect(() => {
    const cargarProductos = async () => {
      const { data, error } = await supabase.from("Stock").select("nombre");
      if (!error) setProductosStock(data.map((p) => p.nombre));
    };
    cargarProductos();
  }, []);

  const guardarCompra = async () => {
    const cantidadNumero = parseInt(cantidad);

    if (!nombre || isNaN(cantidadNumero) || cantidadNumero <= 0) {
      alert("Por favor completá todos los campos correctamente.");
      return;
    }

    const nuevaCompra = {
      nombre,
      costoUnidad: parseFloat(costeUnidad),
      cantidad: cantidadNumero,
      total: parseFloat(total),
      proveedor,
      formaPago,
      precioVenta: parseFloat(precioVenta),
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
      await supabase.from("Stock").insert([{ nombre, cantidad: cantidadNumero }]);
    }

    setNombre("");
    setCantidad("");
    setCosteUnidad("");
    setTotal("");
    setProveedor("");
    setFormaPago("");
    setPrecioVenta("");
  };

  return (
    <div className="p-4">
      <Link
      to="/"
      className="inline-block mb-4 bg-blue-500 text-white px-4 py-2 rounded"
    >
      Volver al menú
    </Link>
      <h1 className="text-xl font-bold mb-4">Cargar Compra</h1>
      <div className="mb-2 w-full">
        <input
          list="productos"
          placeholder="Seleccionar o escribir producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="border p-2 w-full"
        />
        <datalist id="productos">
          {productosStock.map((prod) => (
            <option key={prod} value={prod} />
          ))}
        </datalist>
      </div>
      <input
        type="number"
        placeholder="Cantidad"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <input
        type="number"
        placeholder="Coste por unidad"
        value={costeUnidad}
        onChange={(e) => setCosteUnidad(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <input
        type="number"
        placeholder="Total"
        value={total}
        onChange={(e) => setTotal(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <input
        type="text"
        placeholder="Proveedor"
        value={proveedor}
        onChange={(e) => setProveedor(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <input
        type="text"
        placeholder="Forma de pago"
        value={formaPago}
        onChange={(e) => setFormaPago(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <input
        type="number"
        placeholder="Precio de venta por unidad"
        value={precioVenta}
        onChange={(e) => setPrecioVenta(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <button
        onClick={guardarCompra}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Guardar compra
      </button>
    </div>
  );
}