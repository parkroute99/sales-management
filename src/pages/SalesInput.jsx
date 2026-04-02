import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

// 10원 단위 올림 함수
const roundUp10 = (num) => Math.ceil(num / 10) * 10

function SalesInput() {
  const [channels, setChannels] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [inputMode, setInputMode] = useState('manual')
  const [priceMode, setPriceMode] = useState('supply') // 'supply' = 공급가 기준, 'selling' = 판매가 직접입력
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [excelData, setExcelData] = useState([])
  const [excelFileName, setExcelFileName] = useState('')
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    sale_date: new Date().toISOString().split('T')[0],
    quantity: 1, supply_price: '', selling_price: '', shipping_fee_received: '',
    commission_type: 'RATE', commission_rate: '', commission_fixed: '',
    shipping_cost: '', additional_fee: '', memo: '',
  })

  useEffect(() => { fetchChannels(); fetchSuppliers(); fetchProducts() }, [])

  useEffect(() => {
    if (selectedChannel && selectedProduct) loadChannelProductData()
  }, [selectedChannel, selectedProduct])

  // 공급가 → 판매가 자동계산
  useEffect(() => {
    if (priceMode === 'supply' && form.supply_price && form.commission_type === 'RATE' && form.commission_rate) {
      const supply = Number(form.supply_price) || 0
      const rate = Number(form.commission_rate) || 0
      if (supply > 0 && rate > 0 && rate < 100) {
        const calculated = roundUp10(supply / (1 - rate / 100))
        setForm(prev => ({ ...prev, selling_price: String(calculated) }))
      }
    }
  }, [form.supply_price, form.commission_rate, form.commission_type, priceMode])

  const fetchChannels = async () => {
    const { data } = await supabase.from('channels').select('*').eq('is_active', true).order('sort_order')
    setChannels(data || [])
  }
  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    setSuppliers(data || [])
  }
  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('usage_count', { ascending: false })
    setProducts(data || [])
  }

  const loadChannelProductData = async () => {
    const { data } = await supabase.from('channel_products').select('*')
      .eq('channel_id', selectedChannel.id).eq('product_id', selectedProduct.id)
      .eq('is_active', true).single()

    if (data) {
      setForm(prev => ({
        ...prev,
        selling_price: data.selling_price || '',
        shipping_fee_received: data.shipping_fee_to_customer || '',
        commission_type: data.commission_type || selectedChannel.default_commission_type,
        commission_rate: data.commission_rate || selectedChannel.default_commission_rate || '',
        commission_fixed: data.commission_fixed || selectedChannel.default_commission_fixed || '',
        shipping_cost: data.product_shipping_cost || data.actual_shipping_cost || selectedChannel.default_shipping_cost || '',
        additional_fee: data.additional_channel_fee || '',
      }))
    } else if (selectedChannel) {
      setForm(prev => ({
        ...prev, selling_price: '',
        shipping_fee_received: selectedChannel.default_shipping_policy === 'PAID' ? '' : '0',
        commission_type: selectedChannel.default_commission_type,
        commission_rate: selectedChannel.default_commission_rate || '',
        commission_fixed: selectedChannel.default_commission_fixed || '',
        shipping_cost: selectedChannel.default_shipping_cost || '',
        additional_fee: '',
      }))
    }
  }

  const selectChannel = (ch) => {
    setSelectedChannel(ch)
    setForm(prev => ({
      ...prev,
      commission_type: ch.default_commission_type,
      commission_rate: ch.default_commission_rate || '',
      commission_fixed: ch.default_commission_fixed || '',
      shipping_cost: ch.default_shipping_cost || '',
    }))
  }

  const selectProduct = (p) => { setSelectedProduct(p); setProductSearch(p.product_name); setShowProductDropdown(false) }

  const filteredProducts = products.filter(p =>
    p.product_name.includes(productSearch) || p.product_code.toLowerCase().includes(productSearch.toLowerCase())
  )
  const frequentProducts = products.slice(0, 4)
  const recentProducts = products.filter(p => p.last_used_at).sort((a, b) => new Date(b.last_used_at) - new Date(a.last_used_at)).slice(0, 4)

  const calculateMargin = () => {
    const price = Number(form.selling_price) || 0
    const qty = Number(form.quantity) || 1
    const shippingReceived = Number(form.shipping_fee_received) || 0
    const totalRevenue = roundUp10((price * qty) + shippingReceived)

    // 수수료: 판매가 - (판매가 × (1-수수료율)) = 판매가에서 공급가를 뺀 금액
    let commission = 0
    if (form.commission_type === 'RATE') {
      const rate = Number(form.commission_rate) || 0
      commission = roundUp10(price * qty - price * qty * (1 - rate / 100))
    } else {
      commission = roundUp10(Number(form.commission_fixed) || 0)
    }

    const productCost = selectedProduct ? roundUp10(Number(selectedProduct.total_cost || 0) * qty) : 0
    const shippingCost = roundUp10(Number(form.shipping_cost) || 0)
    const additionalFee = roundUp10(Number(form.additional_fee) || 0)
    const totalCost = productCost + commission + shippingCost + additionalFee
    const netProfit = totalRevenue - totalCost
    const marginRate = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0
    return { totalRevenue, productCost, commission, shippingCost, additionalFee, totalCost, netProfit, marginRate }
  }

  const margin = calculateMargin()
  const formatNumber = (num) => Number(num || 0).toLocaleString()

  // 공급가 역산 표시 (판매가 입력 시)
  const getSupplyPrice = () => {
    const price = Number(form.selling_price) || 0
    const rate = Number(form.commission_rate) || 0
    if (price > 0 && rate > 0 && form.commission_type === 'RATE') {
      return roundUp10(price * (1 - rate / 100))
    }
    return 0
  }

  const handleSave = async () => {
    if (!selectedChannel || !selectedProduct) { alert('매출처와 제품을 선택해주세요.'); return }
    if (!form.selling_price) { alert('판매가를 입력해주세요.'); return }

    setSaving(true)
    const user = (await supabase.auth.getUser()).data.user
    const saleData = {
      channel_id: selectedChannel.id, product_id: selectedProduct.id,
      supplier_id: selectedSupplier?.id || null,
      sale_date: form.sale_date, quantity: Number(form.quantity) || 1,
      selling_price: Number(form.selling_price),
      shipping_fee_received: Number(form.shipping_fee_received) || 0,
      total_revenue: margin.totalRevenue, product_cost: margin.productCost,
      commission_type: form.commission_type,
      commission_rate: form.commission_type === 'RATE' ? Number(form.commission_rate) || 0 : 0,
      commission_fixed: form.commission_type === 'FIXED' ? Number(form.commission_fixed) || 0 : 0,
      commission_amount: margin.commission, shipping_cost: margin.shippingCost,
      additional_fee: margin.additionalFee, total_cost: margin.totalCost,
      net_profit: margin.netProfit, margin_rate: Number(margin.marginRate.toFixed(1)),
      memo: form.memo || null, input_method: 'MANUAL',
      created_by: user.id, updated_by: user.id,
    }

    const { error } = await supabase.from('sales').insert(saleData)
    if (error) { alert('저장 실패: ' + error.message) }
    else {
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 2000)

      const { data: existing } = await supabase.from('channel_products').select('id')
        .eq('channel_id', selectedChannel.id).eq('product_id', selectedProduct.id).eq('is_active', true).single()
      const cpData = {
        channel_id: selectedChannel.id, product_id: selectedProduct.id,
        selling_price: Number(form.selling_price),
        commission_type: form.commission_type,
        commission_rate: Number(form.commission_rate) || 0,
        commission_fixed: Number(form.commission_fixed) || 0,
        shipping_policy: selectedChannel.default_shipping_policy,
        shipping_fee_to_customer: Number(form.shipping_fee_received) || 0,
        actual_shipping_cost: Number(form.shipping_cost) || 0,
        product_shipping_cost: Number(form.shipping_cost) || 0,
        additional_channel_fee: Number(form.additional_fee) || 0,
      }
      if (existing) await supabase.from('channel_products').update(cpData).eq('id', existing.id)
      else { cpData.created_by = user.id; cpData.effective_from = new Date().toISOString().split('T')[0]; await supabase.from('channel_products').insert(cpData) }

      setSelectedProduct(null); setProductSearch('')
      setForm(prev => ({ ...prev, quantity: 1, supply_price: '', selling_price: '', shipping_fee_received: '', additional_fee: '', memo: '' }))
      fetchProducts()
    }
    setSaving(false)
  }

  const handleExcelUpload = (e) => {
    const file = e.target.files[0]; if (!file) return
    setExcelFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      setExcelData(data)
    }
    reader.readAsArrayBuffer(file)
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

      {inputMode === 'manual' ? (
        <div className="space-y-6">
          {/* 매출처 선택 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">❶ 매출처 선택</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {channels.map(ch => (
                <button key={ch.id} onClick={() => selectChannel(ch)}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${
                    selectedChannel?.id === ch.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}>
                  <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: ch.color_code }}>{ch.channel_name.slice(0, 1)}</div>
                  <p className="text-sm font-medium text-slate-700">{ch.channel_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{ch.default_commission_type === 'RATE' ? `수수료 ${ch.default_commission_rate}%` : `수수료 ${formatNumber(ch.default_commission_fixed)}원`}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 매입처 선택 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">❷ 매입처 선택 <span className="text-xs text-slate-400 font-normal">(선택사항)</span></h3>
            <p className="text-xs text-slate-400 mb-4">위탁판매의 경우 매입처를 선택하세요</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedSupplier(null)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  !selectedSupplier ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>선택안함</button>
              {suppliers.map(s => (
                <button key={s.id} onClick={() => setSelectedSupplier(s)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedSupplier?.id === s.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>{s.supplier_name}</button>
              ))}
            </div>
          </div>

          {/* 제품 선택 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">❸ 제품 선택</h3>
            <div className="relative">
              <input type="text" value={productSearch}
                onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); if (selectedProduct && e.target.value !== selectedProduct.product_name) setSelectedProduct(null) }}
                onFocus={() => setShowProductDropdown(true)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                placeholder="제품명 또는 코드로 검색..." />
              {showProductDropdown && !selectedProduct && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-80 overflow-y-auto">
                  {productSearch === '' ? (
                    <>
                      {frequentProducts.length > 0 && (
                        <div className="p-3">
                          <p className="text-xs font-semibold text-slate-400 mb-2 px-2">🔥 자주 사용</p>
                          {frequentProducts.map(p => (
                            <button key={p.id} onClick={() => selectProduct(p)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg text-left">
                              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">{p.product_name.slice(0,1)}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{p.product_name}</p>
                                <p className="text-xs text-slate-400">{p.product_code} · 원가 {formatNumber(p.total_cost)}원</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {recentProducts.length > 0 && (
                        <div className="p-3 border-t border-slate-100">
                          <p className="text-xs font-semibold text-slate-400 mb-2 px-2">🕐 최근 사용</p>
                          {recentProducts.map(p => (
                            <button key={p.id} onClick={() => selectProduct(p)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg text-left">
                              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-bold text-slate-600">{p.product_name.slice(0,1)}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{p.product_name}</p>
                                <p className="text-xs text-slate-400">{p.product_code}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-3">
                      {filteredProducts.length > 0 ? filteredProducts.slice(0,10).map(p => (
                        <button key={p.id} onClick={() => selectProduct(p)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg text-left">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">{p.product_name.slice(0,1)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">{p.product_name}</p>
                            <p className="text-xs text-slate-400">{p.product_code} · 원가 {formatNumber(p.total_cost)}원</p>
                          </div>
                        </button>
                      )) : <p className="text-sm text-slate-400 text-center py-4">검색 결과 없음</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
            {selectedProduct && (
              <div className="mt-3 bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-700">{selectedProduct.product_name}</p>
                  <p className="text-xs text-indigo-500 mt-0.5">{selectedProduct.product_code} · 원가 {formatNumber(selectedProduct.total_cost)}원</p>
                </div>
                <button onClick={() => { setSelectedProduct(null); setProductSearch('') }} className="text-indigo-400 hover:text-indigo-600 text-lg">✕</button>
              </div>
            )}
          </div>

          {/* 매출 상세 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">❹ 매출 상세</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">매출일자</label>
                <input type="date" value={form.sale_date} onChange={e => setForm({...form, sale_date: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">수량</label>
                <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden">
                  <button type="button" onClick={() => setForm({...form, quantity: Math.max(1, Number(form.quantity)-1)})}
                    className="px-4 py-3 hover:bg-slate-100 text-lg font-medium text-slate-600">−</button>
                  <input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})}
                    className="flex-1 text-center py-3 outline-none font-semibold" min="1" />
                  <button type="button" onClick={() => setForm({...form, quantity: Number(form.quantity)+1})}
                    className="px-4 py-3 hover:bg-slate-100 text-lg font-medium text-slate-600">+</button>
                </div>
              </div>
            </div>

            {/* 수수료 */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">수수료</label>
              <div className="flex gap-2">
                <div className="flex border border-slate-300 rounded-xl overflow-hidden">
                  <button type="button" onClick={() => setForm({...form, commission_type: 'RATE'})}
                    className={`px-3 py-3 text-sm font-medium transition-colors ${form.commission_type === 'RATE' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}>%</button>
                  <button type="button" onClick={() => setForm({...form, commission_type: 'FIXED'})}
                    className={`px-3 py-3 text-sm font-medium transition-colors ${form.commission_type === 'FIXED' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}>원</button>
                </div>
                {form.commission_type === 'RATE' ? (
                  <input type="number" step="0.1" value={form.commission_rate} onChange={e => setForm({...form, commission_rate: e.target.value})}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right" placeholder="수수료율" />
                ) : (
                  <input type="text" value={form.commission_fixed ? formatNumber(form.commission_fixed) : ''}
                    onChange={e => setForm({...form, commission_fixed: e.target.value.replace(/[^0-9]/g, '')})}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right" placeholder="수수료 금액" />
                )}
              </div>
            </div>

            {/* 가격 입력 모드 전환 */}
            {form.commission_type === 'RATE' && Number(form.commission_rate) > 0 && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-slate-500 mb-2">가격 입력 방식</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPriceMode('supply')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      priceMode === 'supply' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                    }`}>공급가 입력 → 판매가 자동계산</button>
                  <button type="button" onClick={() => setPriceMode('selling')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      priceMode === 'selling' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                    }`}>판매가 직접 입력</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-4">
              {priceMode === 'supply' && form.commission_type === 'RATE' && Number(form.commission_rate) > 0 ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">공급가 (원) <span className="text-indigo-500">← 입력</span></label>
                    <input type="text" value={form.supply_price ? formatNumber(form.supply_price) : ''}
                      onChange={e => setForm({...form, supply_price: e.target.value.replace(/[^0-9]/g, '')})}
                      onFocus={e => { if (e.target.value === '0') setForm({...form, supply_price: ''}) }}
                      className="w-full px-4 py-3 rounded-xl border-2 border-indigo-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium bg-indigo-50/30"
                      placeholder="공급가 입력" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">판매가 (원) <span className="text-emerald-500">← 자동계산</span></label>
                    <div className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-right font-bold text-lg text-emerald-600">
                      {form.selling_price ? formatNumber(form.selling_price) : '-'}
                    </div>
                    {form.supply_price && form.selling_price && (
                      <p className="text-xs text-slate-400 mt-1 text-right">
                        {formatNumber(form.supply_price)} ÷ {(1 - Number(form.commission_rate)/100).toFixed(2)} = {formatNumber(form.selling_price)}원
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">판매가 (원)</label>
                    <input type="text" value={form.selling_price ? formatNumber(form.selling_price) : ''}
                      onChange={e => setForm({...form, selling_price: e.target.value.replace(/[^0-9]/g, '')})}
                      onFocus={e => { if (e.target.value === '0') setForm({...form, selling_price: ''}) }}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium"
                      placeholder="판매가 입력" />
                  </div>
                  <div>
                    {form.commission_type === 'RATE' && Number(form.commission_rate) > 0 && Number(form.selling_price) > 0 && (
                      <>
                        <label className="block text-xs font-medium text-slate-500 mb-1">공급가 (역산)</label>
                        <div className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-right font-medium text-slate-600">
                          {formatNumber(getSupplyPrice())}원
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">배송비 수취 (원)</label>
                <input type="text" value={form.shipping_fee_received ? formatNumber(form.shipping_fee_received) : ''}
                  onChange={e => setForm({...form, shipping_fee_received: e.target.value.replace(/[^0-9]/g, '')})}
                  onFocus={e => { if (e.target.value === '0') setForm({...form, shipping_fee_received: ''}) }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium"
                  placeholder="0 (무료배송)" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">실 배송비 (원) <span className="text-indigo-500">자동매칭</span></label>
                <input type="text" value={form.shipping_cost ? formatNumber(form.shipping_cost) : ''}
                  onChange={e => setForm({...form, shipping_cost: e.target.value.replace(/[^0-9]/g, '')})}
                  onFocus={e => { if (e.target.value === '0') setForm({...form, shipping_cost: ''}) }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium" placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">추가비용 (원)</label>
                <input type="text" value={form.additional_fee ? formatNumber(form.additional_fee) : ''}
                  onChange={e => setForm({...form, additional_fee: e.target.value.replace(/[^0-9]/g, '')})}
                  onFocus={e => { if (e.target.value === '0') setForm({...form, additional_fee: ''}) }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">메모 (선택)</label>
                <input type="text" value={form.memo} onChange={e => setForm({...form, memo: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="비고" />
              </div>
            </div>
          </div>

          {/* 마진 미리보기 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">마진 계산</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1"><span className="text-slate-500">판매금액</span><span className="text-slate-700">{formatNumber(Number(form.selling_price||0)*Number(form.quantity||1))}원</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">+ 배송비 수취</span><span className="text-slate-700">{formatNumber(form.shipping_fee_received)}원</span></div>
              <div className="flex justify-between py-1 font-semibold border-t border-slate-100 pt-2"><span className="text-slate-700">총매출</span><span className="text-indigo-600">{formatNumber(margin.totalRevenue)}원</span></div>
              <div className="flex justify-between py-1 mt-2"><span className="text-slate-500">- 상품원가</span><span className="text-red-500">-{formatNumber(margin.productCost)}원</span></div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">- 수수료 {form.commission_type === 'RATE' ? `(${form.commission_rate}% = ÷${(1-Number(form.commission_rate)/100).toFixed(2)})` : ''}</span>
                <span className="text-red-500">-{formatNumber(margin.commission)}원</span>
              </div>
              <div className="flex justify-between py-1"><span className="text-slate-500">- 배송비</span><span className="text-red-500">-{formatNumber(margin.shippingCost)}원</span></div>
              {margin.additionalFee > 0 && <div className="flex justify-between py-1"><span className="text-slate-500">- 추가비용</span><span className="text-red-500">-{formatNumber(margin.additionalFee)}원</span></div>}
              {priceMode === 'supply' && form.supply_price && (
                <div className="flex justify-between py-1 border-t border-slate-100 pt-2">
                  <span className="text-slate-500">공급가</span>
                  <span className="text-slate-700 font-medium">{formatNumber(form.supply_price)}원</span>
                </div>
              )}
              <div className="flex justify-between py-3 font-bold border-t-2 border-slate-200 mt-2">
                <span className="text-slate-800">순이익</span>
                <span className={margin.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {formatNumber(roundUp10(margin.netProfit))}원 <span className="text-xs font-medium">({margin.marginRate.toFixed(1)}%)</span>
                </span>
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !selectedChannel || !selectedProduct || !form.selling_price}
            className={`w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all ${
              saving || !selectedChannel || !selectedProduct || !form.selling_price ? 'bg-slate-300 cursor-not-allowed'
              : saveSuccess ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99]'
            }`}>{saving ? '저장 중...' : saveSuccess ? '✓ 저장 완료!' : '매출 등록'}</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">엑셀 업로드</h3>
          <div className="mb-6">
            <label className="block text-xs font-medium text-slate-500 mb-2">매출처 선택</label>
            <div className="flex flex-wrap gap-2">
              {channels.map(ch => (
                <button key={ch.id} onClick={() => selectChannel(ch)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedChannel?.id === ch.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>{ch.channel_name}</button>
              ))}
            </div>
          </div>
          <div onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
            <span className="text-4xl mb-4 block">📄</span>
            <p className="text-sm font-medium text-slate-600">클릭하여 엑셀 파일 선택</p>
            <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv 지원</p>
            {excelFileName && <p className="text-sm text-indigo-600 mt-3 font-medium">{excelFileName} ({excelData.length}행)</p>}
          </div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          {excelData.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-slate-700 mb-3">미리보기 (최대 5행)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50">{Object.keys(excelData[0]).map(key => <th key={key} className="px-3 py-2 text-left font-medium text-slate-500 border-b">{key}</th>)}</tr></thead>
                  <tbody>{excelData.slice(0, 5).map((row, i) => <tr key={i} className="border-b border-slate-100">{Object.values(row).map((val, j) => <td key={j} className="px-3 py-2 text-slate-600">{String(val)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SalesInput
