import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

function Purchases() {
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [filterSupplier, setFilterSupplier] = useState('all')
  const [filterDate, setFilterDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [filterSupplier, filterDate])

  const fetchData = async () => {
    setLoading(true)
    let query = supabase
      .from('purchases')
      .select('*, suppliers(supplier_name, color_code), products(product_name, product_code)')
      .order('purchase_date', { ascending: false })
      .limit(200)

    if (filterSupplier !== 'all') query = query.eq('supplier_id', filterSupplier)
    if (filterDate) {
      query = query.gte('purchase_date', filterDate + '-01').lte('purchase_date', filterDate + '-31')
    }

    const { data: purchaseData } = await query
    const { data: supplierData } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')

    setPurchases(purchaseData || [])
    setSuppliers(supplierData || [])
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 매입 기록을 삭제하시겠습니까?')) {
      await supabase.from('purchases').delete().eq('id', id)
      fetchData()
    }
  }

  const handleExcelDownload = () => {
    if (purchases.length === 0) { alert('다운로드할 데이터가 없습니다.'); return }

    const excelData = purchases.map(p => ({
      '매입일자': p.purchase_date,
      '매입처': p.suppliers?.supplier_name || '-',
      '제품코드': p.products?.product_code || '-',
      '제품명': p.products?.product_name || '-',
      '수량': p.quantity,
      '매입단가': Number(p.purchase_price),
      '배송비': Number(p.shipping_cost),
      '부대비용': Number(p.additional_cost),
      '총매입금액': Number(p.total_amount),
      '메모': p.memo || '',
      '입력방법': p.input_method === 'EXCEL' ? '엑셀' : '수기',
      '등록일시': new Date(p.created_at).toLocaleString('ko-KR'),
    }))

    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '매입내역')

    const colWidths = [12, 15, 12, 25, 8, 12, 10, 10, 14, 20, 8, 18]
    ws['!cols'] = colWidths.map(w => ({ wch: w }))

    const fileName = `매입내역_${filterDate || '전체'}_${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()

  const totalAmount = purchases.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const totalQty = purchases.reduce((s, r) => s + Number(r.quantity || 0), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* 필터 */}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm">
          <option value="all">전체 매입처</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
        </select>
        <input type="month" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
        {filterDate && (
          <button onClick={() => setFilterDate('')} className="px-3 py-2.5 text-sm text-slate-500 hover:text-slate-700">초기화</button>
        )}
        <div className="flex-1"></div>
        <button onClick={handleExcelDownload}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors">
          📥 엑셀 다운로드
        </button>
      </div>

      {/* 요약 */}
      <div className="flex gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">총 매입금액 </span>
          <span className="text-lg font-bold text-indigo-600">{formatNumber(totalAmount)}</span>
          <span className="text-xs text-slate-400">원 ({purchases.length}건)</span>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-3">
          <span className="text-xs text-slate-500">총 수량 </span>
          <span className="text-lg font-bold text-cyan-600">{formatNumber(totalQty)}</span>
          <span className="text-xs text-slate-400">개</span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">날짜</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">매입처</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">제품</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">수량</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">매입단가</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">배송비</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">총금액</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">구분</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(p => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-600">{p.purchase_date}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium text-white"
                      style={{ backgroundColor: p.suppliers?.color_code || '#6366f1' }}>
                      {p.suppliers?.supplier_name || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800 max-w-[200px] truncate">
                    {p.products?.product_name || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-slate-600">{p.quantity}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-600">{formatNumber(p.purchase_price)}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-500">{formatNumber(p.shipping_cost)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-slate-800">{formatNumber(p.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      p.input_method === 'EXCEL' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {p.input_method === 'EXCEL' ? '엑셀' : '수기'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleDelete(p.id)} className="p-1 hover:bg-red-50 rounded text-sm">🗑️</button>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan="9" className="px-4 py-12 text-center text-slate-400">매입 내역이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Purchases
