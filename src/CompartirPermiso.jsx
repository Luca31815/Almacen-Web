// CompartirPermiso.jsx
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useNavigate } from 'react-router-dom';

export default function CompartirPermiso({ user, almacenId }) {
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [sugerencias, setSugerencias] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("almacenId recibido:", almacenId);
  }, [almacenId]);

  // Buscar sugerencias de email según lo que escribe el usuario
  useEffect(() => {
    const fetchSugerencias = async () => {
      if (!email) {
        setSugerencias([]);
        return;
      }
      const { data, error } = await supabase
        .from('Usuarios')
        .select('email')
        .ilike('email', `${email}%`)
        .limit(5);
      if (!error && data) {
        setSugerencias(data.map(u => u.email));
      }
    };
    fetchSugerencias();
  }, [email]);

  const compartirAlmacen = async () => {
    setMensaje(null);
    if (!email || !almacenId) {
      setMensaje("Faltan datos.");
      return;
    }
    setIsSharing(true);
    // Buscar usuario en tabla Usuarios
    const { data: usuarioData, error: usuarioError } = await supabase
      .from('Usuarios')
      .select('id')
      .eq('email', email)
      .single();
    console.log("Usuario encontrado:", usuarioData, usuarioError);
    if (usuarioError || !usuarioData) {
      setMensaje("No se encontró un usuario con ese correo.");
      setIsSharing(false);
      return;
    }
    // Verificar permisos existentes
    const { data: permisos } = await supabase
      .from('AlmacenPermisos')
      .select()
      .eq('almacen_id', almacenId)
      .eq('usuario_id', usuarioData.id);
    if (permisos?.length > 0) {
      setMensaje("Este usuario ya tiene acceso.");
      setIsSharing(false);
      return;
    }
    // Insertar permiso
    const { error: insertError } = await supabase
      .from('AlmacenPermisos')
      .insert({ almacen_id: almacenId, usuario_id: usuarioData.id });
    if (insertError) {
      setMensaje("Error al compartir almacén.");
    } else {
      setMensaje("Permiso concedido correctamente.");
    }
    setIsSharing(false);
  };

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full max-w-full sm:max-w-lg mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        <div className="flex justify-between">
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            Menú principal
          </button>
          <button
            onClick={() => navigate('/almacenes')}
            className="bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            Volver a almacenes
          </button>
        </div>

        <h2 className="text-2xl font-bold text-gray-700 text-center">Compartir Almacén</h2>

        <div className="space-y-4">
          <label className="block text-sm text-gray-700">Correo del usuario:</label>
          <input
            type="email"
            list="sugerencias-emails"
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            placeholder="usuario@ejemplo.com"
            className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <datalist id="sugerencias-emails">
            {sugerencias.map((em) => (
              <option key={em} value={em} />
            ))}
          </datalist>
          <button
            onClick={compartirAlmacen}
            disabled={isSharing}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isSharing ? 'Compartiendo...' : 'Compartir Acceso'}
          </button>
        </div>

        {mensaje && (
          <p className="mt-4 text-center text-sm text-gray-700">{mensaje}</p>
        )}
      </div>
    </div>
  );
}