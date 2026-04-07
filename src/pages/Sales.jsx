import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const fmt = (n) => (n ?? 0).toLocaleString('ko-KR')
const parseNum = (s) => {
  if (!s && s !== 0) return 0
  return Number(String(s).replace(/,/g, '')) || 0
}

function Sales() {
  const [sales, setSales] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterChannel, setFilterChannel] = useState('all')

  const [periodType, setPeriodType] = useState('month')
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [filterDay, setFilterDay] = useState(new Date().toISOString().slice(0, 10))
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const [sortField, setSortField] = useState('sale_date')
  const [sortAsc, setSortAsc] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  useEffect(() => { fetchData() }, [])
  useEffect(() => { fetchSales() }, [filterChannel, periodType, filterMonth, filterDay, customStart, customEnd])

  const fetchData = async () => {
    const { data } = await supabase.from('channels').select('*').order('sort_order')
    setChannels(data || [])
    fetchSales()
  }

  const getDateRange = () => {
    const today = new Date()
    switch (periodType) {
      case 'all': return { start: null, end: null }
      case 'month': {
        if (!filterMonth) return { start: null, end: null }
        const ms = filterMonth + '-01'
        const me = new Date(filterMonth + '-01'); me.setMonth(me.getMonth() + 1)
        return { start: ms, end: me.toISOString().slice(0, 10) }
      }
      case 'week': {
        const dow = today.getDay()
        const mon = new Date(today); mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
        const sun = new Date(mon); sun.setDate(mon.getDate() + 7)
        return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) }
      }
      case 'day': {
        if (!filterDay) return { start: null, end: null }
        const nd = new Date(filterDay); nd.setDate(nd.getDate() + 1)
        return { start: filterDay, end: nd.toISOString().slice(0, 10) }
      }
      case 'custom': {
        let ee = null
        if (customEnd) { const d = new Date(customEnd); d.setDate(d.getDate() + 1); ee = d.toISOString().slice(0, 10) }
        return { start: customStart || null, end: ee }
      }
      default: return { start: null, end: null }
    }
  }

  const fetchSales = async () => {
    setLoading(true)
    let query = supabase
      .from('sales')
      .select('*, channels(channel_name, color_code), products(product_name, product_code)')
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000)

    if (filterChannel !== 'all') query = query.eq('channel_id', filterChannel)
    const { start, end } = getDateRange()
    if (start) query = query.gte('sale_date', start)
    if (end) query = query.lt('sale_date', end)

    const { data, error } = await query
    if (error) console.error('Sales fetch error:', error)
    setSales(data || [])
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('이 매출 내역을 삭제하시겠습니까?')) return
    const { error } = await supabase.from('sales').delete().eq('id', id)
    if (error) alert('삭제 실패: ' + error.message)
    else fetchSales()
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditForm({
      quantity: r.quantity, supply_price: r.supply_price, selling_price: r.selling_price,
      commission_amount: r.commission_amount, shipping_fee_received: r.shipping_fee_received || 0,
      shipping_cost: r.shipping_cost || 0, additional_fee: r.additional_fee || 0,
      product_cost: r.product_cost, memo: r.memo || '',
    })
  }

  const cancelEdit = () => { setEditingId(null); setEditForm({}) }

  const saveEdit = async (id) => {
    const qty = parseNum(editForm.quantity)
    const selling = parseNum(editForm.selling_price)
    const supply = parseNum(editForm.supply_price)
    const commission = parseNum(editForm.commission_amount)
    const shippingRcv = parseNum(editForm.shipping_fee_received)
    const shippingCost = parseNum(editForm.shipping_cost)
    const additionalFee = parseNum(editForm.additional_fee)
    const productCost = parseNum(editForm.product_cost)

    const itemRev = selling * qty
    const totalRevAll = itemRev + shippingRcv
    const totalCostCalc = productCost + commission + shippingCost + additionalFee
    const netProfit = totalRevAll - totalCostCalc
    const marginRate = totalRevAll > 0 ? parseFloat(((netProfit / totalRevAll) * 100).toFixed(1)) : 0

    const { error } = await supabase.from('sales').update({
      quantity: qty, supply_price: supply, selling_price: selling,
      commission_amount: commission, shipping_fee_received: shippingRcv,
      shipping_cost: shippingCost, additional_fee: additionalFee,
      product_cost: productCost, total_revenue: totalRevAll,
      net_profit: netProfit, margin_rate: marginRate, memo: editForm.memo,
    }).eq('id', id)

    if (error) alert('수정 실패: ' + error.message)
    else { cancelEdit(); fetchSales() }
  }

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const sortedSales = [...sales].sort((a, b) => {
    let va, vb
    switch (sortField) {
      case 'sale_date': va = a.sale_date; vb = b.sale_date; break
      case 'product_name': va = a.products?.product_name || ''; vb = b.products?.product_name || ''; break
      case 'channel_name': va = a.channels?.channel_name || ''; vb = b.channels?.channel_name || ''; break
      case 'revenueAll':
        va = ((a.selling_price||0)*(a.quantity||0)) + (a.shipping_fee_received||0)
        vb = ((b.selling_price||0)*(b.quantity||0)) + (b.shipping_fee_received||0)
        break
      default: va = a[sortField]; vb = b[sortField]
    }
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortAsc ? (va||0) - (vb||0) : (vb||0) - (va||0)
  })

  const gTotal = {
    qty: sales.reduce((s, r) => s + (r.quantity || 0), 0),
    supply: sales.reduce((s, r) => s + ((r.supply_price||0) * (r.quantity||0)), 0),
    itemRev: sales.reduce((s, r) => s + ((r.selling_price||0) * (r.quantity||0)), 0),
    shippingRcv: sales.reduce((s, r) => s + (r.shipping_fee_received || 0), 0),
    cost: sales.reduce((s, r) => s + (r.product_cost || 0), 0),
    commission: sales.reduce((s, r) => s + (r.commission_amount || 0), 0),
    shippingCost: sales.reduce((s, r) => s + (r.shipping_cost || 0), 0),
    profit: sales.reduce((s, r) => s + (r.net_profit || 0), 0),
  }
  gTotal.revenueAll = gTotal.itemRev + gTotal.shippingRcv
  gTotal.marginRate = gTotal.revenueAll > 0 ? ((gTotal.profit / gTotal.revenueAll) * 100).toFixed(1) : '0.0'

  const handleExcelDownload = () => {
    const rows = sales.map(r => ({
      '매출일': r.sale_date, '매출처': r.channels?.channel_name || '',
      '제품코드': r.products?.product_code || '', '제품명': r.products?.product_name || '',
      '수량': r.quantity, '원가': r.product_cost,
      '공급가(개당)': r.supply_price, '판매가(개당)': r.selling_price,
      '상품매출': (r.selling_price||0)*(r.quantity||0),
      '배송비수취': r.shipping_fee_received||0,
      '총매출(배송비포함)': ((r.selling_price||0)*(r.quantity||0))+(r.shipping_fee_received||0),
      '수수료': r.commission_amount, '실배송비': r.shipping_cost,
      '순이익': r.net_profit, '마진율(%)': r.margin_rate, '메모': r.memo || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Array(16).fill({ wch: 14 })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '매출내역')
    XLSX.writeFile(wb, `매출내역_${periodType === 'month' ? filterMonth : 'export'}.xlsx`)
  }

  const getPeriodLabel = () => {
    switch (periodType) {
      case 'all': return '전체 기간'
      case 'month': return filterMonth ? `${filterMonth.replace('-', '년 ')}월` : ''
      case 'week': { const { start } = getDateRange(); return start ? `${start} ~ 이번 주` : '' }
      case 'day': return filterDay || ''
      case 'custom': return `${customStart || '시작'} ~ ${customEnd || '끝'}`
      default: return ''
    }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-slate-300 ml-1 text-xs">↕</span>
    return <span className="text-indigo-500 ml-1 text-xs">{sortAsc ? '↑' : '↓'}</span>
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">총 매출 (배송비포함)</p>
          <p className="text-xl font-bold text-blue-700">{fmt(gTotal.revenueAll)}원</p>
          <p className="text-xs text-slate-400 mt-1">{sales.length}건 · {gTotal.qty}개</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">상품매출</p>
          <p className="text-lg font-bold text-blue-600">{fmt(gTotal.itemRev)}원</p>
          <p className="text-xs text-slate-400 mt-1">+ 배송비 {fmt(gTotal.shippingRcv)}원</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">총 원가</p>
          <p className="text-lg font-bold text-red-600">{fmt(gTotal.cost)}원</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">총 수수료</p>
          <p className="text-lg font-bold text-orange-600">{fmt(gTotal.commission)}원</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">순이익</p>
          <p className={`text-xl font-bold ${gTotal.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(gTotal.profit)}원</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">마진율</p>
          <p className={`text-xl font-bold ${gTotal.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{gTotal.marginRate}%</p>
        </div>
      </div>

      {/* 기간 필터 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {[{ key: 'all', label: '전체' }, { key: 'day', label: '일별' }, { key: 'week', label: '이번 주' }, { key: 'month', label: '월별' }, { key: 'custom', label: '기간 지정' }].map((o) => (
            <button key={o.key} onClick={() => setPeriodType(o.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${periodType === o.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {periodType === 'month' && <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-300 outline-none text-sm" />}
          {periodType === 'day' && <input type="date" value={filterDay} onChange={e => setFilterDay(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-300 outline-none text-sm" />}
          {periodType === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-300 outline-none text-sm" />
              <span className="text-sm text-slate-400">~</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-300 outline-none text-sm" />
            </>
          )}
          <p className="text-sm text-slate-500">{getPeriodLabel()}</p>
        </div>
      </div>

      {/* 매출처 필터 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterChannel('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filterChannel === 'all' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>전체</button>
          {channels.map(ch => (
            <button key={ch.id} onClick={() => setFilterChannel(ch.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filterChannel === ch.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{ch.channel_name}</button>
          ))}
        </div>
        <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 엑셀 다운로드</button>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('sale_date')}>매출일<SortIcon field="sale_date" /></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('channel_name')}>매출처<SortIcon field="channel_name" /></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('product_name')}>제품명<SortIcon field="product_name" /></th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('quantity')}>수량<SortIcon field="quantity" /></th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('product_cost')}>원가<SortIcon field="product_cost" /></th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('supply_price')}>공급가<SortIcon field="supply_price" /></th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('selling_price')}>판매가<SortIcon field="selling_price" /></th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('revenueAll')}>매출(배송비포함)<SortIcon field="revenueAll" /></th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('net_profit')}>순이익<SortIcon field="net_profit" /></th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">마진</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {sortedSales.map(r => {
                const isEditing = editingId === r.id
                const rItemRev = (r.selling_price||0) * (r.quantity||0)
                const rRevAll = rItemRev + (r.shipping_fee_received||0)

                if (isEditing) {
                  return (
                    <tr key={r.id} className="border-b border-blue-100 bg-blue-50">
                      <td colSpan="11" className="px-4 py-4">
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-blue-700">✏️ 수정: {r.products?.product_name} ({r.sale_date})</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">수량</label>
                              <input type="number" value={editForm.quantity} onChange={e => setEditForm({...editForm, quantity: e.target.value})}
                                className="w-full px-3 py-2 rounded-lg border text-sm text-right" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">공급가 (개당)</label>
                              <input type="text" value={fmt(editForm.supply_price)} onChange={e => setEditForm({...editForm, supply_price: parseNum(e.target.value)})}
                                className="w-full px-3 py-2 rounded-lg border text-sm text-right" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">판매가 (개당)</label>
                              <input type="text" value={fmt(editForm.selling_price)} onChange={e => setEditForm({...editForm, selling_price: parseNum(e.target.value)})}
                                className="w-full px-3 py-2 rounded-lg border text-sm text-right" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">원가 (총)</label>
                              <input type="text" value={fmt(editForm.product_cost)} onChange={e => setEditForm({...editForm, product_cost: parseNum(e.target.value)})}
                                className="w-full px-3 py-2 rounded-lg border text-sm text-right" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">수수료 (총)</label>
                              <input type="text" value={fmt(editForm.commission_amount)} onChange={e => setEditForm({...editForm, commission_amount: parseNum(e.target.value)})}
                                className="w-full px-3 py-2 rounded-lg border text-sm text-right" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">배송비 수취</label>
                              <input type="text" value={fmt(editForm.shipping_fee_received)} onChange={e => setEditForm({...editForm, shipping_fee_received: parseNum(e.target.value)})}
                                className="w-full px-3 py-2 rounded-lg border text-sm text-right" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">실 배송비</label>
                              <input type="text" value={fmt(editForm.shipping_cost)} onChange={e => setEditForm({...editForm, shipping_cost: parseNum(e.target.value)})}
                                className="w-full px-3 py-2 rounded-lg border text-sm text-right" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">메모</label>
                              <input type="text" value={editForm.memo} onChange={e => setEditForm({...editForm, memo: e.target.value})}
                                className="w-full px-3 py-2 rounded-lg border text-sm" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(r.id)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">저장</button>
                            <button onClick={cancelEdit} className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">취소</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-600">{r.sale_date}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium text-white" style={{ backgroundColor: r.channels?.color_code || '#6366f1' }}>{r.channels?.channel_name || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{r.products?.product_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-center text-slate-600">{r.quantity}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600">{fmt(r.product_cost)}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">{fmt((r.supply_price||0)*(r.quantity||0))}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600">{fmt(rItemRev)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-blue-700">
                      {fmt(rRevAll)}
                      {(r.shipping_fee_received||0) > 0 && <span className="block text-xs font-normal text-slate-400">배송비 +{fmt(r.shipping_fee_received)}</span>}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${(r.net_profit||0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(r.net_profit)}</td>
                    <td className="px-4 py-3 text-center"><span className={`text-xs font-medium ${(r.margin_rate||0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{(r.margin_rate||0).toFixed(1)}%</span></td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => startEdit(r)} className="p-1 hover:bg-slate-200 rounded text-xs mr-1">✏️</button>
                      <button onClick={() => handleDelete(r.id)} className="p-1 hover:bg-red-50 rounded text-xs">🗑️</button>
                    </td>
                  </tr>
                )
              })}
              {sortedSales.length === 0 && (
                <tr><td colSpan="11" className="px-5 py-12 text-center text-slate-400">매출 내역이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Sales
