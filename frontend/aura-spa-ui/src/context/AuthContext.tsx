import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  perfil: string;
  telefono?: string;
  rol: string;
  contrasenaProvisional?: boolean;
  genero?: string | null;
}

/** "Bienvenido"/"Bienvenida" según el género del usuario (solo Cliente lo tiene registrado hoy). */
export const saludoGenero = (user: User | null | undefined): string =>
  user?.genero === 'M' ? 'Bienvenido' : user?.genero === 'F' ? 'Bienvenida' : 'Bienvenido/a';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('aura_user');
    const savedToken = localStorage.getItem('aura_token');
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
      setToken(savedToken);
    }
    setLoading(false);
  }, []);

  const login = (newToken: string, newUser: User) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem('aura_user', JSON.stringify(newUser));
    localStorage.setItem('aura_token', newToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('aura_user');
    localStorage.removeItem('aura_token');
    sessionStorage.setItem('aura_cerro_sesion', '1');
    // El Face ID del Core debe pedirse de nuevo en el próximo inicio de sesión
    sessionStorage.removeItem('aura_core_verificado');
    sessionStorage.removeItem('aura_core_verificado_ts');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
