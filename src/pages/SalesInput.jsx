import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

/* ───── 유틸 ───── */
const fmt = (n) => (n ?? 0).toLocaleString('ko-KR')
const roundUp10 = (v) => Math.ceil(v / 10) * 10
const parseNum = (s) => {
  if (!s && s !== 0) return 0
  return Number(String(s).replace(/,/g, '')) || 0
}

/* ───── 빈 아이템 ───── */
const emptyItem = () => ({
  id: Date.now() + Math.random(),
  productId: '',
  productName: '',
  productSearch: '',
  showDropdown: false,
  quantity: 1,
  supplyPrice: 0,
  sellingPrice: 0,
  priceMode: 'supply',
  commissionType: 'rate',
  commissionRate: 15,
  commissionFixed: 0,
  additionalFee: 0,
  memo: '',
  unitCost: 0,
  purchaseCost: 0,
  packagingCost: 0,
  additionalCost: 0,
})

export default function SalesInput() {
  const [channels, setChannels] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [items, setItems] = useState([emptyItem()])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showExcel, setShowExcel] = useState(false)
  const [excelData, setExcelData] = useState(null)
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10))

  /* ── 배송비: 주문 단위로 관리 ── */
  const [shippingReceived, setShippingReceived] = useState(0)       // 고객에게 받은 배송비 (총액)
  const [shippingReceivedMode, setShippingReceivedMode] = useState('once') // 'once'=1회, 'per'=개당
  const [shippingCost, setShippingCost] = useState(0)            // 실제 택배비 (총액)
  const [shippingCostMode, setShippingCostMode] = useState('once')  // 'once'=1회, 'per'=개당

  /* ── 데이터 로드 ── */
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [chRes, spRes, prRes] = await Promise.all([
        supabase.from('channels').select('*').order('sort_order'),
        supabase.from('suppliers').select('*').eq('is_active', true).order('supplier_name'),
        supabase.from('products').select('*, suppliers(supplier_name)').eq('is_active', true).order('product_name'),
      ])
      setChannels(chRes.data || [])
      setSuppliers(spRes.data || [])
      setProducts(prRes.data || [])
      setLoading(false)
    })()
  }, [])

  /* ── 채널 선택 ── */
