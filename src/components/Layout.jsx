import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const menuItems = [
  { id: 'dashboard', label: '대시보드', icon: '📊' },
  { id: 'divider1', type: 'divider', label: '매출' },
  { id: 'sales-input', label: '매출 등록', icon: '✏️' },
  { id: 'sales', label: '매출 내역', icon: '💰' },
  { id: 'divider2', type: 'divider', label: '매입' },
  { id: 'purchase-input', label: '매입 등록', icon: '📥' },
  { id: 'purchases', label: '매입 내역', icon: '📋' },
  { id: 'divider3', type: 'divider', label: '관리' },
  { id: 'products', label: '제품 관리', icon: '📦' },
  { id: 'channels', label: '매출처 관리', icon: '🏪' },
  { id: 'suppliers', label: '매입처 관리', icon: '🏭' },
  { id: 'audit-log', label: '변경 이력', icon: '📜' },
]

function Layout({ children, currentPage, setCurrentPage, session }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => { await supabase.auth.signOut() }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white border-r border-slate-200
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-xl font-bold text-indigo-600">매출 관리</h1>
          <p className="text-xs text-slate-400 mt-1">Sales Management System</p>
        </div>

        <nav className="p-4 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            if (item.type === 'divider') {
              return (
                <div key={item.id} className="mt-4 mb-2 px-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.label}</p>
                </div>
              )
            }
            return (
              <button key={item.id}
                onClick={() => { setCurrentPage(item.id); setSidebarOpen(false) }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                  transition-all duration-150 mb-0.5
                  ${currentPage === item.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }
                `}>
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm">👤</div>
            <p className="text-xs text-slate-500 truncate flex-1">{session?.user?.email}</p>
          </div>
          <button onClick={handleLogout}
            className="w-full px-4 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            로그아웃
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
            <span className="text-xl">☰</span>
          </button>
          <h2 className="text-lg font-semibold text-slate-800">
            {menuItems.find(m => m.id === currentPage)?.label || '대시보드'}
          </h2>
        </header>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
