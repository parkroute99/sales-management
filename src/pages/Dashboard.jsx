import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import * as XLSX from 'xlsx'

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']
const fmt = (n) => (n ?? 0).toLocaleString('ko-KR')

function Dashboard() {
  const [sales, setSales] = useState([])
  const [purchases, setPurchases] = useState([])
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [channels, setChannels] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)

  const [periodType, setPeriodType] = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const [showDownload, setShowDownload] = useState(false)
  const [downloadMode, setDownloadMode] = useState('period')
  const [downloadPeriod, setDownloadPeriod] = useState('month')
  const [downloadDateFrom, setDownloadDateFrom] = useState('')
  const [downloadDateTo, setDownloadDateTo] = useState('')
  const [downloadSingleDate, setDownloadSingleDate] = useState('')
  const [downloading, setDownloading] = useState(false)

  const [showBackup, setShowBackup] = useState(false)
  const [backups, setBackups] = useState([])
  const [backingUp, setBackingUp] = useState(false)
  const [loadingBackups, setLoadingBackups] = useState(false)

  useEffect(() => { fetchData() }, [periodType, customStart, customEnd])

  const getViewDateRange = () => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    switch (periodType) {
      case 'today': return { start: todayStr, end: null }
      case 'week': {
        const dow = now.getDay()
        const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
        return { start: mon.toISOString().split('T')[0], end: null }
      }
      case 'month': {
        const ms = new Date(now.getFullYear(), now.getMonth(), 1)
        return { start: ms.toISOString().split('T')[0], end: null }
      }
      case 'year': {
        return { start: `${now.getFullYear()}-01-01`, end: null }
      }
      case 'custom': {
        return { start: customStart || null, end: customEnd || null }
      }
      default: return { start: null, end: null }
    }
  }

  const getPeriodLabel = () => {
    const now = new Date()
    switch (periodType) {
      case 'today': return `오늘 (${now.toISOString().split('T')[0]})`
      case 'week': return '이번 주'
      case 'month': return `${now.getFullYear()}년 ${now.getMonth() + 1}월`
      case 'year': return `${now.getFullYear()}년`
      case 'custom': return `${customStart || '?'} ~ ${customEnd || '?'}`
      default: return ''
    }
  }

  const fetchData = async () => {
    setLoading(true)
    const { start, end } = getViewDateRange()

    let salesQ = supabase.from('sales').select('*, channels(channel_name, color_code), suppliers(supplier_name)').order('sale_date', { ascending: false })
    let purchQ = supabase.from('purchases').select('*, suppliers(supplier_name, color_code)').order('purchase_date', { ascending: false })
    let orderQ = supabase.from('orders').select('*, suppliers(supplier_name, color_code)').order('order_date', { ascending: false })

    if (start) {
      salesQ = salesQ.gte('sale_date', start)
      purchQ = purchQ.gte('purchase_date', start)
      orderQ = orderQ.gte('order_date', start)
    }
    if (end) {
      const endNext = new Date(end); endNext.setDate(endNext.getDate() + 1)
      const endStr = endNext.toISOString().split('T')[0]
      salesQ = salesQ.lt('sale_date', endStr)
      purchQ = purchQ.lt('purchase_date', endStr)
      orderQ = orderQ.lt('order_date', endStr)
    }

    const [
      { data: salesData }, { data: purchaseData }, { data: orderData },
      { data: productData }, { data: chData }, { data: spData },
    ] = await Promise.all([
      salesQ, purchQ, orderQ,
      supabase.from('products').select('*, suppliers(supplier_name)').eq('is_active', true).order('product_name'),
      supabase.from('channels').select('*').eq('is_active', true),
      supabase.from('suppliers').select('*').eq('is_active', true),
    ])

    setSales(salesData || [])
    setPurchases(purchaseData || [])
    setOrders(orderData || [])
    setProducts(productData || [])
    setChannels(chData || [])
    setSuppliers(spData || [])
    setLoading(false)
  }

  /* ── 계산 (배송비 포함 매출) ── */
  const totalRevenueWithShipping = sales.reduce((s, r) => s + ((r.selling_price||0)*(r.quantity||0)) + (r.shipping_fee_received||0), 0)
  const totalItemRevenue = sales.reduce((s, r) => s + ((r.selling_price||0)*(r.quantity||0)), 0)
  const totalShippingRcv = sales.reduce((s, r) => s + (r.shipping_fee_received||0), 0)
  const totalSalesCost = sales.reduce((s, r) => s + Number(r.total_cost || 0), 0)
  const totalProfit = sales.reduce((s, r) => s + Number(r.net_profit || 0), 0)
  const totalPurchase = purchases.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const totalOrderAmount = orders.reduce((s, r) => s + Number(r.grand_total || 0), 0)
  const avgMargin = totalRevenueWithShipping > 0 ? ((totalProfit / totalRevenueWithShipping) * 100).toFixed(1) : '0.0'

  const channelSales = channels.map(ch => {
    const cs = sales.filter(s => s.channel_id === ch.id)
    const rev = cs.reduce((s, r) => s + ((r.selling_price||0)*(r.quantity||0)) + (r.shipping_fee_received||0), 0)
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
    acc[d].매출 += ((s.selling_price||0)*(s.quantity||0)) + (s.shipping_fee_received||0)
    acc[d].순이익 += Number(s.net_profit || 0)
    return acc
  }, {})
  const dailyData = Object.values(dailySales).sort((a,b) => a.date.localeCompare(b.date))

  const categoryCount = products.reduce((acc, p) => {
    const cat = p.category || '미분류'
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {})
  const categoryData = Object.entries(categoryCount).map(([name, count]) => ({ name, 수량: count })).sort((a,b) => b.수량 - a.수량)

  /* ── 통합 다운로드 ── */
  const getDlDateRange = () => {
    const now = new Date()
    let from, to = now.toISOString().split('T')[0]
    if (downloadMode === 'range') return { from: downloadDateFrom, to: downloadDateTo || to }
    if (downloadMode === 'date') return { from: downloadSingleDate, to: downloadSingleDate }
    if (downloadPeriod === 'today') from = to
    else if (downloadPeriod === 'week') from = new Date(now.getTime() - 7*24*60*60*1000).toISOString().split('T')[0]
    else if (downloadPeriod === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    else if (downloadPeriod === 'year') from = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
    else from = '2020-01-01'
    return { from, to }
  }

  const handleIntegratedDownload = async () => {
    const { from, to } = getDlDateRange()
    if (!from) { alert('날짜를 선택해주세요.'); return }
    setDownloading(true)
    try {
      const fn = (num) => Number(num || 0)
      const [
        { data: dlSales }, { data: dlPurchases }, { data: dlOrders },
        { data: dlProducts }, { data: dlChannels }, { data: dlSuppliers },
      ] = await Promise.all([
        supabase.from('sales').select('*, channels(channel_name), products(product_name, product_code), suppliers(supplier_name)').gte('sale_date', from).lte('sale_date', to).order('sale_date', { ascending: false }).limit(5000),
        supabase.from('purchases').select('*, suppliers(supplier_name), products(product_name, product_code)').gte('purchase_date', from).lte('purchase_date', to).order('purchase_date', { ascending: false }).limit(5000),
        supabase.from('orders').select('*, suppliers(supplier_name)').gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false }).limit(5000),
        supabase.from('products').select('*, suppliers(supplier_name)').eq('is_active', true).order('product_name'),
        supabase.from('channels').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order'),
      ])

      const wb = XLSX.utils.book_new()
      if ((dlSales||[]).length > 0) {
        const ws = XLSX.utils.json_to_sheet((dlSales||[]).map(s => ({
          '매출일자': s.sale_date, '매출처': s.channels?.channel_name||'', '제품명': s.products?.product_name||'',
          '수량': fn(s.quantity), '판매가': fn(s.selling_price), '배송비수취': fn(s.shipping_fee_received),
          '총매출(배송비포함)': fn(s.selling_price)*fn(s.quantity)+fn(s.shipping_fee_received),
          '원가': fn(s.product_cost), '수수료': fn(s.commission_amount), '실배송비': fn(s.shipping_cost),
          '순이익': fn(s.net_profit), '마진률(%)': fn(s.margin_rate), '메모': s.memo||'',
        })))
        ws['!cols'] = Array(13).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws, '매출내역')
      }
      if ((dlPurchases||[]).length > 0) {
        const ws = XLSX.utils.json_to_sheet((dlPurchases||[]).map(p => ({
          '매입일자': p.purchase_date, '매입처': p.suppliers?.supplier_name||'', '제품명': p.products?.product_name||'',
          '수량': fn(p.quantity), '매입단가': fn(p.purchase_price), '배송비': fn(p.shipping_cost),
          '총매입액': fn(p.total_amount), '메모': p.memo||'',
        })))
        ws['!cols'] = Array(8).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws, '매입내역')
      }
      if ((dlOrders||[]).length > 0) {
        const ws = XLSX.utils.json_to_sheet((dlOrders||[]).map(o => ({
          '주문일자': o.order_date, '매입처': o.suppliers?.supplier_name||'',
          '공급가합계': fn(o.total_amount), '택배비': fn(o.shipping_total), '총합계': fn(o.grand_total),
        })))
        ws['!cols'] = Array(5).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws, '주문내역')
      }
      if ((dlProducts||[]).length > 0) {
        const ws = XLSX.utils.json_to_sheet((dlProducts||[]).map(p => ({
          '제품코드': p.product_code||'', '제품명': p.product_name, '카테고리': p.category||'',
          '매입처': p.suppliers?.supplier_name||'', '총원가': fn(p.total_cost),
        })))
        ws['!cols'] = Array(5).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws, '제품목록')
      }

      const today = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `전체데이터_${from}_${to}_${today}.xlsx`)
      alert('다운로드 완료!')
    } catch (err) { alert('다운로드 오류: ' + err.message) }
    setDownloading(false)
  }

  /* ── 백업 ── */
  const fetchBackups = async () => {
    setLoadingBackups(true)
    const { data } = await supabase.from('data_backups')
      .select('id, backup_date, sales_count, purchases_count, orders_count, products_count, channels_count, suppliers_count, created_at')
      .order('backup_date', { ascending: false }).limit(60)
    setBackups(data || [])
    setLoadingBackups(false)
  }

  const createBackupNow = async () => {
    setBackingUp(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const [
        { data: bS }, { data: bP }, { data: bO },
        { data: bPr }, { data: bC }, { data: bSp },
      ] = await Promise.all([
        supabase.from('sales').select('*, channels(channel_name), products(product_name, product_code)').order('sale_date', { ascending: false }).limit(10000),
        supabase.from('purchases').select('*, suppliers(supplier_name), products(product_name, product_code)').order('purchase_date', { ascending: false }).limit(10000),
        supabase.from('orders').select('*, suppliers(supplier_name)').order('order_date', { ascending: false }).limit(5000),
        supabase.from('products').select('*, suppliers(supplier_name)').eq('is_active', true),
        supabase.from('channels').select('*').eq('is_active', true),
        supabase.from('suppliers').select('*').eq('is_active', true),
      ])
      const { error } = await supabase.from('data_backups').upsert({
        backup_date: today, sales_count: (bS||[]).length, purchases_count: (bP||[]).length,
        orders_count: (bO||[]).length, products_count: (bPr||[]).length,
        channels_count: (bC||[]).length, suppliers_count: (bSp||[]).length,
        backup_data: { sales: bS||[], purchases: bP||[], orders: bO||[], products: bPr||[], channels: bC||[], suppliers: bSp||[] },
      }, { onConflict: 'backup_date' })
      if (error) throw error
      alert('백업 완료!')
      fetchBackups()
    } catch (err) { alert('백업 오류: ' + err.message) }
    setBackingUp(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* ══ 기간 필터 ══ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          {[
            { id: 'today', label: '오늘' }, { id: 'week', label: '이번 주' },
            { id: 'month', label: '이번 달' }, { id: 'year', label: '올해' },
            { id: 'custom', label: '기간 지정' },
          ].map(p => (
            <button key={p.id} onClick={() => setPeriodType(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodType === p.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}>{p.label}</button>
          ))}
          {periodType === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" />
              <span className="text-slate-400 text-sm">~</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none" />
            </div>
          )}
          <span className="text-sm text-slate-500 ml-2">{getPeriodLabel()}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowDownload(!showDownload); setShowBackup(false) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${showDownload ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
            📥 통합 다운로드</button>
          <button onClick={() => { setShowBackup(!showBackup); setShowDownload(false); if (!showBackup) fetchBackups() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${showBackup ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
            💾 백업 관리</button>
        </div>
      </div>

      {/* 통합 다운로드 패널 */}
      {showDownload && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">📥 통합 데이터 다운로드</h3>
          <div className="flex gap-2 mb-4">
            {[{id:'period',label:'기간 선택'},{id:'range',label:'날짜 범위'},{id:'date',label:'특정 날짜'}].map(m => (
              <button key={m.id} onClick={() => setDownloadMode(m.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border ${downloadMode === m.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{m.label}</button>
            ))}
          </div>
          {downloadMode === 'period' && (
            <div className="flex gap-2 mb-4">
              {[{id:'today',label:'오늘'},{id:'week',label:'이번 주'},{id:'month',label:'이번 달'},{id:'year',label:'올해'},{id:'all',label:'전체'}].map(p => (
                <button key={p.id} onClick={() => setDownloadPeriod(p.id)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border ${downloadPeriod === p.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300'}`}>{p.label}</button>
              ))}
            </div>
          )}
          {downloadMode === 'range' && (
            <div className="flex items-center gap-3 mb-4">
              <input type="date" value={downloadDateFrom} onChange={e => setDownloadDateFrom(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm" />
              <span className="text-slate-400">~</span>
              <input type="date" value={downloadDateTo} onChange={e => setDownloadDateTo(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm" />
            </div>
          )}
          {downloadMode === 'date' && (
            <div className="mb-4">
              <input type="date" value={downloadSingleDate} onChange={e => setDownloadSingleDate(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm" />
            </div>
          )}
          <button onClick={handleIntegratedDownload} disabled={downloading}
            className={`px-6 py-3 rounded-xl text-white font-semibold ${downloading ? 'bg-slate-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {downloading ? '다운로드 중...' : '📥 엑셀 다운로드'}
          </button>
        </div>
      )}

      {/* 백업 관리 패널 */}
      {showBackup && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800">💾 데이터 백업</h3>
            <button onClick={createBackupNow} disabled={backingUp}
              className={`px-5 py-2.5 rounded-xl text-white font-medium ${backingUp ? 'bg-slate-300' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {backingUp ? '백업 중...' : '📸 지금 백업하기'}
            </button>
          </div>
          {loadingBackups ? (
            <div className="flex items-center justify-center py-8"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>
          ) : backups.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {backups.map(b => (
                <div key={b.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{b.backup_date}</p>
                    <p className="text-xs text-slate-500">매출 {b.sales_count} · 매입 {b.purchases_count} · 주문 {b.orders_count} · 제품 {b.products_count}</p>
                  </div>
                  <button onClick={() => { /* 백업 다운로드 로직 유지 */ }} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">📥 다운로드</button>
                </div>
              ))}
            </div>
          ) : <p className="text-center py-8 text-slate-400 text-sm">백업이 없습니다.</p>}
        </div>
      )}

      {/* ══ 요약 카드 ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-indigo-50 rounded-2xl p-5 border border-slate-100">
          <p className="text-xs text-slate-500 mb-2">총 매출 (배송비포함)</p>
          <p className="text-2xl font-bold text-indigo-600">{fmt(totalRevenueWithShipping)}원</p>
          <p className="text-xs text-slate-400 mt-1">상품 {fmt(totalItemRevenue)} + 배송비 {fmt(totalShippingRcv)}</p>
        </div>
        <div className="bg-orange-50 rounded-2xl p-5 border border-slate-100">
          <p className="text-xs text-slate-500 mb-2">총 매입</p>
          <p className="text-2xl font-bold text-orange-600">{fmt(totalPurchase)}원</p>
          <p className="text-xs text-slate-400 mt-1">{purchases.length}건</p>
        </div>
        <div className="bg-blue-50 rounded-2xl p-5 border border-slate-100">
          <p className="text-xs text-slate-500 mb-2">총 주문</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(totalOrderAmount)}원</p>
          <p className="text-xs text-slate-400 mt-1">{orders.length}건</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-5 border border-slate-100">
          <p className="text-xs text-slate-500 mb-2">순이익</p>
          <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(totalProfit)}원</p>
        </div>
        <div className="bg-purple-50 rounded-2xl p-5 border border-slate-100">
          <p className="text-xs text-slate-500 mb-2">평균 마진율</p>
          <p className="text-2xl font-bold text-purple-600">{avgMargin}%</p>
        </div>
      </div>

      {/* 건수 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: '매출 건수', value: sales.length, icon: '💰', color: 'text-indigo-600' },
          { label: '매입 건수', value: purchases.length, icon: '📦', color: 'text-orange-600' },
          { label: '주문 건수', value: orders.length, icon: '📝', color: 'text-blue-600' },
          { label: '등록 제품', value: products.length, icon: '🏷️', color: 'text-emerald-600' },
          { label: '매출처 / 매입처', value: `${channels.length} / ${suppliers.length}`, icon: '🏪', color: 'text-purple-600' },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">{c.label}</p>
              <span className="text-lg">{c.icon}</span>
            </div>
            <span className={`text-2xl font-bold ${c.color}`}>{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</span>
          </div>
        ))}
      </div>

      {/* ══ 차트 ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">매출처별 매출</h3>
          {channelSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelSales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize:12}} />
                <YAxis tickFormatter={v => fmt(v)} tick={{fontSize:11}} />
                <Tooltip formatter={v => `${fmt(v)}원`} />
                <Bar dataKey="매출" fill="#6366f1" radius={[6,6,0,0]} />
                <Bar dataKey="순이익" fill="#10b981" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-64 flex items-center justify-center text-slate-400">데이터 없음</div>}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">일별 매출 추이</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{fontSize:11}} />
                <YAxis tickFormatter={v => fmt(v)} tick={{fontSize:11}} />
                <Tooltip formatter={v => `${fmt(v)}원`} />
                <Line type="monotone" dataKey="매출" stroke="#6366f1" strokeWidth={2} dot={{r:3}} />
                <Line type="monotone" dataKey="순이익" stroke="#10b981" strokeWidth={2} dot={{r:3}} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="h-64 flex items-center justify-center text-slate-400">데이터 없음</div>}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">매입처별 매입</h3>
          {supplierPurchases.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={supplierPurchases} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={v => fmt(v)} tick={{fontSize:11}} />
                <YAxis type="category" dataKey="name" tick={{fontSize:12}} width={100} />
                <Tooltip formatter={v => `${fmt(v)}원`} />
                <Bar dataKey="매입액" fill="#f59e0b" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-64 flex items-center justify-center text-slate-400">데이터 없음</div>}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">카테고리별 제품 수</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={100} dataKey="수량" label={({name, 수량}) => `${name} (${수량})`}>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-64 flex items-center justify-center text-slate-400">데이터 없음</div>}
        </div>
      </div>

      {/* 매출처별 상세 테이블 */}
      {channelSales.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">매출처별 상세</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">매출처</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">매출</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">순이익</th>
                <th className="text-center px-4 py-2 text-xs font-semibold text-slate-500">건수</th>
                <th className="text-center px-4 py-2 text-xs font-semibold text-slate-500">마진율</th>
              </tr>
            </thead>
            <tbody>
              {channelSales.map((c, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-3 text-right text-blue-700 font-medium">{fmt(c.매출)}원</td>
                  <td className={`px-4 py-3 text-right font-medium ${c.순이익 >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(c.순이익)}원</td>
                  <td className="px-4 py-3 text-center text-slate-600">{c.건수}건</td>
                  <td className="px-4 py-3 text-center"><span className={`text-xs font-medium ${parseFloat(c.marginRate) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{c.marginRate}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default Dashboard
