import { Link } from 'react-router-dom'

export default function Menu() {
  return (
    <div className="p-6 max-w-md mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold mb-4 text-center">Menú del Kiosco</h1>

      <Link
        to="/stock"
        className="bg-gray-700 hover:bg-gray-800 text-white py-2 px-4 rounded text-center"
      >
        Ver Stock
      </Link>

      <Link
        to="/compras"
        className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-center"
      >
        Cargar Compras
      </Link>

      <Link
        to="/ventas"
        className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded text-center"
      >
        Cargar Ventas
      </Link>

    </div>
  )
}
