import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

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
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('usage_count', { ascending: false })
    setProducts(data || [])
  }

  const loadSupplierProductData = async () => {
    const { data } = await supabase.from('supplier_products').select('*')
      .eq('supplier_id', selectedSupplier.id).eq('product_id', selectedProduct.id)
      .eq('is_active', true).order('effective_from', { ascending: false }).limit(1).single()
    if (data) setForm(prev => ({ ...prev, purchase_price: data.purchase_price || '', shipping_cost: data.shipping_cost_from_supplier || '', additional_cost: data.additional_cost || '' }))
  }

  const selectProduct = (p) => { setSelectedProduct(p); setProductSearch(p.product_name); setShowProductDropdown(false) }
  const filteredProducts = products.filter(p => p.product_name.includes(productSearch) || p.product_code.toLowerCase().includes(productSearch.toLowerCase()))
  const frequentProducts = products.slice(0, 4)

  const totalAmount = () => {
    return ((Number(form.purchase_price)||0) * (Number(form.quantity)||1)) + (Number(form.shipping_cost)||0) + (Number(form.additional_cost)||0)
  }
  const formatNumber = (num) => Number(num || 0).toLocaleString()

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

  const handleExcelSave = async () => {
    if (!selectedSupplier) { alert('매입처를 먼저 선택하세요.'); return }
    if (excelData.length === 0) { alert('엑셀 데이터가 없습니다.'); return }
    setExcelSaving(true)
    const user = (await supabase.auth.getUser()).data.user
    let success = 0, fail = 0
    for (const row of excelData) {
      const productCode = row['제품코드'] || row['product_code'] || ''
      const productName = row['제품명'] || row['product_name'] || ''
      const product = products.find(p => p.product_code === productCode || p.product_name === productName)
      if (!product) { fail++; continue }
      const { error } = await supabase.from('purchases').insert({
        supplier_id: selectedSupplier.id, product_id: product.id,
        purchase_date: row['매입일자'] || row['purchase_date'] || new Date().toISOString().split('T')[0],
        quantity: Number(row['수량'] || row['quantity'] || 1),
        purchase_price: Number(row['매입단가'] || row['purchase_price'] || 0),
        shipping_cost: Number(row['배송비'] || row['shipping_cost'] || 0),
        additional_cost: Number(row['부대비용'] || row['additional_cost'] || 0),
        total_amount: Number(row['총금액'] || row['total_amount'] || 0) ||
          (Number(row['매입단가']||0) * Number(row['수량']||1)) + Number(row['배송비']||0) + Number(row['부대비용']||0),
        memo: row['메모'] || row['memo'] || null,
        input_method: 'EXCEL', source_file_name: excelFileName,
        created_by: user.id, updated_by: user.id,
      })
      if (error) fail++; else success++
    }
    alert(`완료! 성공: ${success}건, 실패: ${fail}건`)
    setExcelData([]); setExcelFileName('')
    setExcelSaving(false)
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

      {/* 매입처 선택 (공통) */}
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">❷ 제품 선택</h3>
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
                          <div><p className="text-sm font-medium text-slate-700">{p.product_name}</p><p className="text-xs text-slate-400">{p.product_code}</p></div>
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
                          <div><p className="text-sm font-medium text-slate-700">{p.product_name}</p><p className="text-xs text-slate-400">{p.product_code}</p></div>
                        </button>
                      ))}
                      {filteredProducts.length === 0 && <p className="text-sm text-slate-400 text-center py-4">검색 결과 없음</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
            {selectedProduct && (
              <div className="mt-3 bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
                <div><p className="text-sm font-semibold text-indigo-700">{selectedProduct.product_name}</p><p className="text-xs text-indigo-500">{selectedProduct.product_code}</p></div>
                <button onClick={() => { setSelectedProduct(null); setProductSearch('') }} className="text-indigo-400 hover:text-indigo-600 text-lg">✕</button>
              </div>
            )}
          </div>

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
          <div onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
            <span className="text-4xl mb-4 block">📄</span>
            <p className="text-sm font-medium text-slate-600">클릭하여 엑셀 파일 선택</p>
            <p className="text-xs text-slate-400 mt-1">컬럼: 제품코드, 제품명, 수량, 매입단가, 배송비, 부대비용, 메모</p>
            {excelFileName && <p className="text-sm text-indigo-600 mt-3 font-medium">{excelFileName} ({excelData.length}행)</p>}
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
                className={`w-full py-4 rounded-2xl text-white font-semibold text-lg ${
                  excelSaving || !selectedSupplier ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}>{excelSaving ? '저장 중...' : `${excelData.length}건 매입 일괄 등록`}</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default PurchaseInput
