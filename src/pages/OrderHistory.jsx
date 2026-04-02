import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

function OrderHistory() {
  const [orders, setOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [filterSupplier, setFilterSupplier] = useState('all')
  const [filterDate, setFilterDate] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [orderDetails, setOrderDetails] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [filterSupplier, filterDate])

  const fetchData = async () => {
    setLoading(true)
    let query = supabase.from('orders').select('*, suppliers(supplier_name, color_code)')
      .order('order_date', { ascending: false }).limit(200)
    if (filterSupplier !== 'all') query = query.eq('supplier_id', filterSupplier)
    if (filterDate) query = query.gte('order_date', filterDate + '-01').lte('order_date', filterDate + '-31')
    const { data: oData } = await query
    const { data: sData } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    setOrders(oData || []); setSuppliers(sData || []); setLoading(false)
  }

  const loadDetails = async (orderId) => {
    if (expandedId === orderId) { setExpandedId(null); return }
    if (orderDetails[orderId]) { setExpandedId(orderId); return }
    const { data: items } = await supabase.from('order_items').select('*, order_item_products(*)').eq('order_id', orderId).order('created_at')
    setOrderDetails(prev => ({ ...prev, [orderId]: items || [] }))
    setExpandedId(orderId)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 주문을 삭제하시겠습니까?')) {
      await supabase.from('orders').delete().eq('id', id); fetchData()
    }
  }

  const redownloadExcel = async (order) => {
    const { data: items } = await supabase.from('order_items').select('*, order_item_products(*)').eq('order_id', order.id)
    if (!items || items.length === 0) { alert('주문 상세가 없습니다.'); return }

    const { data: senderArr } = await supabase.from('sender_profiles').select('*').eq('supplier_id', order.supplier_id).limit(1)
    const sender = senderArr?.[0] || {}
    const wb = XLSX.utils.book_new()

    const sheetData = items.map(item => ({
      '수취인명': item.recipient_name, '수취인 연락처': item.recipient_phone,
      '배송지': item.recipient_address, '배송메세지': item.delivery_message || '',
      '옵션명': item.order_item_products.map(p => p.quantity > 1 ? `${p.product_name} x${p.quantity}` : p.product_name).join(', '),
      '수량': item.order_item_products.reduce((s, p) => s + p.quantity, 0),
      '발송인': sender.sender_name || '', '발송인연락처': sender.sender_phone || '',
      '발송인주소': sender.sender_address || '', '운송장번호': '',
    }))
    const ws1 = XLSX.utils.json_to_sheet(sheetData)
    ws1['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 60 }, { wch: 35 }, { wch: 40 }, { wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 50 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, ws1, '발송내역')

    const productMap = {}
    items.forEach(item => {
      item.order_item_products.forEach(p => {
        if (!productMap[p.product_name]) productMap[p.product_name] = { name: p.product_name, qty: 0, price: p.unit_price }
        productMap[p.product_name].qty += p.quantity
      })
    })
    const msData = [['거 래 명 세 표', '', '', '', '', ''], ['', '', '', '', '', ''], ['품목', '수량', '단가', '공급가액', '세액(10%)', '소계']]
    Object.values(productMap).forEach(p => {
      const supply = p.qty * p.price; const tax = Math.round(supply * 0.1)
      msData.push([p.name, p.qty, p.price, supply, tax, supply + tax])
    })
    const ss = items.length * 4000; const st = Math.round(ss * 0.1)
    msData.push(['택배비', items.length, 4000, ss, st, ss + st])
    let total = ss + st
    Object.values(productMap).forEach(p => { const s = p.qty * p.price; total += s + Math.round(s * 0.1) })
    msData.push(['총계', '', '', '', '', total])
    const ws2 = XLSX.utils.aoa_to_sheet(msData)
    ws2['!cols'] = [{ wch: 35 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws2, '명세서')

    const d = new Date(order.order_date)
    const yy = String(d.getFullYear()).slice(2)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    XLSX.writeFile(wb, `택배양식_와이바이_${yy}${mm}${dd}.xlsx`)
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()
  const statusLabel = (s) => ({ PENDING: '대기', CONFIRMED: '확정', SHIPPED: '발송', COMPLETED: '완료' }[s] || s)
  const statusColor = (s) => ({ PENDING: 'bg-amber-100 text-amber-700', CONFIRMED: 'bg-blue-100 text-blue-700', SHIPPED: 'bg-indigo-100 text-indigo-700', COMPLETED: 'bg-emerald-100 text-emerald-700' }[s] || 'bg-slate-100 text-slate-600')

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm">
          <option value="all">전체 매입처</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
        </select>
        <input type="month" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
        {filterDate && <button onClick={() => setFilterDate('')} className="px-3 py-2.5 text-sm text-slate-500">초기화</button>}
      </div>

      <div className="space-y-4">
        {orders.map(order => (
          <div key={order.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => loadDetails(order.id)}>
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{order.order_date}</span>
                    {order.suppliers && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-white"
                        style={{ backgroundColor: order.suppliers.color_code || '#6366f1' }}>
                        {order.suppliers.supplier_name}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(order.status)}`}>{statusLabel(order.status)}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">합계: {formatNumber(order.grand_total)}원 (공급가 {formatNumber(order.total_amount)} + 택배 {formatNumber(order.shipping_total)} + 세액)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); redownloadExcel(order) }}
                  className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200">📥 엑셀</button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(order.id) }}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-sm">🗑️</button>
                <span className="text-slate-400 text-sm">{expandedId === order.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expandedId === order.id && orderDetails[order.id] && (
              <div className="border-t border-slate-200 p-5 bg-slate-50">
                <div className="space-y-3">
                  {orderDetails[order.id].map((item, idx) => (
                    <div key={item.id} className="bg-white rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">{idx + 1}</span>
                        <span className="text-sm font-semibold text-slate-800">{item.recipient_name}</span>
                        <span className="text-xs text-slate-400">{item.recipient_phone}</span>
                      </div>
                      <p className="text-xs text-slate-500">{item.recipient_address}</p>
                      {item.delivery_message && <p className="text-xs text-slate-400 mt-1">💬 {item.delivery_message}</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.order_item_products?.map(p => (
                          <span key={p.id} className="inline-flex items-center px-2.5 py-1 bg-slate-100 rounded-lg text-xs">
                            {p.product_name} {p.quantity > 1 ? `×${p.quantity}` : ''} <span className="text-slate-400 ml-1">({formatNumber(p.unit_price)}원)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {orders.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">주문 내역이 없습니다.</div>
        )}
      </div>
    </div>
  )
}

export default OrderHistory
