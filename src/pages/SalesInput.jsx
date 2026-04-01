import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

function SalesInput() {
  const [channels, setChannels] = useState([])
  const [products, setProducts] = useState([])
  const [channelProducts, setChannelProducts] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [recentProducts, setRecentProducts] = useState([])
  const [frequentProducts, setFrequentProducts] = useState([])
  const [inputMode, setInputMode] = useState('manual') // 'manual' | 'excel'
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [excelData, setExcelData] = useState([])
  const [excelFileName, setExcelFileName] = useState('')
  const fileInputRef = useRef(null)
  const searchRef = useRef(null)

  const [form, setForm] = useState({
    sale_date: new Date().toISOString().split('T')[0],
    quantity: 1,
    selling_price: '',
    shipping_fee_received: '',
    commission_type: 'RATE',
    commission_rate: '',
    commission_fixed: '',
    shipping_cost: '',
    additional_fee: '',
    memo: '',
  })

  useEffect(() => {
    fetchChannels()
    fetchProducts()
  }, [])

  useEffect(() => {
    if (selectedChannel && selectedProduct) {
      loadChannelProductData()
    }
  }, [selectedChannel, selectedProduct])

  const fetchChannels = async () => {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    setChannels(data || [])
  }

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false })

    setProducts(data || [])
    setFrequentProducts((data || []).slice(0, 4))
    setRecentProducts(
      (data || [])
        .filter(p => p.last_used_at)
        .sort((a, b) => new Date(b.last_used_at) - new Date(a.last_used_at))
        .slice(0, 4)
    )
  }

  const loadChannelProductData = async () => {
    const { data } = await supabase
      .from('channel_products')
      .select('*')
      .eq('channel_id', selectedChannel.id)
      .eq('product_id', selectedProduct.id)
      .eq('is_active', true)
      .single()

    if (data) {
      setForm(prev => ({
        ...prev,
        selling_price: data.selling_price || '',
        shipping_fee_received: data.shipping_fee_to_customer || '',
        commission_type: data.commission_type || selectedChannel.default_commission_type,
        commission_rate: data.commission_rate || selectedChannel.default_commission_rate || '',
        commission_fixed: data.commission_fixed || selectedChannel.default_commission_fixed || '',
        shipping_cost: data.actual_shipping_cost || selectedChannel.default_shipping_cost || '',
        additional_fee: data.additional_channel_fee || '',
      }))
    } else if (selectedChannel) {
      setForm(prev => ({
        ...prev,
        selling_price: '',
        shipping_fee_received: selectedChannel.default_shipping_policy === 'PAID' ? '' : '0',
        commission_type: selectedChannel.default_commission_type,
        commission_rate: selectedChannel.default_commission_rate || '',
        commission_fixed: selectedChannel.default_commission_fixed || '',
        shipping_cost: selectedChannel.default_shipping_cost || '',
        additional_fee: '',
      }))
    }
  }

  const selectChannel = (channel) => {
    setSelectedChannel(channel)
    setForm(prev => ({
      ...prev,
      commission_type: channel.default_commission_type,
      commission_rate: channel.default_commission_rate || '',
      commission_fixed: channel.default_commission_fixed || '',
      shipping_cost: channel.default_shipping_cost || '',
    }))
  }

  const selectProduct = (product) => {
    setSelectedProduct(product)
    setProductSearch(product.product_name)
    setShowProductDropdown(false)
  }

  const filteredProducts = products.filter(p =>
    p.product_name.includes(productSearch) ||
    p.product_code.toLowerCase().includes(productSearch.toLowerCase())
  )

  // 마진 계산
  const calculateMargin = () => {
    const price = Number(form.selling_price) || 0
    const qty = Number(form.quantity) || 1
    const shippingReceived = Number(form.shipping_fee_received) || 0
    const totalRevenue = (price * qty) + shippingReceived

    let commission = 0
    if (form.commission_type === 'RATE') {
      commission = price * qty * (Number(form.commission_rate) || 0) / 100
    } else {
      commission = Number(form.commission_fixed) || 0
    }

    const productCost = selectedProduct ? Number(selectedProduct.total_cost || 0) * qty : 0
    const shippingCost = Number(form.shipping_cost) || 0
    const additionalFee = Number(form.additional_fee) || 0

    const totalCost = productCost + commission + shippingCost + additionalFee
    const netProfit = totalRevenue - totalCost
    const marginRate = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0

    return { totalRevenue, productCost, commission, shippingCost, additionalFee, totalCost, netProfit, marginRate }
  }

  const margin = calculateMargin()

  const handleSave = async () => {
    if (!selectedChannel || !selectedProduct) {
      alert('채널과 제품을 선택해주세요.')
      return
    }
    if (!form.selling_price) {
      alert('판매가를 입력해주세요.')
      return
    }

    setSaving(true)
    const user = (await supabase.auth.getUser()).data.user

    const saleData = {
      channel_id: selectedChannel.id,
      product_id: selectedProduct.id,
      sale_date: form.sale_date,
      quantity: Number(form.quantity) || 1,
      selling_price: Number(form.selling_price),
      shipping_fee_received: Number(form.shipping_fee_received) || 0,
      total_revenue: margin.totalRevenue,
      product_cost: margin.productCost,
      commission_type: form.commission_type,
      commission_rate: form.commission_type === 'RATE' ? Number(form.commission_rate) || 0 : 0,
      commission_fixed: form.commission_type === 'FIXED' ? Number(form.commission_fixed) || 0 : 0,
      commission_amount: margin.commission,
      shipping_cost: margin.shippingCost,
      additional_fee: margin.additionalFee,
      total_cost: margin.totalCost,
      net_profit: margin.netProfit,
      margin_rate: Number(margin.marginRate.toFixed(1)),
      memo: form.memo || null,
      input_method: 'MANUAL',
      created_by: user.id,
      updated_by: user.id,
    }

    const { error } = await supabase.from('sales').insert(saleData)

    if (error) {
      alert('저장 실패: ' + error.message)
    } else {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)

      // 채널별 제품 정보 저장/업데이트
      const { data: existing } = await supabase
        .from('channel_products')
        .select('id')
        .eq('channel_id', selectedChannel.id)
        .eq('product_id', selectedProduct.id)
        .eq('is_active', true)
        .single()

      const cpData = {
        channel_id: selectedChannel.id,
        product_id: selectedProduct.id,
        selling_price: Number(form.selling_price),
        commission_type: form.commission_type,
        commission_rate: Number(form.commission_rate) || 0,
        commission_fixed: Number(form.commission_fixed) || 0,
        shipping_policy: selectedChannel.default_shipping_policy,
        shipping_fee_to_customer: Number(form.shipping_fee_received) || 0,
        actual_shipping_cost: Number(form.shipping_cost) || 0,
        additional_channel_fee: Number(form.additional_fee) || 0,
      }

      if (existing) {
        await supabase.from('channel_products').update(cpData).eq('id', existing.id)
      } else {
        cpData.created_by = user.id
        cpData.effective_from = new Date().toISOString().split('T')[0]
        await supabase.from('channel_products').insert(cpData)
      }

      // 폼 일부 초기화 (채널은 유지)
      setSelectedProduct(null)
      setProductSearch('')
      setForm(prev => ({
        ...prev,
        quantity: 1,
        selling_price: '',
        shipping_fee_received: '',
        additional_fee: '',
        memo: '',
      }))
      fetchProducts()
    }
    setSaving(false)
  }

  // 엑셀 업로드
  const handleExcelUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

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

  const formatNumber = (num) => Number(num || 0).toLocaleString()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 입력 모드 선택 */}
      <div className="flex gap-3">
        <button
          onClick={() => setInputMode('manual')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            inputMode === 'manual'
              ? 'bg-indigo-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          ✏️ 수기 입력
        </button>
        <button
          onClick={() => setInputMode('excel')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            inputMode === 'excel'
              ? 'bg-indigo-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          📊 엑셀 업로드
        </button>
      </div>

      {inputMode === 'manual' ? (
        <div className="space-y-6">
          {/* STEP 1: 채널 선택 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">❶ 판매 채널 선택</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {channels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => selectChannel(ch)}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${
                    selectedChannel?.id === ch.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: ch.color_code }}
                  >
                    {ch.channel_name.slice(0, 1)}
                  </div>
                  <p className="text-sm font-medium text-slate-700">{ch.channel_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    수수료 {ch.default_commission_type === 'RATE' ? `${ch.default_commission_rate}%` : `${formatNumber(ch.default_commission_fixed)}원`}
                  </p>
                </button>
              ))}
            </div>
            {channels.length === 0 && (
              <p className="text-center text-slate-400 py-8">채널을 먼저 등록해주세요. (채널 관리 메뉴)</p>
            )}
          </div>

          {/* STEP 2: 제품 선택 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">❷ 제품 선택</h3>

            {/* 검색 */}
            <div className="relative" ref={searchRef}>
              <input
                type="text"
                value={productSearch}
                onChange={e => {
                  setProductSearch(e.target.value)
                  setShowProductDropdown(true)
                  if (selectedProduct && e.target.value !== selectedProduct.product_name) {
                    setSelectedProduct(null)
                  }
                }}
                onFocus={() => setShowProductDropdown(true)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                placeholder="🔍 제품명 또는 코드로 검색..."
              />

              {showProductDropdown && !selectedProduct && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-80 overflow-y-auto">
                  {productSearch === '' && (
                    <>
                      {frequentProducts.length > 0 && (
                        <div className="p-3">
                          <p className="text-xs font-semibold text-slate-400 mb-2 px-2">⭐ 자주 사용하는 제품</p>
                          {frequentProducts.map(p => (
                            <button
                              key={p.id}
                              onClick={() => selectProduct(p)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg transition-colors text-left"
                            >
                              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">
                                {p.product_name.slice(0, 1)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{p.product_name}</p>
                                <p className="text-xs text-slate-400">{p.product_code} · 원가 {formatNumber(p.total_cost)}원</p>
                              </div>
                              <span className="text-xs text-slate-400">{p.usage_count}회</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {recentProducts.length > 0 && (
                        <div className="p-3 border-t border-slate-100">
                          <p className="text-xs font-semibold text-slate-400 mb-2 px-2">🕐 최근 사용한 제품</p>
                          {recentProducts.map(p => (
                            <button
                              key={p.id}
                              onClick={() => selectProduct(p)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg transition-colors text-left"
                            >
                              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-xs font-bold text-slate-600">
                                {p.product_name.slice(0, 1)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{p.product_name}</p>
                                <p className="text-xs text-slate-400">{p.product_code} · 원가 {formatNumber(p.total_cost)}원</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {productSearch !== '' && (
                    <div className="p-3">
                      {filteredProducts.length > 0 ? filteredProducts.slice(0, 10).map(p => (
                        <button
                          key={p.id}
                          onClick={() => selectProduct(p)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg transition-colors text-left"
                        >
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">
                            {p.product_name.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">{p.product_name}</p>
                            <p className="text-xs text-slate-400">{p.product_code} · 원가 {formatNumber(p.total_cost)}원</p>
                          </div>
                        </button>
                      )) : (
                        <p className="text-sm text-slate-400 text-center py-4">검색 결과가 없습니다.</p>
                      )}
                    </div>
                  )}
                  {products.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-4">제품을 먼저 등록해주세요. (제품 관리 메뉴)</p>
                  )}
                </div>
              )}
            </div>

            {/* 선택된 제품 표시 */}
            {selectedProduct && (
              <div className="mt-3 bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-700">{selectedProduct.product_name}</p>
                  <p className="text-xs text-indigo-500 mt-0.5">{selectedProduct.product_code} · 원가 {formatNumber(selectedProduct.total_cost)}원</p>
                </div>
                <button
                  onClick={() => { setSelectedProduct(null); setProductSearch('') }}
                  className="text-indigo-400 hover:text-indigo-600 text-lg"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* STEP 3: 매출 상세 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">❸ 매출 상세</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">매출일자</label>
                <input
                  type="date"
                  value={form.sale_date}
                  onChange={e => setForm({ ...form, sale_date: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">수량</label>
                <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, quantity: Math.max(1, Number(form.quantity) - 1) })}
                    className="px-4 py-3 hover:bg-slate-100 text-lg font-medium text-slate-600"
                  >−</button>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={e => setForm({ ...form, quantity: e.target.value })}
                    className="flex-1 text-center py-3 outline-none font-semibold"
                    min="1"
                  />
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, quantity: Number(form.quantity) + 1 })}
                    className="px-4 py-3 hover:bg-slate-100 text-lg font-medium text-slate-600"
                  >+</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  판매가 (원)
                  {form.selling_price && <span className="text-indigo-500 ml-1">자동입력됨</span>}
                </label>
                <input
                  type="text"
                  value={form.selling_price ? formatNumber(form.selling_price) : ''}
                  onChange={e => setForm({ ...form, selling_price: e.target.value.replace(/[^0-9]/g, '') })}
                  onFocus={e => { if (e.target.value === '0') setForm({ ...form, selling_price: '' }) }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium"
                  placeholder="판매가 입력"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">고객 배송비 (원)</label>
                <input
                  type="text"
                  value={form.shipping_fee_received ? formatNumber(form.shipping_fee_received) : ''}
                  onChange={e => setForm({ ...form, shipping_fee_received: e.target.value.replace(/[^0-9]/g, '') })}
                  onFocus={e => { if (e.target.value === '0') setForm({ ...form, shipping_fee_received: '' }) }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium"
                  placeholder="0 (무료배송)"
                />
              </div>
            </div>

            {/* 수수료 */}
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">수수료</label>
              <div className="flex gap-2">
                <div className="flex border border-slate-300 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, commission_type: 'RATE' })}
                    className={`px-3 py-3 text-sm font-medium transition-colors ${
                      form.commission_type === 'RATE' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >%</button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, commission_type: 'FIXED' })}
                    className={`px-3 py-3 text-sm font-medium transition-colors ${
                      form.commission_type === 'FIXED' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >원</button>
                </div>
                {form.commission_type === 'RATE' ? (
                  <input
                    type="number"
                    step="0.1"
                    value={form.commission_rate}
                    onChange={e => setForm({ ...form, commission_rate: e.target.value })}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right"
                    placeholder="수수료율"
                  />
                ) : (
                  <input
                    type="text"
                    value={form.commission_fixed ? formatNumber(form.commission_fixed) : ''}
                    onChange={e => setForm({ ...form, commission_fixed: e.target.value.replace(/[^0-9]/g, '') })}
                    onFocus={e => { if (e.target.value === '0') setForm({ ...form, commission_fixed: '' }) }}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right"
                    placeholder="수수료 금액"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">실제 택배비 (원)</label>
                <input
                  type="text"
                  value={form.shipping_cost ? formatNumber(form.shipping_cost) : ''}
                  onChange={e => setForm({ ...form, shipping_cost: e.target.value.replace(/[^0-9]/g, '') })}
                  onFocus={e => { if (e.target.value === '0') setForm({ ...form, shipping_cost: '' }) }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">추가비용 (원)</label>
                <input
                  type="text"
                  value={form.additional_fee ? formatNumber(form.additional_fee) : ''}
                  onChange={e => setForm({ ...form, additional_fee: e.target.value.replace(/[^0-9]/g, '') })}
                  onFocus={e => { if (e.target.value === '0') setForm({ ...form, additional_fee: '' }) }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-right font-medium"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">메모 (선택)</label>
              <input
                type="text"
                value={form.memo}
                onChange={e => setForm({ ...form, memo: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                placeholder="예: 프로모션 가격, 특이사항 등"
              />
            </div>
          </div>

          {/* 마진 미리보기 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">💰 마진 미리보기</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">판매가 × 수량</span>
                <span className="text-slate-700">{formatNumber(Number(form.selling_price || 0) * Number(form.quantity || 1))}원</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">+ 고객 배송비</span>
                <span className="text-slate-700">{formatNumber(form.shipping_fee_received)}원</span>
              </div>
              <div className="flex justify-between py-1 font-semibold border-t border-slate-100 pt-2">
                <span className="text-slate-700">총 수입</span>
                <span className="text-indigo-600">{formatNumber(margin.totalRevenue)}원</span>
              </div>

              <div className="flex justify-between py-1 mt-2">
                <span className="text-slate-500">- 제품 원가</span>
                <span className="text-red-500">-{formatNumber(margin.productCost)}원</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">- 수수료 ({form.commission_type === 'RATE' ? `${form.commission_rate || 0}%` : '고정'})</span>
                <span className="text-red-500">-{formatNumber(Math.round(margin.commission))}원</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">- 택배비</span>
                <span className="text-red-500">-{formatNumber(margin.shippingCost)}원</span>
              </div>
              {margin.additionalFee > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">- 추가비용</span>
                  <span className="text-red-500">-{formatNumber(margin.additionalFee)}원</span>
                </div>
              )}

              <div className="flex justify-between py-3 font-bold border-t-2 border-slate-200 mt-2">
                <span className="text-slate-800">순이익</span>
                <span className={margin.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {formatNumber(Math.round(margin.netProfit))}원
                  <span className="text-xs font-medium ml-1">({margin.marginRate.toFixed(1)}%)</span>
                </span>
              </div>
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={saving || !selectedChannel || !selectedProduct || !form.selling_price}
            className={`w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all ${
              saving || !selectedChannel || !selectedProduct || !form.selling_price
                ? 'bg-slate-300 cursor-not-allowed'
                : saveSuccess
                  ? 'bg-emerald-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99]'
            }`}
          >
            {saving ? '저장 중...' : saveSuccess ? '✓ 저장 완료!' : '매출 저장'}
          </button>
        </div>
      ) : (
        /* 엑셀 업로드 모드 */
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">엑셀 파일 업로드</h3>

          {/* 채널 선택 */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-slate-500 mb-2">업로드할 채널 선택</label>
            <div className="flex flex-wrap gap-2">
              {channels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => selectChannel(ch)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedChannel?.id === ch.id
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {ch.channel_name}
                </button>
              ))}
            </div>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
          >
            <span className="text-4xl mb-4 block">📂</span>
            <p className="text-sm font-medium text-slate-600">클릭하여 엑셀 파일 선택</p>
            <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv 지원</p>
            {excelFileName && (
              <p className="text-sm text-indigo-600 mt-3 font-medium">{excelFileName} ({excelData.length}행)</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelUpload}
            className="hidden"
          />

          {excelData.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-slate-700 mb-3">미리보기 (처음 5행)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      {Object.keys(excelData[0]).map(key => (
                        <th key={key} className="px-3 py-2 text-left font-medium text-slate-500 border-b">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-2 text-slate-600">{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-2">전체 {excelData.length}행 중 5행 표시</p>

              <div className="mt-4 p-4 bg-amber-50 rounded-xl">
                <p className="text-sm text-amber-800">
                  ⚠️ 엑셀 매핑 기능은 채널별 컬럼 매핑 설정 후 사용 가능합니다.
                  현재는 미리보기만 지원됩니다.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SalesInput
