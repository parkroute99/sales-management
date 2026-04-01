import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']

function Dashboard() {
  const [sales, setSales] = useState([])
  const [purchases, setPurchases] = useState([])
  const [channels, setChannels] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [period])

  const fetchData = async () => {
    setLoading(true)
    const now = new Date()
    let startDate
    if (period === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    else if (period === 'week') startDate = new Date(now.getTime() - 7*24*60*60*1000)
    else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    else startDate = new Date(now.getFullYear(), 0, 1)

    const dateStr = startDate.toISOString().split('T')[0]

    const { data: salesData } = await supabase.from('sales')
      .select('*, channels(channel_name, color_code)').gte('sale_date', dateStr).order('sale_date', { ascending: false })
    const { data: purchaseData } = await supabase.from('purchases')
      .select('*, suppliers(supplier_name, color_code)').gte('purchase_date', dateStr).order('purchase_date', { ascending: false })
    const { data: chData } = await supabase.from('channels').select('*').eq('is_active', true)
    const { data: spData } = await supabase.from('suppliers').select('*').eq('is_active', true)

    setSales(salesData || []); setPurchases(purchaseData || [])
    setChannels(chData || []); setSuppliers(spData || [])
    setLoading(false)
  }

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_revenue || 0), 0)
  const totalSalesCost = sales.reduce((s, r) => s + Number(r.total_cost || 0), 0)
  const totalProfit = sales.reduce((s, r) => s + Number(r.net_profit || 0), 0)
  const totalPurchase = purchases.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0
  const realProfit = totalRevenue - totalPurchase - totalSalesCost + sales.reduce((s,r) => s + Number(r.product_cost||0), 0)

  const channelSales = channels.map(ch => {
    const cs = sales.filter(s => s.channel_id === ch.id)
    const rev = cs.reduce((s, r) => s + Number(r.total_revenue || 0), 0)
    const prof = cs.reduce((s, r) => s + Number(r.net_profit || 0), 0)
    return { name: ch.channel_name, 매출: rev, 순이익: prof, 건수: cs.length, marginRate: rev > 0 ? ((prof/rev)*100).toFixed(1) : 0 }
  }).filter(c => c.매출 > 0).sort((a,b) => b.매출 - a.매출)

  const supplierPurchases = suppliers.map(sp => {
    const ps = purchases.filter(p => p.supplier_id === sp.id)
    const amt = ps.reduce((s, r) => s + Number(r.total_amount || 0), 0)
    return { name: sp.supplier_name, 매입액: amt, 건수: ps.length }
  }).filter(s => s.매입액 > 0).sort((a,b) => b.매입액 - a.매입액)

  const dailySales = sales.reduce((acc, s) => {
    const d = s.sale_date
    if (!acc[d]) acc[d] = { date: d, 매출: 0, 순이익: 0 }
    acc[d].매출 += Number(s.total_revenue || 0)
    acc[d].순이익 += Number(s.net_profit || 0)
    return acc
  }, {})
  const dailyData = Object.values(dailySales).sort((a,b) => a.date.localeCompare(b.date))

  const fmt = (v) => {
    if (v >= 10000000) return `${(v/10000000).toFixed(1)}천만`
    if (v >= 10000) return `${(v/10000).toFixed(0)}만`
    return v.toLocaleString()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[{id:'today',label:'오늘'},{id:'week',label:'이번 주'},{id:'month',label:'이번 달'},{id:'year',label:'올해'}].map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}>{p.label}</button>
        ))}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          {label:'총 매출',value:fmt(totalRevenue),sub:'원',color:'text-indigo-600'},
          {label:'총 매입',value:fmt(totalPurchase),sub:'원',color:'text-orange-600'},
          {label:'총 비용',value:fmt(totalSalesCost),sub:'원',color:'text-red-500'},
          {label:'순이익',value:fmt(totalProfit),sub:'원',color:'text-emerald-600'},
          {label:'평균 마진률',value:avgMargin,sub:'%',color:'text-purple-600'},
          {label:'매출 건수',value:sales.length.toLocaleString(),sub:'건',color:'text-cyan-600'},
        ].map((c,i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200">
            <p className="text-xs text-slate-500 mb-2">{c.label}</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${c.color}`}>{c.value}</span>
              <span className="text-sm text-slate-400">{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">매출처별 매출</h3>
          {channelSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelSales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize:12}} />
                <YAxis tickFormatter={fmt} tick={{fontSize:11}} />
                <Tooltip formatter={v => `${Number(v).toLocaleString()}원`} />
                <Bar dataKey="매출" fill="#6366f1" radius={[6,6,0,0]} />
                <Bar dataKey="순이익" fill="#10b981" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-64 flex items-center justify-center text-slate-400">매출 데이터가 없습니다.</div>}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">일별 매출 추이</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{fontSize:11}} />
                <YAxis tickFormatter={fmt} tick={{fontSize:11}} />
                <Tooltip formatter={v => `${Number(v).toLocaleString()}원`} />
                <Line type="monotone" dataKey="매출" stroke="#6366f1" strokeWidth={2} dot={{r:3}} />
                <Line type="monotone" dataKey="순이익" stroke="#10b981" strokeWidth={2} dot={{r:3}} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="h-64 flex items-center justify-center text-slate-400">데이터가 없습니다.</div>}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">매출처별 비중</h3>
          {channelSales.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={channelSales} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="매출">
                    {channelSales.map((e,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `${Number(v).toLocaleString()}원`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-4">
                {channelSales.map((ch,i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i%COLORS.length] }}></div>
                    <span className="text-slate-600">{ch.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="h-64 flex items-center justify-center text-slate-400">데이터가 없습니다.</div>}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">매입처별 매입현황</h3>
          {supplierPurchases.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={supplierPurchases} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={fmt} tick={{fontSize:11}} />
                <YAxis type="category" dataKey="name" tick={{fontSize:12}} width={80} />
                <Tooltip formatter={v => `${Number(v).toLocaleString()}원`} />
                <Bar dataKey="매입액" fill="#f59e0b" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-64 flex items-center justify-center text-slate-400">매입 데이터가 없습니다.</div>}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">매출처별 마진률</h3>
          {channelSales.length > 0 ? (
            <div className="space-y-3">
              {channelSales.map((ch,i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-24 truncate">{ch.name}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                      style={{ width:`${Math.max(Number(ch.marginRate),5)}%`,
                        background: Number(ch.marginRate)>=30 ? '#10b981' : Number(ch.marginRate)>=20 ? '#f59e0b' : '#ef4444' }}>
                      <span className="text-xs font-medium text-white">{ch.marginRate}%</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 w-20 text-right">{fmt(ch.순이익)}원</span>
                </div>
              ))}
            </div>
          ) : <div className="h-48 flex items-center justify-center text-slate-400">데이터가 없습니다.</div>}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
