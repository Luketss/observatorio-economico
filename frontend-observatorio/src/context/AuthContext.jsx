import { createContext, useContext, useState, useEffect } from "react";
import api from "../services/api";
import { identificarSessao, montarDadosSessao } from "../services/analytics";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.data);
      })
      .catch((err) => {
        // Só descarta o token quando o backend o rejeitou de fato — uma falha
        // de rede/cold start aqui apagava uma sessão ainda válida.
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          localStorage.removeItem("access_token");
        }
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Analytics (Umami): anexa municipio_id e papel à sessão anônima quando o
  // usuário fica conhecido (login ou sessão restaurada). Sem PII — ver
  // montarDadosSessao. Com user null não envia nada.
  useEffect(() => {
    const dados = montarDadosSessao(user);
    if (dados) identificarSessao(dados);
  }, [user]);

  const login = async (email, senha) => {
    const response = await api.post(
      "/auth/login",
      new URLSearchParams({
        username: email,
        password: senha,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = response.data;

    localStorage.setItem("access_token", access_token);

    const me = await api.get("/auth/me");
    setUser(me.data.data);
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
