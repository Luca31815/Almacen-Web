// Stock.jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Link, useNavigate } from 'react-router-dom';

export default function Stock() {
  const [productos, setProductos] = useState([]); // {id,nombre,cantidad,categoria, proxima_vencimiento}
  const [categorias, setCategorias] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const [soloConVencimiento, setSoloConVencimiento] = useState(false);
  const [ordenarPorVencimiento, setOrdenarPorVencimiento] = useState(false);

  const navigate = useNavigate();
  const almacen_id = localStorage.getItem('almacen_id');

  useEffect(() => {
    if (!almacen_id) {
      navigate("/almacenes");
      return;
    }

    const fetchStock = async () => {
      // 1) Traer productos del Stock
      const { data: stock, error } = await supabase
        .from('Stock')
        .select('id, nombre, cantidad, categoria')
        .eq('almacen_id', almacen_id);

      if (error) {
        console.error('Error al cargar stock', error);
        return;
      }

      // 2) Si no hay productos, listo
      if (!stock || stock.length === 0) {
        setProductos([]);
        setCategorias([]);
        return;
      }

      // 3) Traer lotes con fecha_vencimiento y cantidad > 0 para esos stock_id
      const stockIds = stock.map(s => s.id);
      const { data: lotes, error: lotesErr } = await supabase
        .from('Lotes')
        .select('stock_id, fecha_vencimiento, cantidad')
        .in('stock_id', stockIds)
        .gt('cantidad', 0)
        .not('fecha_vencimiento', 'is', null)
        .order('fecha_vencimiento', { ascending: true });

      if (lotesErr) {
        console.error('Error al cargar lotes', lotesErr);
      }

      // 4) Calcular la próxima fecha de vencimiento por stock_id (min fecha)
      const minVencPorStock = new Map();
      if (lotes && lotes.length > 0) {
        for (const l of lotes) {
          const f = l.fecha_vencimiento; // 'YYYY-MM-DD'
          if (!minVencPorStock.has(l.stock_id)) {
            minVencPorStock.set(l.stock_id, f);
          } else {
            // mantener la menor
            if (f < minVencPorStock.get(l.stock_id)) {
              minVencPorStock.set(l.stock_id, f);
            }
          }
        }
      }

      // 5) Mezclar al resultado
      const enriquecidos = stock.map(s => ({
        ...s,
        proxima_vencimiento: minVencPorStock.get(s.id) || null,
      }));
      setProductos(enriquecidos);

      // 6) Categorías únicas
      const categoriasUnicas = [...new Set(enriquecidos.map(p => p.categoria).filter(Boolean))];
      setCategorias(categoriasUnicas);
    };

    fetchStock();
  }, [almacen_id, navigate]);

  // Filtros
  let productosFiltrados = categoriaSeleccionada
    ? productos.filter(p => p.categoria === categoriaSeleccionada)
    : productos;

  if (soloConVencimiento) {
    productosFiltrados = productosFiltrados.filter(p => p.proxima_vencimiento !== null);
  }

  // Orden por próximo vencimiento (asc, los sin vencimiento al final)
  if (ordenarPorVencimiento) {
    productosFiltrados = [...productosFiltrados].sort((a, b) => {
      const fa = a.proxima_vencimiento;
      const fb = b.proxima_vencimiento;
      if (fa && fb) return fa < fb ? -1 : fa > fb ? 1 : 0;
      if (fa && !fb) return -1; // con fecha primero
      if (!fa && fb) return 1;  // sin fecha al final
      return 0;
    });
  }

  return (
    <div className="max-w-2xl mx-auto mt-8 p-4 bg-white shadow rounded">
      <Link
        to="/"
        className="inline-block text-sm text-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition"
      >
        Volver al menú
      </Link>

      <h2 className="text-xl font-bold mb-2">Stock Actual</h2>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {/* Categoría */}
        <div>
          <label className="block mb-1 text-sm text-gray-700">Filtrar por categoría:</label>
          <select
            value={categoriaSeleccionada}
            onChange={(e) => setCategoriaSeleccionada(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Todas</option>
            {categorias.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Solo con vencimiento */}
        <div>
          <label className="block mb-1 text-sm text-gray-700">Vencimiento:</label>
          <div className="flex items-center h-10 gap-2">
            <input
              id="soloConVto"
              type="checkbox"
              checked={soloConVencimiento}
              onChange={(e) => setSoloConVencimiento(e.target.checked)}
            />
            <label htmlFor="soloConVto" className="text-sm text-gray-700">Solo con fecha de vencimiento</label>
          </div>
        </div>

        {/* Ordenar por próximos a vencer */}
        <div>
          <label className="block mb-1 text-sm text-gray-700">Ordenar:</label>
          <div className="flex items-center h-10 gap-2">
            <input
              id="ordenVto"
              type="checkbox"
              checked={ordenarPorVencimiento}
              onChange={(e) => setOrdenarPorVencimiento(e.target.checked)}
            />
            <label htmlFor="ordenVto" className="text-sm text-gray-700">Próximos a vencer primero</label>
          </div>
        </div>
      </div>

      <table className="table-auto w-full text-gray-500">
        <thead>
          <tr>
            <th className="px-4 py-2 border">Producto</th>
            <th className="px-4 py-2 border">Cantidad</th>
            <th className="px-4 py-2 border">Categoría</th>
            <th className="px-4 py-2 border">Próx. vencimiento</th>
          </tr>
        </thead>
        <tbody>
          {productosFiltrados.map((p) => (
            <tr key={p.id}>
              <td className="border px-4 py-2">{p.nombre}</td>
              <td className="border px-4 py-2">{p.cantidad}</td>
              <td className="border px-4 py-2">{p.categoria || "-"}</td>
              <td className="border px-4 py-2">
                {p.proxima_vencimiento ? p.proxima_vencimiento : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
