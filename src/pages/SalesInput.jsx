import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const fmt = (n) => (n ?? 0).toLocaleString('ko-KR')
const roundUp10 = (v) => Math.ceil(v / 10) * 10
const parseNum = (s) => {
  if (!s && s !== 0) return 0
  return Number(String(s).replace(/,/g, '')) || 0
}

const emptyItem = () => ({
  id: Date.now() + Math.random(),
  productId: '', productName: '', productSearch: '', showDropdown: false,
  quantity: 1, supplyPrice: 0, sellingPrice: 0, priceMode: 'supply',
  commissionType: 'rate', commissionRate: 0, commissionFixed: 0,
  additionalFee: 0, memo: '',
  unitCost: 0, purchaseCost: 0, packagingCost: 0, additionalCost: 0,
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
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10))

  const [shippingReceived, setShippingReceived] = useState(0)
  const [shippingReceivedMode, setShippingReceivedMode] = useState('once')
  const [shippingCost, setShippingCost] = useState(0)
  const [shippingCostMode, setShippingCostMode] = useState('once')

  const [showExcel, setShowExcel] = useState(false)
  const [showUploadGuide, setShowUploadGuide] = useState(false)
  const [excelData, setExcelData] = useState(null)
  const [uploadResult, setUploadResult] = useState(null)
  const fileInputRef = useRef(null)

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

  const handleChannelSelect = (ch) => {
    setSelectedChannel(ch)
    setShippingReceived(0)
    setItems((prev) => prev.map((it) => ({ ...it, commissionType: 'rate', commissionRate: 0, commissionFixed: 0 })))
  }

  const handleProductSelect = (idx, product) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = {
        ...next[idx], productId: product.id, productName: product.product_name,
        productSearch: product.product_name, showDropdown: false,
        unitCost: product.total_cost ?? 0, purchaseCost: product.purchase_cost ?? 0,
        packagingCost: product.packaging_cost ?? 0, additionalCost: product.additional_cost ?? 0,
      }
      return next
    })
  }

  const updateItem = useCallback((idx, updates) => {
    setItems((prev) => { const next = [...prev]; next[idx] = { ...next[idx], ...updates }; return next })
  }, [])

  const calcSellingFromSupply = (supply, item) => {
    if (item.commissionType === 'rate') { const rate = item.commissionRate / 100; return roundUp10(supply / (1 - rate)) }
    return roundUp10(supply + item.commissionFixed)
  }
  const calcSupplyFromSelling = (selling, item) => {
    if (item.commissionType === 'rate') { const rate = item.commissionRate / 100; return roundUp10(selling * (1 - rate)) }
    return roundUp10(selling - item.commissionFixed)
  }
  const getCommission = (item) => {
    if (item.commissionType === 'rate') return roundUp10(item.sellingPrice * (item.commissionRate / 100))
    return item.commissionFixed
  }

  const totalQty = items.reduce((s, it) => s + (it.productId ? it.quantity : 0), 0)
  const calcShippingReceivedTotal = () => shippingReceivedMode === 'once' ? shippingReceived : shippingReceived * totalQty
  const calcShippingCostTotal = () => shippingCostMode === 'once' ? shippingCost : shippingCost * totalQty

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
    items.forEach((it) => { if (!it.productId) return; const m = calcItemMargin(it); Object.keys(r).forEach(k => r[k] += m[k]) })
    const sRcv = calcShippingReceivedTotal(), sCost = calcShippingCostTotal()
    r.shippingReceived = sRcv; r.shippingCost = sCost
    r.profit -= sCost; r.totalOrderAmount = r.supplyTotal + sRcv
    r.revenueAll = r.revenue + sRcv
    r.marginRate = r.revenueAll > 0 ? ((r.profit / r.revenueAll) * 100).toFixed(1) : '0.0'
    return r
  }

  const addItem = () => {
    const base = emptyItem()
    if (selectedChannel) { base.commissionType = 'rate'; base.commissionRate = 0; base.commissionFixed = 0 }
    setItems((prev) => [...prev, base]); setActiveIdx(items.length)
  }
  const removeItem = (idx) => {
    if (items.length <= 1) return
    const next = items.filter((_, i) => i !== idx); setItems(next); setActiveIdx(Math.min(activeIdx, next.length - 1))
  }
  const changeQty = (idx, delta) => { setItems((prev) => { const next = [...prev]; next[idx] = { ...next[idx], quantity: Math.max(1, next[idx].quantity + delta) }; return next }) }

  const handleSupplyChange = (idx, val) => {
    const supply = parseNum(val)
    setItems((prev) => { const next = [...prev]; const item = { ...next[idx], supplyPrice: supply }; item.sellingPrice = calcSellingFromSupply(supply, item); next[idx] = item; return next })
  }
  const handleSellingChange = (idx, val) => {
    const selling = parseNum(val)
    setItems((prev) => { const next = [...prev]; const item = { ...next[idx], sellingPrice: selling }; item.supplyPrice = calcSupplyFromSelling(selling, item); next[idx] = item; return next })
  }
  const handleCommissionChange = (idx, field, val) => {
    setItems((prev) => {
      const next = [...prev]; const item = { ...next[idx], [field]: field === 'commissionType' ? val : parseNum(val) }
      if (item.priceMode === 'supply') item.sellingPrice = calcSellingFromSupply(item.supplyPrice, item)
      else item.supplyPrice = calcSupplyFromSelling(item.sellingPrice, item)
      next[idx] = item; return next
    })
  }

  const filteredProducts = (search) => {
    if (!search) return products.slice(0, 20)
    const s = search.toLowerCase()
    return products.filter(p => p.product_name?.toLowerCase().includes(s) || p.product_code?.toLowerCase().includes(s) || p.suppliers?.supplier_name?.toLowerCase().includes(s)).slice(0, 20)
  }

  /* ── 저장 (order_group_id 포함) ── */
  const handleSave = async () => {
    if (!selectedChannel) return alert('매출처를 선택하세요')
    const validItems = items.filter((it) => it.productId)
    if (validItems.length === 0) return alert('제품을 선택하세요')
    const zeroCost = validItems.some((it) => it.unitCost === 0)
    if (zeroCost && !window.confirm('원가가 0원인 제품이 있습니다. 계속하시겠습니까?')) return

    setSaving(true)
    try {
      const groupId = crypto.randomUUID()
      const sRcv = calcShippingReceivedTotal()
      const sCost = calcShippingCostTotal()

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i]
        const m = calcItemMargin(item)
        const isFirst = i === 0
        const itemShipRcv = isFirst ? sRcv : 0
        const itemShipCost = isFirst ? sCost : 0
        const itemRevAll = m.revenue + itemShipRcv
        const itemProfit = m.profit - itemShipCost

        const record = {
          order_group_id: groupId,
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
          shipping_fee_received: itemShipRcv,
          shipping_cost: itemShipCost,
          additional_fee: item.additionalFee,
          product_cost: m.cost,
          total_revenue: itemRevAll,
          total_cost: m.cost + m.commission + itemShipCost + item.additionalFee,
          net_profit: itemProfit,
          margin_rate: itemRevAll > 0 ? parseFloat(((itemProfit / itemRevAll) * 100).toFixed(1)) : 0,
          memo: item.memo,
          input_method: 'manual',
        }
        const { error } = await supabase.from('sales').insert(record)
        if (error) throw error
      }
      alert(`${validItems.length}건 매출이 등록되었습니다`)
      setItems([emptyItem()]); setActiveIdx(0)
      setShippingReceived(0); setShippingReceivedMode('once')
      setShippingCost(0); setShippingCostMode('once')
    } catch (err) { alert('저장 실패: ' + err.message) }
    finally { setSaving(false) }
  }

  /* ── 엑셀 업로드 ── */
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      if (data.length === 0) { alert('데이터가 없습니다.'); return }

      let success = 0, failed = 0, errors = []
      const channelMap = {}; channels.forEach(c => { channelMap[c.channel_name] = c.id })
      const productMap = {}; products.forEach(p => { productMap[p.product_code] = p; productMap[p.product_name] = p })

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const chName = String(row['매출처'] || '').trim()
        const chId = channelMap[chName]
        if (!chId) { failed++; errors.push(`${i+2}행: 매출처 "${chName}" 없음`); continue }

        const pKey = String(row['제품코드'] || row['제품명'] || '').trim()
        const product = productMap[pKey]
        if (!product) { failed++; errors.push(`${i+2}행: 제품 "${pKey}" 없음`); continue }

        const qty = Number(row['수량'] || 1)
        const selling = Number(row['판매가'] || 0)
        const supply = Number(row['공급가'] || 0)
        const commAmt = Number(row['수수료'] || 0)
        const shipRcv = Number(row['배송비수취'] || 0)
        const shipCost = Number(row['실배송비'] || 0)
        const cost = (product.total_cost || 0) * qty
        const revAll = selling * qty + shipRcv
        const profit = revAll - cost - commAmt - shipCost

        const groupId = crypto.randomUUID()
        const { error } = await supabase.from('sales').insert({
          order_group_id: groupId, channel_id: chId, product_id: product.id,
          sale_date: String(row['매출일'] || saleDate), quantity: qty,
          supply_price: supply, selling_price: selling,
          commission_type: 'fixed', commission_rate: 0, commission_fixed: commAmt, commission_amount: commAmt,
          shipping_fee_received: shipRcv, shipping_cost: shipCost, additional_fee: 0,
          product_cost: cost, total_revenue: revAll, total_cost: cost + commAmt + shipCost,
          net_profit: profit, margin_rate: revAll > 0 ? parseFloat(((profit/revAll)*100).toFixed(1)) : 0,
          memo: String(row['메모'] || ''), input_method: 'excel',
        })
        if (error) { failed++; errors.push(`${i+2}행: ${error.message}`) }
        else success++
      }
      setUploadResult({ success, failed, errors, total: data.length })
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const handleSampleDownload = () => {
    const sample = [
      { '매출일': '2026-04-07', '매출처': '파미웰', '제품코드': 'DOL-001', '제품명': '직화 간장 불고기 180g', '수량': 5, '공급가': 3100, '판매가': 3100, '수수료': 0, '배송비수취': 4500, '실배송비': 3000, '메모': '' },
      { '매출일': '2026-04-07', '매출처': '파미웰', '제품코드': 'DOL-002', '제품명': '직화 고추장 불고기 180g', '수량': 5, '공급가': 3100, '판매가': 3100, '수수료': 0, '배송비수취': 0, '실배송비': 0, '메모': '' },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 30 },{ wch: 6 },{ wch: 10 },{ wch: 10 },{ wch: 10 },{ wch: 10 },{ wch: 10 },{ wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '매출등록양식')
    XLSX.writeFile(wb, '매출등록_샘플양식.xlsx')
  }

  const cur = items[activeIdx] || items[0]
  const curIdx = activeIdx
  const tm = totalMargin()

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">매출 등록</h1>
        <div className="flex gap-2">
          <button onClick={() => { setShowUploadGuide(!showUploadGuide); setShowExcel(false) }}
            className={`px-3 py-1.5 text-sm rounded-lg border ${showUploadGuide ? 'bg-blue-600 text-white' : 'border-gray-300 hover:bg-gray-50'}`}>📤 엑셀 업로드</button>
        </div>
      </div>

      {/* ── 엑셀 업로드 가이드 ── */}
      {showUploadGuide && (
        <div className="bg-white rounded-xl border border-blue-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-800">📤 엑셀로 매출 대량 등록</h3>
            <button onClick={() => { setShowUploadGuide(false); setUploadResult(null) }} className="text-slate-400 hover:text-slate-600 text-sm">✕ 닫기</button>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-blue-800">엑셀 파일 형식 안내</p>
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
                    ['매출일', '필수', '매출 날짜 (YYYY-MM-DD)', '2026-04-07'],
                    ['매출처', '필수', '등록된 매출처명과 정확히 일치', '파미웰'],
                    ['제품코드', '필수', '제품코드 또는 제품명 (둘 중 하나)', 'DOL-001'],
                    ['제품명', '선택', '제품코드 없을 시 제품명으로 매칭', '직화 간장 불고기'],
                    ['수량', '필수', '숫자', '5'],
                    ['공급가', '선택', '개당 공급가 (원)', '3100'],
                    ['판매가', '선택', '개당 판매가 (원)', '3100'],
                    ['수수료', '선택', '총 수수료 금액 (원)', '0'],
                    ['배송비수취', '선택', '고객에게 받은 배송비 (원)', '4500'],
                    ['실배송비', '선택', '실제 택배비 (원)', '3000'],
                    ['메모', '선택', '비고', ''],
                  ].map(([col, req, desc, ex], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/50'}>
                      <td className="px-3 py-2 font-semibold text-slate-700 border border-blue-200">{col}</td>
                      <td className={`px-3 py-2 text-center font-bold border border-blue-200 ${req === '필수' ? 'text-red-500' : 'text-slate-400'}`}>{req}</td>
                      <td className="px-3 py-2 text-slate-600 border border-blue-200">{desc}</td>
                      <td className="px-3 py-2 text-slate-500 border border-blue-200">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-blue-700 space-y-1 pt-2">
              <p>• 매출처와 제품은 <strong>사전에 등록된 이름/코드와 정확히 일치</strong>해야 합니다</p>
              <p>• 한 행이 한 건의 매출로 등록됩니다</p>
              <p>• .xlsx, .xls, .csv 파일을 지원합니다</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleSampleDownload} className="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 border border-slate-300">📋 샘플 양식 다운로드</button>
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">📤 엑셀 파일 선택하여 업로드</button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </div>
          {uploadResult && (
            <div className={`rounded-xl p-4 ${uploadResult.failed > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              <p className="text-sm font-semibold mb-2">업로드 결과</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-2"><p className="text-lg font-bold text-emerald-600">{uploadResult.success}</p><p className="text-xs text-slate-500">성공</p></div>
                <div className="bg-white rounded-lg p-2"><p className="text-lg font-bold text-red-600">{uploadResult.failed}</p><p className="text-xs text-slate-500">실패</p></div>
                <div className="bg-white rounded-lg p-2"><p className="text-lg font-bold text-slate-500">{uploadResult.total}</p><p className="text-xs text-slate-500">전체</p></div>
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="mt-3 bg-white rounded-lg p-3 max-h-32 overflow-y-auto">
                  {uploadResult.errors.map((err, i) => <p key={i} className="text-xs text-red-600">• {err}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 매출일 */}
      <div className="bg-white rounded-xl border p-4">
        <label className="block text-sm font-medium text-gray-600 mb-1">매출일</label>
        <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* 매출처 */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-600">매출처 (채널) 선택</h3>
        <div className="flex flex-wrap gap-2">
          {channels.map((ch) => (
            <button key={ch.id} onClick={() => handleChannelSelect(ch)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${selectedChannel?.id === ch.id ? 'text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={selectedChannel?.id === ch.id ? { backgroundColor: ch.color_code || '#3B82F6' } : {}}>{ch.channel_name}</button>
          ))}
        </div>
      </div>

      {/* 매입처 */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="text-sm font-semibold text-gray-600">매입처 (선택)</h3>
        <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs">
          <option value="">선택 안 함</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
        </select>
      </div>

      {/* 배송비 */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-600">📦 배송비 설정</h3>
        <p className="text-xs text-gray-400">"1회"는 수량 무관 한 번, "개당"은 총 수량에 곱합니다.</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-blue-700">배송비 수취</label>
              <div className="flex bg-white rounded-lg overflow-hidden border border-blue-200">
                <button onClick={() => setShippingReceivedMode('once')} className={`px-3 py-1 text-xs font-medium ${shippingReceivedMode === 'once' ? 'bg-blue-500 text-white' : 'text-blue-600'}`}>1회</button>
                <button onClick={() => setShippingReceivedMode('per')} className={`px-3 py-1 text-xs font-medium ${shippingReceivedMode === 'per' ? 'bg-blue-500 text-white' : 'text-blue-600'}`}>개당</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="text" value={fmt(shippingReceived)} onChange={(e) => setShippingReceived(parseNum(e.target.value))} className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm text-right font-medium bg-white" />
              <span className="text-sm text-blue-500">원</span>
            </div>
            {shippingReceivedMode === 'per' && totalQty > 0 && <p className="text-xs text-blue-600 font-medium">= {fmt(shippingReceived * totalQty)}원</p>}
          </div>
          <div className="bg-red-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-red-700">실제 배송비</label>
              <div className="flex bg-white rounded-lg overflow-hidden border border-red-200">
                <button onClick={() => setShippingCostMode('once')} className={`px-3 py-1 text-xs font-medium ${shippingCostMode === 'once' ? 'bg-red-500 text-white' : 'text-red-600'}`}>1회</button>
                <button onClick={() => setShippingCostMode('per')} className={`px-3 py-1 text-xs font-medium ${shippingCostMode === 'per' ? 'bg-red-500 text-white' : 'text-red-600'}`}>개당</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="text" value={fmt(shippingCost)} onChange={(e) => setShippingCost(parseNum(e.target.value))} className="flex-1 border border-red-200 rounded-lg px-3 py-2 text-sm text-right font-medium bg-white" />
              <span className="text-sm text-red-500">원</span>
            </div>
            {shippingCostMode === 'per' && totalQty > 0 && <p className="text-xs text-red-600 font-medium">= {fmt(shippingCost * totalQty)}원</p>}
          </div>
        </div>
      </div>

      {/* 제품 탭 */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-600">제품 목록</h3>
          <button onClick={addItem} className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">+ 제품 추가</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {items.map((it, idx) => (
            <div key={it.id} className="flex items-center">
              <button onClick={() => setActiveIdx(idx)} className={`px-3 py-1 text-sm rounded-t-lg ${idx === activeIdx ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {it.productName || `제품 ${idx + 1}`}{it.quantity > 1 && ` ×${it.quantity}`}
              </button>
              {items.length > 1 && <button onClick={() => removeItem(idx)} className="ml-0.5 px-1.5 py-1 text-xs text-red-400 hover:text-red-600 bg-gray-50 rounded-t-lg">✕</button>}
            </div>
          ))}
        </div>

        <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
          {/* 제품 검색 */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">제품 검색</label>
            {cur.productId ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-600 font-medium">✓ {cur.productName}</span>
                <button onClick={() => updateItem(curIdx, { productId: '', productName: '', productSearch: '', showDropdown: false, unitCost: 0, purchaseCost: 0, packagingCost: 0, additionalCost: 0 })} className="text-xs text-gray-400 hover:text-red-500">변경</button>
              </div>
            ) : (
              <>
                <input type="text" placeholder="제품명 또는 코드로 검색..." value={cur.productSearch}
                  onChange={(e) => updateItem(curIdx, { productSearch: e.target.value, showDropdown: true })}
                  onFocus={() => updateItem(curIdx, { showDropdown: true })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                {cur.showDropdown && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
                    {filteredProducts(cur.productSearch).map((p) => (
                      <button key={p.id} onClick={() => handleProductSelect(curIdx, p)} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0">
                        <span className="font-medium">{p.product_name}</span>
                        {p.product_code && <span className="text-gray-400 ml-2">({p.product_code})</span>}
                        <span className="text-gray-500 ml-2">원가 {fmt(p.total_cost ?? 0)}원</span>
                      </button>
                    ))}
                    {filteredProducts(cur.productSearch).length === 0 && <p className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</p>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 수량 + 원가 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">개당 원가</p>
              <p className="text-lg font-bold text-gray-800">{fmt(cur.unitCost)}원</p>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">수량</p>
              <div className="flex items-center gap-3">
                <button onClick={() => changeQty(curIdx, -1)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-200 hover:bg-gray-300 text-lg font-bold">−</button>
                <input type="number" min="1" value={cur.quantity} onChange={(e) => updateItem(curIdx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} className="w-16 text-center border rounded-lg py-1 text-lg font-bold" />
                <button onClick={() => changeQty(curIdx, 1)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-lg font-bold">+</button>
              </div>
            </div>
          </div>

          {/* 가격 모드 */}
          <div className="flex items-center gap-2">
            <button onClick={() => updateItem(curIdx, { priceMode: 'supply' })} className={`px-3 py-1 text-xs rounded-full ${cur.priceMode === 'supply' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>공급가 입력 → 판매가 자동</button>
            <button onClick={() => updateItem(curIdx, { priceMode: 'selling' })} className={`px-3 py-1 text-xs rounded-full ${cur.priceMode === 'selling' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>판매가 입력 → 공급가 역산</button>
          </div>

          {/* 공급가 · 판매가 · 수수료 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">개당 공급가 {cur.priceMode === 'supply' ? <span className="text-blue-500">(입력)</span> : <span className="text-gray-400">(자동)</span>}</label>
              <input type="text" value={fmt(cur.supplyPrice)} onChange={(e) => cur.priceMode === 'supply' && handleSupplyChange(curIdx, e.target.value)} readOnly={cur.priceMode !== 'supply'}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-right font-medium ${cur.priceMode === 'supply' ? 'bg-white border-blue-300' : 'bg-gray-100 text-gray-500'}`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">개당 판매가 {cur.priceMode === 'selling' ? <span className="text-blue-500">(입력)</span> : <span className="text-gray-400">(자동)</span>}</label>
              <input type="text" value={fmt(cur.sellingPrice)} onChange={(e) => cur.priceMode === 'selling' && handleSellingChange(curIdx, e.target.value)} readOnly={cur.priceMode !== 'selling'}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-right font-medium ${cur.priceMode === 'selling' ? 'bg-white border-blue-300' : 'bg-gray-100 text-gray-500'}`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">수수료</label>
              <div className="flex gap-1 mb-1">
                <button onClick={() => handleCommissionChange(curIdx, 'commissionType', cur.commissionType === 'rate' ? 'fixed' : 'rate')} className="text-xs px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300">
                  {cur.commissionType === 'rate' ? '정률(%)' : '정액(원)'}
                </button>
              </div>
              {cur.commissionType === 'rate' ? (
                <div className="flex items-center gap-1">
                  <input type="number" value={cur.commissionRate} onChange={(e) => handleCommissionChange(curIdx, 'commissionRate', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input type="text" value={fmt(cur.commissionFixed)} onChange={(e) => handleCommissionChange(curIdx, 'commissionFixed', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
                  <span className="text-sm text-gray-500">원</span>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">수수료: {fmt(getCommission(cur))}원/개</p>
            </div>
          </div>

          {/* 추가비용 · 메모 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">추가비용</label>
              <input type="text" value={fmt(cur.additionalFee)} onChange={(e) => updateItem(curIdx, { additionalFee: parseNum(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">메모</label>
              <input type="text" value={cur.memo} onChange={(e) => updateItem(curIdx, { memo: e.target.value })} placeholder="메모 (선택)" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* 전체 요약 */}
      {items.some((it) => it.productId) && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">전체 주문 요약 ({items.filter(it => it.productId).length}건 · 총 {totalQty}개)</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-2 py-1 text-left">제품</th><th className="px-2 py-1 text-right">수량</th>
                <th className="px-2 py-1 text-right">공급가 합계</th><th className="px-2 py-1 text-right">판매가 합계</th>
                <th className="px-2 py-1 text-right">원가</th><th className="px-2 py-1 text-right">수수료</th>
              </tr></thead>
              <tbody>
                {items.map((it) => { if (!it.productId) return null; const m = calcItemMargin(it); return (
                  <tr key={it.id} className="border-t">
                    <td className="px-2 py-1.5">{it.productName}</td><td className="px-2 py-1.5 text-right">{it.quantity}</td>
                    <td className="px-2 py-1.5 text-right text-blue-600">{fmt(m.supplyTotal)}</td><td className="px-2 py-1.5 text-right">{fmt(m.revenue)}</td>
                    <td className="px-2 py-1.5 text-right text-red-500">{fmt(m.cost)}</td><td className="px-2 py-1.5 text-right text-red-500">{fmt(m.commission)}</td>
                  </tr>
                )})}
                <tr className="border-t bg-gray-50">
                  <td className="px-2 py-1.5 font-medium" colSpan="2">📦 배송비</td>
                  <td className="px-2 py-1.5 text-right text-blue-600 font-medium">+{fmt(calcShippingReceivedTotal())}</td>
                  <td></td><td className="px-2 py-1.5 text-right text-red-500 font-medium">{fmt(calcShippingCostTotal())}</td><td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-indigo-500">거래처 발주 총액 (공급가 + 배송비 수취)</p>
                <p className="text-xs text-indigo-400 mt-0.5">= {fmt(tm.supplyTotal)}원 + {fmt(tm.shippingReceived)}원</p>
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

      <button onClick={handleSave} disabled={saving || !selectedChannel || !items.some((it) => it.productId)}
        className={`w-full py-3 rounded-xl text-white font-bold text-lg transition ${saving || !selectedChannel || !items.some((it) => it.productId) ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}>
        {saving ? '저장 중...' : `매출 등록 (${items.filter((it) => it.productId).length}건)`}
      </button>
    </div>
  )
}
