import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../lib/admin-auth'

export function AdminLogin() {
  const { login, isAdmin } = useAdminAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAdmin) navigate('/admin/dashboard')
  }, [isAdmin, navigate])

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    const success = await login(password)
    if (success) {
      navigate('/admin/dashboard')
    } else {
      setError('كلمة السر غير صحيحة.')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-md mx-auto pt-12">
      <div className="card text-center">
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-2xl font-bold text-slate-700 mb-2">دخول الإدارة</h2>
        <p className="text-slate-500 text-sm mb-6">هذه الصفحة مخصصة للمسؤول عن الرحلة فقط</p>

        {error && (
          <div className="bg-error-50 border border-error-200 text-error-700 rounded-xl p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="text-right">
          <label className="label">كلمة السر</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="input-field text-center"
            placeholder="••••••••"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || !password}
          className="btn-primary w-full mt-4"
        >
          {loading ? 'جاري التحقق...' : 'دخول'}
        </button>
      </div>
    </div>
  )
}
