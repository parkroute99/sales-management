
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

/* ───── 빈 아이템 생성 ───── */
const emptyItem = () => ({
  id: Date.now() + Math.random(),
  productId: '',
  productName: '',
  productSearch: '',
  quantity: 1,
  supplyPrice: 0,        // 개당 공급가
  sellingPrice: 0,        // 개당 판매가
  priceMode: 'supply',    // 'supply' | 'selling'
  commissionType: 'rate',
  commissionRate: 15,
  commissionFixed: 0,
  shippingReceived: 0,    // 배송비 수취
  shippingCost: 3000,     // 실 배송비
  additionalFee: 0,
  memo: '',
  // 제품정보 (선택 시 자동)
  unitCost: 0,
  purchasePrice: 0,
  packagingCost: 0,
  extraCost: 0,
})

export default function SalesInput() {
  /* ── 기본 상태 ── */
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

  /* ── 데이터 로드 ── */
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [chRes, spRes, prRes] = await Promise.all([
        supabase.from('channels').select('*').eq('is_active', true).order('name'),
        supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
        supabase.from('products').select('*, suppliers(name)').eq('is_active', true).order('name'),
      ])
      setChannels(chRes.data || [])
      setSuppliers(spRes.data || [])
      setProducts(prRes.data || [])
      setLoading(false)
    })()
  }, [])

  /* ── 채널 선택 시 수수료 기본값 ── */
  const handleChannelSelect = (ch) => {
    setSelectedChannel(ch)
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        commissionType: ch.commission_type === 'fixed' ? 'fixed' : 'rate',
        commissionRate: ch.commission_rate ?? 15,
        commissionFixed: ch.commission_fixed ?? 0,
        shippingReceived: ch.default_shipping_fee ?? 0,
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
        productName: product.name,
        productSearch: product.name,
        unitCost: product.cost ?? 0,
        purchasePrice: product.purchase_price ?? 0,
        packagingCost: product.packaging_cost ?? 0,
        extraCost: product.extra_cost ?? 0,
      }
      return next
    })
  }

  /* ── 아이템 필드 업데이트 ── */
  const updateItem = useCallback((idx, field, value) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }, [])

  /* ── 공급가 → 판매가 계산 ── */
  const calcSellingFromSupply = (supply, item) => {
    if (item.commissionType === 'rate') {
      const rate = item.commissionRate / 100
      return roundUp10(supply / (1 - rate))
    }
    return roundUp10(supply + item.commissionFixed)
  }

  /* ── 판매가 → 공급가 역산 ── */
  const calcSupplyFromSelling = (selling, item) => {
    if (item.commissionType === 'rate') {
      const rate = item.commissionRate / 100
      return roundUp10(selling * (1 - rate))
    }
    return roundUp10(selling - item.commissionFixed)
  }

  /* ── 수수료 금액 ── */
  const getCommission = (item) => {
    if (item.commissionType === 'rate') {
      return roundUp10(item.sellingPrice * (item.commissionRate / 100))
    }
    return item.commissionFixed
  }

  /* ── 마진 계산 (아이템 1건) ── */
  const calcMargin = (item) => {
    const qty = item.quantity
    const revenue = item.sellingPrice * qty
    const cost = item.unitCost * qty
    const commission = getCommission(item) * qty
    const supplyTotal = item.supplyPrice * qty
    const shippingRcv = item.shippingReceived * qty
    const shippingReal = item.shippingCost
    const additional = item.additionalFee
    const supplyPlusShipping = supplyTotal + shippingRcv
    const profit = revenue - cost - commission - shippingReal - additional
    const marginRate = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0'
    return { revenue, cost, commission, supplyTotal, shippingRcv, shippingReal, additional, supplyPlusShipping, profit, marginRate }
  }

  /* ── 전체 합산 ── */
  const totalMargin = () => {
    let r = { revenue: 0, cost: 0, commission: 0, supplyTotal: 0, shippingRcv: 0, shippingReal: 0, additional: 0, supplyPlusShipping: 0, profit: 0 }
    items.forEach((it) => {
      const m = calcMargin(it)
      Object.keys(r).forEach((k) => (r[k] += m[k]))
    })
    r.marginRate = r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) : '0.0'
    return r
  }

  /* ── 아이템 추가/제거 ── */
  const addItem = () => {
    const base = emptyItem()
    if (selectedChannel) {
      base.commissionType = selectedChannel.commission_type === 'fixed' ? 'fixed' : 'rate'
      base.commissionRate = selectedChannel.commission_rate ?? 15
      base.commissionFixed = selectedChannel.commission_fixed ?? 0
      base.shippingReceived = selectedChannel.default_shipping_fee ?? 0
    }
    setItems((prev) => [...prev, base])
    setActiveIdx(items.length)
  }
  const removeItem = (idx) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== idx))
    setActiveIdx((prev) => Math.min(prev, items.length - 2))
  }

  /* ── 수량 ── */
  const changeQty = (idx, delta) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], quantity: Math.max(1, next[idx].quantity + delta) }
      return next
    })
  }

  /* ── 가격 변경 핸들러 ── */
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
      const item = { ...next[idx], [field]: parseNum(val) }
      // 재계산
      if (item.priceMode === 'supply') {
        item.sellingPrice = calcSellingFromSupply(item.supplyPrice, item)
      } else {
        item.supplyPrice = calcSupplyFromSelling(item.sellingPrice, item)
      }
      next[idx] = item
      return next
    })
  }

  /* ── 필터된 제품 목록 ── */
  const filteredProducts = (search) => {
    if (!search) return products.slice(0, 20)
    const s = search.toLowerCase()
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(s) ||
        p.code?.toLowerCase().includes(s) ||
        p.suppliers?.name?.toLowerCase().includes(s)
    ).slice(0, 20)
  }

  /* ── 저장 ── */
  const handleSave = async () => {
    if (!selectedChannel) return alert('매출처를 선택하세요')
    const valid = items.every((it) => it.productId)
    if (!valid) return alert('모든 항목에 제품을 선택하세요')
    const zeroCost = items.some((it) => it.unitCost === 0)
    if (zeroCost && !window.confirm('원가가 0원인 제품이 있습니다. 계속하시겠습니까?')) return

    setSaving(true)
    try {
      for (const item of items) {
        const m = calcMargin(item)
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
          shipping_fee_received: item.shippingReceived,
          shipping_cost: item.shippingCost,
          additional_fee: item.additionalFee,
          product_cost: m.cost,
          total_revenue: m.revenue,
          profit: m.profit,
          margin_rate: parseFloat(m.marginRate),
          memo: item.memo,
        }
        const { error } = await supabase.from('sales').insert(record)
        if (error) throw error

        // channel_products upsert
        await supabase.from('channel_products').upsert(
          {
            channel_id: selectedChannel.id,
            product_id: item.productId,
            selling_price: item.sellingPrice,
            supply_price: item.supplyPrice,
          },
          { onConflict: 'channel_id,product_id' }
        )
      }
      alert(`${items.length}건 매출이 등록되었습니다`)
      setItems([emptyItem()])
      setActiveIdx(0)
    } catch (err) {
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

  /* ── 현재 아이템 ── */
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
      {/* ===== 헤더 ===== */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">매출 등록</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowExcel(!showExcel)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            엑셀 업로드
          </button>
        </div>
      </div>

      {/* ===== 엑셀 업로드 패널 ===== */}
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
              <p className="text-gray-500 mt-1">미리보기 (최대 5행)</p>
            </div>
          )}
        </div>
      )}

      {/* ===== 매출일 ===== */}
      <div className="bg-white rounded-xl border p-4">
        <label className="block text-sm font-medium text-gray-600 mb-1">매출일</label>
        <input
          type="date"
          value={saleDate}
          onChange={(e) => setSaleDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* ===== 매출처 선택 ===== */}
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
              style={selectedChannel?.id === ch.id ? { backgroundColor: ch.color || '#3B82F6' } : {}}
            >
              {ch.name}
            </button>
          ))}
        </div>
        {selectedChannel && (
          <p className="text-xs text-gray-500">
            수수료: {selectedChannel.commission_type === 'fixed'
              ? `${fmt(selectedChannel.commission_fixed)}원`
              : `${selectedChannel.commission_rate}%`}
            {' · '}기본 배송비 수취: {fmt(selectedChannel.default_shipping_fee)}원
          </p>
        )}
      </div>

      {/* ===== 매입처 선택 (선택사항) ===== */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="text-sm font-semibold text-gray-600">매입처 (선택)</h3>
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
        >
          <option value="">선택 안 함</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* ===== 아이템 탭 ===== */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-600">제품 목록</h3>
          <button onClick={addItem} className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            + 제품 추가
          </button>
        </div>

        {/* 탭 */}
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
              </button>
              {items.length > 1 && (
                <button
                  onClick={() => removeItem(idx)}
                  className="ml-0.5 px-1.5 py-1 text-xs text-red-400 hover:text-red-600 rounded-t-lg bg-gray-50 hover:bg-red-50"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ===== 아이템 입력 폼 ===== */}
        <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
          {/* 제품 검색 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">제품 검색</label>
            <input
              type="text"
              placeholder="제품명 또는 코드로 검색..."
              value={cur.productSearch}
              onChange={(e) => updateItem(curIdx, 'productSearch', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            {cur.productSearch && !cur.productId && (
              <div className="mt-1 bg-white border rounded-lg max-h-40 overflow-auto">
                {filteredProducts(cur.productSearch).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProductSelect(curIdx, p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0"
                  >
                    <span className="font-medium">{p.name}</span>
                    {p.code && <span className="text-gray-400 ml-2">({p.code})</span>}
                    <span className="text-gray-500 ml-2">원가 {fmt(p.cost ?? 0)}원</span>
                    {p.suppliers?.name && <span className="text-xs text-blue-400 ml-2">{p.suppliers.name}</span>}
                  </button>
                ))}
              </div>
            )}
            {cur.productId && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-green-600 font-medium">✓ {cur.productName}</span>
                <button
                  onClick={() => {
                    updateItem(curIdx, 'productId', '')
                    updateItem(curIdx, 'productName', '')
                    updateItem(curIdx, 'productSearch', '')
                    updateItem(curIdx, 'unitCost', 0)
                  }}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  변경
                </button>
              </div>
            )}
          </div>

          {/* 원가 표시 + 수량 (가로 배치) */}
          <div className="grid grid-cols-2 gap-4">
            {/* 원가 */}
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">개당 원가</p>
              <p className="text-lg font-bold text-gray-800">{fmt(cur.unitCost)}원</p>
              <p className="text-xs text-gray-400 mt-1">
                매입가 {fmt(cur.purchasePrice)} + 포장비 {fmt(cur.packagingCost)} + 기타 {fmt(cur.extraCost)}
              </p>
            </div>

            {/* 수량 */}
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
                  onChange={(e) => updateItem(curIdx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
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

          {/* 가격 모드 토글 */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => updateItem(curIdx, 'priceMode', 'supply')}
              className={`px-3 py-1 text-xs rounded-full ${
                cur.priceMode === 'supply' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              공급가 입력 → 판매가 자동
            </button>
            <button
              onClick={() => updateItem(curIdx, 'priceMode', 'selling')}
              className={`px-3 py-1 text-xs rounded-full ${
                cur.priceMode === 'selling' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              판매가 입력 → 공급가 역산
            </button>
          </div>

          {/* 공급가 · 판매가 · 수수료 (3열) */}
          <div className="grid grid-cols-3 gap-3">
            {/* 공급가 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                개당 공급가
                {cur.priceMode === 'supply' && <span className="text-blue-500 ml-1">(입력)</span>}
                {cur.priceMode === 'selling' && <span className="text-gray-400 ml-1">(자동)</span>}
              </label>
              <input
                type="text"
                value={fmt(cur.supplyPrice)}
                onChange={(e) => {
                  if (cur.priceMode === 'supply') handleSupplyChange(curIdx, e.target.value)
                }}
                readOnly={cur.priceMode === 'selling'}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-right font-medium ${
                  cur.priceMode === 'supply' ? 'bg-white border-blue-300' : 'bg-gray-100 text-gray-500'
                }`}
              />
            </div>

            {/* 판매가 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                개당 판매가
                {cur.priceMode === 'selling' && <span className="text-blue-500 ml-1">(입력)</span>}
                {cur.priceMode === 'supply' && <span className="text-gray-400 ml-1">(자동)</span>}
              </label>
              <input
                type="text"
                value={fmt(cur.sellingPrice)}
                onChange={(e) => {
                  if (cur.priceMode === 'selling') handleSellingChange(curIdx, e.target.value)
                }}
                readOnly={cur.priceMode === 'supply'}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-right font-medium ${
                  cur.priceMode === 'selling' ? 'bg-white border-blue-300' : 'bg-gray-100 text-gray-500'
                }`}
              />
            </div>

            {/* 수수료 */}
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
                  <span className="text-sm text-gray-500">%</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={fmt(cur.commissionFixed)}
                    onChange={(e) => handleCommissionChange(curIdx, 'commissionFixed', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-right"
                  />
                  <span className="text-sm text-gray-500">원</span>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">수수료: {fmt(getCommission(cur))}원/개</p>
            </div>
          </div>

          {/* 배송비 · 추가비용 · 메모 (3열) */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">배송비 수취 (개당)</label>
              <input
                type="text"
                value={fmt(cur.shippingReceived)}
                onChange={(e) => updateItem(curIdx, 'shippingReceived', parseNum(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm text-right"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">실 배송비 (건당)</label>
              <input
                type="text"
                value={fmt(cur.shippingCost)}
                onChange={(e) => updateItem(curIdx, 'shippingCost', parseNum(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm text-right"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">추가비용</label>
              <input
                type="text"
                value={fmt(cur.additionalFee)}
                onChange={(e) => updateItem(curIdx, 'additionalFee', parseNum(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm text-right"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">메모</label>
            <input
              type="text"
              value={cur.memo}
              onChange={(e) => updateItem(curIdx, 'memo', e.target.value)}
              placeholder="메모 (선택)"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* 개별 마진 미리보기 */}
          {cur.productId && (
            <div className="bg-white border rounded-lg p-3 space-y-1">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">이 제품 마진 미리보기</h4>
              {(() => {
                const m = calcMargin(cur)
                return (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">총 매출</span>
                      <span className="font-medium">{fmt(m.revenue)}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">총 원가</span>
                      <span className="font-medium text-red-500">-{fmt(m.cost)}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">수수료</span>
                      <span className="font-medium text-red-500">-{fmt(m.commission)}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">배송비</span>
                      <span className="font-medium text-red-500">-{fmt(m.shippingReal)}원</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 col-span-2">
                      <span className="text-blue-600 font-semibold">공급가 합계</span>
                      <span className="font-bold text-blue-600">{fmt(m.supplyTotal)}원</span>
                    </div>
                    <div className="flex justify-between col-span-2">
                      <span className="text-blue-600 font-semibold">공급가 + 배송비수취</span>
                      <span className="font-bold text-blue-600">{fmt(m.supplyPlusShipping)}원</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 col-span-2">
                      <span className={`font-bold ${m.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        순이익
                      </span>
                      <span className={`font-bold ${m.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(m.profit)}원 ({m.marginRate}%)
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ===== 전체 마진 요약 ===== */}
      {items.some((it) => it.productId) && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">전체 마진 요약 ({items.length}건)</h3>

          {/* 제품별 요약 테이블 */}
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="px-2 py-1 text-left">제품</th>
                  <th className="px-2 py-1 text-right">수량</th>
                  <th className="px-2 py-1 text-right">공급가</th>
                  <th className="px-2 py-1 text-right">판매가</th>
                  <th className="px-2 py-1 text-right">원가</th>
                  <th className="px-2 py-1 text-right">수수료</th>
                  <th className="px-2 py-1 text-right">이익</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  if (!it.productId) return null
                  const m = calcMargin(it)
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-1.5">{it.productName}</td>
                      <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                      <td className="px-2 py-1.5 text-right text-blue-600">{fmt(m.supplyTotal)}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(m.revenue)}</td>
                      <td className="px-2 py-1.5 text-right text-red-500">{fmt(m.cost)}</td>
                      <td className="px-2 py-1.5 text-right text-red-500">{fmt(m.commission)}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${m.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(m.profit)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 합산 카드 */}
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
              <p className="text-xs text-gray-500">총 배송비</p>
              <p className="text-lg font-bold text-gray-700">{fmt(tm.shippingReal)}원</p>
            </div>
          </div>

          {/* 공급가 + 배송비수취 하이라이트 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-xs text-indigo-500">공급가 합계</p>
              <p className="text-xl font-bold text-indigo-700">{fmt(tm.supplyTotal)}원</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-xs text-indigo-500">공급가 + 배송비수취</p>
              <p className="text-xl font-bold text-indigo-700">{fmt(tm.supplyPlusShipping)}원</p>
            </div>
          </div>

          {/* 순이익 */}
          <div className={`rounded-lg p-4 ${tm.profit >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs ${tm.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>순이익</p>
                <p className={`text-2xl font-bold ${tm.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {fmt(tm.profit)}원
                </p>
              </div>
              <div className={`text-3xl font-bold ${tm.profit >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {tm.marginRate}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 저장 버튼 ===== */}
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
