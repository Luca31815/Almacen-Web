// App.jsx
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import Login from "./Login";
import Menu from "./Menu";
import Compras from "./Compras";
import Ventas from "./Ventas";
import Stock from "./Stock";
import Almacenes from "./Almacenes";
import CompartirPermiso from './CompartirPermiso'; // Importa el componente

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [almacenId, setAlmacenId] = useState(localStorage.getItem("almacen_id"));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUsuario(data?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSeleccionarAlmacen = (id) => {
    localStorage.setItem("almacen_id", id);
    setAlmacenId(id);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("almacen_id");
    setUsuario(null);
    setAlmacenId(null);
  };

  if (!usuario) {
    return <Login onLogin={() => supabase.auth.getUser().then(({ data }) => setUsuario(data.user))} />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100 p-[20px] ">
        <div className="flex justify-end">
          <button
            className="text-sm text-red-400"
            onClick={handleLogout}
          >
            Cerrar sesión
          </button>
        </div>
        <Routes>
          {/* Redirige a /almacenes si no se seleccionó ningún almacen */}
          {!almacenId ? (
            <>
              <Route
                path="*"
                element={<Almacenes usuario={usuario} onSeleccionarAlmacen={handleSeleccionarAlmacen} />}
              />
            </>
          ) : (
            <>
              <Route path="/" element={<Menu almacenId={almacenId} />} />
              <Route path="/compras" element={<Compras almacenId={almacenId} />} />
              <Route path="/ventas" element={<Ventas almacenId={almacenId} />} />
              <Route path="/stock" element={<Stock almacenId={almacenId} />} />
              <Route
                path="/almacenes"
                element={<Almacenes usuario={usuario} onSeleccionarAlmacen={handleSeleccionarAlmacen} />}
              />
              <Route path="/compartir-permiso" element={<CompartirPermiso almacenId={almacenId} />} />
              
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}
        </Routes>
      </div>
    </Router>
  );
}
