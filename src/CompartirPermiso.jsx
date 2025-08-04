import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useNavigate } from 'react-router-dom';

export default function CompartirPermiso({ user, almacenId }) {
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const navigate = useNavigate();

    useEffect(() => {
    console.log("almacenId recibido:", almacenId);
  }, [almacenId]);      
  const compartirAlmacen = async () => {
    setMensaje(null);
    if (!email || !almacenId) {
      setMensaje("Faltan datos.");
      return;
    }

    

    // Obtener el usuario por email
     const { data: userData, error: userError } = await supabase
    .from('auth.users') // Nombre correcto de la tabla interna
    .select('id') // Selecciona el ID del usuario (campo correcto)
    .eq('email', email) // Filtra por el correo electrónico (campo correcto)
    .single();

    console.log("Consultando usuario con email:", email);
    console.log("Resultado de la consulta:", { userData, userError });

    if (userError || !userData) {
      setMensaje("No se encontró un usuario con ese correo.");
      return;
    }

    // Verificar si ya tiene permisos
    const { data: yaExiste } = await supabase
      .from('AlmacenPermisos')
      .select()
      .eq('almacen_id', almacenId)
      .eq('usuario_id', userData.id);

    if (yaExiste?.length > 0) {
      setMensaje("Este usuario ya tiene acceso.");
      return;
    }

    // Insertar permiso
    const { error } = await supabase.from('AlmacenPermisos').insert({
      almacen_id: almacenId,
      usuario_id: userData.id,
    });

    if (error) {
      setMensaje("Error al compartir almacén.");
    } else {
      setMensaje("Permiso concedido correctamente.");
    }
  };

  return (
    <div className="max-w-screen-md mx-auto mt-10 p-4 bg-white rounded shadow">
      {/* Contenedor para los botones */}
      <div className="flex justify-between mb-6">
        {/* Botón Menú principal */}
        <button
          onClick={() => navigate('/')}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Menú principal
        </button>
        {/* Botón Volver a almacenes */}
        <button
          onClick={() => navigate('/almacenes')}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Volver a almacenes
        </button>
      </div>

      <h2 className="text-xl font-bold mb-4 text-gray-800">Compartir almacén</h2>
      <label className="block mb-2 text-sm text-gray-800">Correo del usuario:</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full p-2 border rounded mb-4"
        placeholder="usuario@ejemplo.com"
      />
      <button
        onClick={compartirAlmacen}
        className="bg-green-500 text-white py-2 rounded w-full"
      >
        Compartir acceso
      </button>
      {mensaje && <p className="mt-4 text-sm text-gray-700">{mensaje}</p>}
    </div>
  );
}