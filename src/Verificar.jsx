// Verificar.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";

export default function Verificar() {
  const [codigoIngresado, setCodigoIngresado] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [email, setEmail] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    } else {
      setMensaje("Falta el correo electrónico.");
    }
  }, [searchParams]);

  const getVerificacion = async (email) => {
    const { data, error } = await supabase
      .from("Verificaciones")
      .select("codigo, creado_en")
      .eq("email", email)
      .single();

    if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
    return data || null;
  };

  const deleteVerificacion = async (email) => {
    const { error } = await supabase
      .from("Verificaciones")
      .delete()
      .eq("email", email);
    if (error) throw error;
  };

  const verificarCodigo = async (e) => {
    e.preventDefault();
    setMensaje("");

    if (!codigoIngresado || !email) {
      setMensaje("Faltan datos.");
      return;
    }

    setVerificando(true);

    try {
      // 1) Leer código+fecha desde Verificaciones
      const row = await getVerificacion(email);
      if (!row) {
        setMensaje("No se encontró el código para este correo.");
        setVerificando(false);
        return;
      }

      // 2) Validar expiración (15 min) y coincidencia
      const ahora = new Date();
      const creadoEn = new Date(row.creado_en);
      const diffMin = (ahora.getTime() - creadoEn.getTime()) / (1000 * 60);
      if (diffMin > 15) {
        setMensaje("El código expiró. Registrate de nuevo.");
        setVerificando(false);
        return;
      }
      if (row.codigo !== codigoIngresado) {
        setMensaje("Código incorrecto.");
        setVerificando(false);
        return;
      }

      // 3) Recuperar datos temporales
      const password  = localStorage.getItem("temp_password");
      const firstName = localStorage.getItem("temp_firstName");
      const lastName  = localStorage.getItem("temp_lastName");
      if (!password || !firstName || !lastName) {
        setMensaje("Faltan datos de registro. Iniciá sesión manualmente.");
        navigate("/login");
        return;
      }

      // 4) Crear usuario en Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setMensaje(`Error al crear usuario: ${signUpError.message}`);
        setVerificando(false);
        return;
      }

      // 5) Iniciar sesión (para poder insertar en Usuarios con RLS)
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        setMensaje(`Error al iniciar sesión: ${loginError.message}`);
        setVerificando(false);
        return;
      }

      // 6) Insertar perfil en Usuarios
      const userId = loginData?.user?.id || signUpData?.user?.id;
      const { error: insError } = await supabase.from("Usuarios").insert([
        { id: userId, email, first_name: firstName, last_name: lastName },
      ]);
      if (insError) {
        // No bloqueamos el flujo si falla el perfil
        console.error("Insert Usuarios error:", insError);
      }

      // 7) Borrar el código (consumirlo)
      try {
        await deleteVerificacion(email);
      } catch (delErr) {
        console.warn("No se pudo borrar el código (continuo):", delErr);
      }

      // 8) Limpiar temporales y navegar
      localStorage.removeItem("temp_password");
      localStorage.removeItem("temp_firstName");
      localStorage.removeItem("temp_lastName");

      navigate("/");
    } catch (err) {
      console.error("Error en verificación:", err);
      setMensaje(err.message || "Ocurrió un error durante la verificación.");
      setVerificando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <form
        onSubmit={verificarCodigo}
        className="max-w-md bg-white rounded-xl p-6 shadow-md w-full space-y-4"
      >
        <h2 className="text-xl font-bold mb-2 text-gray-800 text-center">
          Verificar código
        </h2>
        <p className="text-sm text-gray-600 text-center">
          Ingresá el código enviado a <strong>{email}</strong>
        </p>
        <input
          type="text"
          placeholder="Código de 6 dígitos"
          value={codigoIngresado}
          onChange={(e) => setCodigoIngresado(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <button
          type="submit"
          disabled={verificando}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
        >
          {verificando ? "Verificando..." : "Verificar"}
        </button>
        {mensaje && <p className="text-center text-red-500 text-sm">{mensaje}</p>}
      </form>
    </div>
  );
}
