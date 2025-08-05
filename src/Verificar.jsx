// Verificar.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "./supabase";

export default function Verificar() {
  const [codigoIngresado, setCodigoIngresado] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [email, setEmail] = useState("");
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

    // Obtener código de la tabla
    const { data, error } = await supabase
      .from("Verificaciones")
      .select("codigo, creado_en")
      .eq("email", email)
      .single();

    if (error || !data) {
      setMensaje("No se encontró el código para este correo.");
      return;
    }

    // Validar expiración
    const ahora = new Date();
    const creadoEn = new Date(data.creado_en);
    const diffMin = (ahora - creadoEn) / 1000 / 60;
    if (diffMin > 15) {
      setMensaje("El código expiró. Registrate de nuevo.");
      return;
    }

    // Comparar códigos
    if (data.codigo !== codigoIngresado) {
      setMensaje("Código incorrecto.");
      return;
    }

    // Obtener contraseña temporal
    const password = localStorage.getItem("temp_password");
    if (!password) {
      setMensaje("No se encontró la contraseña temporal. Iniciá sesión manualmente.");
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
        return;
      }

      // Insertar en tabla Usuarios interna
      await supabase.from("Usuarios").insert([{ id: signUpData.user.id, email }]);

      // Iniciar sesión
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (loginError) {
        setMensaje(`Error al iniciar sesión: ${loginError.message}`);
        return;
      }

      // Limpieza y redirección
      localStorage.removeItem("temp_password");
      navigate("/");
    } catch (err) {
      console.error("Error en verificación:", err);
      setMensaje(err.message || "Ocurrió un error durante la verificación.");
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
          className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          required
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          Verificar
        </button>
        {mensaje && <p className="text-center text-red-500 text-sm">{mensaje}</p>}
      </form>
    </div>
  );
}