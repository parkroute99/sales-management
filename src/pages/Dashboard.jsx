import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b']

function Dashboard() {
  const [sales, setSales] = useState([])
  const [channels, setChannels] = useState([])
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [period])

  const fetchData = async () => {
    setLoading(true)

    const now = new Date()
    let startDate
    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      startDate = new Date(now.getFullYear(), 0, 1)
    }

    const { data: salesData } = await supabase
      .from('sales')
      .select('*, channels(channel_name, color_code)')
      .gte('sale_date', startDate.toISOString().split('T')[0])
      .order('sale_date', { ascending: false })

    const { data: channelsData } = await supabase
      .from('channels')
      .select('*')
      .eq('is_active', true)

    setSales(salesData || [])
    setChannels(channelsData || [])
    setLoading(false)
  }

  // 통계 계산
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_revenue || 0), 0)
  const totalCost = sales.reduce((sum, s) => sum + Number(s.total_cost || 0), 0)
  const totalProfit = sales.reduce((sum, s) => sum + Number(s.net_profit || 0), 0)
  const totalOrders = sales.length
  const avgMarginRate = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0

  // 채널별 매출
  const channelSales = channels.map(ch => {
    const chSales = sales.filter(s => s.channel_id === ch.id)
    const revenue = chSales.reduce((sum, s) => sum + Number(s.total_revenue || 0), 0)
    const profit = chSales.reduce((sum, s) => sum + Number(s.net_profit || 0), 0)
    const count = chSales.length
    return {
      name: ch.channel_name,
      매출: revenue,
      순이익: profit,
      건수: count,
      color: ch.color_code || '#6366f1',
      marginRate: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0,
    }
  }).filter(ch => ch.매출 > 0).sort((a, b) => b.매출 - a.매출)

  // 일별 매출 추이
  const dailySales = sales.reduce((acc, s) => {
    const date = s.sale_date
    if (!acc[date]) acc[date] = { date, 매출: 0, 순이익: 0 }
    acc[date].매출 += Number(s.total_revenue || 0)
    acc[date].순이익 += Number(s.net_profit || 0)
    return acc
  }, {})
  const dailyData = Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date))

  const formatMoney = (value) => {
    if (value >= 10000000) return `${(value / 10000000).toFixed(1)}천만`
    if (value >= 10000) return `${(value / 10000).toFixed(0)}만`
    return value.toLocaleString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 기간 선택 */}
      <div className="flex gap-2">
        {[
          { id: 'week', label: '이번 주' },
          { id: 'month', label: '이번 달' },
          { id: 'year', label: '올해' },
        ].map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: '총 매출', value: formatMoney(totalRevenue), sub: '원', color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: '총 비용', value: formatMoney(totalCost), sub: '원', color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: '순이익', value: formatMoney(totalProfit), sub: '원', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '평균 마진률', value: `${avgMarginRate}`, sub: '%', color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: '판매 건수', value: totalOrders.toLocaleString(), sub: '건', color: 'text-cyan-600', bg: 'bg-cyan-50' },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200">
            <p className="text-xs text-slate-500 mb-2">{card.label}</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${card.color}`}>{card.value}</span>
              <span className="text-sm text-slate-400">{card.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 채널별 매출 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">채널별 매출</h3>
          {channelSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelSales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatMoney} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${Number(v).toLocaleString()}원`} />
                <Bar dataKey="매출" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="순이익" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              데이터가 없습니다. 매출을 등록해주세요.
            </div>
          )}
        </div>

        {/* 매출 추이 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">일별 매출 추이</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatMoney} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${Number(v).toLocaleString()}원`} />
                <Line type="monotone" dataKey="매출" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="순이익" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              데이터가 없습니다.
            </div>
          )}
        </div>

        {/* 채널별 비중 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">채널별 매출 비중</h3>
          {channelSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={channelSales}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="매출"
                >
                  {channelSales.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${Number(v).toLocaleString()}원`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400">
              데이터가 없습니다.
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-4">
            {channelSales.map((ch, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                <span className="text-slate-600">{ch.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 채널별 마진률 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">채널별 마진률</h3>
          <div className="space-y-3">
            {channelSales.length > 0 ? channelSales.map((ch, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-24 truncate">{ch.name}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                    style={{
                      width: `${Math.max(Number(ch.marginRate), 5)}%`,
                      backgroundColor: Number(ch.marginRate) >= 30 ? '#10b981' : Number(ch.marginRate) >= 20 ? '#f59e0b' : '#ef4444',
                    }}
                  >
                    <span className="text-xs font-medium text-white">{ch.marginRate}%</span>
                  </div>
                </div>
                <span className="text-xs text-slate-500 w-16 text-right">{formatMoney(ch.순이익)}원</span>
              </div>
            )) : (
              <div className="h-48 flex items-center justify-center text-slate-400">
                데이터가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
