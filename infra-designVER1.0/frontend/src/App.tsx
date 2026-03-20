import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAuthStore } from './stores/authStore'
import {
  HomePage,
  LoginPage,
  RegisterPage,
  AgentsPage,
  AgentDetailPage,
  CreateAgentPage,
  LeaderboardPage,
  BattlePage,
  CreateBattlePage,
  BacktestPage,
  ProfilePage
} from './pages'

function App() {
  const { checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/create" element={<CreateAgentPage />} />
          <Route path="agents/:id" element={<AgentDetailPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="battle" element={<BattlePage />} />
          <Route path="battle/:battleId" element={<BattlePage />} />
          <Route path="battle/create" element={<CreateBattlePage />} />
          <Route path="backtest" element={<BacktestPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </div>
  )
}

export default App