import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

function Products() {
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [categories, setCategories] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [editCategoryId, setEditCategoryId] = useState(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterSupplier, setFilterSupplier] = useState('all')
  const [form, setForm] = useState({
    product_code: '', product_name: '', category: '',
    purchase_cost: '', packaging_cost: '', additional_cost: '', supplier_id: ''
  })

  useEffect(() => { fetchProducts(); fetchSuppliers(); fetchCategories() }, [])

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*, suppliers(supplier_name)').eq('is_active', true).order('usage_count', { ascending: false })
    setProducts(data || [])
    setLoading(false)
  }

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    setSuppliers(data || [])
  }

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('sort_order').order('name')
    setCategories(data || [])
  }

  const resetForm = () => {
    setForm({ product_code: '', product_name: '', category: '', purchase_cost: '', packaging_cost: '', additional_cost: '', supplier_id: '' })
    setEditId(null)
    setShowCategoryDropdown(false)
  }

  /* ── 카테고리 관리 (DB 저장) ── */
  const handleAddCategory = async () => {
    const name = newCategory.trim()
    if (!name) return
    if (categories.find(c => c.name === name)) {
      alert('이미 존재하는 카테고리입니다.')
      return
    }
    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order || 0)) : 0
    const { error } = await supabase.from('categories').insert({ name, sort_order: maxOrder + 1 })
    if (error) { alert('추가 실패: ' + error.message); return }
    setNewCategory('')
    fetchCategories()
  }

  const handleUpdateCategory = async (id, oldName) => {
    const name = editCategoryName.trim()
    if (!name) return
    if (name === oldName) { setEditCategoryId(null); return }
    if (categories.find(c => c.name === name && c.id !== id)) {
      alert('이미 존재하는 카테고리명입니다.')
      return
    }
    // 카테고리명 수정
    const { error } = await supabase.from('categories').update({ name }).eq('id', id)
    if (error) { alert('수정 실패: ' + error.message); return }
    // 해당 카테고리를 사용하는 제품들도 업데이트
    await supabase.from('products').update({ category: name }).eq('category', oldName)
    setEditCategoryId(null)
    setEditCategoryName('')
    if (form.category === oldName) setForm({ ...form, category: name })
    if (filterCategory === oldName) setFilterCategory(name)
    fetchCategories()
    fetchProducts()
  }

  const handleDeleteCategory = async (id, name) => {
    const count = products.filter(p => p.category === name).length
    const msg = count > 0
      ? `"${name}" 카테고리를 삭제하시겠습니까?\n\n⚠️ 이 카테고리에 ${count}개 제품이 있습니다.\n제품은 유지되고 카테고리만 비워집니다.`
      : `"${name}" 카테고리를 삭제하시겠습니까?`
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    // 해당 카테고리 사용 제품의 카테고리를 null로
    if (count > 0) {
      await supabase.from('products').update({ category: null }).eq('category', name)
    }
    if (form.category === name) setForm({ ...form, category: '' })
    if (filterCategory === name) setFilterCategory('all')
    fetchCategories()
    fetchProducts()
  }

  const handleMoveCategory = async (id, direction) => {
    const idx = categories.findIndex(c => c.id === id)
    if (direction === 'up' && idx <= 0) return
    if (direction === 'down' && idx >= categories.length - 1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const currentOrder = categories[idx].sort_order
    const swapOrder = categories[swapIdx].sort_order
    await supabase.from('categories').update({ sort_order: swapOrder }).eq('id', categories[idx].id)
    await supabase.from('categories').update({ sort_order: currentOrder }).eq('id', categories[swapIdx].id)
    fetchCategories()
  }

  /* ── 제품 CRUD ── */
  const handleSubmit = async (e) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    const data = {
      product_code: form.product_code, product_name: form.product_name, category: form.category || null,
      purchase_cost: Number(form.purchase_cost) || 0, packaging_cost: Number(form.packaging_cost) || 0,
      additional_cost: Number(form.additional_cost) || 0, supplier_id: form.supplier_id || null,
    }
    if (editId) await supabase.from('products').update(data).eq('id', editId)
    else { data.created_by = user.id; await supabase.from('products').insert(data) }
    setShowForm(false); resetForm(); fetchProducts()
  }

  const handleEdit = (p) => {
    setForm({
      product_code: p.product_code, product_name: p.product_name, category: p.category || '',
      purchase_cost: p.purchase_cost || '', packaging_cost: p.packaging_cost || '',
      additional_cost: p.additional_cost || '', supplier_id: p.supplier_id || ''
    })
    setEditId(p.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 제품을 삭제하시겠습니까?')) {
      await supabase.from('products').update({ is_active: false }).eq('id', id); fetchProducts()
    }
  }

  const selectCategory = (cat) => {
    setForm({ ...form, category: cat })
    setShowCategoryDropdown(false)
  }

  /* ── 엑셀 ── */
  const handleExcelDownload = () => {
    const excelData = products.map(p => ({
      '제품코드': p.product_code, '제품명': p.product_name, '카테고리': p.category || '',
      '매입처': p.suppliers?.supplier_name || '',
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
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      const user = (await supabase.auth.getUser()).data.user
      let count = 0
      for (const row of data) {
        const code = row['제품코드'] || row['product_code']
        const name = row['제품명'] || row['product_name']
        if (!code || !name) continue
        const existing = products.find(p => p.product_code === code)
        if (existing) continue
        const supplierName = row['매입처'] || row['supplier_name']
        const supplierId = supplierName ? suppliers.find(s => s.supplier_name === supplierName)?.id : null
        await supabase.from('products').insert({
          product_code: code, product_name: name, category: row['카테고리'] || row['category'] || null,
          purchase_cost: Number(row['매입원가'] || row['purchase_cost'] || 0),
          packaging_cost: Number(row['포장비'] || row['packaging_cost'] || 0),
          additional_cost: Number(row['부대비용'] || row['additional_cost'] || 0),
          supplier_id: supplierId, created_by: user.id,
        })
        count++
      }
      alert(`${count}개 제품이 등록되었습니다.`)
      fetchProducts()
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ── 필터링 ── */
  const filteredProducts = products.filter(p => {
    const matchSearch = p.product_name.includes(search) || p.product_code.includes(search) || (p.category && p.category.includes(search))
    const matchCategory = filterCategory === 'all' || p.category === filterCategory
    const matchSupplier = filterSupplier === 'all' || p.supplier_id === filterSupplier
    return matchSearch && matchCategory && matchSupplier
  })
  const formatNumber = (num) => Number(num || 0).toLocaleString()
  const categoryNames = categories.map(c => c.name)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex gap-3 items-center flex-wrap">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="w-56 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm"
            placeholder="제품명 또는 코드 검색..." />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm">
            <option value="all">전체 카테고리</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
            className="px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm">
            <option value="all">전체 매입처</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCategoryManager(!showCategoryManager)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${showCategoryManager ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            🏷️ 카테고리 관리
          </button>
          <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 다운로드</button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover<span class="cursor">█</span>
