// Stock.jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Link, useNavigate } from 'react-router-dom';

export default function Stock() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const navigate = useNavigate();

  const almacen_id = localStorage.getItem('almacen_id');

  useEffect(() => {
    if (!almacen_id) {
      navigate("/almacenes");
      return;
    }

    const fetchStock = async () => {
      const { data, error } = await supabase
        .from('Stock')
        .select()
        .eq('almacen_id', almacen_id); // Filtrar por almacén

      if (error) {
        console.error('Error al cargar stock', error);
      } else {
        setProductos(data);

        // Sacar categorías únicas
        const categoriasUnicas = [...new Set(data.map(p => p.categoria).filter(Boolean))];
        setCategorias(categoriasUnicas);
      }
    };

    fetchStock();
  }, [almacen_id, navigate]);

  const productosFiltrados = categoriaSeleccionada
    ? productos.filter(p => p.categoria === categoriaSeleccionada)
    : productos;

  return (
    <div className="max-w-2xl mx-auto mt-8 p-4 bg-white shadow rounded">
      <Link
        to="/"
        className="inline-block mb-4 bg-blue-500 text-white px-4 py-2 rounded"
      >
        Volver al menú
      </Link>

      <h2 className="text-xl font-bold mb-2">Stock Actual</h2>

      <div className="mb-4">
        <label className="block mb-1 text-sm text-gray-700">Filtrar por categoría:</label>
        <select
          value={categoriaSeleccionada}
          onChange={(e) => setCategoriaSeleccionada(e.target.value)}
          className="w-full p-2  border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Todas</option>
          {categorias.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <table className="table-auto w-full text-gray-500">
        <thead>
          <tr>
            <th className="px-4 py-2 border">Producto</th>
            <th className="px-4 py-2 border">Cantidad</th>
            <th className="px-4 py-2 border">Categoría</th>
          </tr>
        </thead>
        <tbody>
          {productosFiltrados.map((p, i) => (
            <tr key={i}>
              <td className="border px-4 py-2">{p.nombre}</td>
              <td className="border px-4 py-2">{p.cantidad}</td>
              <td className="border px-4 py-2">{p.categoria || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
