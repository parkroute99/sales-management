import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const DEFAULT_CATEGORIES = ['스킨케어', '밀키트', '냉동식품', '건강식품', '생활용품', '음료', '간식/과자', '양념/소스']

function PurchaseInput() {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [inputMode, setInputMode] = useState('manual')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [excelData, setExcelData] = useState([])
  const [excelFileName, setExcelFileName] = useState('')
  const [excelSaving, setExcelSaving] = useState(false)
  const fileInputRef = useRef(null)

  const [showNewProduct, setShowNewProduct] = useState(false)
  const [newProductForm, setNewProductForm] = useState({
    product_code: '', product_name: '', category: '',
    purchase_cost: '', packaging_cost: '', additional_cost: '',
  })
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [newProductSaving, setNewProductSaving] = useState(false)

  const [form, setForm] = useState({
    purchase_date: new Date().toISOString().split('T')[0],
    quantity: 1, purchase_price: '', shipping_cost: '', additional_cost: '', memo: '',
  })

  useEffect(() => { fetchSuppliers(); fetchProducts() }, [])
  useEffect(() => { if (selectedSupplier && selectedProduct) loadSupplierProductData() }, [selectedSupplier, selectedProduct])

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    setSuppliers(data || [])
  }

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*, suppliers(supplier_name)').eq('is_active', true).order('usage_count', { ascending: false })
    setProducts(data || [])
    if (data) {
      const dbCategories = [...new Set(data.map(p => p.category).filter(Boolean))]
      setCategories([...new Set([...DEFAULT_CATEGORIES, ...dbCategories])])
    }
  }

  const loadSupplierProductData = async () => {
    const { data } = await supabase.from('supplier_products').select('*')
      .eq('supplier_id', selectedSupplier.id).eq('product_id', selectedProduct.id)
      .eq('is_active', true).order('effective_from', { ascending: false }).limit(1).single()
    if (data) setForm(prev => ({ ...prev, purchase_price: data.purchase_price || '', shipping_cost: data.shipping_cost_from_supplier || '', additional_cost: data.additional_cost || '' }))
  }

  const selectProduct = (p) => { setSelectedProduct(p); setProductSearch(p.product_name); setShowProductDropdown(false); setShowNewProduct(false) }
  const filteredProducts = products.filter(p =>
    p.product_name.includes(productSearch) || p.product_code.toLowerCase().includes(productSearch.toLowerCase())
  )
  const frequentProducts = products.slice(0, 4)

  const totalAmount = () => {
    return ((Number(form.purchase_price)||0) * (Number(form.quantity)||1)) + (Number(form.shipping_cost)||0) + (Number(form.additional_cost)||0)
  }
  const formatNumber = (num) => Number(num || 0).toLocaleString()

  /* ── 제품 즉석 등록 ── */
  const openNewProduct = () => {
    setShowNewProduct(true)
    setNewProductForm({
      product_code: '', product_name: productSearch || '', category: '',
      purchase_cost: '', packaging_cost: '', additional_cost: '',
    })
  }

  const handleNewProductSave = async () => {
    if (!newProductForm.product_code || !newProductForm.product_name) {
      alert('제품코드와 제품명은 필수입니다.')
      return
    }
    if (!newProductForm.purchase_cost) {
      alert('매입원가는 필수입니다.')
      return
    }
    const duplicate = products.find(p => p.product_code === newProductForm.product_code)
    if (duplicate) {
      alert('이미 같은 제품코드가 있습니다: ' + duplicate.product_name)
      return
    }

    setNewProductSaving(true)
    try {
      const user = (await supabase.auth.getUser()).data.user
      const { data, error } = await supabase.from('products').insert({
        product_code: newProductForm.product_code,
        product_name: newProductForm.product_name,
        category: newProductForm.category || null,
        purchase_cost: Number(newProductForm.purchase_cost) || 0,
        packaging_cost: Number(newProductForm.packaging_cost) || 0,
        additional_cost: Number(newProductForm.additional_cost) || 0,
        supplier_id: selectedSupplier?.id || null,
        created_by: user.id,
      }).select('*, suppliers(supplier_name)').single()

      if (error) throw error

      await fetchProducts()
      selectProduct(data)
      setForm(prev => ({ ...prev, purchase_price: newProductForm.purchase_cost }))
      setShowNewProduct(false)
      alert(`"${data.product_name}" 제품이 등록되고 선택되었습니다!`)
    } catch (err) {
      alert('제품 등록 실패: ' + err.message)
    } finally {
      setNewProductSaving(false)
    }
  }

  const selectCategory = (cat) => {
    setNewProductForm({ ...newProductForm, category: cat })
    setShowCategoryDropdown(false)
  }

  const addCategory = () => {
    if (!newCategory.trim()) return
    if (!categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()])
    }
    setNewProductForm({ ...newProductForm, category: newCategory.trim() })
    setNewCategory('')
    setShowCategoryDropdown(false)
  }

  /* ── 매입 저장 ── */
  const handleSave = async () => {
    if (!selectedSupplier || !selectedProduct) { alert('매입처와 제품을 선택해주세요.'); return }
    if (!form.purchase_price) { alert('매입가를 입력해주세요.'); return }
    setSaving(true)
    const user = (await supabase.auth.getUser()).data.user
    const { error } = await supabase.from('purchases').insert({
      supplier_id: selectedSupplier.id, product_id: selectedProduct.id,
      purchase_date: form.purchase_date, quantity: Number(form.quantity) || 1,
      purchase_price: Number(form.purchase_price), shipping_cost: Number(form.shipping_cost) || 0,
      additional_cost: Number(form.additional_cost) || 0, total_amount: totalAmount(),
      memo: form.memo || null, input_method: 'MANUAL', created_by: user.id, updated_by: user.id,
    })
    if (error) alert('저장 실패: ' + error.message)
    else {
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 2000)
      const { data: existing } = await supabase.from('supplier_products').select('id')
        .eq('supplier_id', selectedSupplier.id).eq('product_id', selectedProduct.id).eq('is_active', true).single()
      const spData = { supplier_id: selectedSupplier.id, product_id: selectedProduct.id,
        purchase_price: Number(form.purchase_price), shipping_cost_from_supplier: Number(form.shipping_cost) || 0,
        additional_cost: Number(form.additional_cost) || 0 }
      if (existing) await supabase.from('supplier_products').update(spData).eq('id', existing.id)
      else { spData.created_by = user.id; spData.effective_from = new Date().toISOString().split('T')[0]; await supabase.from('supplier_products').insert(spData) }
      setSelectedProduct(null); setProductSearch('')
      setForm(prev => ({ ...prev, quantity: 1, purchase_price: '', shipping_cost: '', additional_cost: '', memo: '' }))
    }
    setSaving(false)
  }

  /* ── 엑셀 업로드 ── */
  const handleExcelUpload = (e) => {
    const file = e.target.files[0]; if (!file) return
    setExcelFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      setExcelData(data)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ── 엑셀 일괄 저장 (미등록 제품 자동 등록 포함) ── */
  const handleExcelSave = async () => {
    if (!selectedSupplier) { alert('매입처를 먼저 선택하세요.'); return }
    if (excelData.length === 0) { alert('엑셀 데이터가 없습니다.'); return }

    // 1단계: 미등록 제품 확인
    const unregistered = []
    for (const row of excelData) {
      const productCode = row['제품코드'] || row['product_code'] || ''
      const productName = row['제품명'] || row['product_name'] || ''
      if (!productCode && !productName) continue
      const found = products.find(p => p.product_code === productCode || p.product_name === productName)
      if (!found) {
        const already = unregistered.find(u => u.code === productCode || u.name === productName)
        if (!already) {
          unregistered.push({
            code: productCode,
            name: productName,
            purchaseCost: Number(row['매입단가'] || row['purchase_price'] || row['매입원가'] || row['purchase_cost'] || 0),
            category: row['카테고리'] || row['category'] || '',
          })
        }
      }
    }

    // 2단계: 미등록 제품이 있으면 확인
    if (unregistered.length > 0) {
      const list = unregistered.map(u => `  • ${u.code || '(코드없음)'} - ${u.name || '(이름없음)'} (매입가: ${formatNumber(u.purchaseCost)}원)`).join('\n')
      const ok = window.confirm(
        `⚠️ 미등록 제품 ${unregistered.length}건이 발견되었습니다.\n\n${list}\n\n이 제품들을 자동으로 등록하고 매입을 진행하시겠습니까?`
      )
      if (!ok) return
    }

    setExcelSaving(true)
    const user = (await supabase.auth.getUser()).data.user
    let successPurchase = 0, failPurchase = 0, newProducts = 0

    // 3단계: 미등록 제품 자동 등록
    for (const u of unregistered) {
      if (!u.code || !u.name) { continue }
      const { error } = await supabase.from('products').insert({
        product_code: u.code,
        product_name: u.name,
        category: u.category || null,
        purchase_cost: u.purchaseCost,
        packaging_cost: 0,
        additional_cost: 0,
        supplier_id: selectedSupplier.id,
        created_by: user.id,
      })
      if (!error) newProducts++
    }

    // 제품 목록 새로 로드
    const { data: freshProducts } = await supabase.from('products').select('*, suppliers(supplier_name)').eq('is_active', true)
    const allProducts = freshProducts || []

    // 4단계: 매입 등록
    for (const row of excelData) {
      const productCode = row['제품코드'] || row['product_code'] || ''
      const productName = row['제품명'] || row['product_name'] || ''
      const product = allProducts.find(p => p.product_code === productCode || p.product_name === productName)
      if (!product) { failPurchase++; continue }

      const qty = Number(row['수량'] || row['quantity'] || 1)
      const price = Number(row['매입단가'] || row['purchase_price'] || 0)
      const shipping = Number(row['배송비'] || row['shipping_cost'] || 0)
      const additional = Number(row['부대비용'] || row['additional_cost'] || 0)
      const total = Number(row['총금액'] || row['total_amount'] || 0) || (price * qty) + shipping + additional

      const { error } = await supabase.from('purchases').insert({
        supplier_id: selectedSupplier.id, product_id: product.id,
        purchase_date: row['매입일자'] || row['purchase_date'] || new Date().toISOString().split('T')[0],
        quantity: qty, purchase_price: price, shipping_cost: shipping,
        additional_cost: additional, total_amount: total,
        memo: row['메모'] || row['memo'] || null,
        input_method: 'EXCEL', source_file_name: excelFileName,
        created_by: user.id, updated_by: user.id,
      })
      if (error) failPurchase++; else successPurchase++
    }

    let msg = `✅ 매입 등록 완료!\n\n`
    if (newProducts > 0) msg += `🆕 신규 제품 등록: ${newProducts}건\n`
    msg += `📦 매입 성공: ${successPurchase}건`
    if (failPurchase > 0) msg += `\n❌ 매입 실패: ${failPurchase}건`
    alert(msg)

    setExcelData([]); setExcelFileName('')
    setExcelSaving(false)
    fetchProducts()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex gap-3">
        {[{id:'manual',label:'✏️ 수기 입력'},{id:'excel',label:'📄 엑셀 업로드'}].map(m => (
          <button key={m.id} onClick={() => setInputMode(m.id)}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              inputMode === m.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>{m.label}</button>
        ))}
      </div>

      {/* 매입처 선택 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">❶ 매입처 선택</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {suppliers.map(s => (
            <button key={s.id} onClick={() => setSelectedSupplier(s)}
              className={`p-4 rounded-xl border-2 transition-all text-center ${
                selectedSupplier?.id === s.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}>
              <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: s.color_code }}>{s.supplier_name.slice(0,1)}</div>
              <p className="text-sm font-medium text-slate-700">{s.supplier_name}</p>
            </button>
          ))}
        </div>
        {suppliers.length === 0 && <p className="text-center text-slate-400 py-8">매입처를 먼저 등록해주세요.</p>}
      </div>

      {inputMode === 'manual' ? (
        <div className="space-y-6">
          {/* 제품 선택 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">❷ 제품 선택</h3>
              <button onClick={openNewProduct}
                className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600">
                + 새 제품 등록
              </button>
            </div>
            <div className="relative">
              <input type="text" value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); if (selectedProduct && e.target.value !== selectedProduct.product_name) setSelectedProduct(null) }}
                onFocus={() => setShowProductDropdown(true)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                placeholder="제품명 또는 코드로 검색..." />
              {showProductDropdown && !selectedProduct && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-80 overflow-y-auto">
                  {productSearch === '' && frequentProducts.length > 0 && (
                    <div className="p-3">
                      <p className="text-xs font-semibold text-slate-400 mb-2 px-2">🔥 자주 사용</p>
                      {frequentProducts.map(p => (
                        <button key={p.id} onClick={() => selectProduct(p)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg text-left">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">{p.product_name.slice(0,1)}</div>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{p.product_name}</p>
                            <p className="text-xs text-slate-400">{p.product_code} · 원가 {formatNumber(p.total_cost)}원</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {productSearch !== '' && (
                    <div className="p-3">
                      {filteredProducts.slice(0,10).map(p => (
                        <button key={p.id} onClick={() => selectProduct(p)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg text-left">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">{p.product_name.slice(0,1)}</div>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{p.product_name}</p>
                            <p className="text-xs text-slate-400">{p.product_code} · 원가 {formatNumber(p.total_cost)}원</p>
                          </div>
                        </button>
                      ))}
                      {filteredProducts.length === 0 && (
                        <div className="text-center py-6">
                          <p className="text-sm text-slate-400 mb-3">검색 결과 없음</p>
                          <button onClick={openNewProduct}
                            className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600">
                            "{productSearch}" 새 제품으로 등록하기
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {selectedProduct && (
              <div className="mt-3 bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-700">{selectedProduct.product_name}</p>
                  <p className="text-xs text-indigo-500">{selectedProduct.product_code} · 원가 {formatNumber(selectedProduct.total_cost)}원</p>
                </div>
                <button onClick={() => { setSelectedProduct(null); setProductSearch('') }} className="text-indigo-400 hover:text-indigo-600 text-lg">✕</button>
              </div>
            )}
          </div>

          {/* 새 제품 등록 폼 */}
          {showNewProduct && (
            <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-300 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-emerald-800">🆕 새 제품 등록</h3>
                <button onClick={() => setShowNewProduct(false)} className="text-emerald-400 hover:text-emerald-600 text-sm">✕ 닫기</button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">제품코드 *</label>
                  <input type="text" value={newProductForm.product_code}
                    onChange={e => setNewProductForm({...newProductForm, product_code: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                    placeholder="예: DOL004" />
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-600 mb-1">카테고리</label>
                  <div onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className={`w-full px-4 py-3 rounded-xl border cursor-pointer flex items-center justify-between text-sm ${
                      showCategoryDropdown ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-300'
                    }`}>
                    <span className={newProductForm.category ? 'text-slate-800' : 'text-slate-400'}>
                      {newProductForm.category || '선택'}
                    </span>
                    <span className="text-slate-400 text-xs">{showCategoryDropdown ? '▲' : '▼'}</span>
                  </div>
                  {showCategoryDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                      <div className="p-2">
                        <button type="button" onClick={() => { setNewProductForm({...newProductForm, category: ''}); setShowCategoryDropdown(false) }}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-50 text-slate-400">선택 안함</button>
                        {categories.map(c => (
                          <button key={c} type="button" onClick={() => selectCategory(c)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-50 ${
                              newProductForm.category === c ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600'
                            }`}>{c}</button>
                        ))}
                      </div>
                      <div className="border-t p-2 flex gap-2">
                        <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" placeholder="새 카테고리" />
                        <button type="button" onClick={addCategory}
                          className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm">추가</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">제품명 *</label>
                <input type="text" value={newProductForm.product_name}
                  onChange={e => setNewProductForm({...newProductForm, product_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                  placeholder="예: 직화 고추장 불고기 180g" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">매입원가 * (원)</label>
                  <input type="number" value={newProductForm.purchase_cost}
                    onChange={e => setNewProductForm({...newProductForm, purchase_cost: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm text-right"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">포장비 (원)</label>
                  <input type="number" value={newProductForm.packaging_cost}
                    onChange={e => setNewProductForm({...newProductForm, packaging_cost: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm text-right"
                    placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">부대비용 (원)</label>
                  <input type="number" value={newProductForm.additional_cost}
                    onChange={e => setNewProductForm({...newProductForm, additional_cost: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm text-right"
                    placeholder="0" />
                </div>
              </div>

              <div className="bg-white rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm text-slate-500">총 원가</span>
                <span className="text-lg font-bold text-emerald-600">
                  {formatNumber((Number(newProductForm.purchase_cost)||0) + (Number(newProductForm.packaging_cost)||0) + (Number(newProductForm.additional_cost)||0))}원
                </span>
              </div>

              {selectedSupplier && (
                <p className="text-xs text-slate-500">
                  매입처 <span className="font-medium text-indigo-600">{selectedSupplier.supplier_name}</span>에 자동 연결됩니다
                </p>
              )}

              <button onClick={handleNewProductSave} disabled={newProductSaving}
                className={`w-full py-3 rounded-xl text-white font-semibold transition-all ${
                  newProductSaving ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}>
                {newProductSaving ? '등록 중...' : '제품 등록 후 바로 선택'}
              </button>
            </div>
          )}

          {/* 매입 상세 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">❸ 매입 상세</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">매입일자</label>
                <input type="date" value={form.purchase_date} onChange={e => setForm({...form, purchase_date: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">수량</label>
                <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden">
                  <button type="button" onClick={() => setForm({...form, quantity: Math.max(1, Number(form.quantity)-1)})} className="px-4 py-3 hover:bg-slate-100 text-lg">−</button>
                  <input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="flex-1 text-center py-3 outline-none font-semibold" min="1" />
                  <button type="button" onClick={() => setForm({...form, quantity: Number(form.quantity)+1})} className="px-4 py-3 hover:bg-slate-100 text-lg">+</button>
                </div></div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">매입단가 (원)</label>
                <input type="text" value={form.purchase_price ? formatNumber(form.purchase_price) : ''}
                  onChange={e => setForm({...form, purchase_price: e.target.value.replace(/[^0-9]/g, '')})}
                  onFocus={e => { if (e.target.value === '0') setForm({...form, purchase_price: ''}) }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium" placeholder="단가" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">배송비 (원)</label>
                <input type="text" value={form.shipping_cost ? formatNumber(form.shipping_cost) : ''}
                  onChange={e => setForm({...form, shipping_cost: e.target.value.replace(/[^0-9]/g, '')})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium" placeholder="0" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">부대비용 (원)</label>
                <input type="text" value={form.additional_cost ? formatNumber(form.additional_cost) : ''}
                  onChange={e => setForm({...form, additional_cost: e.target.value.replace(/[^0-9]/g, '')})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium" placeholder="0" /></div>
            </div>
            <div className="mt-4"><label className="block text-xs font-medium text-slate-500 mb-1">메모</label>
              <input type="text" value={form.memo} onChange={e => setForm({...form, memo: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="예: 긴급발주" /></div>
          </div>

          {/* 매입 요약 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">매입 요약</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1"><span className="text-slate-500">매입단가 × 수량</span><span>{formatNumber((Number(form.purchase_price)||0)*(Number(form.quantity)||1))}원</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">+ 배송비</span><span>{formatNumber(form.shipping_cost)}원</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">+ 부대비용</span><span>{formatNumber(form.additional_cost)}원</span></div>
              <div className="flex justify-between py-3 font-bold border-t-2 border-slate-200 mt-2"><span>총 매입금액</span><span className="text-indigo-600">{formatNumber(totalAmount())}원</span></div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !selectedSupplier || !selectedProduct || !form.purchase_price}
            className={`w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all ${
              saving || !selectedSupplier || !selectedProduct || !form.purchase_price ? 'bg-slate-300 cursor-not-allowed'
              : saveSuccess ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}>{saving ? '저장 중...' : saveSuccess ? '✓ 저장 완료!' : '매입 등록'}</button>
        </div>
       ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
          {/* 엑셀 가이드 */}
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-800">📤 엑셀 매입 등록 안내</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-blue-100">
                  <th className="px-3 py-2 text-left font-semibold text-blue-800 border border-blue-200">컬럼명</th>
                  <th className="px-3 py-2 text-center font-semibold text-blue-800 border border-blue-200">필수</th>
                  <th className="px-3 py-2 text-left font-semibold text-blue-800 border border-blue-200">설명</th>
                  <th className="px-3 py-2 text-left font-semibold text-blue-800 border border-blue-200">예시</th>
                </tr></thead>
                <tbody>
                  {[
                    ['매입일자','선택','YYYY-MM-DD (미입력시 오늘)','2026-04-07'],
                    ['제품코드','필수','등록된 제품코드 (미등록시 자동 등록)','DOL-001'],
                    ['제품명','필수','제품 이름','직화 간장 불고기 180g'],
                    ['수량','필수','숫자','10'],
                    ['매입단가','필수','개당 매입 단가 (원)','2800'],
                    ['배송비','선택','배송비 (원, 미입력시 0)','5000'],
                    ['부대비용','선택','기타 비용 (원, 미입력시 0)','0'],
                    ['카테고리','선택','미등록 제품 자동등록 시 카테고리','밀키트'],
                    ['메모','선택','비고',''],
                  ].map(([col,req,desc,ex],i) => (
                    <tr key={i} className={i%2===0?'bg-white':'bg-blue-50/50'}>
                      <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">{col}</td>
                      <td className={`px-3 py-2 text-center font-bold border border-blue-200 ${req==='필수'?'text-red-500':'text-slate-400'}`}>{req}</td>
                      <td className="px-3 py-2 text-slate-600 border border-blue-200">{desc}</td>
                      <td className="px-3 py-2 text-slate-500 border border-blue-200">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-blue-700 space-y-1 pt-2">
              <p>• <strong>매입처는 상단에서 먼저 선택</strong>한 후 업로드하세요</p>
              <p>• 미등록 제품이 있으면 <strong>자동으로 제품 등록 후 매입 처리</strong>됩니다</p>
              <p>• .xlsx, .xls, .csv 파일 지원</p>
            </div>
          </div>

          {/* 샘플 다운로드 + 파일 선택 */}
          <div className="flex gap-3">
            <button onClick={() => {
              const sample = [
                { '매입일자':'2026-04-07','제품코드':'DOL-001','제품명':'직화 간장 불고기 180g','수량':10,'매입단가':2800,'배송비':5000,'부대비용':0,'카테고리':'밀키트','메모':'' },
                { '매입일자':'2026-04-07','제품코드':'DOL-002','제품명':'직화 고추장 불고기 180g','수량':10,'매입단가':2800,'배송비':0,'부대비용':0,'카테고리':'밀키트','메모':'' },
              ]
              const ws = XLSX.utils.json_to_sheet(sample); ws['!cols'] = Array(9).fill({wch:14})
              const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'매입등록양식')
              XLSX.writeFile(wb,'매입등록_샘플양식.xlsx')
            }} className="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 border border-slate-300">📋 샘플 양식 다운로드</button>
            <div onClick={() => fileInputRef.current?.click()}
              className="flex-1 border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
              <p className="text-sm font-medium text-slate-600">📄 클릭하여 엑셀 파일 선택</p>
              {excelFileName && <p className="text-sm text-indigo-600 mt-1 font-medium">{excelFileName} ({excelData.length}행)</p>}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />

          {excelData.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50">{Object.keys(excelData[0]).map(k => <th key={k} className="px-3 py-2 text-left font-medium text-slate-500 border-b">{k}</th>)}</tr></thead>
                  <tbody>{excelData.slice(0,5).map((row,i) => <tr key={i} className="border-b border-slate-100">{Object.values(row).map((v,j) => <td key={j} className="px-3 py-2 text-slate-600">{String(v)}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <button onClick={handleExcelSave} disabled={excelSaving || !selectedSupplier}
                className={`w-full py-4 rounded-2xl text-white font-semibold text-lg ${excelSaving || !selectedSupplier ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {excelSaving ? '저장 중...' : `${excelData.length}건 매입 일괄 등록`}
              </button>
            </>
          )}
              </div>
      )}
    </div>
  )
}

export default PurchaseInput

