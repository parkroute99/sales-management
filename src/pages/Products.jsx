
import React, { useState, useEffect, useRef } from 'react'
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
  const [showUploadGuide, setShowUploadGuide] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [editCategoryId, setEditCategoryId] = useState(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterSupplier, setFilterSupplier] = useState('all')
  const [uploadResult, setUploadResult] = useState(null)
  const fileInputRef = useRef(null)
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
    if (categories.find(c => c.name === name)) { alert('이미 존재하는 카테고리입니다.'); return }
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
    if (categories.find(c => c.name === name && c.id !== id)) { alert('이미 존재하는 카테고리명입니다.'); return }
    const { error } = await supabase.from('categories').update({ name }).eq('id', id)
    if (error) { alert('수정 실패: ' + error.message); return }
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
    if (count > 0) await supabase.from('products').update({ category: null }).eq('category', name)
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

  /* ── 샘플 엑셀 다운로드 ── */
  const handleSampleDownload = () => {
    const sampleData = [
      { '제품코드': 'DOL-001', '제품명': '직화 고추장 불고기 180g', '카테고리': '밀키트', '매입처': '', '매입원가': 3500, '포장비': 200, '부대비용': 0 },
      { '제품코드': 'DOL-002', '제품명': '국물 닭볶음탕 500g', '카테고리': '밀키트', '매입처': '', '매입원가': 4200, '포장비': 300, '부대비용': 0 },
      { '제품코드': 'SK-001', '제품명': '프리미엄 에센스 50ml', '카테고리': '스킨케어', '매입처': '', '매입원가': 8000, '포장비': 500, '부대비용': 100 },
    ]
    const ws = XLSX.utils.json_to_sheet(sampleData)
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '제품등록양식')
    XLSX.writeFile(wb, '제품등록_샘플양식.xlsx')
  }

  /* ── 엑셀 제품목록 다운로드 ── */
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

  /* ── 엑셀 업로드 ── */
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      if (data.length === 0) { alert('데이터가 없습니다.'); return }

      const user = (await supabase.auth.getUser()).data.user
      const { data: freshProducts } = await supabase.from('products').select('product_code').eq('is_active', true)
      const existingCodes = new Set((freshProducts || []).map(p => p.product_code))

      let success = 0, skipped = 0, failed = 0, noCode = 0
      const errors = []

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const code = String(row['제품코드'] || row['product_code'] || '').trim()
        const name = String(row['제품명'] || row['product_name'] || '').trim()

        if (!code && !name) continue
        if (!code || !name) { noCode++; errors.push(`${i + 2}행: 제품코드 또는 제품명 누락`); continue }
        if (existingCodes.has(code)) { skipped++; continue }

        const supplierName = String(row['매입처'] || row['supplier_name'] || '').trim()
        const supplierId = supplierName ? suppliers.find(s => s.supplier_name === supplierName)?.id || null : null
        const category = String(row['카테고리'] || row['category'] || '').trim() || null

        const { error } = await supabase.from('products').insert({
          product_code: code, product_name: name, category,
          purchase_cost: Number(row['매입원가'] || row['purchase_cost'] || 0),
          packaging_cost: Number(row['포장비'] || row['packaging_cost'] || 0),
          additional_cost: Number(row['부대비용'] || row['additional_cost'] || 0),
          supplier_id: supplierId, created_by: user.id,
        })

        if (error) { failed++; errors.push(`${i + 2}행 "${name}": ${error.message}`) }
        else { success++; existingCodes.add(code) }
      }

      setUploadResult({ success, skipped, failed, noCode, errors, total: data.length })
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
          <button onClick={() => setShowUploadGuide(!showUploadGuide)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${showUploadGuide ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            📤 엑셀 업로드
          </button>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 추가</button>
        </div>
      </div>

      {/* ── 엑셀 업로드 가이드 패널 ── */}
      {showUploadGuide && (
        <div className="bg-white rounded-2xl border border-blue-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-800">📤 엑셀로 제품 대량 등록</h3>
            <button onClick={() => { setShowUploadGuide(false); setUploadResult(null) }} className="text-slate-400 hover:text-slate-600 text-sm">✕ 닫기</button>
          </div>

          {/* 안내 */}
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-800">엑셀 파일 형식 안내</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-blue-100">
                    <th className="px-3 py-2 text-left font-semibold text-blue-800 border border-blue-200">컬럼명</th>
                    <th className="px-3 py-2 text-center font-semibold text-blue-800 border border-blue-200">필수</th>
                    <th className="px-3 py-2 text-left font-semibold text-blue-800 border border-blue-200">설명</th>
                    <th className="px-3 py-2 text-left font-semibold text-blue-800 border border-blue-200">예시</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">제품코드</td>
                    <td className="px-3 py-2 text-center text-red-500 font-bold border border-blue-200">필수</td>
                    <td className="px-3 py-2 text-slate-600 border border-blue-200">제품 고유 코드 (중복 불가)</td>
                    <td className="px-3 py-2 text-slate-500 border border-blue-200">DOL-001</td>
                  </tr>
                  <tr className="bg-blue-50/50">
                    <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">제품명</td>
                    <td className="px-3 py-2 text-center text-red-500 font-bold border border-blue-200">필수</td>
                    <td className="px-3 py-2 text-slate-600 border border-blue-200">제품의 정식 이름</td>
                    <td className="px-3 py-2 text-slate-500 border border-blue-200">직화 고추장 불고기 180g</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">카테고리</td>
                    <td className="px-3 py-2 text-center text-slate-400 border border-blue-200">선택</td>
                    <td className="px-3 py-2 text-slate-600 border border-blue-200">제품 분류 (미입력시 비워둠)</td>
                    <td className="px-3 py-2 text-slate-500 border border-blue-200">밀키트</td>
                  </tr>
                  <tr className="bg-blue-50/50">
                    <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">매입처</td>
                    <td className="px-3 py-2 text-center text-slate-400 border border-blue-200">선택</td>
                    <td className="px-3 py-2 text-slate-600 border border-blue-200">등록된 매입처명과 동일하게 입력</td>
                    <td className="px-3 py-2 text-slate-500 border border-blue-200">돌구름푸드</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">매입원가</td>
                    <td className="px-3 py-2 text-center text-slate-400 border border-blue-200">선택</td>
                    <td className="px-3 py-2 text-slate-600 border border-blue-200">숫자만 입력 (원 단위)</td>
                    <td className="px-3 py-2 text-slate-500 border border-blue-200">3500</td>
                  </tr>
                  <tr className="bg-blue-50/50">
                    <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">포장비</td>
                    <td className="px-3 py-2 text-center text-slate-400 border border-blue-200">선택</td>
                    <td className="px-3 py-2 text-slate-600 border border-blue-200">숫자만 입력 (원 단위)</td>
                    <td className="px-3 py-2 text-slate-500 border border-blue-200">200</td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">부대비용</td>
                    <td className="px-3 py-2 text-center text-slate-400 border border-blue-200">선택</td>
                    <td className="px-3 py-2 text-slate-600 border border-blue-200">숫자만 입력 (원 단위)</td>
                    <td className="px-3 py-2 text-slate-500 border border-blue-200">0</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-xs text-blue-700 space-y-1 pt-2">
              <p>• 첫 번째 행은 반드시 <strong>컬럼명</strong>이어야 합니다 (제품코드, 제품명, ...)</p>
              <p>• <strong>제품코드가 이미 등록된 제품</strong>은 자동으로 건너뜁니다 (중복 등록 안 됨)</p>
              <p>• 매입처는 <strong>매입처 관리에 등록된 이름과 정확히 일치</strong>해야 연결됩니다</p>
              <p>• 금액 항목을 비워두면 0원으로 등록됩니다</p>
              <p>• .xlsx, .xls, .csv 파일을 지원합니다</p>
            </div>
          </div>

          {/* 버튼 영역 */}
          <div className="flex gap-3">
            <button onClick={handleSampleDownload}
              className="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 border border-slate-300">
              📋 샘플 양식 다운로드
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
              📤 엑셀 파일 선택하여 업로드
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </div>

          {/* 업로드 결과 */}
          {uploadResult && (
            <div className={`rounded-xl p-4 ${uploadResult.failed > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              <p className="text-sm font-semibold mb-2 ${uploadResult.failed > 0 ? 'text-amber-800' : 'text-emerald-800'}">
                업로드 결과
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white rounded-lg p-2">
                  <p className="text-lg font-bold text-emerald-600">{uploadResult.success}</p>
                  <p className="text-xs text-slate-500">등록 성공</p>
                </div>
                <div className="bg-white rounded-lg p-2">
                  <p className="text-lg font-bold text-slate-400">{uploadResult.skipped}</p>
                  <p className="text-xs text-slate-500">중복 건너뜀</p>
                </div>
                <div className="bg-white rounded-lg p-2">
                  <p className="text-lg font-bold text-amber-600">{uploadResult.noCode}</p>
                  <p className="text-xs text-slate-500">필수값 누락</p>
                </div>
                <div className="bg-white rounded-lg p-2">
                  <p className="text-lg font-bold text-red-600">{uploadResult.failed}</p>
                  <p className="text-xs text-slate-500">등록 실패</p>
                </div>
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="mt-3 bg-white rounded-lg p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-slate-500 mb-1">상세 오류:</p>
                  {uploadResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600">• {err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 카테고리 관리 패널 ── */}
      {showCategoryManager && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">🏷️ 카테고리 관리</h3>
              <p className="text-xs text-slate-400 mt-1">추가, 수정, 삭제, 순서 변경이 가능합니다. 변경사항은 바로 저장됩니다.</p>
            </div>
            <button onClick={() => setShowCategoryManager(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕ 닫기</button>
          </div>
          <div className="space-y-2 mb-4">
            {categories.map((c, idx) => {
              const count = products.filter(p => p.category === c.name).length
              const isEditing = editCategoryId === c.id
              return (
                <div key={c.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => handleMoveCategory(c.id, 'up')} disabled={idx === 0}
                      className={`text-xs px-1 rounded ${idx === 0 ? 'text-slate-300' : 'text-slate-500 hover:bg-slate-200'}`}>▲</button>
                    <button onClick={() => handleMoveCategory(c.id, 'down')} disabled={idx === categories.length - 1}
                      className={`text-xs px-1 rounded ${idx === categories.length - 1 ? 'text-slate-300' : 'text-slate-500 hover:bg-slate-200'}`}>▼</button>
                  </div>
                  {isEditing ? (
                    <div className="flex-1 flex gap-2">
                      <input type="text" value={editCategoryName}
                        onChange={e => setEditCategoryName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleUpdateCategory(c.id, c.name) } if (e.key === 'Escape') setEditCategoryId(null) }}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-indigo-400 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                        autoFocus />
                      <button onClick={() => handleUpdateCategory(c.id, c.name)}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium">저장</button>
                      <button onClick={() => setEditCategoryId(null)}
                        className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-xs font-medium">취소</button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-slate-700">{c.name}</span>
                      <span className="text-xs text-slate-400 mr-2">제품 {count}개</span>
                      <button onClick={() => { setEditCategoryId(c.id); setEditCategoryName(c.name) }}
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-sm">✏️</button>
                      <button onClick={() => handleDeleteCategory(c.id, c.name)}
                        className="p-1.5 hover:bg-red-100 rounded-lg text-sm">🗑️</button>
                    </>
                  )}
                </div>
              )
            })}
            {categories.length === 0 && (
              <p className="text-center text-slate-400 py-4 text-sm">등록된 카테고리가 없습니다.</p>
            )}
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-200">
            <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory() } }}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm"
              placeholder="새 카테고리 입력 후 Enter 또는 추가 클릭" />
            <button onClick={handleAddCategory}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 추가</button>
          </div>
        </div>
      )}

      {/* 카테고리 빠른 필터 */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filterCategory === 'all' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>전체 ({products.length})</button>
        {categories.map(c => {
          const count = products.filter(p => p.category === c.name).length
          if (count === 0) return null
          return (
            <button key={c.id} onClick={() => setFilterCategory(c.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterCategory === c.name ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}>{c.name} ({count})</button>
          )
        })}
      </div>

      {/* 제품 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">코드</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">제품명</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">카테고리</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">매입처</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">매입원가</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">포장비</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">총원가</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">사용</th>
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
                  <td className="px-5 py-4 text-sm text-slate-600">{p.suppliers?.supplier_name || <span className="text-xs text-slate-400">-</span>}</td>
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
                <tr><td colSpan="9" className="px-5 py-12 text-center text-slate-400">{search || filterCategory !== 'all' ? '검색 결과가 없습니다.' : '등록된 제품이 없습니다.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 제품 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); resetForm() } }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '제품 수정' : '제품 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">제품 코드 *</label>
                  <input type="text" value={form.product_code} onChange={e => setForm({...form, product_code: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="ESS-001" required /></div>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">카테고리</label>
                  <div onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className={`w-full px-4 py-3 rounded-xl border cursor-pointer flex items-center justify-between ${
                      showCategoryDropdown ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'
                    }`}>
                    <span className={form.category ? 'text-slate-800 text-sm' : 'text-slate-400 text-sm'}>{form.category || '선택'}</span>
                    <span className="text-slate-400 text-xs">{showCategoryDropdown ? '▲' : '▼'}</span>
                  </div>
                  {showCategoryDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                      <div className="p-2">
                        <button type="button" onClick={() => { setForm({...form, category: ''}); setShowCategoryDropdown(false) }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-50 ${
                            !form.category ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600'
                          }`}>선택 안함</button>
                        {categories.map(c => (
                          <button key={c.id} type="button" onClick={() => selectCategory(c.name)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-slate-50 ${
                              form.category === c.name ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-600'
                            }`}>{c.name}</button>
                        ))}
                      </div>
                      <div className="border-t border-slate-200 p-3">
                        <p className="text-xs font-medium text-slate-500 mb-2">새 카테고리 추가</p>
                        <div className="flex gap-2">
                          <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory() } }}
                            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500"
                            placeholder="새 카테고리" />
                          <button type="button" onClick={handleAddCategory}
                            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">추가</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">제품명 *</label>
                <input type="text" value={form.product_name} onChange={e => setForm({...form, product_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="프리미엄 에센스 50ml" required /></div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">매입처</label>
                <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-sm">
                  <option value="">선택안함</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                </select>
              </div>
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
