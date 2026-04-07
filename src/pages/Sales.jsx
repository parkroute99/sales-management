
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const fmt = (n) => (n ?? 0).toLocaleString('ko-KR')

function Sales() {
  const [sales, setSales] = useState([])
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterChannel, setFilterChannel] = useState('all')
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [sortField, setSortField] = useState('sale_date')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { fetchSales() }, [filterChannel, filterMonth])

  const fetchData = async () => {
    const { data } = await supabase.from('channels').select('*').order('sort_order')
    setChannels(data || [])
    fetchSales()
  }

  const fetchSales = async () => {
    setLoading(true)
    let query = supabase
      .from('sales')
      .select('*, channels(channel_name, color_code), products(product_name, product_code)')
      .order('sale_date', { ascending: false })
      .limit(500)

    if (filterChannel !== 'all') {
      query = query.eq('channel_id', filterChannel)
    }
    if (filterMonth) {
      const start = filterMonth + '-01'
      const endDate = new Date(filterMonth + '-01')
      endDate.setMonth(endDate.getMonth() + 1)
      const end = endDate.toISOString().slice(0, 10)
      query = query.gte('sale_date', start).lt('sale_date', end)
    }

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

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const sortedSales = [...sales].sort((a, b) => {
    let va = a[sortField], vb = b[sortField]
    if (sortField === 'product_name') { va = a.products?.product_name || ''; vb = b.products?.product_name || '' }
    if (sortField === 'channel_name') { va = a.channels?.channel_name || ''; vb = b.channels?.channel_name || '' }
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortAsc ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0)
  })

  const totalRevenue = sales.reduce((s, r) => s + (r.total_revenue || 0), 0)
  const totalCost = sales.reduce((s, r) => s + (r.product_cost || 0), 0)
  const totalCommission = sales.reduce((s, r) => s + (r.commission_amount || 0), 0)
  const totalProfit = sales.reduce((s, r) => s + (r.net_profit || 0), 0)
  const totalQty = sales.reduce((s, r) => s + (r.quantity || 0), 0)

  const handleExcelDownload = () => {
    const excelData = sortedSales.map(r => ({
      '매출일': r.sale_date,
      '매출처': r.channels?.channel_name || '',
      '제품코드': r.products?.product_code || '',
      '제품명': r.products?.product_name || '',
      '수량': r.quantity,
      '공급가': r.supply_price,
      '판매가': r.selling_price,
      '총매출': r.total_revenue,
      '원가': r.product_cost,
      '수수료': r.commission_amount,
      '배송비': r.shipping_cost,
      '순이익': r.net_profit,
      '마진율(%)': r.margin_rate,
      '메모': r.memo || '',
    }))
    const ws = XLSX.utils.json_to_sheet(excelData)
    ws['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '매출내역')
    XLSX.writeFile(wb, `매출내역_${filterMonth || 'all'}.xlsx`)
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-slate-300 ml-1">↕</span>
    return <span className="text-indigo-500 ml-1">{sortAsc ? '↑' : '↓'}</span>
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">총 매출</p>
          <p className="text-xl font-bold text-blue-700">{fmt(totalRevenue)}원</p>
          <p className="text-xs text-slate-400 mt-1">{sales.length}건 · {totalQty}개</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">총 원가</p>
          <p className="text-xl font-bold text-red-600">{fmt(totalCost)}원</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">총 수수료</p>
          <p className="text-xl font-bold text-orange-600">{fmt(totalCommission)}원</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">순이익</p>
          <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(totalProfit)}원</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">평균 마진율</p>
          <p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3 items-center">
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
          <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm">
            <option value="all">전체 매출처</option>
            {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.channel_name}</option>)}
          </select>
          <p className="text-sm text-slate-500">{sales.length}건</p>
        </div>
        <button onClick={handleExcelDownload}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">
          📥 엑셀 다운로드
        </button>
      </div>

      {/* 매출처별 빠른 필터 */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterChannel('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filterChannel === 'all' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}>전체</button>
        {channels.map(ch => (
          <button key={ch.id} onClick={() => setFilterChannel(ch.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filterChannel === ch.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}>{ch.channel_name}</button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('sale_date')}>
                  매출일<SortIcon field="sale_date" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('channel_name')}>
                  매출처<SortIcon field="channel_name" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('product_name')}>
                  제품명<SortIcon field="product_name" />
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('quantity')}>
                  수량<SortIcon field="quantity" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('supply_price')}>
                  공급가<SortIcon field="supply_price" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('selling_price')}>
                  판매가<SortIcon field="selling_price" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('total_revenue')}>
                  매출<SortIcon field="total_revenue" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer" onClick={() => handleSort('net_profit')}>
                  순이익<SortIcon field="net_profit" />
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">마진</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {sortedSales.map(r => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-600">{r.sale_date}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium text-white"
                      style={{ backgroundColor: r.channels?.color_code || '#6366f1' }}>
                      {r.channels?.channel_name || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{r.products?.product_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-center text-slate-600">{r.quantity}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-600">{fmt(r.supply_price)}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-600">{fmt(r.selling_price)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-blue-700">{fmt(r.total_revenue)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${(r.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmt(r.net_profit)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium ${(r.margin_rate || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {(r.margin_rate || 0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleDelete(r.id)} className="p-1 hover:bg-red-50 rounded text-sm">🗑️</button>
                  </td>
                </tr>
              ))}
              {sortedSales.length === 0 && (
                <tr><td colSpan="10" className="px-5 py-12 text-center text-slate-400">매출 내역이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Sales
