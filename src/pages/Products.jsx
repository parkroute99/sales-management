import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

function Products() {
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ product_code: '', product_name: '', category: '', purchase_cost: '', packaging_cost: '', additional_cost: '' })

  useEffect(() => { fetchProducts() }, [])

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('usage_count', { ascending: false })
    setProducts(data || []); setLoading(false)
  }

  const resetForm = () => { setForm({ product_code: '', product_name: '', category: '', purchase_cost: '', packaging_cost: '', additional_cost: '' }); setEditId(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    const data = { product_code: form.product_code, product_name: form.product_name, category: form.category || null,
      purchase_cost: Number(form.purchase_cost) || 0, packaging_cost: Number(form.packaging_cost) || 0, additional_cost: Number(form.additional_cost) || 0 }
    if (editId) await supabase.from('products').update(data).eq('id', editId)
    else { data.created_by = user.id; await supabase.from('products').insert(data) }
    setShowForm(false); resetForm(); fetchProducts()
  }

  const handleEdit = (p) => {
    setForm({ product_code: p.product_code, product_name: p.product_name, category: p.category || '',
      purchase_cost: p.purchase_cost || '', packaging_cost: p.packaging_cost || '', additional_cost: p.additional_cost || '' })
    setEditId(p.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 제품을 삭제하시겠습니까?')) {
      await supabase.from('products').update({ is_active: false }).eq('id', id); fetchProducts()
    }
  }

  const handleExcelDownload = () => {
    const excelData = products.map(p => ({
      '제품코드': p.product_code, '제품명': p.product_name, '카테고리': p.category || '',
      '매입원가': Number(p.purchase_cost), '포장비': Number(p.packaging_cost), '부대비용': Number(p.additional_cost),
      '총원가': Number(p.total_cost), '사용횟수': p.usage_count,
    }))
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '제품목록')
    XLSX.writeFile(wb, `제품목록_${new Date().toISOString().split('T')[0]}.xlsx`)
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
        const code = row['제품코드'] || row['product_code']
        const name = row['제품명'] || row['product_name']
        if (!code || !name) continue
        const existing = products.find(p => p.product_code === code)
        if (existing) continue
        await supabase.from('products').insert({
          product_code: code, product_name: name, category: row['카테고리'] || row['category'] || null,
          purchase_cost: Number(row['매입원가'] || row['purchase_cost'] || 0),
          packaging_cost: Number(row['포장비'] || row['packaging_cost'] || 0),
          additional_cost: Number(row['부대비용'] || row['additional_cost'] || 0),
          created_by: user.id,
        })
        count++
      }
      alert(`${count}개 제품이 등록되었습니다.`)
      fetchProducts()
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const filteredProducts = products.filter(p =>
    p.product_name.includes(search) || p.product_code.includes(search) || (p.category && p.category.includes(search))
  )
  const formatNumber = (num) => Number(num || 0).toLocaleString()

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
          placeholder="제품명 또는 코드로 검색..." />
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
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">코드</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">제품명</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">카테고리</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">매입원가</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">포장비</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">총원가</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">사용횟수</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-4 text-sm font-mono text-indigo-600">{p.product_code}</td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-800">{p.product_name}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{p.category || '-'}</td>
                  <td className="px-5 py-4 text-sm text-right text-slate-700">{formatNumber(p.purchase_cost)}원</td>
                  <td className="px-5 py-4 text-sm text-right text-slate-700">{formatNumber(p.packaging_cost)}원</td>
                  <td className="px-5 py-4 text-sm text-right font-semibold text-slate-800">{formatNumber(p.total_cost)}원</td>
                  <td className="px-5 py-4 text-sm text-center text-slate-500">{p.usage_count}</td>
                  <td className="px-5 py-4 text-center">
                    <button onClick={() => handleEdit(p)} className="p-1 hover:bg-slate-100 rounded text-sm mr-1">✏️</button>
                    <button onClick={() => handleDelete(p.id)} className="p-1 hover:bg-red-50 rounded text-sm">🗑️</button>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr><td colSpan="8" className="px-5 py-12 text-center text-slate-400">{search ? '검색 결과가 없습니다.' : '등록된 제품이 없습니다.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '제품 수정' : '제품 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">제품 코드</label>
                  <input type="text" value={form.product_code} onChange={e => setForm({...form, product_code: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="ESS-001" required /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">카테고리</label>
                  <input type="text" value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="스킨케어" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">제품명</label>
                <input type="text" value={form.product_name} onChange={e => setForm({...form, product_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="프리미엄 에센스 50ml" required /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">매입원가</label>
                  <input type="number" value={form.purchase_cost} onChange={e => setForm({...form, purchase_cost: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="0" required /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">포장비</label>
                  <input type="number" value={form.packaging_cost} onChange={e => setForm({...form, packaging_cost: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="0" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">부대비용</label>
                  <input type="number" value={form.additional_cost} onChange={e => setForm({...form, additional_cost: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="0" /></div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <span className="text-sm text-slate-500">총 원가: </span>
                <span className="text-lg font-bold text-indigo-600">{formatNumber((Number(form.purchase_cost)||0)+(Number(form.packaging_cost)||0)+(Number(form.additional_cost)||0))}원</span>
              </div>
              <div className="flex gap-3 pt-2">
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

export default Products
