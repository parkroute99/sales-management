import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Sales from './pages/Sales.jsx'
import SalesInput from './pages/SalesInput.jsx'
import Products from './pages/Products.jsx'
import Channels from './pages/Channels.jsx'
import Suppliers from './pages/Suppliers.jsx'
import Purchases from './pages/Purchases.jsx'
import PurchaseInput from './pages/PurchaseInput.jsx'
import AuditLog from './pages/AuditLog.jsx'
import OrderInput from './pages/OrderInput.jsx'
import OrderHistory from './pages/OrderHistory.jsx'
import ProductAliases from './pages/ProductAliases.jsx'
import Layout from './components/Layout.jsx'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <span style={{ marginLeft: 12, color: '#64748b' }}>로딩 중...</span>
    </div>
  )

  if (!session) return <Login />

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />
      case 'sales': return <Sales />
      case 'sales-input': return <SalesInput />
      case 'purchases': return <Purchases />
      case 'purchase-input': return <PurchaseInput />
      case 'order-input': return <OrderInput />
      case 'order-history': return <OrderHistory />
      case 'products': return <Products />
      case 'channels': return <Channels />
      case 'suppliers': return <Suppliers />
      case 'product-aliases': return <ProductAliases />
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
