// Menu.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaBoxOpen, FaCartPlus, FaCashRegister, FaHistory } from "react-icons/fa"; // <- usamos FaHistory
import { supabase } from "./supabase";

export default function Menu() {
  const [nombreAlmacen, setNombreAlmacen] = useState("Cargando...");

  // Buscar el nombre del almacén seleccionado al cargar
  useEffect(() => {
    const fetchNombreAlmacen = async () => {
      const almacenId = localStorage.getItem("almacen_id");
      if (!almacenId) {
        setNombreAlmacen("Sin almacén seleccionado");
        return;
      }

      const { data, error } = await supabase
        .from("Almacenes")
        .select("nombre")
        .eq("id", almacenId)
        .single();

      if (error || !data) {
        setNombreAlmacen("Almacén no encontrado");
      } else {
        setNombreAlmacen(data.nombre);
      }
    };

    fetchNombreAlmacen();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 px-4 py-10">
      {/* Título dinámico con nombre del almacén */}
      <h1 className="text-3xl font-bold mb-8 text-gray-800">{nombreAlmacen}</h1>

      <div className="bg-white rounded-2xl p-6 w-full max-w-screen-xl shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {/* Historial (reemplaza a Almacenes) */}
          <Link
            to="/historial"
            className="bg-purple-100 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-purple-200 transition cursor-pointer"
          >
            <FaHistory className="text-purple-600 text-5xl mb-3" />
            <h2 className="text-xl font-semibold text-gray-800">Historial</h2>
            <p className="text-sm text-gray-600 mt-1 text-center">
              Compras y ventas + gasto mensual
            </p>
          </Link>

          <Link
            to="/stock"
            className="bg-blue-100 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-blue-200 transition cursor-pointer"
          >
            <FaBoxOpen className="text-blue-600 text-5xl mb-3" />
            <h2 className="text-xl font-semibold text-gray-800">Stock</h2>
            <p className="text-sm text-gray-600 mt-1 text-center">Ver el inventario de productos</p>
          </Link>

          <Link
            to="/compras"
            className="bg-green-100 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-green-200 transition cursor-pointer"
          >
            <FaCartPlus className="text-green-600 text-5xl mb-3" />
            <h2 className="text-xl font-semibold text-gray-800">Compras</h2>
            <p className="text-sm text-gray-600 mt-1 text-center">Registrar una nueva compra</p>
          </Link>

          <Link
            to="/ventas"
            className="bg-yellow-100 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-yellow-200 transition cursor-pointer"
          >
            <FaCashRegister className="text-yellow-600 text-5xl mb-3" />
            <h2 className="text-xl font-semibold text-gray-800">Ventas</h2>
            <p className="text-sm text-gray-600 mt-1 text-center">Registrar una nueva venta</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
