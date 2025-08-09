// Login.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";
import { sendCodeEmail } from "./utils/sendEmail";

export default function Login({ onLogin }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [mensaje, setMensaje]     = useState("");
  const [loading, setLoading]     = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setMensaje("");
  }, [registrando]);

  const upsertVerificacion = async ({ email, codigo }) => {
    // Graba o actualiza por PK (email)
    const { error } = await supabase
      .from("Verificaciones")
      .upsert({
        email,
        codigo,
        creado_en: new Date().toISOString(),
      }, { onConflict: "email" });

    if (error) throw error;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje("");

    if (registrando) {
      if (!firstName.trim() || !lastName.trim()) {
        setMensaje("Ingrese nombre y apellido.");
        return;
      }
      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        setMensaje("Ingrese un correo válido antes de solicitar el código.");
        return;
      }
      if (!password) {
        setMensaje("Ingrese una contraseña.");
        return;
      }

      try {
        setLoading(true);
        const codigo = Math.floor(100000 + Math.random() * 900000).toString();

        // 1) Guardar/actualizar código en Verificaciones
        await upsertVerificacion({ email, codigo });

        // 2) Enviar email con el código
        await sendCodeEmail(email, codigo);

        // 3) Guardar datos temporales y navegar a Verificar
        localStorage.setItem("temp_password", password);
        localStorage.setItem("temp_firstName", firstName);
        localStorage.setItem("temp_lastName", lastName);

        navigate(`/verificar?email=${encodeURIComponent(email)}`);
      } catch (error) {
        console.error("Error en registro inicial:", error);
        setMensaje(error.message || "No se pudo procesar el registro");
      } finally {
        setLoading(false);
      }
    } else {
      // Login estándar
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setMensaje(`Error: ${error.message}`);
      } else {
        onLogin?.();
        navigate("/");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-300 px-4">
      <form
        onSubmit={handleSubmit}
        className="max-w-xl bg-white shadow-xl rounded-2xl p-6 space-y-[12px]"
      >
        <h2 className="text-2xl text-gray-700 font-bold text-center">
          {registrando ? "Registrate" : "Iniciar Sesión"}
        </h2>

        {registrando && (
          <>
            <input
              type="text"
              placeholder="Nombre"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full h-[52px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
            <input
              type="text"
              placeholder="Apellido"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full h-[52px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </>
        )}

        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
          className="w-full h-[52px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full h-[52px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full h-[52px] bg-blue-600 text-white rounded-[12px] hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading
            ? (registrando ? "Enviando código..." : "Ingresando...")
            : (registrando ? "Registrarse" : "Iniciar Sesión")}
        </button>

        <button
          type="button"
          onClick={() => setRegistrando(!registrando)}
          className="text-sm text-blue-600 hover:underline text-left"
        >
          {registrando
            ? "¿Ya tenés una cuenta? Iniciar sesión"
            : "¿No tenés cuenta? Registrate"}
        </button>

        {mensaje && <p className="text-center text-red-500 text-sm">{mensaje}</p>}
      </form>
    </div>
  );
}
