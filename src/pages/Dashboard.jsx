import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']

function Dashboard() {
  const [sales, setSales] = useState([])
  const [channels, setChannels] = useState([])
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [period])

  const fetchData = async () => {
    setLoading(true)
    const now = new Date()
    let startDate
    if (period === 'week') startDate = new Date(now.getTime() - 7*24*60*60*1000)
    else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    else startDate = new Date(now.getFullYear(), 0, 1)

    const { data: salesData } = await supabase.from('sales')
      .select('*, channels(channel_name, color_code)')
      .gte('sale_date', startDate.toISOString().split('T')[0])
      .order('sale_date', { ascending: false })
    const { data: channelsData } = await supabase.from('channels')
      .select('*').eq('is_active', true)

    setSales(salesData || [])
    setChannels(channelsData || [])
    setLoading(false)
  }

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_revenue || 0), 0)
  const totalCost = sales.reduce((s, r) => s + Number(r.total_cost || 0), 0)
  const totalProfit = sales.reduce((s, r) => s + Number(r.net_profit || 0), 0)
  const totalOrders = sales.length
  const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0

  const channelSales = channels.map(ch => {
    const cs = sales.filter(s => s.channel_id === ch.id)
    const rev = cs.reduce((s, r) => s + Number(r.total_revenue || 0), 0)
    const prof = cs.reduce((s, r) => s + Number(r.net_profit || 0), 0)
    return { name: ch.channel_name, 매출: rev, 순이익: prof, 건수: cs.length, color: ch.color_code || '#6366f1', marginRate: rev > 0 ? ((prof/rev)*100).toFixed(1) : 0 }
  }).filter(c => c.매출 > 0).sort((a,b) => b.매출 - a.매출)

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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256 }}>
      <div style={{ width:40, height:40, border:'4px solid #6366f1', borderTopColor:'transparent', borderRadius:'50%' }} className="animate-spin"></div>
    </div>
  )

  const cardStyle = { background:'#fff', borderRadius:16, padding:20, border:'1px solid #e2e8f0' }
  const periodBtnStyle = (active) => ({
    padding:'8px 16px', borderRadius:8, fontSize:14, fontWeight:500, border: active ? 'none' : '1px solid #e2e8f0',
    background: active ? '#6366f1' : '#fff', color: active ? '#fff' : '#64748b', cursor:'pointer'
  })

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:24 }}>
        {[{id:'week',label:'이번 주'},{id:'month',label:'이번 달'},{id:'year',label:'올해'}].map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)} style={periodBtnStyle(period===p.id)}>{p.label}</button>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:16, marginBottom:24 }}>
        {[
          {label:'총 매출',value:fmt(totalRevenue),sub:'원',color:'#6366f1'},
          {label:'총 비용',value:fmt(totalCost),sub:'원',color:'#f97316'},
          {label:'순이익',value:fmt(totalProfit),sub:'원',color:'#10b981'},
          {label:'평균 마진률',value:avgMargin,sub:'%',color:'#8b5cf6'},
          {label:'판매 건수',value:totalOrders.toLocaleString(),sub:'건',color:'#06b6d4'},
        ].map((c,i) => (
          <div key={i} style={cardStyle}>
            <p style={{ fontSize:12, color:'#94a3b8', marginBottom:8 }}>{c.label}</p>
            <span style={{ fontSize:24, fontWeight:700, color:c.color }}>{c.value}</span>
            <span style={{ fontSize:14, color:'#94a3b8', marginLeft:4 }}>{c.sub}</span>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap:24 }}>
        <div style={cardStyle}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#1e293b', marginBottom:16 }}>채널별 매출</h3>
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
          ) : <div style={{ height:300, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>데이터가 없습니다. 매출을 등록해주세요.</div>}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#1e293b', marginBottom:16 }}>일별 매출 추이</h3>
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
          ) : <div style={{ height:300, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>데이터가 없습니다.</div>}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#1e293b', marginBottom:16 }}>채널별 매출 비중</h3>
          {channelSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={channelSales} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="매출">
                  {channelSales.map((e,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => `${Number(v).toLocaleString()}원`} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div style={{ height:250, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>데이터가 없습니다.</div>}
          <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginTop:16 }}>
            {channelSales.map((ch,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                <div style={{ width:12, height:12, borderRadius:'50%', background:COLORS[i%COLORS.length] }}></div>
                <span style={{ color:'#64748b' }}>{ch.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#1e293b', marginBottom:16 }}>채널별 마진률</h3>
          {channelSales.length > 0 ? channelSales.map((ch,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
              <span style={{ fontSize:13, color:'#64748b', width:96, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ch.name}</span>
              <div style={{ flex:1, background:'#f1f5f9', borderRadius:12, height:24, overflow:'hidden' }}>
                <div style={{
                  height:'100%', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:8,
                  width:`${Math.max(Number(ch.marginRate),5)}%`,
                  background: Number(ch.marginRate)>=30 ? '#10b981' : Number(ch.marginRate)>=20 ? '#f59e0b' : '#ef4444',
                  transition:'width 0.5s'
                }}>
                  <span style={{ fontSize:11, fontWeight:500, color:'#fff' }}>{ch.marginRate}%</span>
                </div>
              </div>
              <span style={{ fontSize:12, color:'#94a3b8', width:64, textAlign:'right' }}>{fmt(ch.순이익)}원</span>
            </div>
          )) : <div style={{ height:192, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>데이터가 없습니다.</div>}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
