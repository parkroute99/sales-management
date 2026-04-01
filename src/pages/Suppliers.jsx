
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']

function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    supplier_name: '', supplier_code: '', contact_name: '', contact_phone: '',
    contact_email: '', business_number: '', memo: '', color_code: '#6366f1'
  })

  useEffect(() => { fetchSuppliers() }, [])

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    setSuppliers(data || []); setLoading(false)
  }

  const resetForm = () => {
    setForm({ supplier_name: '', supplier_code: '', contact_name: '', contact_phone: '',
      contact_email: '', business_number: '', memo: '', color_code: COLORS[suppliers.length % COLORS.length] })
    setEditId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    const data = { ...form, sort_order: suppliers.length }
    if (editId) {
      await supabase.from('suppliers').update(data).eq('id', editId)
    } else {
      data.created_by = user.id
      await supabase.from('suppliers').insert(data)
    }
    setShowForm(false); resetForm(); fetchSuppliers()
  }

  const handleEdit = (s) => {
    setForm({ supplier_name: s.supplier_name, supplier_code: s.supplier_code || '',
      contact_name: s.contact_name || '', contact_phone: s.contact_phone || '',
      contact_email: s.contact_email || '', business_number: s.business_number || '',
      memo: s.memo || '', color_code: s.color_code || '#6366f1' })
    setEditId(s.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 매입처를 삭제하시겠습니까?')) {
      await supabase.from('suppliers').update({ is_active: false }).eq('id', id); fetchSuppliers()
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">등록된 매입처 {suppliers.length}개</p>
        <button onClick={() => { resetForm(); setShowForm(true) }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
          + 매입처 추가
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: s.color_code || '#6366f1' }}>
                  {s.supplier_name.slice(0, 1)}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{s.supplier_name}</h3>
                  <span className="text-xs text-slate-400">{s.supplier_code || '코드 없음'}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(s)} className="p-2 hover:bg-slate-100 rounded-lg text-sm">✏️</button>
                <button onClick={() => handleDelete(s.id)} className="p-2 hover:bg-red-50 rounded-lg text-sm">🗑️</button>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {s.contact_name && (
                <div className="flex justify-between">
                  <span className="text-slate-500">담당자</span>
                  <span className="text-slate-700 font-medium">{s.contact_name}</span>
                </div>
              )}
              {s.contact_phone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">연락처</span>
                  <span className="text-slate-700 font-medium">{s.contact_phone}</span>
                </div>
              )}
              {s.business_number && (
                <div className="flex justify-between">
                  <span className="text-slate-500">사업자번호</span>
                  <span className="text-slate-700 font-medium">{s.business_number}</span>
                </div>
              )}
              {s.memo && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400">{s.memo}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '매입처 수정' : '매입처 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">매입처명 *</label>
                <input type="text" value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="예: ○○제조, △△물산" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">매입처 코드</label>
                  <input type="text" value={form.supplier_code} onChange={e => setForm({...form, supplier_code: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    placeholder="예: SUP-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">사업자번호</label>
                  <input type="text" value={form.business_number} onChange={e => setForm({...form, business_number: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    placeholder="000-00-00000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">담당자명</label>
                  <input type="text" value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">연락처</label>
                  <input type="text" value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    placeholder="010-0000-0000" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">이메일</label>
                <input type="email" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="example@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">메모</label>
                <textarea value={form.memo} onChange={e => setForm({...form, memo: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  rows={2} placeholder="참고사항" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">테마 색상</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({...form, color_code: c})}
                      className={`w-8 h-8 rounded-full transition-transform ${form.color_code === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => { setShowForm(false); resetForm() }}
                  className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-medium hover:bg-slate-50 transition-colors">취소</button>
                <button type="submit"
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
                  {editId ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Suppliers
