// Login.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { useNavigate } from "react-router-dom";
import { sendCodeEmail } from "./utils/sendEmail";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    // Resetear campos al cambiar modo
    setEmail("");
    setPassword("");
    setMensaje("");
  }, [registrando]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje("");

    if (registrando) {
      // Validación básica del email
      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        setMensaje("Ingrese un correo válido antes de solicitar el código.");
        return;
      }

      try {
        const codigo = Math.floor(100000 + Math.random() * 900000).toString();

        // Guardar o actualizar el código en la tabla Verificaciones
        await supabase
          .from("Verificaciones")
          .upsert({
                email,
                 codigo,
                 creado_en: new Date().toISOString()   // ← Aquí renovamos la marca de tiempo
            }, { onConflict: ['email'] });

        // Log de depuración
        console.log("Email para verificación:", email);
        console.log("Código generado:", codigo);

        // Enviar código por email
        await sendCodeEmail(email, codigo);
        console.log("sendCodeEmail: OK");

        // Guardar contraseña temporal para verificación
        localStorage.setItem("temp_password", password);
        // Redirigir a Verificar
        navigate(`/verificar?email=${encodeURIComponent(email)}`);
      } catch (error) {
        console.error("Error en registro inicial:", error);
        setMensaje(error.message || "No se pudo procesar el registro");
      }
    } else {
      // Login estándar: requiere usuario ya creado por verificación
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMensaje(`Error: ${error.message}`);
      } else {
        onLogin();
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
          className="w-full h-[52px] bg-blue-600 text-white rounded-[12px] hover:bg-blue-700 transition"
        >
          {registrando ? "Registrarse" : "Iniciar Sesión"}
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
