// Almacenes.jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useNavigate } from 'react-router-dom';

export default function Almacenes({ usuario, onSeleccionarAlmacen }) {
  const [almacenes, setAlmacenes] = useState([]);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState(null);
  const navigate = useNavigate();

  // Cargar almacenes propios y compartidos y enriquecer con datos del dueño
  useEffect(() => {
    const fetchAlmacenes = async () => {
      // Traer propios con muchos campos
      const { data: propios } = await supabase
        .from('Almacenes')
        .select('*')
        .eq('usuario_id', usuario.id);
      // Traer compartidos
      const { data: permisos } = await supabase
        .from('AlmacenPermisos')
        .select('almacen_id')
        .eq('usuario_id', usuario.id);
      const idsCompartidos = permisos?.map(p => p.almacen_id) || [];
      let compartidos = [];
      if (idsCompartidos.length) {
        const { data } = await supabase
          .from('Almacenes')
          .select('*')
          .in('id', idsCompartidos);
        compartidos = data || [];
      }
      // Unir y enriquecer con nombres
      const lista = [...(propios || []), ...compartidos];
      const userIds = [...new Set(lista.map(a => a.usuario_id))];
      const { data: users } = await supabase
        .from('Usuarios')
        .select('id, first_name, last_name')
        .in('id', userIds);
      const mapaUsuarios = Object.fromEntries(
        (users || []).map(u => [u.id, `${u.first_name} ${u.last_name}`])
      );
      const enriched = lista.map(a => ({
        ...a,
        ownerName: mapaUsuarios[a.usuario_id] || 'Desconocido'
      }));
      setAlmacenes(enriched);
    };
    fetchAlmacenes();
  }, [usuario.id]);

  // Crear un nuevo almacén y añadir ownerName
  const crearAlmacen = async () => {
    if (!nombreNuevo.trim()) return;
    const { data, error } = await supabase
      .from('Almacenes')
      .insert([{ nombre: nombreNuevo.trim(), usuario_id: usuario.id }])
      .select('*')
      .single();
    if (!error && data) {
      // Obtener nombre del dueño creado
      const { data: ownerData } = await supabase
        .from('Usuarios')
        .select('first_name, last_name')
        .eq('id', data.usuario_id)
        .single();
      const ownerName = ownerData ? `${ownerData.first_name} ${ownerData.last_name}` : 'Desconocido';
      setAlmacenes(prev => [...prev, { ...data, ownerName }]);
      setNombreNuevo('');
    }
  };

  // Seleccionar y usar el almacén
  const manejarSeleccion = (almacen) => {
    setAlmacenSeleccionado(almacen.id);
    localStorage.setItem('almacen_id', almacen.id);
    onSeleccionarAlmacen?.(almacen.id);
    navigate('/');
  };

  // Seleccionar y compartir el almacén
  const manejarCompartir = (almacen) => {
    setAlmacenSeleccionado(almacen.id);
    localStorage.setItem('almacen_id', almacen.id);
    onSeleccionarAlmacen?.(almacen.id);
    navigate('/compartir-permiso');
  };

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full max-w-full sm:max-w-2xl mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        <h2 className="text-2xl font-bold text-gray-700 text-center">Mis Almacenes</h2>
        <ul className="space-y-4">
          {almacenes.map(a => (
            <li
              key={a.id}
              className={`p-4 rounded-lg border ${almacenSeleccionado === a.id ? 'bg-blue-100 border-blue-300' : 'bg-white border-gray-200'}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-gray-800 font-medium text-lg">{a.nombre}</span>
                  <p className="text-sm text-gray-600">Dueño: {a.ownerName}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => manejarCompartir(a)}
                    className="text-sm text-green-500 hover:text-green-700 transition"
                  >Compartir</button>
                  <button
                    onClick={() => manejarSeleccion(a)}
                    className="text-sm text-blue-500 hover:text-blue-700 transition"
                  >Usar este</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="space-y-4">
          <input
            value={nombreNuevo}
            onChange={e => setNombreNuevo(e.target.value)}
            placeholder="Nuevo almacén..."
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={crearAlmacen}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
          >Crear almacén</button>
        </div>
      </div>
    </div>
  );
}