
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setLogs(data || [])
    setLoading(false)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const getActionLabel = (action) => {
    switch (action) {
      case 'INSERT': return '등록'
      case 'UPDATE': return '수정'
      case 'DELETE': return '삭제'
      default: return action
    }
  }

  const getActionColor = (action) => {
    switch (action) {
      case 'INSERT': return 'bg-emerald-100 text-emerald-700'
      case 'UPDATE': return 'bg-amber-100 text-amber-700'
      case 'DELETE': return 'bg-red-100 text-red-700'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">최근 변경 이력 (최대 100건)</p>
        <button
          onClick={fetchLogs}
          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">시간</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">구분</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">테이블</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">사용자</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">변경 내용</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-medium ${getActionColor(log.action)}`}>
                      {getActionLabel(log.action)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{log.table_name || '-'}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{log.user_email || '-'}</td>
                  <td className="px-5 py-4 text-sm text-slate-500 max-w-xs truncate">
                    {log.changed_fields || (log.new_data ? JSON.stringify(log.new_data).slice(0, 80) + '...' : '-')}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-5 py-12 text-center text-slate-400">
                    변경 이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default AuditLog
