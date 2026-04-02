import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

function ProductAliases() {
  const [aliases, setAliases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterSupplier, setFilterSupplier] = useState('all')
  const [form, setForm] = useState({
    alias: '', product_full_name: '', unit_price: '', supplier_id: '', product_id: ''
  })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: aData } = await supabase.from('product_aliases').select('*, suppliers(supplier_name), products(product_name, product_code)').order('supplier_id').order('alias')
    const { data: sData } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    const { data: pData } = await supabase.from('products').select('*').eq('is_active', true).order('product_name')
    setAliases(aData || []); setSuppliers(sData || []); setProducts(pData || []); setLoading(false)
  }

  const resetForm = () => {
    setForm({ alias: '', product_full_name: '', unit_price: '', supplier_id: '', product_id: '' })
    setEditId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const data = {
      alias: form.alias, product_full_name: form.product_full_name,
      unit_price: Number(form.unit_price) || 0,
      supplier_id: form.supplier_id || null, product_id: form.product_id || null,
    }
    if (editId) await supabase.from('product_aliases').update(data).eq('id', editId)
    else await supabase.from('product_aliases').insert(data)
    setShowForm(false); resetForm(); fetchAll()
  }

  const handleEdit = (a) => {
    setForm({
      alias: a.alias, product_full_name: a.product_full_name,
      unit_price: a.unit_price || '', supplier_id: a.supplier_id || '', product_id: a.product_id || ''
    })
    setEditId(a.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('삭제하시겠습니까?')) {
      await supabase.from('product_aliases').delete().eq('id', id); fetchAll()
    }
  }

  const handleExcelDownload = () => {
    const excelData = aliases.map(a => ({
      '약어': a.alias, '정식명칭': a.product_full_name, '단가': a.unit_price,
      '매입처': a.suppliers?.supplier_name || '', '제품코드': a.products?.product_code || '',
    }))
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '약어매핑')
    XLSX.writeFile(wb, `약어매핑_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      let count = 0
      for (const row of data) {
        const alias = row['약어'] || row['alias']
        if (!alias) continue
        const existing = aliases.find(a => a.alias === alias)
        if (existing) continue
        const supplierId = row['매입처'] ? suppliers.find(s => s.supplier_name === row['매입처'])?.id : null
        const productId = row['제품코드'] ? products.find(p => p.product_code === row['제품코드'])?.id : null
        await supabase.from('product_aliases').insert({
          alias, product_full_name: row['정식명칭'] || row['product_full_name'] || alias,
          unit_price: Number(row['단가'] || row['unit_price'] || 0),
          supplier_id: supplierId, product_id: productId,
        })
        count++
      }
      alert(`${count}개 약어가 등록되었습니다.`)
      fetchAll()
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const filtered = filterSupplier === 'all' ? aliases : aliases.filter(a => a.supplier_id === filterSupplier)
  const formatNumber = (num) => Number(num || 0).toLocaleString()

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm">
            <option value="all">전체 매입처</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
          </select>
          <p className="text-sm text-slate-500">{filtered.length}개 매핑</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 다운로드</button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 cursor-pointer">
            📤 업로드<input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </label>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 추가</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">약어 (입력값)</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">정식 제품명</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">단가</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">매입처</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-4 text-sm font-semibold text-indigo-600">{a.alias}</td>
                  <td className="px-5 py-4 text-sm text-slate-800">{a.product_full_name}</td>
                  <td className="px-5 py-4 text-sm text-right text-slate-700">{formatNumber(a.unit_price)}원</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{a.suppliers?.supplier_name || '-'}</td>
                  <td className="px-5 py-4 text-center">
                    <button onClick={() => handleEdit(a)} className="p-1 hover:bg-slate-100 rounded text-sm mr-1">✏️</button>
                    <button onClick={() => handleDelete(a.id)} className="p-1 hover:bg-red-50 rounded text-sm">🗑️</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan="5" className="px-5 py-12 text-center text-slate-400">등록된 약어 매핑이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '약어 수정' : '약어 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">약어 (입력값) *</label>
                <input type="text" value={form.alias} onChange={e => setForm({...form, alias: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="예: 오돌, 국물, 직화무뼈" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">정식 제품명 *</label>
                <input type="text" value={form.product_full_name} onChange={e => setForm({...form, product_full_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="예: 직화오돌뼈 200g" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">단가 (원) *</label>
                  <input type="number" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="3000" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">매입처</label>
                  <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none">
                    <option value="">선택안함</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">연결 제품 (선택)</label>
                <select value={form.product_id} onChange={e => setForm({...form, product_id: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none">
                  <option value="">선택안함</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.product_code} - {p.product_name}</option>)}
                </select>
              </div>
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

export default ProductAliases
