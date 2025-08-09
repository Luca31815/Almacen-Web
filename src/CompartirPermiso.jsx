// CompartirPermiso.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";

export default function CompartirPermiso({ almacenId }) {
  const navigate = useNavigate();

  // 1) Estado: datos del almacén
  const [nombreAlmacen, setNombreAlmacen] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  // 2) Estado: compartir por email (como antes)
  const [email, setEmail] = useState("");
  const [sugerencias, setSugerencias] = useState([]);
  const [isSharing, setIsSharing] = useState(false);

  // 3) Estado: usuarios con acceso
  const [usuariosCompartidos, setUsuariosCompartidos] = useState([]); // [{id, usuario:{id,email,first_name,last_name}}]
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  const [mensaje, setMensaje] = useState(null);

  // Helpers
  const avatarDe = (first, emailAddr) =>
    (first?.trim()?.[0] || emailAddr?.[0] || "?").toUpperCase();

  const nombreCompleto = (u) => {
    const fn = u?.first_name?.trim();
    const ln = u?.last_name?.trim();
    if (fn && ln) return `${fn} ${ln}`;
    if (fn) return fn;
    return null;
  };

  // Cargar nombre del almacén y usuarios con acceso
  useEffect(() => {
    if (!almacenId) return;

    const cargar = async () => {
      setMensaje(null);

      // Almacén
      const { data: almac, error: errAlm } = await supabase
        .from("Almacenes")
        .select("nombre")
        .eq("id", almacenId)
        .single();

      if (!errAlm && almac) setNombreAlmacen(almac.nombre || "");
      // Usuarios con acceso (desde AlmacenPermisos -> Usuarios)
      setLoadingUsuarios(true);
      const { data: perms, error: errPerms } = await supabase
        .from("AlmacenPermisos")
        .select("id, usuario:Usuarios(id, email, first_name, last_name)")
        .eq("almacen_id", almacenId);

      if (!errPerms && perms) setUsuariosCompartidos(perms);
      setLoadingUsuarios(false);
    };

    cargar();
  }, [almacenId]);

  // Sugerencias de email
  useEffect(() => {
    let cancel = false;
    const fetchSugerencias = async () => {
      if (!email) {
        setSugerencias([]);
        return;
      }
      const { data, error } = await supabase
        .from("Usuarios")
        .select("email")
        .ilike("email", `${email}%`)
        .limit(5);

      if (!error && data && !cancel) setSugerencias(data.map((u) => u.email));
    };
    fetchSugerencias();
    return () => {
      cancel = true;
    };
  }, [email]);

  // Guardar nombre del almacén
  const guardarNombre = async () => {
    setMensaje(null);
    if (!almacenId || !nombreAlmacen.trim()) {
      setMensaje("Ingresá un nombre válido.");
      return;
    }
    try {
      setGuardandoNombre(true);
      const { error } = await supabase
        .from("Almacenes")
        .update({ nombre: nombreAlmacen.trim() })
        .eq("id", almacenId);
      if (error) {
        setMensaje("No se pudo actualizar el nombre del almacén.");
      } else {
        setMensaje("Nombre de almacén actualizado.");
      }
    } finally {
      setGuardandoNombre(false);
    }
  };

  // Compartir acceso por email (igual que antes)
  const compartirAlmacen = async () => {
    setMensaje(null);
    if (!email || !almacenId) {
      setMensaje("Faltan datos.");
      return;
    }
    setIsSharing(true);

    // Buscar usuario
    const { data: usuarioData, error: usuarioError } = await supabase
      .from("Usuarios")
      .select("id, email, first_name, last_name")
      .eq("email", email)
      .single();

    if (usuarioError || !usuarioData) {
      setMensaje("No se encontró un usuario con ese correo.");
      setIsSharing(false);
      return;
    }

    // Verificar si ya existe permiso
    const { data: permisos } = await supabase
      .from("AlmacenPermisos")
      .select("id")
      .eq("almacen_id", almacenId)
      .eq("usuario_id", usuarioData.id);

    if (permisos?.length > 0) {
      setMensaje("Este usuario ya tiene acceso.");
      setIsSharing(false);
      return;
    }

    // Insertar permiso
    const { error: insertError } = await supabase
      .from("AlmacenPermisos")
      .insert({ almacen_id: almacenId, usuario_id: usuarioData.id });

    if (insertError) {
      setMensaje("Error al compartir almacén.");
    } else {
      setMensaje("Permiso concedido correctamente.");
      // refrescar lista
      setUsuariosCompartidos((prev) => [
        ...prev,
        { id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), usuario: usuarioData },
      ]);
      setEmail("");
    }
    setIsSharing(false);
  };

  // Contador de usuarios
  const contador = useMemo(() => usuariosCompartidos.length, [usuariosCompartidos]);

  return (
    <div className="bg-gray-100 px-4 py-6 flex justify-center">
      <div className="w-full max-w-full sm:max-w-3xl mx-auto bg-white shadow-xl rounded-2xl p-6 space-y-6">
        {/* Header / navegación */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition"
          >
            ← Volver al menú
          </button>
          <h1 className="text-2xl font-bold text-gray-700">Gestión de Almacén</h1>
          <button
            onClick={() => navigate("/almacenes")}
            className="text-sm text-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 hover:text-white transition"
          >
            Mis almacenes
          </button>
        </div>

        {/* 1) Editar nombre de almacén */}
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Nombre del almacén</h2>
          <div className="flex flex-col sm:flex-row sm:space-x-4 sm:space-y-0 space-y-3">
            <input
              type="text"
              value={nombreAlmacen}
              onChange={(e) => setNombreAlmacen(e.target.value)}
              placeholder="Nombre del almacén"
              className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
            />
            <button
              onClick={guardarNombre}
              disabled={guardandoNombre}
              className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {guardandoNombre ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </section>

        {/* 2) Compartir almacén por email */}
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Compartir acceso</h2>
          <label className="block text-sm text-gray-700">Correo del usuario:</label>
          <input
            type="email"
            list="sugerencias-emails"
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            placeholder="usuario@ejemplo.com"
            className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <datalist id="sugerencias-emails">
            {sugerencias.map((em) => (
              <option key={em} value={em} />
            ))}
          </datalist>
          <button
            onClick={compartirAlmacen}
            disabled={isSharing}
            className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isSharing ? "Compartiendo..." : "Compartir acceso"}
          </button>
        </section>

        {/* 3) Usuarios con acceso */}
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-700">Usuarios con acceso</h2>
            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
              {contador} usuario{contador === 1 ? "" : "s"}
            </span>
          </div>

          {loadingUsuarios ? (
            <p className="text-sm text-gray-500">Cargando usuarios...</p>
          ) : usuariosCompartidos.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no compartiste este almacén.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {usuariosCompartidos.map((row) => {
                const u = row.usuario;
                const nombre = nombreCompleto(u);
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white font-semibold inline-flex items-center justify-center leading-none select-none shadow">
                      <span className="uppercase translate-y-[0.5px]">
                        {avatarDe(u?.first_name, u?.email)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {nombre || u?.email}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{u?.email}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {mensaje && (
          <p className="text-center text-sm text-gray-700">{mensaje}</p>
        )}
      </div>
    </div>
  );
}
