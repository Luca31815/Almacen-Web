// Almacenes.jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useNavigate } from 'react-router-dom';

export default function Almacenes({ usuario, onSeleccionarAlmacen }) {
  const [almacenes, setAlmacenes] = useState([]);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  const cargarAlmacenes = async () => {
    try {
      // Chequeo robusto de sesión
      const { data: s } = await supabase.auth.getSession();
      if (!s?.session?.user?.id) {
        console.warn('No hay sesión de Supabase (auth).');
        setAlmacenes([]);
        return;
      }

      if (!usuario?.id) {
        console.warn('No hay usuario.id, no se puede cargar.');
        return;
      }

      setCargando(true);

      const { data, error } = await supabase
        .from('AlmacenesAccesibles')
        .select('id, nombre, usuario_id, creado_en, es_dueno, owner_first_name, owner_last_name, owner_email') // columnas explícitas
        .order('creado_en', { ascending: true });

      if (error) {
        console.error('Vista -> error:', error);
        throw error;
      }

      const enriched = (data || []).map(a => ({
        id: a.id,
        nombre: a.nombre,
        usuario_id: a.usuario_id,
        ownerName: a.es_dueno
          ? 'Vos'
          : ((`${a.owner_first_name ?? ''} ${a.owner_last_name ?? ''}`).trim()
            || a.owner_email
            || 'Desconocido'),
      }));

      
      setAlmacenes(enriched);
    } catch (e) {
      console.error('[ERROR] cargarAlmacenes (vista):', e);
    } finally {
      setCargando(false);
      console.groupEnd();
    }
  };


  useEffect(() => {
    cargarAlmacenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  const crearAlmacen = async (maybeName) => {
    console.group('%c[Almacenes] crearAlmacen()', 'color:#10b981');
    console.time('crearAlmacen');
    try {
      // Si vino un evento, ignorarlo
      if (maybeName && typeof maybeName === 'object' && 'preventDefault' in maybeName) {
        try { maybeName.preventDefault?.(); } catch {}
        maybeName = undefined;
      }

      const base = typeof maybeName === 'string' ? maybeName : (nombreNuevo ?? '');
      const nombre = String(base).trim();
      console.log('[crearAlmacen] nombre ->', nombre);

      if (!nombre) {
        console.warn('[crearAlmacen] NOMBRE_VACIO');
        return { ok:false, reason:'NOMBRE_VACIO' };
      }

      const { data: s } = await supabase.auth.getSession();
      const authId = s?.session?.user?.id;
      if (!authId) return { ok:false, reason:'SIN_SESION' };

      const payload = { nombre, usuario_id: authId };
      const { data, error } = await supabase
        .from('Almacenes')
        .insert(payload)
        .select('id,nombre,usuario_id,creado_en')
        .single();

      if (error) return { ok:false, reason:'INSERT_ERROR', error };

      setNombreNuevo('');
      await cargarAlmacenes();
      return { ok:true, data };
    } catch (e) {
      console.error('[crearAlmacen] EXCEPTION', e);
      return { ok:false, reason:'EXCEPTION', error:e };
    } finally {
      console.timeEnd('crearAlmacen');
      console.groupEnd();
    }
  };



    
  const manejarSeleccion = (almacen) => {
    console.groupCollapsed('%c[Almacenes] manejarSeleccion()', 'color:#a855f7');
    try {
      console.log('Almacén seleccionado:', almacen);
      setAlmacenSeleccionado(almacen.id);
      localStorage.setItem('almacen_id', almacen.id);
      onSeleccionarAlmacen?.(almacen.id);
      navigate('/');
    } catch (e) {
      console.error('[ERROR] manejarSeleccion:', e);
    } finally {
      console.groupEnd();
    }
  };

  const manejarCompartir = (almacen) => {
    console.groupCollapsed('%c[Almacenes] manejarCompartir()', 'color:#f59e0b');
    try {
      console.log('Almacén para editar:', almacen);
      setAlmacenSeleccionado(almacen.id);
      localStorage.setItem('almacen_id', almacen.id);
      onSeleccionarAlmacen?.(almacen.id);
      navigate('/compartir-permiso');
    } catch (e) {
      console.error('[ERROR] manejarCompartir:', e);
    } finally {
      console.groupEnd();
    }
  };
    useEffect(() => {
      // Solo para debug
      window.crearAlmacenDebug = crearAlmacen;
      window.cargarAlmacenesDebug = cargarAlmacenes;
      window.supabase = supabase;
    }, []);
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
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => manejarSeleccion(a)}
                    className="text-sm text-blue-500 hover:text-blue-700 transition"
                  >
                    Usar este
                  </button>
                </div>
              </div>
            </li>
          ))}
          {almacenes.length === 0 && !cargando && (
            <li className="text-center text-gray-500 text-sm py-8 border rounded-lg">
              No se encontraron almacenes (propios o compartidos).
            </li>
          )}
        </ul>

        <div className="space-y-4">
          <input
            value={nombreNuevo}
            onChange={e => setNombreNuevo(e.target.value)}
            placeholder="Nuevo almacén..."
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={() => crearAlmacen()}   // <- evita que entre el evento
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Crear almacén
          </button>
        </div>
      </div>
    </div>
  );
}
