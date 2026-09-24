import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from './lib/admin-auth'
import { PublicLayout, AdminLayout } from './components/Layout'
import { Home } from './pages/Home'
import { NewBooking } from './pages/NewBooking'
import { ContinuePayment } from './pages/ContinuePayment'
import { AdminLogin } from './admin/AdminLogin'
import { AdminDashboard } from './admin/AdminDashboard'
import { AdminBookings } from './admin/AdminBookings'
import { AdminBookingDetails } from './admin/AdminBookingDetails'
import { AdminPaymentReview } from './admin/AdminPaymentReview'
import { AdminSeats } from './admin/AdminSeats'
import { AdminSettings } from './admin/AdminSettings'
import { AdminExport } from './admin/AdminExport'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAdminAuth()
  if (!isAdmin) return <Navigate to="/admin" replace />
  return <AdminLayout>{children}</AdminLayout>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
      <Route path="/new-booking" element={<PublicLayout><NewBooking /></PublicLayout>} />
      <Route path="/continue-payment" element={<PublicLayout><ContinuePayment /></PublicLayout>} />

      {/* Admin routes */}
      <Route path="/admin" element={
        <AdminLayout>
          <AdminLogin />
        </AdminLayout>
      } />
      <Route path="/admin/dashboard" element={
        <ProtectedRoute><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/bookings" element={
        <ProtectedRoute><AdminBookings /></ProtectedRoute>
      } />
      <Route path="/admin/bookings/:id" element={
        <ProtectedRoute><AdminBookingDetails /></ProtectedRoute>
      } />
      <Route path="/admin/payments" element={
        <ProtectedRoute><AdminPaymentReview /></ProtectedRoute>
      } />
      <Route path="/admin/seats" element={
        <ProtectedRoute><AdminSeats /></ProtectedRoute>
      } />
      <Route path="/admin/settings" element={
        <ProtectedRoute><AdminSettings /></ProtectedRoute>
      } />
      <Route path="/admin/export" element={
        <ProtectedRoute><AdminExport /></ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AdminAuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AdminAuthProvider>
  )
}
