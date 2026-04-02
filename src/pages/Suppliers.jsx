import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']

function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    supplier_name: '', supplier_code: '', contact_name: '', contact_phone: '',
    contact_email: '', business_number: '', memo: '', color_code: '#6366f1',
    default_shipping_cost: 4000
  })

  useEffect(() => { fetchSuppliers() }, [])

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    setSuppliers(data || []); setLoading(false)
  }

  const resetForm = () => {
    setForm({ supplier_name: '', supplier_code: '', contact_name: '', contact_phone: '',
      contact_email: '', business_number: '', memo: '', color_code: COLORS[suppliers.length % COLORS.length],
      default_shipping_cost: 4000 })
    setEditId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    const data = { ...form, default_shipping_cost: Number(form.default_shipping_cost) || 4000, sort_order: suppliers.length }
    if (editId) await supabase.from('suppliers').update(data).eq('id', editId)
    else { data.created_by = user.id; await supabase.from('suppliers').insert(data) }
    setShowForm(false); resetForm(); fetchSuppliers()
  }

  const handleEdit = (s) => {
    setForm({ supplier_name: s.supplier_name, supplier_code: s.supplier_code || '',
      contact_name: s.contact_name || '', contact_phone: s.contact_phone || '',
      contact_email: s.contact_email || '', business_number: s.business_number || '',
      memo: s.memo || '', color_code: s.color_code || '#6366f1',
      default_shipping_cost: s.default_shipping_cost ?? 4000 })
    setEditId(s.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 매입처를 삭제하시겠습니까?')) {
      await supabase.from('suppliers').update({ is_active: false }).eq('id', id); fetchSuppliers()
    }
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()

  const handleExcelDownload = () => {
    const excelData = suppliers.map(s => ({
      '매입처명': s.supplier_name, '코드': s.supplier_code || '', '담당자': s.contact_name || '',
      '연락처': s.contact_phone || '', '이메일': s.contact_email || '',
      '사업자번호': s.business_number || '', '기본택배비': s.default_shipping_cost ?? 4000,
      '메모': s.memo || '',
    }))
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '매입처목록')
    XLSX.writeFile(wb, `매입처목록_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      const user = (await supabase.auth.getUser()).data.user
      let count = 0
      for (const row of data) {
        const name = row['매입처명'] || row['supplier_name']
        if (!name) continue
        const existing = suppliers.find(s => s.supplier_name === name)
        if (existing) continue
        await supabase.from('suppliers').insert({
          supplier_name: name, supplier_code: row['코드'] || row['supplier_code'] || '',
          contact_name: row['담당자'] || '', contact_phone: row['연락처'] || '',
          contact_email: row['이메일'] || '', business_number: row['사업자번호'] || '',
          default_shipping_cost: Number(row['기본택배비']) || 4000,
          memo: row['메모'] || '', color_code: COLORS[(suppliers.length + count) % COLORS.length],
          sort_order: suppliers.length + count, created_by: user.id,
        })
        count++
      }
      alert(`${count}개 매입처가 등록되었습니다.`)
      fetchSuppliers()
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">등록된 매입처 {suppliers.length}개</p>
        <div className="flex gap-2">
          <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 엑셀 다운로드</button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 cursor-pointer">
            📤 엑셀 업로드<input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </label>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 추가</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: s.color_code || '#6366f1' }}>{s.supplier_name.slice(0,1)}</div>
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
              {s.contact_name && <div className="flex justify-between"><span className="text-slate-500">담당자</span><span className="text-slate-700 font-medium">{s.contact_name}</span></div>}
              {s.contact_phone && <div className="flex justify-between"><span className="text-slate-500">연락처</span><span className="text-slate-700 font-medium">{s.contact_phone}</span></div>}
              {s.business_number && <div className="flex justify-between"><span className="text-slate-500">사업자번호</span><span className="text-slate-700 font-medium">{s.business_number}</span></div>}
              <div className="flex justify-between">
                <span className="text-slate-500">기본 택배비</span>
                <span className="text-indigo-600 font-bold">{formatNumber(s.default_shipping_cost ?? 4000)}원</span>
              </div>
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
              <div><label className="block text-sm font-medium text-slate-700 mb-1">매입처명 *</label>
                <input type="text" value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="예: ○○제조" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">코드</label>
                  <input type="text" value={form.supplier_code} onChange={e => setForm({...form, supplier_code: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="SUP-001" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">사업자번호</label>
                  <input type="text" value={form.business_number} onChange={e => setForm({...form, business_number: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="000-00-00000" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">담당자</label>
                  <input type="text" value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">연락처</label>
                  <input type="text" value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" /></div>
              </div>

              {/* 택배비 설정 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">기본 택배비 (건당)</label>
                <div className="relative">
                  <input type="number" value={form.default_shipping_cost} onChange={e => setForm({...form, default_shipping_cost: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none pr-10" placeholder="4000" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">원</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[3000, 3500, 4000, 4500, 5000].map(v => (
                    <button key={v} type="button" onClick={() => setForm({...form, default_shipping_cost: v})}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        Number(form.default_shipping_cost) === v
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                      }`}>{v.toLocaleString()}원</button>
                  ))}
                </div>
              </div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">메모</label>
                <textarea value={form.memo} onChange={e => setForm({...form, memo: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" rows={2} /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">색상</label>
                <div className="flex gap-2">{COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm({...form, color_code: c})}
                    className={`w-8 h-8 rounded-full ${form.color_code===c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''}`} style={{ backgroundColor: c }} />
                ))}</div></div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => { setShowForm(false); resetForm() }} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-medium">취소</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium">{editId ? '수정' : '추가'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Suppliers
