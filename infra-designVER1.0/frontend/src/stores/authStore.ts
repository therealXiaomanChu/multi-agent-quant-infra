import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import toast from 'react-hot-toast'

export interface User {
  id: string
  username: string
  email: string
  avatar?: string
  role: 'user' | 'admin'
  createdAt: string
  stats: {
    totalAgents: number
    totalTrades: number
    totalProfit: number
    winRate: number
  }
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<boolean>
  register: (username: string, email: string, password: string) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<boolean>
}

// 配置axios默认设置
axios.defaults.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// 请求拦截器 - 添加token
axios.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器 - 处理401错误
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      toast.error('登录已过期，请重新登录')
    }
    return Promise.reject(error)
  }
)

export const useAuthStore = create<AuthState>()(n  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const response = await axios.post('/api/auth/login', {
            email,
            password,
          })
          
          const { user, token } = response.data
          set({ user, token, isLoading: false })
          toast.success(`欢迎回来，${user.username}！`)
          return true
        } catch (error: any) {
          set({ isLoading: false })
          const message = error.response?.data?.message || '登录失败'
          toast.error(message)
          return false
        }
      },

      register: async (username: string, email: string, password: string) => {
        set({ isLoading: true })
        try {
          const response = await axios.post('/api/auth/register', {
            username,
            email,
            password,
          })
          
          const { user, token } = response.data
          set({ user, token, isLoading: false })
          toast.success(`注册成功，欢迎 ${user.username}！`)
          return true
        } catch (error: any) {
          set({ isLoading: false })
          const message = error.response?.data?.message || '注册失败'
          toast.error(message)
          return false
        }
      },

      logout: () => {
        set({ user: null, token: null })
        toast.success('已退出登录')
        // 清除axios默认header
        delete axios.defaults.headers.common['Authorization']
      },

      checkAuth: async () => {
        const { token } = get()
        if (!token) return

        try {
          const response = await axios.get('/api/auth/me')
          set({ user: response.data })
        } catch (error) {
          // Token无效，清除登录状态
          set({ user: null, token: null })
        }
      },

      updateProfile: async (data: Partial<User>) => {
        try {
          const response = await axios.put('/api/auth/profile', data)
          set({ user: response.data })
          toast.success('个人资料更新成功')
          return true
        } catch (error: any) {
          const message = error.response?.data?.message || '更新失败'
          toast.error(message)
          return false
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token 
      }),
    }
  )
)