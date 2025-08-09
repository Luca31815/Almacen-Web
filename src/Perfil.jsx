// Perfil.jsx
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./AuthProvider";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react"; // ✅ ícono de flecha (asegúrate de tener lucide-react instalado)

export default function Perfil() {
  const { user, profile, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [email] = useState(user?.email || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const navigate = useNavigate();

  // Password
  const [openPwd, setOpenPwd] = useState(false);
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    setFirstName(profile?.first_name || "");
    setLastName(profile?.last_name || "");
  }, [profile]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");

    if (!user?.id) {
      setErr("No hay usuario autenticado.");
      return;
    }
    setSaving(true);
    try {
      const updates = {
        first_name: (firstName || "").trim(),
        last_name: (lastName || "").trim(),
      };
      const { error } = await supabase
        .from("Usuarios")
        .update(updates)
        .eq("id", user.id);

      if (error) throw error;
      if (typeof refreshProfile === "function") await refreshProfile();

      setMsg("Perfil actualizado correctamente.");
    } catch (e) {
      setErr(e.message || "Error al actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");

    if (!pwd1 || pwd1.length < 6) {
      setErr("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (pwd1 !== pwd2) {
      setErr("Las contraseñas no coinciden.");
      return;
    }
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd1 });
      if (error) throw error;
      setMsg("Contraseña actualizada.");
      setPwd1(""); setPwd2(""); setOpenPwd(false);
    } catch (e) {
      setErr(e.message || "No se pudo actualizar la contraseña.");
    } finally {
      setSavingPwd(false);
    }
  };

  const handleVolver = () => {
    const almacenId = localStorage.getItem("almacen_id");
    if (almacenId) {
      navigate("/"); // Menú principal
    } else {
      navigate("/almacenes"); // Selección de almacenes
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white rounded-2xl shadow-xl">
      {/* Header con botón de volver */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleVolver}
          className="p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-semibold text-gray-800">Perfil</h1>
      </div>

      {/* Mensajes */}
      {msg && <div className="mb-3 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{msg}</div>}
      {err && <div className="mb-3 text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{err}</div>}

      {/* Datos básicos */}
      <form onSubmit={handleSaveProfile} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Email</label>
          <input
            type="email"
            value={email}
            readOnly
            className="w-full rounded-xl border-gray-300 bg-gray-50 text-gray-700 px-3 py-2 outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">El email no se puede modificar.</p>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Nombre</label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Tu nombre"
            autoComplete="given-name"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">Apellido</label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Tu apellido"
            autoComplete="family-name"
          />
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>

        </div>
      </form>

      {/* Cambiar contraseña */}
      <div className="mt-8">
        <button
          onClick={() => setOpenPwd(v => !v)}
          className="text-sm text-blue-700 hover:underline"
        >
          {openPwd ? "Ocultar cambio de contraseña" : "Cambiar contraseña"}
        </button>

        {openPwd && (
          <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nueva contraseña</label>
              <input
                type="password"
                value={pwd1}
                onChange={(e) => setPwd1(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Repetir contraseña</label>
              <input
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={savingPwd}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {savingPwd ? "Actualizando…" : "Actualizar contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
