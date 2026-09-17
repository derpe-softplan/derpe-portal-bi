import { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, LayoutDashboard, LogOut, Moon, Settings, Sun, User } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function PortalLayout({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const isPublisher = user?.role === 'admin' || user?.role === 'publisher'
  const isViewer = user?.role === 'viewer'

  return (
    <div className="min-h-screen flex flex-col dark:bg-gray-900">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="bg-gov-blue text-white shadow-md z-10">
        <div className="bg-gov-blue-dark text-xs py-1 px-4 flex items-center gap-2 opacity-90">
          <div className="w-1.5 h-1.5 bg-gov-yellow rounded-full" />
          <span>Governo do Estado de Pernambuco</span>
        </div>

        <div className="px-4 lg:px-8 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <BarChart3 size={18} />
            </div>
            <div>
              <p className="text-xs font-medium opacity-75 leading-none">DER-PE</p>
              <p className="text-base font-semibold leading-tight">Portal BI</p>
            </div>
          </Link>

          {!isViewer && (
            <nav className="hidden md:flex items-center gap-1">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive ? 'bg-white/20' : 'hover:bg-white/10'
                  )
                }
              >
                <LayoutDashboard size={15} />
                Painel
              </NavLink>

              {isPublisher && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive ? 'bg-white/20' : 'hover:bg-white/10'
                    )
                  }
                >
                  <Settings size={15} />
                  Admin
                </NavLink>
              )}
            </nav>
          )}

          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium leading-none">{user?.full_name}</p>
              <p className="text-xs opacity-60 mt-0.5">{user?.email ?? user?.username}</p>
            </div>

            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <button
              onClick={() => navigate('/perfil')}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Meu perfil"
            >
              <User size={16} />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main
        className={clsx(
          'flex-1 px-4 lg:px-8 py-6 w-full mx-auto',
          wide ? 'max-w-[1600px]' : 'max-w-screen-2xl'
        )}
      >
        {children}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-700 py-4 px-8 text-center text-xs text-gray-400 dark:text-gray-500">
        DER-PE · Portal BI © {new Date().getFullYear()} · Governo de Pernambuco
      </footer>
    </div>
  )
}
