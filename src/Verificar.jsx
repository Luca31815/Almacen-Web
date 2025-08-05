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
    if (emailParam) setEmail(emailParam);
    else setMensaje("Falta el correo electrónico.");
  }, [searchParams]);

  const verificarCodigo = async () => {
    setMensaje("");

    if (!codigoIngresado || !email) {
      setMensaje("Faltan datos.");
      return;
    }

    const { data, error } = await supabase
      .from("Verificaciones")
      .select("codigo, creado_en")
      .eq("email", email)
      .single();

    if (error || !data) {
      setMensaje("No se encontró el código para este correo.");
      return;
    }

    const ahora = new Date();
    const creadoEn = new Date(data.creado_en);
    const diferenciaMinutos = (ahora - creadoEn) / 1000 / 60;

    if (diferenciaMinutos > 15) {
      setMensaje("El código expiró. Registrate de nuevo.");
      return;
    }

    if (data.codigo !== codigoIngresado) {
      setMensaje("Código incorrecto.");
      return;
    }

    const password = localStorage.getItem("temp_password");
    if (!password) {
      setMensaje("No se encontró la contraseña temporal. Iniciá sesión manualmente.");
      navigate("/login");
      return;
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setMensaje("Error al iniciar sesión. Intentá manualmente.");
      navigate("/login");
    } else {
      localStorage.removeItem("temp_password");
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md bg-white rounded-xl p-6 shadow-md w-full">
        <h2 className="text-xl font-bold mb-4 text-gray-800 text-center">
          Verificar código
        </h2>
        <p className="mb-2 text-sm text-gray-600 text-center">
          Ingresá el código enviado a <strong>{email}</strong>
        </p>
        <input
          type="text"
          placeholder="Código de 6 dígitos"
          value={codigoIngresado}
          onChange={(e) => setCodigoIngresado(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded mb-4"
        />
        <button
          onClick={verificarCodigo}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          Verificar
        </button>
        {mensaje && <p className="mt-4 text-sm text-red-500 text-center">{mensaje}</p>}
      </div>
    </div>
  );
}
