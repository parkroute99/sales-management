import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const menuItems = [
  { id: 'dashboard', label: '📊 대시보드', group: 'main' },
  { id: 'divider-sales', type: 'divider', label: '매출' },
  { id: 'sales-input', label: '✏️ 매출 등록', group: 'sales' },
  { id: 'sales', label: '📋 매출 내역', group: 'sales' },
  { id: 'divider-purchase', type: 'divider', label: '매입' },
  { id: 'purchase-input', label: '✏️ 매입 등록', group: 'purchase' },
  { id: 'purchases', label: '📋 매입 내역', group: 'purchase' },
  { id: 'divider-order', type: 'divider', label: '주문/발주' },
  { id: 'order-input', label: '📦 주문 입력', group: 'order' },
  { id: 'order-history', label: '📋 주문 내역', group: 'order' },
  { id: 'divider-manage', type: 'divider', label: '관리' },
  { id: 'products', label: '📦 제품 관리', group: 'manage' },
  { id: 'channels', label: '🏪 매출처 관리', group: 'manage' },
  { id: 'suppliers', label: '🏭 매입처 관리', group: 'manage' },
  { id: 'product-aliases', label: '🔗 약어 매핑', group: 'manage' },
  { id: 'audit-log', label: '📝 변경 이력', group: 'manage' },
]

function Layout({ children, currentPage, setCurrentPage, session }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const handleLogout = async () => { await supabase.auth.signOut() }

  const currentLabel = menuItems.find(m => m.id === currentPage)?.label || '대시보드'

  return (
    <div className="flex h-screen bg-slate-100">
      {/* 사이드바 */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300`}>
        <div className="p-5 border-b border-slate-200">
          <h1 className="text-lg font-bold text-slate-800">📊 정산 관리</h1>
          <p className="text-xs text-slate-400 mt-1 truncate">{session?.user?.email}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {menuItems.map(item => {
            if (item.type === 'divider') {
              return <div key={item.id} className="px-5 pt-5 pb-2"><span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{item.label}</span></div>
            }
            return (
              <button key={item.id} onClick={() => setCurrentPage(item.id)}
                className={`w-full text-left px-5 py-2.5 text-sm transition-colors ${
                  currentPage === item.id ? 'bg-indigo-50 text-indigo-700 font-semibold border-r-2 border-indigo-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}>{item.label}</button>
            )
          })}
        </nav>
        <div className="p-4 border-t border-slate-200">
          <button onClick={handleLogout} className="w-full py-2.5 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">🚪 로그아웃</button>
        </div>
      </aside>

      {/* 메인 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              {sidebarOpen ? '◀' : '▶'}
            </button>
            <h2 className="text-lg font-semibold text-slate-800">{currentLabel.replace(/^[^\s]+ /, '')}</h2>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

export default Layout
