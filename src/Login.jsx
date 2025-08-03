// Login.jsx
import { useState } from "react";
import { supabase } from "./supabase";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [esRegistro, setEsRegistro] = useState(false);

  const manejarLogin = async () => {
    const { data, error } = esRegistro
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert("Error: " + error.message);
    } else {
      onLogin();
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">{esRegistro ? "Registrarse" : "Iniciar sesión"}</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 mb-2 w-full"
      />
      <button onClick={manejarLogin} className="bg-blue-600 text-white px-4 py-2 w-full rounded">
        {esRegistro ? "Registrarse" : "Iniciar sesión"}
      </button>
      <p
        className="text-blue-700 mt-2 cursor-pointer underline text-sm"
        onClick={() => setEsRegistro(!esRegistro)}
      >
        {esRegistro ? "¿Ya tenés cuenta? Iniciar sesión" : "¿No tenés cuenta? Registrate"}
      </p>
    </div>
  );
}
