import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Sales from './pages/Sales'
import SalesInput from './pages/SalesInput'
import Products from './pages/Products'
import Channels from './pages/Channels'
import AuditLog from './pages/AuditLog'
import Layout from './components/Layout'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, border: '4px solid #6366f1',
            borderTopColor: 'transparent', borderRadius: '50%',
            margin: '0 auto 16px'
          }} className="animate-spin"></div>
          <p style={{ color: '#94a3b8' }}>로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!session) return <Login />

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />
      case 'sales': return <Sales />
      case 'sales-input': return <SalesInput />
      case 'products': return <Products />
      case 'channels': return <Channels />
      case 'audit-log': return <AuditLog />
      default: return <Dashboard />
    }
  }

  return (
    <Layout currentPage={currentPage} setCurrentPage={setCurrentPage} session={session}>
      {renderPage()}
    </Layout>
  )
}

export default App
