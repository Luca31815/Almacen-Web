// CompartirPermiso.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";

export default function CompartirPermiso({ almacenId }) {
  const navigate = useNavigate();

  // 1) Estado: datos del almacén
  const [nombreAlmacen, setNombreAlmacen] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  // 2) Estado: combobox (lo visible y la selección)
  const [inputValue, setInputValue] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [isSharing, setIsSharing] = useState(false);

  // 3) Estado: usuarios con acceso
  const [usuariosCompartidos, setUsuariosCompartidos] = useState([]); // [{id, usuario:{...}}]
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [removiendoIds, setRemoviendoIds] = useState(new Set());

  // 4) Estado: usuarios disponibles
  const [usuariosDisponibles, setUsuariosDisponibles] = useState([]);
  const [loadingDisponibles, setLoadingDisponibles] = useState(false);

  const [mensaje, setMensaje] = useState(null);

  // Modal de confirmación
  const [modalOpen, setModalOpen] = useState(false);
  const [permAEliminar, setPermAEliminar] = useState(null); // { id, usuario:{...} }

  // Refs
  const boxRef = useRef(null);
  const inputRef = useRef(null);

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

  const normalizar = (s) =>
    (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();

  const esEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());

  // Cargar nombre + usuarios con acceso
  // Usuarios con acceso (2 pasos: permisos -> usuarios)
useEffect(() => {
  if (!almacenId) return;

  const cargar = async () => {
    setMensaje(null);
    setLoadingUsuarios(true);
    try {
      // 1) nombre del almacén
      const { data: almac, error: eAlm } = await supabase
        .from("Almacenes")
        .select("nombre")
        .eq("id", almacenId)
        .maybeSingle();
      if (!eAlm && almac) setNombreAlmacen(almac.nombre || "");

      // 2) permisos del almacén (sin embed)
      const { data: perms, error: ePerms } = await supabase
        .from("AlmacenPermisos")
        .select("id, usuario_id")
        .eq("almacen_id", almacenId);

      if (ePerms) {
        console.error("Error SELECT AlmacenPermisos:", ePerms);
        setUsuariosCompartidos([]);
        return;
      }
      if (!perms?.length) {
        setUsuariosCompartidos([]);
        return;
      }

      // 3) traer datos de esos usuarios (desde Usuarios, o UsuariosLookup si preferís)
      const ids = [...new Set(perms.map(p => p.usuario_id).filter(Boolean))];
      const { data: users, error: eUsers } = await supabase
        .from("Usuarios")
        .select("id, email, first_name, last_name")
        .in("id", ids);

      if (eUsers) {
        console.error("Error SELECT Usuarios por ids:", eUsers);
        setUsuariosCompartidos([]);
        return;
      }

      // 4) mapear: [{id_permiso, usuario:{...}}]
      const mapUsers = new Map(users.map(u => [u.id, u]));
      const resultado = perms.map(p => ({
        id: p.id,
        usuario: mapUsers.get(p.usuario_id) || null,
      }));

      setUsuariosCompartidos(resultado);
    } finally {
      setLoadingUsuarios(false);
    }
  };

  cargar();
}, [almacenId]);


  // Cargar usuarios disponibles para combobox (excluye: yo + ya compartidos)
  useEffect(() => {
    const cargarDisponibles = async () => {
      try {
        setLoadingDisponibles(true);
        const { data: userInfo } = await supabase.auth.getUser();
        const myId = userInfo?.user?.id || null;

        const { data } = await supabase
          .from("UsuariosLookup")
          .select("id, email, first_name, last_name")
          .neq("id", myId)
          .order("first_name", { ascending: true })
          .order("last_name", { ascending: true })
          .limit(500);

        if (!data) {
          setUsuariosDisponibles([]);
          return;
        }
        const idsConAcceso = new Set(usuariosCompartidos.map((r) => r.usuario?.id));
        const filtrados = data.filter((u) => !idsConAcceso.has(u.id));
        setUsuariosDisponibles(filtrados);
      } finally {
        setLoadingDisponibles(false);
      }
    };
    cargarDisponibles();
  }, [usuariosCompartidos]);

  // Homónimos solo para el dropdown (email visible solo si hay duplicados exactos de nombre)
  const dupsNombre = useMemo(() => {
    const map = new Map();
    for (const u of usuariosDisponibles) {
      const nc = nombreCompleto(u);
      if (!nc) continue;
      const key = normalizar(nc);
      map.set(key, (map.get(key) || 0) + 1);
    }
    const set = new Set();
    for (const [k, v] of map.entries()) if (v > 1) set.add(k);
    return set;
  }, [usuariosDisponibles]);

  // Filtrado combobox
  const queryNorm = normalizar(inputValue);
  const opcionesFiltradas = useMemo(() => {
    if (!usuariosDisponibles?.length) return [];
    if (!queryNorm) return usuariosDisponibles.slice(0, 10);
    return usuariosDisponibles
      .filter((u) => {
        const nc = normalizar(nombreCompleto(u) || "");
        const em = normalizar(u.email);
        return nc.includes(queryNorm) || em.includes(queryNorm);
      })
      .slice(0, 10);
  }, [usuariosDisponibles, queryNorm]);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Cerrar modal con Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    if (modalOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

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
      if (error) setMensaje("No se pudo actualizar el nombre del almacén.");
      else setMensaje("Nombre de almacén actualizado.");
    } finally {
      setGuardandoNombre(false);
    }
  };

  // Selección combobox
  const seleccionar = (u) => {
    setSelectedUser(u);
    setInputValue(nombreCompleto(u) || u.email);
    setOpen(false);
    setFocusIdx(-1);
    inputRef.current?.focus();
  };

  // Teclado combobox
  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, opcionesFiltradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (focusIdx >= 0 && focusIdx < opcionesFiltradas.length) {
        e.preventDefault();
        seleccionar(opcionesFiltradas[focusIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Compartir acceso
  const compartirAlmacen = async () => {
    setMensaje(null);
    if (!almacenId) {
      setMensaje("Faltan datos.");
      return;
    }

    // Evitar compartirse a sí mismo
    const { data: authInfo } = await supabase.auth.getUser();
    const myEmail = authInfo?.user?.email || "";
    if (
      selectedUser?.email?.toLowerCase() === myEmail.toLowerCase() ||
      (esEmail(inputValue) && inputValue.toLowerCase() === myEmail.toLowerCase())
    ) {
      setMensaje("No podés compartirte acceso a vos mismo.");
      return;
    }

    setIsSharing(true);

    // Resolver usuario (por selección o email escrito)
    let usuarioData = null;
    if (selectedUser?.id) {
      usuarioData = selectedUser;
    } else if (esEmail(inputValue)) {
      const { data } = await supabase
        .from("UsuariosLookup")
        .select("id, email, first_name, last_name")
        .eq("email", inputValue.trim())
        .maybeSingle();
      if (data) usuarioData = data;
    } else {
      setMensaje("Elegí un usuario de la lista o ingresá un email válido.");
      setIsSharing(false);
      return;
    }

    if (!usuarioData) {
      setMensaje("No se encontró un usuario con ese correo en la app.");
      setIsSharing(false);
      return;
    }

    // Ya tiene permiso?
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

    if (insertError) setMensaje("Error al compartir almacén.");
    else {
      setMensaje("Permiso concedido correctamente.");
      setUsuariosCompartidos((prev) => [
        ...prev,
        { id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), usuario: usuarioData },
      ]);
      setInputValue("");
      setSelectedUser(null);
    }
    setIsSharing(false);
  };

  // Abrir modal de confirmación
  const abrirModalQuitar = (row) => {
    setPermAEliminar(row); // { id, usuario:{...} }
    setModalOpen(true);
  };

  // Confirmar quitar acceso (desde modal)
  const confirmarQuitarAcceso = async () => {
    if (!permAEliminar) return;
    const permId = permAEliminar.id;

    try {
      setRemoviendoIds((prev) => new Set(prev).add(permId));
      const { error } = await supabase.from("AlmacenPermisos").delete().eq("id", permId);
      if (error) {
        setMensaje("No se pudo quitar el acceso.");
        return;
      }
      setUsuariosCompartidos((prev) => prev.filter((r) => r.id !== permId));
      setMensaje("Acceso quitado correctamente.");
      setModalOpen(false);
      setPermAEliminar(null);
    } finally {
      setRemoviendoIds((prev) => {
        const n = new Set(prev);
        n.delete(permId);
        return n;
      });
    }
  };

  const cancelarModal = () => {
    setModalOpen(false);
    setPermAEliminar(null);
  };

  const contador = useMemo(() => usuariosCompartidos.length, [usuariosCompartidos]);
  const puedeCompartir = !!selectedUser || esEmail(inputValue);

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

        {/* 2) Compartir almacén: combobox */}
        <section className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Compartir acceso</h2>

          <div ref={boxRef} className="relative">
            <label className="block text-sm text-gray-700 mb-1">Usuario (buscá por nombre o email):</label>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setSelectedUser(null);
                setOpen(true);
                setFocusIdx(-1);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder="Ej: Juan Pérez o juan@correo.com"
              className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />

            {open && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
                {loadingDisponibles ? (
                  <div className="px-3 py-2 text-sm text-gray-500">Cargando usuarios...</div>
                ) : opcionesFiltradas.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    No hay sugerencias. Podés ingresar el email completo.
                  </div>
                ) : (
                  <ul className="py-1">
                    {opcionesFiltradas.map((u, idx) => (
                      <li
                        key={u.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => seleccionar(u)}
                        onMouseEnter={() => setFocusIdx(idx)}
                        className={`px-3 py-2 cursor-pointer text-sm flex items-center gap-2 ${
                          idx === focusIdx ? "bg-blue-50" : ""
                        } hover:bg-blue-50`}
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center leading-none">
                          {avatarDe(u?.first_name, u?.email)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-gray-800 truncate">{nombreCompleto(u) || u.email}</div>
                          {(() => {
                            const nc = nombreCompleto(u);
                            const esHom = nc ? dupsNombre.has(normalizar(nc)) : false;
                            return esHom ? (
                              <div className="text-[11px] text-gray-500 truncate">{u.email}</div>
                            ) : null;
                          })()}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <button
            onClick={compartirAlmacen}
            disabled={isSharing || !puedeCompartir}
            className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 mt-2"
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
                const enProceso = removiendoIds.has(row.id);
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white font-semibold inline-flex items-center justify-center leading-none select-none shadow">
                        <span className="uppercase translate-y-[0.5px]">{avatarDe(u?.first_name, u?.email)}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 truncate">
                          {nombre || u?.email}
                        </div>
                        {/* Email oculto en la lista */}
                      </div>
                    </div>

                    <button
                      onClick={() => abrirModalQuitar(row)}
                      disabled={enProceso}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                        enProceso ? "opacity-60 cursor-not-allowed" : "border-red-300 text-red-600 hover:bg-red-50"
                      }`}
                      title="Quitar acceso"
                    >
                      {enProceso ? "Quitando..." : "Quitar acceso"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {mensaje && <p className="text-center text-sm text-gray-700">{mensaje}</p>}

        {/* Modal de confirmación */}
        {modalOpen && (
          <div className="fixed inset-0 z-30 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={cancelarModal}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative z-40 w-full max-w-md bg-white rounded-xl shadow-xl p-5"
            >
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Quitar acceso</h3>
              <p className="text-sm text-gray-600">
                Vas a quitar el acceso a{" "}
                <span className="font-medium text-gray-800">
                  {nombreCompleto(permAEliminar?.usuario) || permAEliminar?.usuario?.email}
                </span>
                . ¿Querés continuar?
              </p>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={cancelarModal}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarQuitarAcceso}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm"
                >
                  Quitar acceso
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
