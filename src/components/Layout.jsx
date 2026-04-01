import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const menuItems = [
  { id: 'dashboard', label: '대시보드', icon: '📊' },
  { id: 'sales-input', label: '매출 등록', icon: '✏️' },
  { id: 'sales', label: '매출 내역', icon: '💰' },
  { id: 'products', label: '제품 관리', icon: '📦' },
  { id: 'channels', label: '채널 관리', icon: '🏪' },
  { id: 'audit-log', label: '변경 이력', icon: '📜' },
]

function Layout({ children, currentPage, setCurrentPage, session }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => { await supabase.auth.signOut() }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex' }}>
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      )}

      <aside style={{
        width: 256, background: '#fff', borderRight: '1px solid #e2e8f0',
        display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0,
        transform: sidebarOpen ? 'translateX(0)' : (window.innerWidth < 1024 ? 'translateX(-100%)' : 'translateX(0)'),
        transition: 'transform 0.2s', zIndex: 50
      }}>
        <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#6366f1' }}>매출 관리</h1>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Sales Management System</p>
        </div>

        <nav style={{ padding: 16, flex: 1 }}>
          {menuItems.map((item) => (
            <button key={item.id}
              onClick={() => { setCurrentPage(item.id); setSidebarOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 500,
                border: 'none', cursor: 'pointer', marginBottom: 4,
                background: currentPage === item.id ? '#eef2ff' : 'transparent',
                color: currentPage === item.id ? '#4f46e5' : '#64748b',
              }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: 16, borderTop: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 8px', marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#eef2ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
            }}>👤</div>
            <p style={{ fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session?.user?.email}
            </p>
          </div>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '8px 16px', fontSize: 14, color: '#94a3b8',
            border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent'
          }}>로그아웃</button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: window.innerWidth >= 1024 ? 256 : 0 }}>
        <header style={{
          background: '#fff', borderBottom: '1px solid #e2e8f0',
          padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16
        }}>
          <button onClick={() => setSidebarOpen(true)}
            style={{ display: window.innerWidth >= 1024 ? 'none' : 'block', padding: 8, border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}>
            ☰
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
            {menuItems.find(m => m.id === currentPage)?.label || '대시보드'}
          </h2>
        </header>

        <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
