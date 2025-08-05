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

  const verificarCodigo = async (e) => {
    e.preventDefault();
    setMensaje("");

    if (!codigoIngresado || !email) {
      setMensaje("Faltan datos.");
      return;
    }

    setVerificando(true);
    // Obtener código de la tabla
    const { data, error } = await supabase
      .from("Verificaciones")
      .select("codigo, creado_en")
      .eq("email", email)
      .single();

    if (error || !data) {
      setMensaje("No se encontró el código para este correo.");
      setVerificando(false);
      return;
    }

    // Validar expiración (15 minutos)
    const ahora = new Date();
    const creadoEn = new Date(data.creado_en);
    const diffMin = (ahora - creadoEn) / 1000 / 60;
    if (diffMin > 15) {
      setMensaje("El código expiró. Registrate de nuevo.");
      setVerificando(false);
      return;
    }

    // Comparar códigos
    if (data.codigo !== codigoIngresado) {
      setMensaje("Código incorrecto.");
      setVerificando(false);
      return;
    }

    // Obtener datos temporales
    const password = localStorage.getItem("temp_password");
    const firstName = localStorage.getItem("temp_firstName");
    const lastName = localStorage.getItem("temp_lastName");
    if (!password || !firstName || !lastName) {
      setMensaje("Faltan datos de registro. Iniciá sesión manualmente.");
      navigate("/login");
      return;
    }

    try {
      // Crear usuario en Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password
      });
      if (signUpError) {
        setMensaje(`Error al crear usuario: ${signUpError.message}`);
        setVerificando(false);
        return;
      }

      // Insertar en tabla Usuarios interna con nombre y apellido
      await supabase.from("Usuarios").insert([{ 
        id: signUpData.user.id,
        email,
        first_name: firstName,
        last_name: lastName
      }]);

      // Iniciar sesión
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (loginError) {
        setMensaje(`Error al iniciar sesión: ${loginError.message}`);
        setVerificando(false);
        return;
      }

      // Limpieza de datos temporales
      localStorage.removeItem("temp_password");
      localStorage.removeItem("temp_firstName");
      localStorage.removeItem("temp_lastName");

      // Redirigir al menú principal
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
          className="w-full p-2 border border-gray-300 rounded text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <button
          type="submit"
          disabled={verificando}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
        >
          {verificando ? 'Verificando...' : 'Verificar'}
        </button>
        {mensaje && <p className="text-center text-red-500 text-sm">{mensaje}</p>}
      </form>
    </div>
  );
}
