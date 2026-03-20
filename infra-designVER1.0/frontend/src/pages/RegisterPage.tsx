import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { useAuthStore } from '../stores/authStore'

export function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const { register, isLoading, user } = useAuthStore()

  // 如果已登录，重定向到首页
  if (user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username || !email || !password || !confirmPassword) {
      return
    }
    
    if (password !== confirmPassword) {
      return
    }
    
    if (!agreedToTerms) {
      return
    }
    
    const success = await register(username, email, password)
    if (success) {
      // 注册成功会自动重定向
    }
  }

  const passwordsMatch = password === confirmPassword
  const isFormValid = username && email && password && confirmPassword && passwordsMatch && agreedToTerms

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo和标题 */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xl">TA</span>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            创建您的账户
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            已有账户？{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              立即登录
            </Link>
          </p>
        </div>

        {/* 注册表单 */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="label">
                用户名
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="input mt-1"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="email" className="label">
                邮箱地址
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input mt-1"
                placeholder="请输入您的邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div>
              <label htmlFor="password" className="label">
                密码
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="input pr-10"
                  placeholder="请输入密码（至少6位）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {password && password.length < 6 && (
                <p className="mt-1 text-xs text-red-600">密码至少需要6位字符</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">
                确认密码
              </label>
              <div className="mt-1 relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className={`input pr-10 ${
                    confirmPassword && !passwordsMatch ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : ''
                  }`}
                  placeholder="请再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-600">两次输入的密码不一致</p>
              )}
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="agree-terms"
              name="agree-terms"
              type="checkbox"
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
            />
            <label htmlFor="agree-terms" className="ml-2 block text-sm text-gray-900">
              我同意{' '}
              <a href="#" className="text-blue-600 hover:text-blue-500">
                服务条款
              </a>{' '}
              和{' '}
              <a href="#" className="text-blue-600 hover:text-blue-500">
                隐私政策
              </a>
            </label>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className="btn btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="loading-spinner mr-2"></div>
                  注册中...
                </div>
              ) : (
                '创建账户'
              )}
            </button>
          </div>
        </form>

        {/* 安全提示 */}
        <div className="mt-8 bg-green-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-900 mb-2">安全保障</h3>
          <ul className="text-xs text-green-700 space-y-1">
            <li>• 密码采用加密存储，确保账户安全</li>
            <li>• 支持双因素认证，提升安全等级</li>
            <li>• 严格的数据保护政策</li>
            <li>• 24/7 安全监控和防护</li>
          </ul>
        </div>
      </div>
    </div>
  )
}