import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { Link } from 'react-router-dom'

export default function Stock() {
  const [productos, setProductos] = useState([])

  useEffect(() => {
    const fetchStock = async () => {
      const { data, error } = await supabase.from('Stock').select()
      if (error) {
        console.error('Error al cargar stock', error)
      } else {
        setProductos(data)
      }
    }
    fetchStock()
  }, [])

  return (
    <div className="max-w-2xl mx-auto mt-8 p-4 bg-white shadow rounded">
      <Link
      to="/"
      className="inline-block mb-4 bg-blue-500 text-white px-4 py-2 rounded"
    >
      Volver al menú
    </Link>
      <h2 className="text-xl font-bold mb-4">Stock Actual</h2>
      <table className="table-auto w-full">
        <thead>
          <tr>
            <th className="px-4 py-2 border">Producto</th>
            <th className="px-4 py-2 border">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p, i) => (
            <tr key={i}>
              <td className="border px-4 py-2">{p.nombre}</td>
              <td className="border px-4 py-2">{p.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
