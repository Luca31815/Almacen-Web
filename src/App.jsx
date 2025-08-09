// App.jsx
import { useEffect, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import Login from "./Login";
import Verificar from "./Verificar";
import Menu from "./Menu";
import Compras from "./Compras";
import Ventas from "./Ventas";
import Stock from "./Stock";
import Almacenes from "./Almacenes";
import CompartirPermiso from "./CompartirPermiso";

export default function App() {
  const { user, profile, loading, signOut } = useAuth(); // ✅ sesión real desde el provider
  const [almacenId, setAlmacenId] = useState(localStorage.getItem("almacen_id"));

  // Dropdown
  const [openUserMenu, setOpenUserMenu] = useState(false);
  const userBtnRef = useRef(null);
  const userMenuRef = useRef(null);

  // Cerrar dropdown al hacer click afuera o presionar Escape
  useEffect(() => {
    function onClickOutside(e) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target) &&
        userBtnRef.current &&
        !userBtnRef.current.contains(e.target)
      ) {
        setOpenUserMenu(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpenUserMenu(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const handleSeleccionarAlmacen = (id) => {
    localStorage.setItem("almacen_id", id);
    setAlmacenId(id);
  };

  const handleLogout = async () => {
    try {
      await signOut();                  // ✅ cierra sesión + limpia claves en el provider
    } finally {
      setOpenUserMenu(false);
      // No hace falta reload: al no haber user, se renderizan rutas de login
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-600">Cargando sesión…</div>;
  }

  // Inicial del usuario (prioriza first_name; fallback email)
  const initial = (
    profile?.first_name?.[0] ||
    user?.email?.[0] ||
    "?"
  ).toUpperCase();

  return (
    <Router>
      {!user ? (
        // Rutas de autenticación
        <Routes>
          <Route
            path="/login"
            element={<Login onLogin={() => { /* el AuthProvider actualizará solo */ }} />}
          />
          <Route path="/verificar" element={<Verificar />} />
          <Route path="/*" element={<Navigate to="/login" />} />
        </Routes>
      ) : (
        // Rutas protegidas
        <div className="min-h-screen bg-gray-100 p-[20px]">
          {/* Header */}
          <div className="flex justify-end mb-2 relative">
            <button
              ref={userBtnRef}
              onClick={() => setOpenUserMenu((v) => !v)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white font-semibold leading-none select-none shadow hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-haspopup="menu"
              aria-expanded={openUserMenu}
              aria-controls="user-menu"
              title={user?.email || "Usuario"}
            >
              <span className="uppercase translate-y-[0.5px]">{initial}</span>
            </button>

            {/* Dropdown */}
            {openUserMenu && (
              <div
                ref={userMenuRef}
                id="user-menu"
                className="absolute top-12 right-0 w-56 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm text-gray-500">Sesión iniciada como</p>
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {profile?.first_name
                      ? `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`
                      : user?.email}
                  </p>
                </div>
                <nav className="py-1 text-sm text-gray-700">
                  <Link
                    to="/perfil"
                    onClick={() => setOpenUserMenu(false)}
                    className="block px-4 py-2 hover:bg-gray-50"
                  >
                    Administrar perfil
                  </Link>
                  <Link
                    to="/almacenes"
                    onClick={() => setOpenUserMenu(false)}
                    className="block px-4 py-2 hover:bg-gray-50"
                  >
                    Almacenes
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50"
                  >
                    Cerrar sesión
                  </button>
                </nav>
              </div>
            )}
          </div>

          <Routes>
            {!almacenId ? (
              <Route
                path="/*"
                element={
                  <Almacenes
                    usuario={user} // ✅ id real de Auth
                    onSeleccionarAlmacen={handleSeleccionarAlmacen}
                  />
                }
              />
            ) : (
              <>
                <Route path="/" element={<Menu almacenId={almacenId} />} />
                <Route path="/compras" element={<Compras almacenId={almacenId} />} />
                <Route path="/ventas" element={<Ventas almacenId={almacenId} />} />
                <Route path="/stock" element={<Stock almacenId={almacenId} />} />
                <Route
                  path="/almacenes"
                  element={
                    <Almacenes
                      usuario={user} // ✅ id real de Auth
                      onSeleccionarAlmacen={handleSeleccionarAlmacen}
                    />
                  }
                />
                <Route
                  path="/compartir-permiso"
                  element={<CompartirPermiso almacenId={almacenId} />}
                />
                {/* Placeholder de Perfil */}
                <Route
                  path="/perfil"
                  element={
                    <div className="max-w-lg mx-auto p-6 bg-white rounded-2xl shadow-xl">
                      Pantalla de perfil (en construcción)
                    </div>
                  }
                />
                <Route path="*" element={<Navigate to="/" />} />
              </>
            )}
          </Routes>
        </div>
      )}
    </Router>
  );
}
