// App.jsx
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabase";
import Login from "./Login";
import Menu from "./Menu";
import Compras from "./Compras";
import Ventas from "./Ventas";
import Stock from "./Stock";

export default function App() {
  const [usuario, setUsuario] = useState(null);

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

  if (!usuario) {
    return <Login onLogin={() => supabase.auth.getUser().then(({ data }) => setUsuario(data.user))} />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100 p-[20px]">
        <button
          className="text-sm text-red-600 underline float-right "
          onClick={() => supabase.auth.signOut()}
        >
          Cerrar sesión
        </button>
        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/ventas" element={<Ventas />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}
