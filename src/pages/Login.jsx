import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #eef2ff 0%, #ffffff 50%, #f5f3ff 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{
          background: '#fff', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', padding: 40
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 64, height: 64, background: '#eef2ff', borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: 32
            }}>📊</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b' }}>매출 관리 시스템</h1>
            <p style={{ color: '#94a3b8', marginTop: 8, fontSize: 14 }}>로그인하여 시작하세요</p>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#475569', marginBottom: 8 }}>이메일</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일을 입력하세요" required
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12,
                  border: '1px solid #e2e8f0', outline: 'none', fontSize: 14,
                  transition: 'border 0.2s', boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#475569', marginBottom: 8 }}>비밀번호</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요" required
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12,
                  border: '1px solid #e2e8f0', outline: 'none', fontSize: 14,
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', color: '#dc2626', padding: '12px 16px',
                borderRadius: 12, fontSize: 14, marginBottom: 20
              }}>{error}</div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: 14, background: '#6366f1', color: '#fff',
              borderRadius: 12, fontWeight: 600, fontSize: 15, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1
            }}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
