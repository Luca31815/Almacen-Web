// Almacenes.jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useNavigate } from "react-router-dom";

export default function Almacenes({ usuario, onSeleccionar }) {
  const [almacenes, setAlmacenes] = useState([]);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState(null);

  // Traer todos los almacenes del usuario (propios o compartidos)
  useEffect(() => {
    const fetchAlmacenes = async () => {
      // Almacenes propios
      const { data: propios, error: errPropios } = await supabase
        .from('Almacenes')
        .select('*')
        .eq('usuario_id', usuario.id);

      // Almacenes compartidos
      const { data: permisos, error: errPermisos } = await supabase
        .from('AlmacenPermisos')
        .select('almacen_id')
        .eq('usuario_id', usuario.id);

      const idsCompartidos = permisos?.map(p => p.almacen_id) || [];

      let compartidos = [];
      if (idsCompartidos.length > 0) {
        const { data, error } = await supabase
          .from('Almacenes')
          .select('*')
          .in('id', idsCompartidos);
        compartidos = data || [];
      }

      setAlmacenes([...(propios || []), ...compartidos]);
    };

    fetchAlmacenes();
  }, [usuario.id]);

  // Crear nuevo almacén
  const crearAlmacen = async () => {
    if (!nombreNuevo.trim()) return;
    const { data, error } = await supabase
      .from('Almacenes')
      .insert([{ nombre: nombreNuevo.trim(), usuario_id: usuario.id }])
      .select()
      .single();
    if (!error) {
      setAlmacenes([...almacenes, data]);
      setNombreNuevo('');
    } else {
      alert('Error al crear el almacén');
    }
  };

  const navigate = useNavigate();


  const seleccionar = (almacen) => {
  setAlmacenSeleccionado(almacen.id);
  localStorage.setItem('almacen_id', almacen.id);
  if (onSeleccionar) onSeleccionar(almacen.id);
  navigate("/"); // redirige al menú
};

  return (
    <div className="max-w-1/3  mx-auto max-w-screen-md mt-20 p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Mis Almacenes</h2>

      <ul className="mb-4 space-y-[12px]">
        {almacenes.map((a) => (
          <li
            key={a.id}
            className={`mb-2 p-2 rounded border ${
              almacenSeleccionado === a.id ? 'bg-blue-100' : ''
            }`}
          >
            <div className="flex justify-between text-gray-400 items-center h-[52px]">
              <span>{a.nombre}</span>
              <div className="flex gap-2">
                {/* Botón para Compartir Permiso */}
                <button
                  onClick={() => navigate("/compartir-permiso")}
                  className="text-sm text-green-500"
                >
                  Compartir
                </button>
                {/* Botón para Usar este */}
                <button
                  onClick={() => seleccionar(a)}
                  className="text-sm text-blue-500"
                >
                  Usar este
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mb-2 space-y-[12px] flex flex-col items-center">
        <input
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          placeholder="Nuevo almacén..."
          className="border p-2 w-1/2 rounded bg-white mb-2 h-[42px] pl-[10px] rounded-[12px]"
        />
        <button
          onClick={crearAlmacen}
          className="w-full bg-green-500 text-white py-2 rounded"
        >
          Crear almacén
        </button>
      </div>
    </div>
  );
}
