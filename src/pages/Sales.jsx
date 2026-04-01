import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function Sales() {
  const [sales, setSales] = useState([])
  const [channels, setChannels] = useState([])
  const [filterChannel, setFilterChannel] = useState('all')
  const [filterDate, setFilterDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('sale_date')
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    fetchData()
  }, [filterChannel, filterDate, sortBy, sortDesc])

  const fetchData = async () => {
    setLoading(true)

    let query = supabase
      .from('sales')
      .select('*, channels(channel_name, color_code), products(product_name, product_code)')
      .order(sortBy, { ascending: !sortDesc })
      .limit(200)

    if (filterChannel !== 'all') {
      query = query.eq('channel_id', filterChannel)
    }
    if (filterDate) {
      query = query.gte('sale_date', filterDate + '-01')
        .lte('sale_date', filterDate + '-31')
    }

    const { data: salesData } = await query
    const { data: channelsData } = await supabase.from('channels').select('*').eq('is_active', true).order('sort_order')

    setSales(salesData || [])
    setChannels(channelsData || [])
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 매출 기록을 삭제하시겠습니까?')) {
      await supabase.from('sales').delete().eq('id', id)
      fetchData()
    }
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_revenue || 0), 0)
  const totalProfit = sales.reduce((s, r) => s + Number(r.net_profit || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterChannel}
          onChange={e => setFilterChannel(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm"
        >
          <option value="all">전체 채널</option>
          {channels.map(ch => (
            <option key={ch.id} value={ch.id}>{ch.channel_name}</option>
          ))}
        </select>

        <input
          type="month"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm"
        />

        {filterDate && (
          <button
            onClick={() => setFilterDate('')}
            className="px-3 py-2.5 text-sm text-slate-500 hover:text-slate-700"
          >
            초기화
          </button>
        )}
      </div>

      {/* 요약 */}
      <div className="flex gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">총 매출 </span>
          <span className="text-lg font-bold text-indigo-600">{formatNumber(totalRevenue)}</span>
          <span className="text-xs text-slate-400">원 ({sales.length}건)</span>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">순이익 </span>
          <span className={`text-lg font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatNumber(totalProfit)}</span>
          <span className="text-xs text-slate-400">원</span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">날짜</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">채널</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">제품</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">수량</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">판매가</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">매출</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">비용</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">순이익</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">마진</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">구분</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(sale => (
                <tr key={sale.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-600">{sale.sale_date}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-white"
                      style={{ backgroundColor: sale.channels?.color_code || '#6366f1' }}
                    >
                      {sale.channels?.channel_name || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800 max-w-[200px] truncate">
                    {sale.products?.product_name || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-slate-600">{sale.quantity}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-600">{formatNumber(sale.selling_price)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-slate-800">{formatNumber(sale.total_revenue)}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-500">{formatNumber(sale.total_cost)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-semibold ${Number(sale.net_profit) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatNumber(sale.net_profit)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      Number(sale.margin_rate) >= 30 ? 'bg-emerald-100 text-emerald-700' :
                      Number(sale.margin_rate) >= 20 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {sale.margin_rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      sale.input_method === 'EXCEL' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {sale.input_method === 'EXCEL' ? '엑셀' : '수기'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(sale.id)}
                      className="p-1 hover:bg-red-50 rounded text-sm"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan="11" className="px-4 py-12 text-center text-slate-400">
                    매출 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Sales
