import { useState, useEffect } from "react";
import { supabase } from "./supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    setEmail("");
    setPassword("");
    setMensaje("");
  }, [registrando]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (registrando) {
      const { error } = await supabase.auth.signUp({ email, password });
      setMensaje(error ? `Error: ${error.message}` : "Revisá tu mail para confirmar.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setMensaje(error ? `Error: ${error.message}` : "Inicio de sesión exitoso.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-300 px-4">
      <form
        onSubmit={handleSubmit}
        className="max-w-xl bg-white shadow-xl rounded-2xl p-6"
      >
        <div className="space-y-[12px]">
          <h2 className="text-2xl text-gray-700 font-bold text-center">
            {registrando ? "Registrarse" : "Iniciar Sesión"}
          </h2>
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-[52px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-[52px] px-4 text-base border border-gray-300 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-400"
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
          {mensaje && (
            <p className="text-center text-red-500 text-sm">{mensaje}</p>
          )}
        </div>
      </form>
    </div>
  );
}
