import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import PortalLayout from './layouts/PortalLayout'
import Login from './pages/Login'
import Portal from './pages/Portal'
import ReportPage from './pages/Report'
import Admin from './pages/Admin'
import ChangePassword from './pages/ChangePassword'
import Profile from './pages/Profile'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gov-blue border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function RequireLogin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/alterar-senha" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'admin' && user?.role !== 'publisher') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/alterar-senha"
        element={
          <RequireLogin>
            <ChangePassword />
          </RequireLogin>
        }
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <PortalLayout>
              <Portal />
            </PortalLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/relatorio/:slug"
        element={
          <RequireAuth>
            <PortalLayout wide>
              <ReportPage />
            </PortalLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/perfil"
        element={
          <RequireAuth>
            <Profile />
          </RequireAuth>
        }
      />

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireAdmin>
              <PortalLayout>
                <Admin />
              </PortalLayout>
            </RequireAdmin>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