const handleChannelSelect = (ch) => {
    setSelectedChannel(ch)
    setShippingReceived(0)
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        commissionType: 'rate',
        commissionRate: 0,
        commissionFixed: 0,
      }))
    )
  }

  /* ── 제품 선택 ── */
  const handleProductSelect = (idx, product) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        productId: product.id,
        productName: product.product_name,
        productSearch: product.product_name,
        showDropdown: false,
        unitCost: product.total_cost ?? 0,
        purchaseCost: product.purchase_cost ?? 0,
        packagingCost: product.packaging_cost ?? 0,
        additionalCost: product.additional_cost ?? 0,
      }
      return next
    })
  }

  /* ── 필드 업데이트 ── */
  const updateItem = useCallback((idx, updates) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...updates }
      return next
    })
  }, [])

  /* ── 가격 계산 ── */
  const calcSellingFromSupply = (supply, item) => {
    if (item.commissionType === 'rate') {
      const rate = item.commissionRate / 100
      return roundUp10(supply / (1 - rate))
    }
    return roundUp10(supply + item.commissionFixed)
  }

  const calcSupplyFromSelling = (selling, item) => {
    if (item.commissionType === 'rate') {
      const rate = item.commissionRate / 100
      return roundUp10(selling * (1 - rate))
    }
    return roundUp10(selling - item.commissionFixed)
  }

  const getCommission = (item) => {
    if (item.commissionType === 'rate') {
      return roundUp10(item.sellingPrice * (item.commissionRate / 100))
    }
    return item.commissionFixed
  }

  /* ── 총 수량 ── */
  const totalQty = items.reduce((s, it) => s + (it.productId ? it.quantity : 0), 0)

  /* ── 배송비 실제 합계 계산 ── */
  const calcShippingReceivedTotal = () => {
    if (shippingReceivedMode === 'once') return shippingReceived
    return shippingReceived * totalQty
  }

  const calcShippingCostTotal = () => {
    if (shippingCostMode === 'once') return shippingCost
    return shippingCost * totalQty
  }

  /* ── 마진 계산 (배송비는 주문 단위로 별도) ── */
  const calcItemMargin = (item) => {
    const qty = item.quantity
    const revenue = item.sellingPrice * qty
    const cost = item.unitCost * qty
    const commission = getCommission(item) * qty
    const additional = item.additionalFee
    const profit = revenue - cost - commission - additional
    const marginRate = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0'
    return { revenue, cost, commission, additional, profit, marginRate, supplyTotal: item.supplyPrice * qty }
  }

  const totalMargin = () => {
    let r = { revenue: 0, cost: 0, commission: 0, additional: 0, supplyTotal: 0, profit: 0 }
    items.forEach((it) => {
      if (!it.productId) return
      const m = calcItemMargin(it)
      r.revenue += m.revenue
      r.cost += m.cost
      r.commission += m.commission
      r.additional += m.additional
      r.supplyTotal += m.supplyTotal
      r.profit += m.profit
    })
    const shippingRcvTotal = calcShippingReceivedTotal()
    const shippingCostTotal = calcShippingCostTotal()
    r.shippingReceived = shippingRcvTotal
    r.shippingCost = shippingCostTotal
    r.profit = r.profit - shippingCostTotal
    r.totalOrderAmount = r.supplyTotal + shippingRcvTotal  // 거래처 발주 기준 총액
    r.marginRate = r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) : '0.0'
    return r
  }

  /* ── 아이템 관리 ── */
  const addItem = () => {
    const base = emptyItem()
    if (selectedChannel) {
      base.commissionType = 'rate'
      base.commissionRate = 0
      base.commissionFixed = 0
    }
    setItems((prev) => [...prev, base])
    setActiveIdx(items.length)
  }

  const removeItem = (idx) => {
    if (items.length <= 1) return
    const next = items.filter((_, i) => i !== idx)
    setItems(next)
    setActiveIdx(Math.min(activeIdx, next.length - 1))
  }

  const changeQty = (idx, delta) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], quantity: Math.max(1, next[idx].quantity + delta) }
      return next
    })
  }

  /* ── 가격 입력 ── */
  const handleSupplyChange = (idx, val) => {
    const supply = parseNum(val)
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], supplyPrice: supply }
      item.sellingPrice = calcSellingFromSupply(supply, item)
      next[idx] = item
      return next
    })
  }

  const handleSellingChange = (idx, val) => {
    const selling = parseNum(val)
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], sellingPrice: selling }
      item.supplyPrice = calcSupplyFromSelling(selling, item)
      next[idx] = item
      return next
    })
  }

  const handleCommissionChange = (idx, field, val) => {
    setItems((prev) => {
      const next = [...prev]
      const item = { ...next[idx], [field]: field === 'commissionType' ? val : parseNum(val) }
      if (item.priceMode === 'supply') {
        item.sellingPrice = calcSellingFromSupply(item.supplyPrice, item)
      } else {
        item.supplyPrice = calcSupplyFromSelling(item.sellingPrice, item)
      }
      next[idx] = item
      return next
    })
  }

  /* ── 제품 검색 ── */
  const filteredProducts = (search) => {
    if (!search) return products.slice(0, 20)
    const s = search.toLowerCase()
    return products
      .filter(
        (p) =>
          p.product_name?.toLowerCase().includes(s) ||
          p.product_code?.toLowerCase().includes(s) ||
          p.suppliers?.supplier_name?.toLowerCase().includes(s)
      )
      .slice(0, 20)
  }

  /* ── 저장 ── */
  const handleSave = async () => {
    if (!selectedChannel) return alert('매출처를 선택하세요')
    const validItems = items.filter((it) => it.productId)
    if (validItems.length === 0) return alert('제품을 선택하세요')
    const zeroCost = validItems.some((it) => it.unitCost === 0)
    if (zeroCost && !window.confirm('원가가 0원인 제품이 있습니다. 계속하시겠습니까?')) return

    setSaving(true)
    try {
      const shippingRcvTotal = calcShippingReceivedTotal()
      const shippingCostTotal = calcShippingCostTotal()
      const itemCount = validItems.length

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i]
        const m = calcItemMargin(item)

        // 배송비를 첫 번째 아이템에만 할당 (DB에 저장할 때)
        const isFirst = i === 0
        const itemShippingRcv = isFirst ? shippingRcvTotal : 0
        const itemShippingCost = isFirst ? shippingCostTotal : 0

        const record = {
          channel_id: selectedChannel.id,
          supplier_id: selectedSupplier || null,
          product_id: item.productId,
          sale_date: saleDate,
          quantity: item.quantity,
          supply_price: item.supplyPrice,
          selling_price: item.sellingPrice,
          commission_type: item.commissionType,
          commission_rate: item.commissionRate,
          commission_fixed: item.commissionFixed,
          commission_amount: m.commission,
          shipping_fee_received: itemShippingRcv,
          shipping_cost: itemShippingCost,
          additional_fee: item.additionalFee,
          product_cost: m.cost,
          total_revenue: m.revenue,
          total_cost: m.cost + m.commission + itemShippingCost + item.additionalFee,
          net_profit: m.profit - itemShippingCost,
          margin_rate: m.revenue > 0 ? parseFloat(((m.profit - itemShippingCost) / m.revenue * 100).toFixed(1)) : 0,
          memo: item.memo || (itemCount > 1 ? `${itemCount}건 중 ${i + 1}번` : ''),
          input_method: 'manual',
        }
        const { error } = await supabase.from('sales').insert(record)
        if (error) throw error
      }
      alert(`${validItems.length}건 매출이 등록되었습니다`)
      setItems([emptyItem()])
      setActiveIdx(0)
      setShippingReceived(selectedChannel?.default_shipping_cost ?? 0)
      setShippingReceivedMode('once')
      setShippingCost(3000)
      setShippingCostMode('once')
    } catch (err) {
      console.error('Save error:', err)
      alert('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  /* ── 엑셀 업로드 ── */
  const handleExcelUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet)
      setExcelData(json)
    }
    reader.readAsBinaryString(file)
  }

  const cur = items[activeIdx] || items[0]
  const curIdx = activeIdx

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  const tm = totalMargin()

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">매출 등록</h1>
        <button
          onClick={() => setShowExcel(!showExcel)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          엑셀 업로드
        </button>
      </div>

      {/* 엑셀 업로드 */}
      {showExcel && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-semibold text-gray-700">엑셀 업로드</h3>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="text-sm" />
          {excelData && (
            <div className="overflow-auto max-h-40 text-xs">
              <table className="w-full">
                <thead>
                  <tr>
                    {Object.keys(excelData[0] || {}).map((k) => (
                      <th key={k} className="px-2 py-1 bg-gray-100 text-left">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelData.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-2 py-1 border-t">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 매출일 */}
      <div className="bg-white rounded-xl border p-4">
        <label className="block text-sm font-medium text-gray-600 mb-1">매출일</label>
        <input
          type="date"
          value={saleDate}
          onChange={(e) => setSaleDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* 매출처 선택 */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-600">매출처 (채널) 선택</h3>
        <div className="flex flex-wrap gap-2">
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleChannelSelect(ch)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                selectedChannel?.id === ch.id
                  ? 'text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={selectedChannel?.id === ch.id ? { backgroundColor: ch.color_code || '#3B82F6' } : {}}
            >
              {ch.channel_name}
            </button>
          ))}
        </div>
        {selectedChannel && (
          <p className="text-xs text-gray-500">
            수수료: {selectedChannel.default_commission_type === 'fixed'
              ? `${fmt(selectedChannel.default_commission_fixed)}원`
              : `${selectedChannel.default_commission_rate}%`}
            {' · '}기본 배송비 수취: {fmt(selectedChannel.default_shipping_cost)}원
          </p>
        )}
      </div>

      {/* 매입처 선택 */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="text-sm font-semibold text-gray-600">매입처 (선택)</h3>
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
        >
          <option value="">선택 안 함</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.supplier_name}</option>
          ))}
        </select>
      </div>

      {/* ═══ 배송비 영역 (주문 단위) ═══ */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-600">📦 배송비 설정</h3>
        <p className="text-xs text-gray-400">이 주문 전체에 적용되는 배송비입니다. "1회"를 선택하면 수량에 관계없이 한 번만 적용되고, "개당"을 선택하면 총 수량에 곱해집니다.</p>

        <div className="grid grid-cols-2 gap-4">
          {/* 배송비 수취 */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-blue-700">고객 배송비 수취</label>
              <div className="flex bg-white rounded-lg overflow-hidden border border-blue-200">
                <button
                  onClick={() => setShippingReceivedMode('once')}
                  className={`px-3 py-1 text-xs font-medium transition ${
                    shippingReceivedMode === 'once' ? 'bg-blue-500 text-white' : 'text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  1회
                </button>
                <button
                  onClick={() => setShippingReceivedMode('per')}
                  className={`px-3 py-1 text-xs font-medium transition ${
                    shippingReceivedMode === 'per' ? 'bg-blue-500 text-white' : 'text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  개당
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fmt(shippingReceived)}
                onChange={(e) => setShippingReceived(parseNum(e.target.value))}
                className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm text-right font-medium bg-white"
              />
              <span className="text-sm text-blue-500">원</span>
            </div>
            {shippingReceivedMode === 'per' && totalQty > 0 && (
              <p className="text-xs text-blue-600 font-medium">
                = {fmt(shippingReceived)} × {totalQty}개 = <span className="font-bold">{fmt(shippingReceived * totalQty)}원</span>
              </p>
            )}
            {shippingReceivedMode === 'once' && (
              <p className="text-xs text-blue-500">수량과 관계없이 {fmt(shippingReceived)}원 1회</p>
            )}
          </div>

          {/* 실 배송비 */}
          <div className="bg-red-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-red-700">실제 배송비 (택배비)</label>
              <div className="flex bg-white rounded-lg overflow-hidden border border-red-200">
                <button
                  onClick={() => setShippingCostMode('once')}
                  className={`px-3 py-1 text-xs font-medium transition ${
                    shippingCostMode === 'once' ? 'bg-red-500 text-white' : 'text-red-600 hover:bg-red-100'
                  }`}
                >
                  1회
                </button>
                <button
                  onClick={() => setShippingCostMode('per')}
                  className={`px-3 py-1 text-xs font-medium transition ${
                    shippingCostMode === 'per' ? 'bg-red-500 text-white' : 'text-red-600 hover:bg-red-100'
                  }`}
                >
                  개당
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fmt(shippingCost)}
                onChange={(e) => setShippingCost(parseNum(e.target.value))}
                className="flex-1 border border-red-200 rounded-lg px-3 py-2 text-sm text-right font-medium bg-white"
              />
              <span className="text-sm text-red-500">원</span>
            </div>
            {shippingCostMode === 'per' && totalQty > 0 && (
              <p className="text-xs text-red-600 font-medium">
                = {fmt(shippingCost)} × {totalQty}개 = <span className="font-bold">{fmt(shippingCost * totalQty)}원</span>
              </p>
            )}
            {shippingCostMode === 'once' && (
              <p className="text-xs text-red-500">수량과 관계없이 {fmt(shippingCost)}원 1회</p>
            )}
          </div>
        </div>

        {/* 배송비 요약 */}
        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">배송비 차이 (수취 - 실비)</span>
          <span className={`text-sm font-bold ${calcShippingReceivedTotal() - calcShippingCostTotal() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmt(calcShippingReceivedTotal() - calcShippingCostTotal())}원
          </span>
        </div>
      </div>

      {/* 아이템 탭 */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-600">제품 목록</h3>
          <button onClick={addItem} className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            + 제품 추가
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {items.map((it, idx) => (
            <div key={it.id} className="flex items-center">
              <button
                onClick={() => setActiveIdx(idx)}
                className={`px-3 py-1 text-sm rounded-t-lg ${
                  idx === activeIdx ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {it.productName || `제품 ${idx + 1}`}
                {it.quantity > 1 && ` ×${it.quantity}`}
              </button>
              {items.length > 1 && (
                <button
                  onClick={() => removeItem(idx)}
                  className="ml-0.5 px-1.5 py-1 text-xs text-red-400 hover:text-red-600 bg-gray-50 hover:bg-red-50 rounded-t-lg"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 아이템 입력 폼 */}
        <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
          {/* 제품 검색 */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">제품 검색</label>
            {cur.productId ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-600 font-medium">✓ {cur.productName}</span>
                <button
                  onClick={() => updateItem(curIdx, { productId: '', productName: '', productSearch: '', showDropdown: false, unitCost: 0, purchaseCost: 0, packagingCost: 0, additionalCost: 0 })}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  변경
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="제품명 또는 코드로 검색..."
                  value={cur.productSearch}
                  onChange={(e) => updateItem(curIdx, { productSearch: e.target.value, showDropdown: true })}
                  onFocus={() => updateItem(curIdx, { showDropdown: true })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                {cur.showDropdown && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
                    {filteredProducts(cur.productSearch).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleProductSelect(curIdx, p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0"
                      >
                        <span className="font-medium">{p.product_name}</span>
                        {p.product_code && <span className="text-gray-400 ml-2">({p.product_code})</span>}
                        <span className="text-gray-500 ml-2">원가 {fmt(p.total_cost ?? 0)}원</span>
                        {p.suppliers?.supplier_name && (
                          <span className="text-xs text-blue-400 ml-2">{p.suppliers.supplier_name}</span>
                        )}
                      </button>
                    ))}
                    {filteredProducts(cur.productSearch).length === 0 && (
                      <p className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 원가 + 수량 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">개당 원가</p>
              <p className="text-lg font-bold text-gray-800">{fmt(cur.unitCost)}원</p>
              <p className="text-xs text-gray-400 mt-1">
                매입가 {fmt(cur.purchaseCost)} + 포장비 {fmt(cur.packagingCost)} + 기타 {fmt(cur.additionalCost)}
              </p>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">수량</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => changeQty(curIdx, -1)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-lg font-bold"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  value={cur.quantity}
                  onChange={(e) => updateItem(curIdx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-16 text-center border rounded-lg py-1 text-lg font-bold"
                />
                <button
                  onClick={() => changeQty(curIdx, 1)}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-lg font-bold"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">총 원가: {fmt(cur.unitCost * cur.quantity)}원</p>
            </div>
          </div>

          {/* 가격 모드 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateItem(curIdx, { priceMode: 'supply' })}
              className={`px-3 py-1 text-xs rounded-full ${
                cur.priceMode === 'supply' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              공급가 입력 → 판매가 자동
            </button>
            <button
              onClick={() => updateItem(curIdx, { priceMode: 'selling' })}
              className={`px-3 py-1 text-xs rounded-full ${
                cur.priceMode === 'selling' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              판매가 입력 → 공급가 역산
            </button>
          </div>

          {/* 공급가 · 판매가 · 수수료 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                개당 공급가 {cur.priceMode === 'supply' ? <span className="text-blue-500">(입력)</span> : <span className="text-gray-400">(자동)</span>}
              </label>
              <input
                type="text"
                value={fmt(cur.supplyPrice)}
                onChange={(e) => cur.priceMode === 'supply' && handleSupplyChange(curIdx, e.target.value)}
                readOnly={cur.priceMode !== 'supply'}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-right font-medium ${
                  cur.priceMode === 'supply' ? 'bg-white border-blue-300 focus:ring-1 focus:ring-blue-400' : 'bg-gray-100 text-gray-500'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                개당 판매가 {cur.priceMode === 'selling' ? <span className="text-blue-500">(입력)</span> : <span className="text-gray-400">(자동)</span>}
              </label>
              <input
                type="text"
                value={fmt(cur.sellingPrice)}
                onChange={(e) => cur.priceMode === 'selling' && handleSellingChange(curIdx, e.target.value)}
                readOnly={cur.priceMode !== 'selling'}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-right font-medium ${
                  cur.priceMode === 'selling' ? 'bg-white border-blue-300 focus:ring-1 focus:ring-blue-400' : 'bg-gray-100 text-gray-500'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">수수료</label>
              <div className="flex gap-1 mb-1">
                <button
                  onClick={() => handleCommissionChange(curIdx, 'commissionType', cur.commissionType === 'rate' ? 'fixed' : 'rate')}
                  className="text-xs px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300"
                >
                  {cur.commissionType === 'rate' ? '정률(%)' : '정액(원)'}
                </button>
              </div>
              {cur.commissionType === 'rate' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={cur.commissionRate}
                    onChange={(e) => handleCommissionChange(curIdx, 'commissionRate', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-right"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">%</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={fmt(cur.commissionFixed)}
                    onChange={(e) => handleCommissionChange(curIdx, 'commissionFixed', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-right"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">원</span>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">수수료: {fmt(getCommission(cur))}원/개</p>
            </div>
          </div>

          {/* 추가비용 · 메모 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">추가비용 (이 제품)</label>
              <input
                type="text"
                value={fmt(cur.additionalFee)}
                onChange={(e) => updateItem(curIdx, { additionalFee: parseNum(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2 text-sm text-right"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">메모</label>
              <input
                type="text"
                value={cur.memo}
                onChange={(e) => updateItem(curIdx, { memo: e.target.value })}
                placeholder="메모 (선택)"
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* 개별 마진 미리보기 */}
          {cur.productId && (() => {
            const m = calcItemMargin(cur)
            return (
              <div className="bg-white border rounded-lg p-3 space-y-1">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">이 제품 마진 미리보기 (배송비 제외)</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">총 매출</span><span className="font-medium">{fmt(m.revenue)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">총 원가</span><span className="font-medium text-red-500">-{fmt(m.cost)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">수수료</span><span className="font-medium text-red-500">-{fmt(m.commission)}원</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">추가비용</span><span className="font-medium text-red-500">-{fmt(m.additional)}원</span></div>
                  <div className="flex justify-between border-t pt-1 col-span-2">
                    <span className="text-blue-600 font-semibold">공급가 합계</span>
                    <span className="font-bold text-blue-600">{fmt(m.supplyTotal)}원</span>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* 전체 마진 요약 */}
      {items.some((it) => it.productId) && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">전체 주문 요약 ({items.filter(it => it.productId).length}건 · 총 {totalQty}개)</h3>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="px-2 py-1 text-left">제품</th>
                  <th className="px-2 py-1 text-right">수량</th>
                  <th className="px-2 py-1 text-right">공급가 합계</th>
                  <th className="px-2 py-1 text-right">판매가 합계</th>
                  <th className="px-2 py-1 text-right">원가</th>
                  <th className="px-2 py-1 text-right">수수료</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  if (!it.productId) return null
                  const m = calcItemMargin(it)
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-1.5">{it.productName}</td>
                      <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                      <td className="px-2 py-1.5 text-right text-blue-600">{fmt(m.supplyTotal)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(m.revenue)}</td>
                      <td className="px-2 py-1.5 text-right text-red-500">{fmt(m.cost)}</td>
                      <td className="px-2 py-1.5 text-right text-red-500">{fmt(m.commission)}</td>
                    </tr>
                  )
                })}
                {/* 배송비 행 */}
                <tr className="border-t bg-gray-50">
                  <td className="px-2 py-1.5 font-medium text-gray-600" colSpan="2">📦 배송비</td>
                  <td className="px-2 py-1.5 text-right text-blue-600 font-medium">+{fmt(calcShippingReceivedTotal())}</td>
                  <td className="px-2 py-1.5 text-right"></td>
                  <td className="px-2 py-1.5 text-right text-red-500 font-medium">{fmt(calcShippingCostTotal())}</td>
                  <td className="px-2 py-1.5 text-right"></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-500">총 매출</p>
              <p className="text-lg font-bold text-blue-700">{fmt(tm.revenue)}원</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-red-500">총 원가</p>
              <p className="text-lg font-bold text-red-700">{fmt(tm.cost)}원</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <p className="text-xs text-orange-500">총 수수료</p>
              <p className="text-lg font-bold text-orange-700">{fmt(tm.commission)}원</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">실 배송비</p>
              <p className="text-lg font-bold text-gray-700">{fmt(tm.shippingCost)}원</p>
            </div>
          </div>

          {/* 거래처 발주 기준 총액 */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-indigo-500">거래처 발주 총액 (공급가 + 배송비 수취)</p>
                <p className="text-xs text-indigo-400 mt-0.5">= 공급가 {fmt(tm.supplyTotal)}원 + 배송비수취 {fmt(tm.shippingReceived)}원</p>
              </div>
              <p className="text-2xl font-bold text-indigo-700">{fmt(tm.totalOrderAmount)}원</p>
            </div>
          </div>

          <div className={`rounded-lg p-4 ${tm.profit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs ${tm.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>순이익</p>
                <p className={`text-2xl font-bold ${tm.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(tm.profit)}원</p>
              </div>
              <div className={`text-3xl font-bold ${tm.profit >= 0 ? 'text-green-300' : 'text-red-300'}`}>{tm.marginRate}%</div>
            </div>
          </div>
        </div>
      )}

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={saving || !selectedChannel || !items.some((it) => it.productId)}
        className={`w-full py-3 rounded-xl text-white font-bold text-lg transition ${
          saving || !selectedChannel || !items.some((it) => it.productId)
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700'
        }`}
      >
        {saving ? '저장 중...' : `매출 등록 (${items.filter((it) => it.productId).length}건)`}
      </button>
    </div>
  )
}
