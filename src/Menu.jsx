import { Link } from "react-router-dom";
import { FaBoxOpen, FaCartPlus, FaCashRegister } from "react-icons/fa";

export default function Menu() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4 py-10">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Panel del Kiosco</h1>

      <div className="bg-white rounded-2xl p-6 w-full max-w-5xl shadow-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
