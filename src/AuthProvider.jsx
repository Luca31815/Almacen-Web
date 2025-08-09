// AuthProvider.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);          // auth.user
  const [profile, setProfile] = useState(null);    // fila en Usuarios
  const [loading, setLoading] = useState(true);

  // Hidratar + suscribir
  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const sess = data?.session ?? null;
      if (!mounted) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      setLoading(false);
    };

    hydrate();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Cargar perfil cuando haya user
  useEffect(() => {
    let cancel = false;
    const loadProfile = async () => {
      if (!user?.id) {
        setProfile(null);
        return;
      }
      const { data, error } = await supabase
        .from('Usuarios')
        .select('id, email, first_name, last_name, creado_en')
        .eq('id', user.id)
        .single();
      if (!cancel) setProfile(error ? null : data);
    };
    loadProfile();
    return () => { cancel = true; };
  }, [user?.id]);

  const signOut = async () => {
    // Limpia TODO lo que sea de la app antes/después del signOut
    try {
      // Limpia claves tuyas (almacen_id, temporales de registro, etc.)
      localStorage.removeItem('almacen_id');
      localStorage.removeItem('tmp_email');
      localStorage.removeItem('tmp_password');
      localStorage.removeItem('firstName');
      localStorage.removeItem('lastName');

      await supabase.auth.signOut();
    } finally {
      // Resetea estado por las dudas
      setSession(null);
      setUser(null);
      setProfile(null);
    }
  };
    async function refreshProfile() {
    const u = (await supabase.auth.getUser()).data.user;
    if (!u) {
        setProfile(null);
        return;
    }
    const { data, error } = await supabase
        .from("Usuarios")
        .select("first_name, last_name, email")
        .eq("id", u.id)
        .single();
    if (!error) setProfile(data);
    }

  return (
    <AuthCtx.Provider value={{ session, user, profile, loading, signOut, refreshProfile  }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
