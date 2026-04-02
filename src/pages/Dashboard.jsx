import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import * as XLSX from 'xlsx'

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']

function Dashboard() {
  const [sales, setSales] = useState([])
  const [purchases, setPurchases] = useState([])
  const [channels, setChannels] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)

  // 통합 다운로드
  const [showDownload, setShowDownload] = useState(false)
  const [downloadMode, setDownloadMode] = useState('period') // 'period' | 'range' | 'date'
  const [downloadPeriod, setDownloadPeriod] = useState('month')
  const [downloadDateFrom, setDownloadDateFrom] = useState('')
  const [downloadDateTo, setDownloadDateTo] = useState('')
  const [downloadSingleDate, setDownloadSingleDate] = useState('')
  const [downloading, setDownloading] = useState(false)

  // 백업
  const [showBackup, setShowBackup] = useState(false)
  const [backups, setBackups] = useState([])
  const [backingUp, setBackingUp] = useState(false)
  const [loadingBackups, setLoadingBackups] = useState(false)

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

  // ========== 통합 다운로드 ==========
  const getDateRange = () => {
    const now = new Date()
    let from, to = now.toISOString().split('T')[0]

    if (downloadMode === 'range') {
      return { from: downloadDateFrom, to: downloadDateTo || to }
    }
    if (downloadMode === 'date') {
      return { from: downloadSingleDate, to: downloadSingleDate }
    }

    // period mode
    if (downloadPeriod === 'today') {
      from = to
    } else if (downloadPeriod === 'week') {
      from = new Date(now.getTime() - 7*24*60*60*1000).toISOString().split('T')[0]
    } else if (downloadPeriod === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    } else if (downloadPeriod === 'year') {
      from = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
    } else {
      from = '2020-01-01'
    }
    return { from, to }
  }

  const handleIntegratedDownload = async () => {
    const { from, to } = getDateRange()
    if (!from) { alert('날짜를 선택해주세요.'); return }

    setDownloading(true)
    try {
      // 모든 데이터 fetch
      const { data: salesData } = await supabase.from('sales')
        .select('*, channels(channel_name), products(product_name, product_code), suppliers(supplier_name)')
        .gte('sale_date', from).lte('sale_date', to).order('sale_date', { ascending: false }).limit(5000)

      const { data: purchaseData } = await supabase.from('purchases')
        .select('*, suppliers(supplier_name), products(product_name, product_code)')
        .gte('purchase_date', from).lte('purchase_date', to).order('purchase_date', { ascending: false }).limit(5000)

      const { data: orderData } = await supabase.from('orders')
        .select('*, suppliers(supplier_name)').gte('order_date', from).lte('order_date', to)
        .order('order_date', { ascending: false }).limit(5000)

      const { data: productData } = await supabase.from('products')
        .select('*, suppliers(supplier_name)').eq('is_active', true).order('product_name')

      const { data: channelData } = await supabase.from('channels')
        .select('*').eq('is_active', true).order('sort_order')

      const { data: supplierData } = await supabase.from('suppliers')
        .select('*').eq('is_active', true).order('sort_order')

      // 주문 상세
      let orderItems = []
      if (orderData && orderData.length > 0) {
        const orderIds = orderData.map(o => o.id)
        const { data: oiData } = await supabase.from('order_items')
          .select('*, order_item_products(*), orders(order_date, suppliers(supplier_name))')
          .in('order_id', orderIds.slice(0, 200))
        orderItems = oiData || []
      }

      const wb = XLSX.utils.book_new()
      const fn = (num) => Number(num || 0)

      // 시트1: 매출내역
      const salesSheet = (salesData || []).map(s => ({
        '매출일자': s.sale_date,
        '매출처': s.channels?.channel_name || '',
        '매입처': s.suppliers?.supplier_name || '',
        '제품코드': s.products?.product_code || '',
        '제품명': s.products?.product_name || '',
        '수량': fn(s.quantity),
        '판매가': fn(s.selling_price),
        '배송비수취': fn(s.shipping_fee_received),
        '총매출': fn(s.total_revenue),
        '상품원가': fn(s.product_cost),
        '수수료타입': s.commission_type,
        '수수료율(%)': fn(s.commission_rate),
        '수수료금액': fn(s.commission_amount),
        '배송비': fn(s.shipping_cost),
        '추가비용': fn(s.additional_fee),
        '총비용': fn(s.total_cost),
        '순이익': fn(s.net_profit),
        '마진률(%)': fn(s.margin_rate),
        '입력방법': s.input_method,
        '메모': s.memo || '',
      }))
      if (salesSheet.length > 0) {
        const ws1 = XLSX.utils.json_to_sheet(salesSheet)
        ws1['!cols'] = Array(20).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws1, '매출내역')
      }

      // 시트2: 매입내역
      const purchaseSheet = (purchaseData || []).map(p => ({
        '매입일자': p.purchase_date,
        '매입처': p.suppliers?.supplier_name || '',
        '제품코드': p.products?.product_code || '',
        '제품명': p.products?.product_name || '',
        '수량': fn(p.quantity),
        '매입단가': fn(p.purchase_price),
        '배송비': fn(p.shipping_cost),
        '추가비용': fn(p.additional_cost),
        '총매입액': fn(p.total_amount),
        '입력방법': p.input_method || '',
        '메모': p.memo || '',
      }))
      if (purchaseSheet.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(purchaseSheet)
        ws2['!cols'] = Array(11).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws2, '매입내역')
      }

      // 시트3: 주문내역
      const orderSheet = (orderData || []).map(o => ({
        '주문일자': o.order_date,
        '매입처': o.suppliers?.supplier_name || '',
        '상태': { PENDING: '대기', CONFIRMED: '확정', SHIPPED: '발송', COMPLETED: '완료' }[o.status] || o.status,
        '공급가합계': fn(o.total_amount),
        '택배비합계': fn(o.shipping_total),
        '건당택배비': fn(o.shipping_cost_per_order),
        '총합계(세포함)': fn(o.grand_total),
      }))
      if (orderSheet.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(orderSheet)
        ws3['!cols'] = Array(7).fill({ wch: 16 })
        XLSX.utils.book_append_sheet(wb, ws3, '주문내역')
      }

      // 시트4: 주문상세
      const orderDetailSheet = orderItems.map(oi => ({
        '주문일자': oi.orders?.order_date || '',
        '매입처': oi.orders?.suppliers?.supplier_name || '',
        '수취인': oi.recipient_name,
        '연락처': oi.recipient_phone,
        '배송지': oi.recipient_address,
        '배송메세지': oi.delivery_message || '',
        '제품': (oi.order_item_products || []).map(p => `${p.product_name}×${p.quantity}`).join(', '),
        '소계': (oi.order_item_products || []).reduce((s, p) => s + fn(p.subtotal), 0),
      }))
      if (orderDetailSheet.length > 0) {
        const ws4 = XLSX.utils.json_to_sheet(orderDetailSheet)
        ws4['!cols'] = [{ wch: 12 },{ wch: 12 },{ wch: 10 },{ wch: 15 },{ wch: 50 },{ wch: 25 },{ wch: 40 },{ wch: 12 }]
        XLSX.utils.book_append_sheet(wb, ws4, '주문상세')
      }

      // 시트5: 제품목록
      const productSheet = (productData || []).map(p => ({
        '제품코드': p.product_code || '',
        '제품명': p.product_name,
        '카테고리': p.category || '',
        '매입처': p.suppliers?.supplier_name || '',
        '매입가': fn(p.purchase_cost),
        '포장비': fn(p.packaging_cost),
        '추가비용': fn(p.additional_cost),
        '총원가': fn(p.total_cost),
        '사용횟수': fn(p.usage_count),
      }))
      if (productSheet.length > 0) {
        const ws5 = XLSX.utils.json_to_sheet(productSheet)
        ws5['!cols'] = Array(9).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws5, '제품목록')
      }

      // 시트6: 매출처목록
      const channelSheet = (channelData || []).map(c => ({
        '매출처명': c.channel_name,
        '유형': c.channel_type === 'open_market' ? '오픈마켓' : '폐쇄몰',
        '수수료타입': c.default_commission_type === 'RATE' ? '정률' : '정액',
        '수수료율(%)': fn(c.default_commission_rate),
        '수수료금액': fn(c.default_commission_fixed),
        '배송정책': { FREE: '무료', CONDITIONAL: '조건부', PAID: '유료' }[c.default_shipping_policy] || '',
        '기본배송비': fn(c.default_shipping_cost),
      }))
      if (channelSheet.length > 0) {
        const ws6 = XLSX.utils.json_to_sheet(channelSheet)
        ws6['!cols'] = Array(7).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws6, '매출처목록')
      }

      // 시트7: 매입처목록
      const supplierSheet = (supplierData || []).map(s => ({
        '매입처명': s.supplier_name,
        '코드': s.supplier_code || '',
        '담당자': s.contact_name || '',
        '연락처': s.contact_phone || '',
        '사업자번호': s.business_number || '',
        '기본택배비': fn(s.default_shipping_cost),
        '메모': s.memo || '',
      }))
      if (supplierSheet.length > 0) {
        const ws7 = XLSX.utils.json_to_sheet(supplierSheet)
        ws7['!cols'] = Array(7).fill({ wch: 14 })
        XLSX.utils.book_append_sheet(wb, ws7, '매입처목록')
      }

      // 시트8: 요약
      const summarySheet = [{
        '기간': `${from} ~ ${to}`,
        '매출건수': (salesData || []).length,
        '총매출': (salesData || []).reduce((s,r) => s + fn(r.total_revenue), 0),
        '총순이익': (salesData || []).reduce((s,r) => s + fn(r.net_profit), 0),
        '매입건수': (purchaseData || []).length,
        '총매입액': (purchaseData || []).reduce((s,r) => s + fn(r.total_amount), 0),
        '주문건수': (orderData || []).length,
        '주문총액': (orderData || []).reduce((s,r) => s + fn(r.grand_total), 0),
        '등록제품수': (productData || []).length,
        '매출처수': (channelData || []).length,
        '매입처수': (supplierData || []).length,
        '다운로드일시': new Date().toLocaleString('ko-KR'),
      }]
      const ws8 = XLSX.utils.json_to_sheet(summarySheet)
      ws8['!cols'] = Array(12).fill({ wch: 16 })
      XLSX.utils.book_append_sheet(wb, ws8, '요약')

      const today = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `전체데이터_${from}_${to}_${today}.xlsx`)
      alert(`다운로드 완료!\n매출 ${(salesData||[]).length}건, 매입 ${(purchaseData||[]).length}건, 주문 ${(orderData||[]).length}건`)
    } catch (err) {
      alert('다운로드 오류: ' + err.message)
    }
    setDownloading(false)
  }

  // ========== 백업 ==========
  const fetchBackups = async () => {
    setLoadingBackups(true)
    const { data } = await supabase.from('data_backups').select('id, backup_date, sales_count, purchases_count, orders_count, products_count, channels_count, suppliers_count, created_at')
      .order('backup_date', { ascending: false }).limit(60)
    setBackups(data || [])
    setLoadingBackups(false)
  }

  const createBackupNow = async () => {
    setBackingUp(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      const { data: salesData } = await supabase.from('sales')
        .select('*, channels(channel_name), products(product_name, product_code), suppliers(supplier_name)')
        .order('sale_date', { ascending: false }).limit(10000)
      const { data: purchaseData } = await supabase.from('purchases')
        .select('*, suppliers(supplier_name), products(product_name, product_code)')
        .order('purchase_date', { ascending: false }).limit(10000)
      const { data: orderData } = await supabase.from('orders')
        .select('*, suppliers(supplier_name)').order('order_date', { ascending: false }).limit(5000)
      const { data: productData } = await supabase.from('products').select('*, suppliers(supplier_name)').eq('is_active', true)
      const { data: channelData } = await supabase.from('channels').select('*').eq('is_active', true)
      const { data: supplierData } = await supabase.from('suppliers').select('*').eq('is_active', true)

      const backupData = {
        sales: salesData || [], purchases: purchaseData || [], orders: orderData || [],
        products: productData || [], channels: channelData || [], suppliers: supplierData || [],
      }

      const { error } = await supabase.from('data_backups').upsert({
        backup_date: today,
        sales_count: (salesData || []).length,
        purchases_count: (purchaseData || []).length,
        orders_count: (orderData || []).length,
        products_count: (productData || []).length,
        channels_count: (channelData || []).length,
        suppliers_count: (supplierData || []).length,
        backup_data: backupData,
      }, { onConflict: 'backup_date' })

      if (error) throw error
      alert(`백업 완료! (${today})`)
      fetchBackups()
    } catch (err) {
      alert('백업 오류: ' + err.message)
    }
    setBackingUp(false)
  }

  const downloadBackup = async (backup) => {
    const { data } = await supabase.from('data_backups').select('backup_data').eq('id', backup.id).single()
    if (!data || !data.backup_data) { alert('백업 데이터가 없습니다.'); return }

    const bd = data.backup_data
    const wb = XLSX.utils.book_new()
    const fn = (num) => Number(num || 0)

    // 매출
    if (bd.sales?.length > 0) {
      const ws = XLSX.utils.json_to_sheet(bd.sales.map(s => ({
        '매출일자': s.sale_date, '매출처': s.channels?.channel_name || '', '매입처': s.suppliers?.supplier_name || '',
        '제품코드': s.products?.product_code || '', '제품명': s.products?.product_name || '',
        '수량': fn(s.quantity), '판매가': fn(s.selling_price), '총매출': fn(s.total_revenue),
        '총비용': fn(s.total_cost), '순이익': fn(s.net_profit), '마진률(%)': fn(s.margin_rate),
      })))
      ws['!cols'] = Array(11).fill({ wch: 14 })
      XLSX.utils.book_append_sheet(wb, ws, '매출내역')
    }
    // 매입
    if (bd.purchases?.length > 0) {
      const ws = XLSX.utils.json_to_sheet(bd.purchases.map(p => ({
        '매입일자': p.purchase_date, '매입처': p.suppliers?.supplier_name || '',
        '제품명': p.products?.product_name || '', '수량': fn(p.quantity),
        '매입단가': fn(p.purchase_price), '배송비': fn(p.shipping_cost), '총매입액': fn(p.total_amount),
      })))
      ws['!cols'] = Array(7).fill({ wch: 14 })
      XLSX.utils.book_append_sheet(wb, ws, '매입내역')
    }
    // 주문
    if (bd.orders?.length > 0) {
      const ws = XLSX.utils.json_to_sheet(bd.orders.map(o => ({
        '주문일자': o.order_date, '매입처': o.suppliers?.supplier_name || '', '상태': o.status,
        '공급가합계': fn(o.total_amount), '택배비합계': fn(o.shipping_total), '총합계': fn(o.grand_total),
      })))
      ws['!cols'] = Array(6).fill({ wch: 14 })
      XLSX.utils.book_append_sheet(wb, ws, '주문내역')
    }
    // 제품
    if (bd.products?.length > 0) {
      const ws = XLSX.utils.json_to_sheet(bd.products.map(p => ({
        '제품코드': p.product_code || '', '제품명': p.product_name, '카테고리': p.category || '',
        '매입처': p.suppliers?.supplier_name || '', '총원가': fn(p.total_cost),
      })))
      ws['!cols'] = Array(5).fill({ wch: 14 })
      XLSX.utils.book_append_sheet(wb, ws, '제품목록')
    }
    // 매출처
    if (bd.channels?.length > 0) {
      const ws = XLSX.utils.json_to_sheet(bd.channels.map(c => ({
        '매출처명': c.channel_name, '유형': c.channel_type, '수수료율': fn(c.default_commission_rate),
      })))
      XLSX.utils.book_append_sheet(wb, ws, '매출처목록')
    }
    // 매입처
    if (bd.suppliers?.length > 0) {
      const ws = XLSX.utils.json_to_sheet(bd.suppliers.map(s => ({
        '매입처명': s.supplier_name, '코드': s.supplier_code || '', '담당자': s.contact_name || '',
        '기본택배비': fn(s.default_shipping_cost),
      })))
      XLSX.utils.book_append_sheet(wb, ws, '매입처목록')
    }

    XLSX.writeFile(wb, `백업_${backup.backup_date}.xlsx`)
  }

  // ========== 기존 대시보드 계산 ==========
  const totalRevenue = sales.reduce((s, r) => s + Number(r.total_revenue || 0), 0)
  const totalSalesCost = sales.reduce((s, r) => s + Number(r.total_cost || 0), 0)
  const totalProfit = sales.reduce((s, r) => s + Number(r.net_profit || 0), 0)
  const totalPurchase = purchases.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const avgMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0

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
      {/* 기간 선택 + 통합 다운로드/백업 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[{id:'today',label:'오늘'},{id:'week',label:'이번 주'},{id:'month',label:'이번 달'},{id:'year',label:'올해'}].map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}>{p.label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowDownload(!showDownload); setShowBackup(false) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showDownload ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            }`}>📥 통합 다운로드</button>
          <button onClick={() => { setShowBackup(!showBackup); setShowDownload(false); if (!showBackup) fetchBackups() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showBackup ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}>💾 백업 관리</button>
        </div>
      </div>

      {/* 통합 다운로드 패널 */}
      {showDownload && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">📥 통합 데이터 다운로드</h3>
          <p className="text-xs text-slate-500 mb-4">매출/매입/주문/제품/매출처/매입처 모든 데이터를 시트별로 나눈 엑셀 파일로 다운받습니다.</p>

          {/* 모드 선택 */}
          <div className="flex gap-2 mb-4">
            {[{id:'period',label:'기간 선택'},{id:'range',label:'날짜 범위'},{id:'date',label:'특정 날짜'}].map(m => (
              <button key={m.id} onClick={() => setDownloadMode(m.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  downloadMode === m.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                }`}>{m.label}</button>
            ))}
          </div>

          {/* 기간 선택 */}
          {downloadMode === 'period' && (
            <div className="flex gap-2 mb-4">
              {[{id:'today',label:'오늘'},{id:'week',label:'이번 주'},{id:'month',label:'이번 달'},{id:'year',label:'올해'},{id:'all',label:'전체'}].map(p => (
                <button key={p.id} onClick={() => setDownloadPeriod(p.id)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    downloadPeriod === p.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'
                  }`}>{p.label}</button>
              ))}
            </div>
          )}

          {/* 날짜 범위 */}
          {downloadMode === 'range' && (
            <div className="flex items-center gap-3 mb-4">
              <input type="date" value={downloadDateFrom} onChange={e => setDownloadDateFrom(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
              <span className="text-slate-400">~</span>
              <input type="date" value={downloadDateTo} onChange={e => setDownloadDateTo(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
            </div>
          )}

          {/* 특정 날짜 */}
          {downloadMode === 'date' && (
            <div className="mb-4">
              <input type="date" value={downloadSingleDate} onChange={e => setDownloadSingleDate(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
            </div>
          )}

          <div className="flex items-center gap-4">
            <button onClick={handleIntegratedDownload} disabled={downloading}
              className={`px-6 py-3 rounded-xl text-white font-semibold transition-colors ${
                downloading ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}>{downloading ? '다운로드 중...' : '📥 엑셀 다운로드 (8개 시트)'}</button>
            <p className="text-xs text-slate-400">
              포함 시트: 매출내역, 매입내역, 주문내역, 주문상세, 제품목록, 매출처목록, 매입처목록, 요약
            </p>
          </div>
        </div>
      )}

      {/* 백업 관리 패널 */}
      {showBackup && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">💾 데이터 백업</h3>
              <p className="text-xs text-slate-500 mt-1">수동으로 백업을 생성하거나, 과거 백업을 엑셀로 다운받을 수 있습니다.</p>
            </div>
            <button onClick={createBackupNow} disabled={backingUp}
              className={`px-5 py-2.5 rounded-xl text-white font-medium transition-colors ${
                backingUp ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}>{backingUp ? '백업 중...' : '📸 지금 백업하기'}</button>
          </div>

          {loadingBackups ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : backups.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {backups.map(b => (
                <div key={b.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{b.backup_date}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      매출 {b.sales_count}건 · 매입 {b.purchases_count}건 · 주문 {b.orders_count}건 · 제품 {b.products_count}개 · 매출처 {b.channels_count}개 · 매입처 {b.suppliers_count}개
                    </p>
                  </div>
                  <button onClick={() => downloadBackup(b)}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200">📥 다운로드</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-sm">백업 내역이 없습니다. "지금 백업하기"를 눌러 첫 번째 백업을 생성하세요.</div>
          )}
        </div>
      )}

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
