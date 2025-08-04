import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Link } from "react-router-dom";

export default function Ventas() {
  const [nombre, setNombre] = useState("");
  const [productosStock, setProductosStock] = useState([]);
  const [cantidadDisponible, setCantidadDisponible] = useState(0);
  const [cantidadVentas, setCantidadVentas] = useState("");
  const [gananciaBruta, setGananciaBruta] = useState("");
  const [gananciaNeta, setGananciaNeta] = useState("");

  const almacenId = localStorage.getItem("almacen_id");

  useEffect(() => {
    const cargarProductos = async () => {
      if (!almacenId) return;

      const { data, error } = await supabase
        .from("Stock")
        .select("nombre")
        .eq("almacen_id", almacenId);

      if (!error && data) {
        setProductosStock(data.map((p) => p.nombre));
      }
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

      if (!error && data) {
        setCantidadDisponible(data.cantidad || 0);
      } else {
        setCantidadDisponible(0);
      }
    };

    obtenerStock();
  }, [nombre, almacenId]);

  const handleCantidadChange = (e) => {
    const value = parseInt(e.target.value);
    if (isNaN(value) || value <= 0) {
      setCantidadVentas("");
    } else if (value > cantidadDisponible) {
      setCantidadVentas(cantidadDisponible.toString());
    } else {
      setCantidadVentas(value.toString());
    }
  };

  const guardarVenta = async () => {
    const cantidadNumero = parseInt(cantidadVentas);

    if (!nombre || isNaN(cantidadNumero) || cantidadNumero <= 0) {
      alert("Por favor completá todos los campos correctamente.");
      return;
    }

    const nuevaVenta = {
      nombre,
      cantidad: cantidadNumero,
      almacen_id: almacenId,
      gananciaBruta: parseFloat(gananciaBruta),
      gananciaNeta: parseFloat(gananciaNeta),
    };

    const { error: ventasError } = await supabase
      .from("Ventas")
      .insert([nuevaVenta]);

    if (ventasError) {
      alert("Error al guardar en ventas: " + ventasError.message);
      return;
    }

    // Actualizar el stock correspondiente
    const nuevaCantidad = cantidadDisponible - cantidadNumero;

    const { error: updateError } = await supabase
      .from("Stock")
      .update({ cantidad: nuevaCantidad })
      .eq("nombre", nombre)
      .eq("almacen_id", almacenId);

    if (updateError) {
      alert("Error al actualizar stock: " + updateError.message);
      return;
    }

    // Limpiar campos
    setNombre("");
    setCantidadVentas("");
    setGananciaBruta("");
    setGananciaNeta("");
    setCantidadDisponible(0);
  };

  return (
    <div className="min-h-screen flex justify-center bg-gray-100 px-4">
      <div className="max-w-xl  bg-white shadow-xl rounded-2xl p-6 space-y-[16px]">
        <Link
          to="/"
          className="inline-block mb-4 bg-blue-500 text-white px-4 py-2 rounded"
        >
          Volver al menú
        </Link>
        <h1 className="text-xl font-bold mb-4">Cargar Venta</h1>

        <input
          list="productos"
          placeholder="Seleccionar o escribir producto"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="border p-2 w-full h-10 bg-gray-200 px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
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
          className="border p-2 w-full h-10 bg-gray-200 px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="number"
          placeholder="Ganancia Bruta"
          value={gananciaBruta}
          onChange={(e) => setGananciaBruta(e.target.value)}
          className="border p-2 w-full h-10 bg-gray-200 px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="number"
          placeholder="Ganancia Neta"
          value={gananciaNeta}
          onChange={(e) => setGananciaNeta(e.target.value)}
          className="border p-2 w-full h-10 bg-gray-200 px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <button
          onClick={guardarVenta}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Guardar venta
        </button>
      </div>
    </div>
  );
}
