import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mvqpuldrukzhxnxfdabi.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cXB1bGRydWt6aHhueGZkYWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNzM0OTYsImV4cCI6MjA2OTY0OTQ5Nn0.yhSMnu0e_B43p4IIkdXXY7opK4XMu_hto86C7Tfc8rI'
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,          // 👉 guarda la sesión en storage
    autoRefreshToken: true,        // 👉 refresca tokens en background
    detectSessionInUrl: true,      // 👉 procesa hashes de auth si los hubiera
    storage: window.localStorage,  // 👉 asegura el mismo storage que tu app
  },
});
