import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const DEFAULT_CATEGORIES = ['스킨케어', '밀키트', '냉동식품', '건강식품', '생활용품', '음료', '간식/과자', '양념/소스']

function Products() {
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [form, setForm] = useState({ product_code: '', product_name: '', category: '', purchase_cost: '', packaging_cost: '', additional_cost: '' })

  useEffect(() => { fetchProducts() }, [])

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('usage_count', { ascending: false })
    setProducts(data || [])
    // DB에 있는 카테고리 추출해서 합치기
    if (data) {
      const dbCategories = [...new Set(data.map(p => p.category).filter(Boolean))]
      const merged = [...new Set([...DEFAULT_CATEGORIES, ...dbCategories])]
      setCategories(merged)
    }
    setLoading(false)
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

  const addCategory = () => {
    if (!newCategory.trim()) return
    if (!categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()])
    }
    setForm({ ...form, category: newCategory.trim() })
    setNewCategory('')
    setShowCategoryDropdown(false)
  }

  const selectCategory = (cat) => {
    setForm({ ...form, category: cat })
    setShowCategoryDropdown(false)
  }

  const filteredProducts = products.filter(p => {
    const matchSearch = p.product_name.includes(search) || p.product_code.includes(search) || (p.category && p.category.includes(search))
    const matchCategory = filterCategory === 'all' || p.category === filterCategory
    return matchSearch && matchCategory
  })
  const formatNumber = (num) => Number(num || 0).toLocaleString()

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex gap-3 items-center">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="w-64 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="제품명 또는 코드로 검색..." />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm">
            <option value="all">전체 카테고리</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 다운로드</button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 cursor-pointer">
            📤 업로드<input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </label>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 추가</button>
        </div>
      </div>

      {/* 카테고리 빠른 필터 */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filterCategory === 'all' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>전체 ({products.length})</button>
        {categories.map(c => {
          const count = products.filter(p => p.category === c).length
          if (count === 0) return null
          return (
            <button key={c} onClick={() => setFilterCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterCategory === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}>{c} ({count})</button>
          )
        })}
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
                  <td className="px-5 py-4">
                    {p.category ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">{p.category}</span>
                    ) : <span className="text-xs text-slate-400">-</span>}
                  </td>
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
                <tr><td colSpan="8" className="px-5 py-12 text-center text-slate-400">{search || filterCategory !== 'all' ? '검색 결과가 없습니다.' : '등록된 제품이 없습니다.'}</td></tr>
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
              <button onClick={() => { setShowForm(false); resetForm(); setShowCategoryDropdown(false) }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">제품 코드 *</label>
                  <input type="text" value={form.product_code} onChange={e => setForm({...form, product_code: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="ESS-001" required /></div>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">카테고리</label>
                  <div
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className={`w-full px-4 py-3 rounded-xl border cursor-pointer flex items-center justify-between ${
                      showCategoryDropdown ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'
                    }`}>
                    <span className={form.category ? 'text-slate-800' : 'text-slate-400'}>{form.category || '카테고리 선택'}</span>
                    <span className="text-slate-400 text-xs">{showCategoryDropdown ? '▲' : '▼'}</span>
                  </div>
                  {showCategoryDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                      {/* 카테고리 목록 */}
                      <div className="p-2">
                        <button type="button" onClick={() => { setForm({...form, category: ''}); setShowCategoryDropdown(false) }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-50 transition-colors ${
                            !form.category ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600'
                          }`}>선택 안함</button>
                        {categories.map(c => (
                          <button type="button" key={c} onClick={() => selectCategory(c)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-50 transition-colors ${
                              form.category === c ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600'
                            }`}>{c}</button>
                        ))}
                      </div>
                      {/* 새 카테고리 추가 */}
                      <div className="border-t border-slate-200 p-3">
                        <p className="text-xs font-medium text-slate-500 mb-2">새 카테고리 추가</p>
                        <div className="flex gap-2">
                          <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
                            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500"
                            placeholder="카테고리명 입력" />
                          <button type="button" onClick={addCategory}
                            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">추가</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">제품명 *</label>
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
                <button type="button" onClick={() => { setShowForm(false); resetForm(); setShowCategoryDropdown(false) }} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-medium">취소</button>
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
