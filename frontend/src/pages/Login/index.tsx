import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("E-mail ou senha inválidos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Painel esquerdo ─────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden">
        {/* Gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-gov-blue-dark via-gov-blue to-[#0069C2]" />

        {/* Subtle road grid pattern */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Decorative road lines */}
        <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="70%" x2="100%" y2="55%" stroke="white" strokeWidth="3" strokeDasharray="20 12" />
          <line x1="0" y1="73%" x2="100%" y2="58%" stroke="white" strokeWidth="1" />
          <line x1="0" y1="40%" x2="60%" y2="80%" stroke="white" strokeWidth="2" strokeDasharray="20 12" />
        </svg>

        {/* Yellow accent bar */}
        <div className="absolute top-0 left-0 w-1.5 h-full bg-gov-yellow" />

        <div className="relative z-10 flex flex-col justify-between p-14 text-white w-full">
          <div>
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white rounded-sm" />
              </div>
              <span className="text-sm font-medium tracking-widest uppercase opacity-80">
                Governo de Pernambuco
              </span>
            </div>

            <div className="mb-6">
              <div className="w-12 h-1 bg-gov-yellow mb-6 rounded" />
              <h1 className="text-5xl font-light leading-tight mb-3">
                Portal BI
              </h1>
              <p className="text-xl font-light text-blue-200">
                Departamento de Estradas
                <br />de Rodagem de Pernambuco
              </p>
            </div>

            <p className="text-sm text-blue-300 leading-relaxed max-w-sm">
              Plataforma centralizada de indicadores e relatórios analíticos
              para acompanhamento de obras, contratos e medições.
            </p>
          </div>

          <p className="text-xs text-blue-400">
            © {new Date().getFullYear()} DER-PE — Todos os direitos reservados
          </p>
        </div>
      </div>

      {/* ── Painel direito ──────────────────────────────────────────────── */}
      <div className="w-full lg:w-2/5 flex flex-col justify-center px-8 sm:px-14 bg-white">
        <div className="max-w-sm w-full mx-auto">
          {/* Logo mobile */}
          <div className="flex items-center gap-2 mb-10 lg:mb-8">
            <div className="w-8 h-8 bg-gov-blue rounded flex items-center justify-center lg:hidden">
              <div className="w-4 h-4 border-2 border-white rounded-sm" />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">DER-PE</p>
              <h2 className="text-xl font-semibold text-gray-900">Portal BI</h2>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-gray-900">Bem-vindo</h3>
            <p className="text-sm text-gray-500 mt-1">Entre com suas credenciais de acesso</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                E-mail institucional
              </label>
              <input
                type="email"
                className="input"
                placeholder="nome@der.pe.gov.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Senha
              </label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-2 text-base"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-gov-yellow rounded-full" />
              <p className="text-xs text-gray-400">
                Acesso restrito a servidores autorizados do DER-PE
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
