import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'

import { AuthProvider, AuthGuard } from '@/auth/auth'

import ThemeProvider from '@/components/providers/ThemeProvider'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'
import GlobalErrorBanner from '@/components/layout/GlobalErrorBanner'

import Landing from '@/pages/Landing'
import Auth from '@/pages/Auth'
import ResetPassword from '@/pages/ResetPassword'
import Dashboard from '@/pages/Dashboard'
import Accounts from '@/pages/Accounts'
import Transactions from '@/pages/Transactions'
import Budgets from '@/pages/Budgets'
import Reports from '@/pages/Reports'
import Categories from '@/pages/Categories'
import Investments from '@/pages/Investments'
import Settings from '@/pages/Settings'

function AppLayout() {
  const location = useLocation()

  return (
    <div className="flex min-h-screen">
      <GlobalErrorBanner />
      <Sidebar />
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <div className="container mx-auto p-4 md:p-6 max-w-5xl">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
            <Routes location={location}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/investments" element={<Investments />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="*"
              element={
                <AuthGuard>
                  <AppLayout />
                </AuthGuard>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
