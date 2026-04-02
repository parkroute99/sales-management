import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const roundUp10 = (num) => Math.ceil(num / 10) * 10

function SalesInput() {
  const [channels, setChannels] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [inputMode, setInputMode] = useState('manual')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [excelData, setExcelData] = useState([])
  const [excelFileName, setExcelFileName] = useState('')
  const fileInputRef = useRef(null)

  // 다중 제품 리스트
  const [saleItems, setSaleItems] = useState([createEmptyItem()])
  const [activeItemIdx, setActiveItemIdx] = useState(0)

  // 공통 정보
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0])
  const [memo, setMemo] = useState('')

  // 제품 검색
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [searchItemIdx, setSearchItemIdx] = useState(null)

  function createEmptyItem() {
    return {
      product: null, productSearch: '',
      quantity: 1, priceMode: 'supply', supply_price: '', selling_price: '',
      shipping_fee_received: '', commission_type: 'RATE', commission_rate: '',
      commission_fixed: '', shipping_cost: '', additional_fee: '',
    }
  }

  useEffect(() => { fetchChannels(); fetchSuppliers(); fetchProducts() }, [])

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

  const selectChannel = (ch) => {
    setSelectedChannel(ch)
    setSaleItems(prev => prev.map(item => ({
      ...item,
      commission_type: ch.default_commission_type,
      commission_rate: ch.default_commission_rate || '',
      commission_fixed: ch.default_commission_fixed || '',
      shipping_cost: item.shipping_cost || ch.default_shipping_cost || '',
    })))
  }

  const loadChannelProductData = async (itemIdx, product) => {
    if (!selectedChannel || !product) return
    const { data } = await supabase.from('channel_products').select('*')
      .eq('channel_id', selectedChannel.id).eq('product_id', product.id)
      .eq('is_active', true).single()

    setSaleItems(prev => {
      const next = [...prev]
      if (data) {
        next[itemIdx] = {
          ...next[itemIdx],
          selling_price: data.selling_price || '',
          shipping_fee_received: data.shipping_fee_to_customer || '',
          commission_type: data.commission_type || selectedChannel.default_commission_type,
          commission_rate: data.commission_rate || selectedChannel.default_commission_rate || '',
          commission_fixed: data.commission_fixed || selectedChannel.default_commission_fixed || '',
          shipping_cost: data.product_shipping_cost || data.actual_shipping_cost || selectedChannel.default_shipping_cost || '',
          additional_fee: data.additional_channel_fee || '',
        }
      } else if (selectedChannel) {
        next[itemIdx] = {
          ...next[itemIdx],
          selling_price: '',
          shipping_fee_received: selectedChannel.default_shipping_policy === 'PAID' ? '' : '0',
          commission_type: selectedChannel.default_commission_type,
          commission_rate: selectedChannel.default_commission_rate || '',
          commission_fixed: selectedChannel.default_commission_fixed || '',
          shipping_cost: selectedChannel.default_shipping_cost || '',
          additional_fee: '',
        }
      }
      return next
    })
  }

  const selectProduct = (itemIdx, p) => {
    setSaleItems(prev => {
      const next = [...prev]
      next[itemIdx] = { ...next[itemIdx], product: p, productSearch: p.product_name }
      return next
    })
    setShowProductDropdown(false)
    setSearchItemIdx(null)
    loadChannelProductData(itemIdx, p)
  }

  const updateItem = (idx, field, value) => {
    setSaleItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }

      // 공급가 → 판매가 자동계산
      if (field === 'supply_price' || field === 'commission_rate' || field === 'commission_type') {
        const item = next[idx]
        if (item.priceMode === 'supply' && item.commission_type === 'RATE') {
          const supply = Number(field === 'supply_price' ? value : item.supply_price) || 0
          const rate = Number(field === 'commission_rate' ? value : item.commission_rate) || 0
          if (supply > 0 && rate > 0 && rate < 100) {
            next[idx].selling_price = String(roundUp10(supply / (1 - rate / 100)))
          }
        }
      }

      return next
    })
  }

  const addSaleItem = () => {
    const newItem = createEmptyItem()
    if (selectedChannel) {
      newItem.commission_type = selectedChannel.default_commission_type
      newItem.commission_rate = selectedChannel.default_commission_rate || ''
      newItem.commission_fixed = selectedChannel.default_commission_fixed || ''
      newItem.shipping_cost = selectedChannel.default_shipping_cost || ''
    }
    setSaleItems(prev => [...prev, newItem])
    setActiveItemIdx(saleItems.length)
  }

  const removeSaleItem = (idx) => {
    if (saleItems.length <= 1) return
    setSaleItems(prev => prev.filter((_, i) => i !== idx))
    if (activeItemIdx >= idx && activeItemIdx > 0) setActiveItemIdx(activeItemIdx - 1)
  }

  const filteredProducts = products.filter(p =>
    p.product_name.includes(productSearch) || (p.product_code && p.product_code.toLowerCase().includes(productSearch.toLowerCase()))
  )
  const frequentProducts = products.slice(0, 6)

  // 개별 아이템 마진 계산
  const calcItemMargin = (item) => {
    const price = Number(item.selling_price) || 0
    const qty = Number(item.quantity) || 1
    const shippingReceived = Number(item.shipping_fee_received) || 0
    const totalRevenue = roundUp10((price * qty) + shippingReceived)

    let commission = 0
    if (item.commission_type === 'RATE') {
      const rate = Number(item.commission_rate) || 0
      commission = roundUp10(price * qty * rate / 100)
    } else {
      commission = roundUp10(Number(item.commission_fixed) || 0)
    }

    const productCost = item.product ? roundUp10(Number(item.product.total_cost || 0) * qty) : 0
    const shippingCost = roundUp10(Number(item.shipping_cost) || 0)
    const additionalFee = roundUp10(Number(item.additional_fee) || 0)
    const supplyPrice = Number(item.supply_price) || 0
    const supplyTotal = roundUp10(supplyPrice * qty)
    const supplyPlusShipping = supplyTotal + shippingReceived
    const totalCost = productCost + commission + shippingCost + additionalFee
    const netProfit = totalRevenue - totalCost
    const marginRate = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0
    return { totalRevenue, productCost, commission, shippingCost, additionalFee, totalCost, netProfit, marginRate, supplyTotal, supplyPlusShipping, shippingReceived }
  }

  // 전체 합계
  const calcTotalMargin = () => {
    let totalRevenue = 0, totalProductCost = 0, totalCommission = 0, totalShippingCost = 0,
      totalAdditionalFee = 0, totalCost = 0, totalNetProfit = 0, totalSupply = 0,
      totalSupplyPlusShipping = 0, totalShippingReceived = 0
    saleItems.forEach(item => {
      const m = calcItemMargin(item)
      totalRevenue += m.totalRevenue
      totalProductCost += m.productCost
      totalCommission += m.commission
      totalShippingCost += m.shippingCost
      totalAdditionalFee += m.additionalFee
      totalCost += m.totalCost
      totalNetProfit += m.netProfit
      totalSupply += m.supplyTotal
      totalSupplyPlusShipping += m.supplyPlusShipping
      totalShippingReceived += m.shippingReceived
    })
    const marginRate = totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100) : 0
    return { totalRevenue, totalProductCost, totalCommission, totalShippingCost, totalAdditionalFee, totalCost, totalNetProfit, marginRate, totalSupply, totalSupplyPlusShipping, totalShippingReceived }
  }

  const getSupplyPrice = (item) => {
    const price = Number(item.selling_price) || 0
    const rate = Number(item.commission_rate) || 0
    if (price > 0 && rate > 0 && item.commission_type === 'RATE') {
      return roundUp10(price * (1 - rate / 100))
    }
    return 0
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()
  const totalMargin = calcTotalMargin()

  const handleSave = async () => {
    const validItems = saleItems.filter(item => item.product && item.selling_price)
    if (!selectedChannel) { alert('매출처를 선택해주세요.'); return }
    if (validItems.length === 0) { alert('제품을 최소 1개 선택하고 판매가를 입력해주세요.'); return }

    // 원가 체크
    const noCostItems = validItems.filter(item => !item.product.total_cost || Number(item.product.total_cost) === 0)
    if (noCostItems.length > 0) {
      const names = noCostItems.map(i => i.product.product_name).join(', ')
      if (!window.confirm(`다음 제품의 원가가 0원입니다: ${names}\n계속 저장하시겠습니까?`)) return
    }

    setSaving(true)
    const user = (await supabase.auth.getUser()).data.user
    let successCount = 0

    for (const item of validItems) {
      const m = calcItemMargin(item)
      const saleData = {
        channel_id: selectedChannel.id, product_id: item.product.id,
        supplier_id: selectedSupplier?.id || null,
        sale_date: saleDate, quantity: Number(item.quantity) || 1,
        selling_price: Number(item.selling_price),
        shipping_fee_received: Number(item.shipping_fee_received) || 0,
        total_revenue: m.totalRevenue, product_cost: m.productCost,
        commission_type: item.commission_type,
        commission_rate: item.commission_type === 'RATE' ? Number(item.commission_rate) || 0 : 0,
        commission_fixed: item.commission_type === 'FIXED' ? Number(item.commission_fixed) || 0 : 0,
        commission_amount: m.commission, shipping_cost: m.shippingCost,
        additional_fee: m.additionalFee, total_cost: m.totalCost,
        net_profit: m.netProfit, margin_rate: Number(m.marginRate.toFixed(1)),
        memo: memo || null, input_method: 'MANUAL',
        created_by: user.id, updated_by: user.id,
      }

      const { error } = await supabase.from('sales').insert(saleData)
      if (!error) {
        successCount++
        // channel_products 업데이트
        const { data: existing } = await supabase.from('channel_products').select('id')
          .eq('channel_id', selectedChannel.id).eq('product_id', item.product.id).eq('is_active', true).single()
        const cpData = {
          channel_id: selectedChannel.id, product_id: item.product.id,
          selling_price: Number(item.selling_price),
          commission_type: item.commission_type,
          commission_rate: Number(item.commission_rate) || 0,
          commission_fixed: Number(item.commission_fixed) || 0,
          shipping_policy: selectedChannel.default_shipping_policy,
          shipping_fee_to_customer: Number(item.shipping_fee_received) || 0,
          actual_shipping_cost: Number(item.shipping_cost) || 0,
          product_shipping_cost: Number(item.shipping_cost) || 0,
          additional_channel_fee: Number(item.additional_fee) || 0,
        }
        if (existing) await supabase.from('channel_products').update(cpData).eq('id', existing.id)
        else { cpData.created_by = user.id; cpData.effective_from = new Date().toISOString().split('T')[0]; await supabase.from('channel_products').insert(cpData) }
      }
    }

    if (successCount > 0) {
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 2000)
      alert(`${successCount}건 매출이 등록되었습니다.`)
      setSaleItems([createEmptyItem()])
      setActiveItemIdx(0)
      setMemo('')
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
    <div className="max-w-5xl mx-auto space-y-6">
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

          {/* ❶ 매출처 선택 */}
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

          {/* ❷ 매입처 선택 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">❷ 매입처 선택 <span className="text-xs text-slate-400 font-normal">(선택사항)</span></h3>
            <div className="flex flex-wrap gap-2 mt-3">
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

          {/* 공통: 날짜 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-semibold text-slate-800">매출일자</label>
              <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
            </div>
          </div>

          {/* ❸ 제품 목록 (다중) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">❸ 제품 등록 ({saleItems.length}개)</h3>
              <button onClick={addSaleItem}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 제품 추가</button>
            </div>

            {/* 제품 탭 */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {saleItems.map((item, idx) => (
                <button key={idx} onClick={() => setActiveItemIdx(idx)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border whitespace-nowrap transition-colors ${
                    activeItemIdx === idx ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>
                  <span>{item.product ? item.product.product_name : `제품 ${idx + 1}`}</span>
                  {item.product && <span className="text-xs text-slate-400">({formatNumber(item.selling_price)}원)</span>}
                  {saleItems.length > 1 && (
                    <span onClick={(e) => { e.stopPropagation(); removeSaleItem(idx) }}
                      className="ml-1 text-red-400 hover:text-red-600">✕</span>
                  )}
                </button>
              ))}
            </div>

            {/* 활성 제품 상세 */}
            {saleItems[activeItemIdx] && (() => {
              const item = saleItems[activeItemIdx]
              const idx = activeItemIdx
              const itemMargin = calcItemMargin(item)

              return (
                <div className="space-y-4 border-t border-slate-100 pt-4">
                  {/* 제품 검색 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">제품 선택</label>
                    <div className="relative">
                      <input type="text" value={item.productSearch}
                        onChange={e => {
                          updateItem(idx, 'productSearch', e.target.value)
                          setProductSearch(e.target.value)
                          setSearchItemIdx(idx)
                          setShowProductDropdown(true)
                          if (item.product && e.target.value !== item.product.product_name) updateItem(idx, 'product', null)
                        }}
                        onFocus={() => { setSearchItemIdx(idx); setShowProductDropdown(true); setProductSearch(item.productSearch) }}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        placeholder="제품명 또는 코드로 검색..." />
                      {showProductDropdown && searchItemIdx === idx && !item.product && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-80 overflow-y-auto">
                          {productSearch === '' ? (
                            <div className="p-3">
                              <p className="text-xs font-semibold text-slate-400 mb-2 px-2">🔥 자주 사용</p>
                              {frequentProducts.map(p => (
                                <button key={p.id} onClick={() => selectProduct(idx, p)}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg text-left">
                                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">{p.product_name.slice(0,1)}</div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">{p.product_name}</p>
                                    <p className="text-xs text-slate-400">{p.product_code} · 원가 <span className="text-red-500 font-semibold">{formatNumber(p.total_cost)}원</span></p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="p-3">
                              {filteredProducts.length > 0 ? filteredProducts.slice(0,10).map(p => (
                                <button key={p.id} onClick={() => selectProduct(idx, p)}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 rounded-lg text-left">
                                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-xs font-bold text-indigo-600">{p.product_name.slice(0,1)}</div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">{p.product_name}</p>
                                    <p className="text-xs text-slate-400">{p.product_code} · 원가 <span className="text-red-500 font-semibold">{formatNumber(p.total_cost)}원</span></p>
                                  </div>
                                </button>
                              )) : <p className="text-sm text-slate-400 text-center py-4">검색 결과 없음</p>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 선택된 제품 - 원가 표시 */}
                    {item.product && (
                      <div className="mt-3 bg-indigo-50 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-indigo-700">{item.product.product_name}</p>
                            <p className="text-xs text-indigo-500 mt-0.5">{item.product.product_code}</p>
                          </div>
                          <button onClick={() => { updateItem(idx, 'product', null); updateItem(idx, 'productSearch', '') }}
                            className="text-indigo-400 hover:text-indigo-600 text-lg">✕</button>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-slate-400">원가 (개당)</p>
                            <p className="text-lg font-bold text-red-600">{formatNumber(item.product.total_cost)}원</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-slate-400">매입가</p>
                            <p className="text-sm font-medium text-slate-600">{formatNumber(item.product.purchase_cost)}원</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-slate-400">포장+추가</p>
                            <p className="text-sm font-medium text-slate-600">{formatNumber((Number(item.product.packaging_cost)||0)+(Number(item.product.additional_cost)||0))}원</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 수량 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">수량</label>
                    <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden w-48">
                      <button type="button" onClick={() => updateItem(idx, 'quantity', Math.max(1, Number(item.quantity)-1))}
                        className="px-4 py-3 hover:bg-slate-100 text-lg font-medium text-slate-600">−</button>
                      <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        className="flex-1 text-center py-3 outline-none font-semibold" min="1" />
                      <button type="button" onClick={() => updateItem(idx, 'quantity', Number(item.quantity)+1)}
                        className="px-4 py-3 hover:bg-slate-100 text-lg font-medium text-slate-600">+</button>
                    </div>
                    {item.product && Number(item.quantity) > 1 && (
                      <p className="text-xs text-slate-400 mt-1">원가 합계: {formatNumber(Number(item.product.total_cost) * Number(item.quantity))}원</p>
                    )}
                  </div>

                  {/* 수수료 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">수수료</label>
                    <div className="flex gap-2">
                      <div className="flex border border-slate-300 rounded-xl overflow-hidden">
                        <button type="button" onClick={() => updateItem(idx, 'commission_type', 'RATE')}
                          className={`px-3 py-3 text-sm font-medium transition-colors ${item.commission_type === 'RATE' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}>%</button>
                        <button type="button" onClick={() => updateItem(idx, 'commission_type', 'FIXED')}
                          className={`px-3 py-3 text-sm font-medium transition-colors ${item.commission_type === 'FIXED' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}>원</button>
                      </div>
                      {item.commission_type === 'RATE' ? (
                        <input type="number" step="0.1" value={item.commission_rate} onChange={e => updateItem(idx, 'commission_rate', e.target.value)}
                          className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-right" placeholder="수수료율" />
                      ) : (
                        <input type="text" value={item.commission_fixed ? formatNumber(item.commission_fixed) : ''}
                          onChange={e => updateItem(idx, 'commission_fixed', e.target.value.replace(/[^0-9]/g, ''))}
                          className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-right" placeholder="수수료 금액" />
                      )}
                    </div>
                  </div>

                  {/* 가격 입력 모드 */}
                  {item.commission_type === 'RATE' && Number(item.commission_rate) > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-2">가격 입력 방식</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => updateItem(idx, 'priceMode', 'supply')}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                            item.priceMode === 'supply' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                          }`}>공급가 입력 → 판매가 자동</button>
                        <button type="button" onClick={() => updateItem(idx, 'priceMode', 'selling')}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                            item.priceMode === 'selling' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                          }`}>판매가 직접 입력</button>
                      </div>
                    </div>
                  )}

                  {/* 공급가 / 판매가 */}
                  <div className="grid grid-cols-2 gap-4">
                    {item.priceMode === 'supply' && item.commission_type === 'RATE' && Number(item.commission_rate) > 0 ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">공급가 (원) <span className="text-indigo-500">← 입력</span></label>
                          <input type="text" value={item.supply_price ? formatNumber(item.supply_price) : ''}
                            onChange={e => updateItem(idx, 'supply_price', e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-full px-4 py-3 rounded-xl border-2 border-indigo-400 focus:border-indigo-500 outline-none text-right font-medium bg-indigo-50/30"
                            placeholder="공급가 입력" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">판매가 (원) <span className="text-emerald-500">← 자동계산</span></label>
                          <div className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-right font-bold text-lg text-emerald-600">
                            {item.selling_price ? formatNumber(item.selling_price) : '-'}
                          </div>
                          {item.supply_price && item.selling_price && (
                            <p className="text-xs text-slate-400 mt-1 text-right">
                              {formatNumber(item.supply_price)} ÷ {(1 - Number(item.commission_rate)/100).toFixed(2)} = {formatNumber(item.selling_price)}원
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">판매가 (원)</label>
                          <input type="text" value={item.selling_price ? formatNumber(item.selling_price) : ''}
                            onChange={e => updateItem(idx, 'selling_price', e.target.value.replace(/[^0-9]/g, ''))}
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-right font-medium"
                            placeholder="판매가 입력" />
                        </div>
                        <div>
                          {item.commission_type === 'RATE' && Number(item.commission_rate) > 0 && Number(item.selling_price) > 0 && (
                            <>
                              <label className="block text-xs font-medium text-slate-500 mb-1">공급가 (역산)</label>
                              <div className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-right font-medium text-slate-600">
                                {formatNumber(getSupplyPrice(item))}원
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 배송비 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">배송비 수취 (원)</label>
                      <input type="text" value={item.shipping_fee_received ? formatNumber(item.shipping_fee_received) : ''}
                        onChange={e => updateItem(idx, 'shipping_fee_received', e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-right font-medium"
                        placeholder="0 (무료배송)" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">실 배송비 (원)</label>
                      <input type="text" value={item.shipping_cost ? formatNumber(item.shipping_cost) : ''}
                        onChange={e => updateItem(idx, 'shipping_cost', e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-right font-medium"
                        placeholder="0" />
                    </div>
                  </div>

                  {/* 추가비용 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">추가비용 (원)</label>
                    <input type="text" value={item.additional_fee ? formatNumber(item.additional_fee) : ''}
                      onChange={e => updateItem(idx, 'additional_fee', e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-right font-medium"
                      placeholder="0" />
                  </div>

                  {/* 개별 마진 미리보기 */}
                  {item.product && item.selling_price && (
                    <div className="bg-slate-50 rounded-xl p-4 mt-2">
                      <p className="text-xs font-semibold text-slate-500 mb-2">📊 이 제품 마진</p>
                      <div className="grid grid-cols-4 gap-3 text-center">
                        <div>
                          <p className="text-xs text-slate-400">총매출</p>
                          <p className="text-sm font-bold text-slate-700">{formatNumber(itemMargin.totalRevenue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">공급가+배송비수취</p>
                          <p className="text-sm font-bold text-blue-600">{formatNumber(itemMargin.supplyPlusShipping)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">총비용</p>
                          <p className="text-sm font-bold text-red-500">{formatNumber(itemMargin.totalCost)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">순이익</p>
                          <p className={`text-sm font-bold ${itemMargin.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatNumber(itemMargin.netProfit)} ({itemMargin.marginRate.toFixed(1)}%)
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* 메모 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <label className="block text-xs font-medium text-slate-500 mb-1">메모 (선택)</label>
            <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="비고" />
          </div>

          {/* 전체 마진 계산 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">💰 전체 마진 계산 ({saleItems.filter(i=>i.product).length}개 제품)</h3>

            {/* 제품별 요약 */}
            {saleItems.filter(i => i.product && i.selling_price).length > 1 && (
              <div className="mb-4 space-y-2">
                {saleItems.filter(i => i.product && i.selling_price).map((item, i) => {
                  const m = calcItemMargin(item)
                  return (
                    <div key={i} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg text-sm">
                      <span className="text-slate-700 font-medium">{item.product.product_name} ×{item.quantity}</span>
                      <div className="flex gap-4 text-xs">
                        <span className="text-slate-500">매출 {formatNumber(m.totalRevenue)}</span>
                        <span className="text-blue-600 font-medium">공급가+배송 {formatNumber(m.supplyPlusShipping)}</span>
                        <span className={m.netProfit >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>이익 {formatNumber(m.netProfit)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">판매금액 합계</span>
                <span className="text-slate-700">{formatNumber(totalMargin.totalRevenue - totalMargin.totalShippingReceived)}원</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">+ 배송비 수취 합계</span>
                <span className="text-slate-700">{formatNumber(totalMargin.totalShippingReceived)}원</span>
              </div>
              <div className="flex justify-between py-1 font-semibold border-t border-slate-100 pt-2">
                <span className="text-slate-700">총매출</span>
                <span className="text-indigo-600">{formatNumber(totalMargin.totalRevenue)}원</span>
              </div>

              <div className="flex justify-between py-2 mt-2 bg-blue-50 rounded-lg px-3">
                <span className="text-blue-700 font-medium">공급가 합계</span>
                <span className="text-blue-700 font-bold">{formatNumber(totalMargin.totalSupply)}원</span>
              </div>
              <div className="flex justify-between py-2 bg-blue-50 rounded-lg px-3">
                <span className="text-blue-700 font-medium">공급가 + 배송비수취</span>
                <span className="text-blue-700 font-bold">{formatNumber(totalMargin.totalSupplyPlusShipping)}원</span>
              </div>

              <div className="flex justify-between py-1 mt-2">
                <span className="text-slate-500">- 상품원가</span>
                <span className="text-red-500">-{formatNumber(totalMargin.totalProductCost)}원</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">- 수수료</span>
                <span className="text-red-500">-{formatNumber(totalMargin.totalCommission)}원</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">- 배송비</span>
                <span className="text-red-500">-{formatNumber(totalMargin.totalShippingCost)}원</span>
              </div>
              {totalMargin.totalAdditionalFee > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">- 추가비용</span>
                  <span className="text-red-500">-{formatNumber(totalMargin.totalAdditionalFee)}원</span>
                </div>
              )}

              <div className="flex justify-between py-3 font-bold border-t-2 border-slate-200 mt-2">
                <span className="text-slate-800">순이익</span>
                <span className={totalMargin.totalNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {formatNumber(roundUp10(totalMargin.totalNetProfit))}원 <span className="text-xs font-medium">({totalMargin.marginRate.toFixed(1)}%)</span>
                </span>
              </div>
            </div>
          </div>

          <button onClick={handleSave} disabled={saving || !selectedChannel || saleItems.every(i => !i.product || !i.selling_price)}
            className={`w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all ${
              saving || !selectedChannel || saleItems.every(i => !i.product || !i.selling_price) ? 'bg-slate-300 cursor-not-allowed'
              : saveSuccess ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99]'
            }`}>{saving ? '저장 중...' : saveSuccess ? '✓ 저장 완료!' : `매출 등록 (${saleItems.filter(i=>i.product&&i.selling_price).length}건)`}</button>
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
