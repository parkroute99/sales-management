import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const SHIPPING_COST = 4000

function OrderInput() {
  const [suppliers, setSuppliers] = useState([])
  const [aliases, setAliases] = useState([])
  const [senderProfiles, setSenderProfiles] = useState([])
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [items, setItems] = useState([])
  const [currentItem, setCurrentItem] = useState({ name: '', phone: '', address: '', message: '', products: [{ keyword: '', matched: null, qty: 1 }] })
  const [saving, setSaving] = useState(false)
  const [showSenderForm, setShowSenderForm] = useState(false)
  const [senderForm, setSenderForm] = useState({ sender_name: '', sender_phone: '', sender_address: '', bank_info: '', deposit_name: '' })
  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (selectedSupplier) fetchAliases() }, [selectedSupplier])

  const fetchData = async () => {
    const { data: sData } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    const { data: spData } = await supabase.from('sender_profiles').select('*')
    setSuppliers(sData || []); setSenderProfiles(spData || [])
  }

  const fetchAliases = async () => {
    // 방법1: 선택된 매입처 약어 + 매입처 미지정 약어 모두 조회
    const { data: data1 } = await supabase.from('product_aliases').select('*').eq('supplier_id', selectedSupplier.id)
    const { data: data2 } = await supabase.from('product_aliases').select('*').is('supplier_id', null)
    // 방법2: 전체 약어도 백업으로 조회
    const { data: dataAll } = await supabase.from('product_aliases').select('*')

    const combined = [...(data1 || []), ...(data2 || [])]
    // 매입처 연결된 게 하나도 없으면 전체를 사용
    const finalAliases = combined.length > 0 ? combined : (dataAll || [])
    setAliases(finalAliases)
    setDebugInfo(`매입처별: ${(data1||[]).length}개, 미지정: ${(data2||[]).length}개, 전체: ${(dataAll||[]).length}개 → 사용: ${finalAliases.length}개`)
  }

  const selectSupplier = (s) => {
    setSelectedSupplier(s)
    const profile = senderProfiles.find(p => p.supplier_id === s.id)
    if (profile) setSenderForm({ sender_name: profile.sender_name, sender_phone: profile.sender_phone, sender_address: profile.sender_address, bank_info: profile.bank_info || '', deposit_name: profile.deposit_name || '' })
    else setSenderForm({ sender_name: '', sender_phone: '', sender_address: '', bank_info: '', deposit_name: '' })
  }

  const matchProduct = (keyword) => {
    if (!keyword || aliases.length === 0) return null
    const lower = keyword.trim().toLowerCase()
    // 1. 정확히 일치
    const exact = aliases.find(a => a.alias.toLowerCase() === lower)
    if (exact) return exact
    // 2. 부분 일치 (입력값이 약어를 포함하거나, 약어가 입력값을 포함)
    const partial = aliases.find(a => lower.includes(a.alias.toLowerCase()) || a.alias.toLowerCase().includes(lower))
    if (partial) return partial
    // 3. 정식명칭에서 검색
    const byName = aliases.find(a => a.product_full_name.toLowerCase().includes(lower) || lower.includes(a.product_full_name.toLowerCase()))
    return byName || null
  }

  const updateProductKeyword = (idx, keyword) => {
    const newProducts = [...currentItem.products]
    newProducts[idx].keyword = keyword
    newProducts[idx].matched = matchProduct(keyword)
    setCurrentItem({ ...currentItem, products: newProducts })
  }

  const updateProductQty = (idx, qty) => {
    const newProducts = [...currentItem.products]
    newProducts[idx].qty = Number(qty) || 1
    setCurrentItem({ ...currentItem, products: newProducts })
  }

  const addProductRow = () => {
    setCurrentItem({ ...currentItem, products: [...currentItem.products, { keyword: '', matched: null, qty: 1 }] })
  }

  const removeProductRow = (idx) => {
    if (currentItem.products.length <= 1) return
    const newProducts = currentItem.products.filter((_, i) => i !== idx)
    setCurrentItem({ ...currentItem, products: newProducts })
  }

  const formatPhone = (phone) => {
    const nums = phone.replace(/[^0-9]/g, '')
    if (nums.length === 11) return `${nums.slice(0,3)}-${nums.slice(3,7)}-${nums.slice(7)}`
    if (nums.length === 10) return `${nums.slice(0,3)}-${nums.slice(3,6)}-${nums.slice(6)}`
    return phone
  }

  const addItem = () => {
    if (!currentItem.name || !currentItem.phone || !currentItem.address) {
      alert('수취인명, 연락처, 주소를 입력해주세요.'); return
    }
    if (currentItem.products.every(p => !p.keyword)) {
      alert('제품을 최소 1개 입력해주세요.'); return
    }
    const newItem = {
      ...currentItem,
      phone: formatPhone(currentItem.phone),
      products: currentItem.products.filter(p => p.keyword)
    }
    setItems([...items, newItem])
    setCurrentItem({ name: '', phone: '', address: '', message: '', products: [{ keyword: '', matched: null, qty: 1 }] })
  }

  const removeItem = (idx) => { setItems(items.filter((_, i) => i !== idx)) }

  const getOptionText = (item) => {
    return item.products.map(p => {
      const name = p.matched ? p.matched.product_full_name : p.keyword
      return p.qty > 1 ? `${name} x${p.qty}` : name
    }).join(', ')
  }

  const getTotalQty = (item) => item.products.reduce((s, p) => s + (p.qty || 1), 0)

  const getSummary = () => {
    const productMap = {}
    items.forEach(item => {
      item.products.forEach(p => {
        const name = p.matched ? p.matched.product_full_name : p.keyword
        const price = p.matched ? p.matched.unit_price : 0
        const key = name
        if (!productMap[key]) productMap[key] = { name, qty: 0, price }
        productMap[key].qty += (p.qty || 1)
      })
    })
    const products = Object.values(productMap)
    const shippingCount = items.length
    return { products, shippingCount }
  }

  const downloadExcel = () => {
    if (items.length === 0) { alert('주문 내역이 없습니다.'); return }

    const summary = getSummary()
    const wb = XLSX.utils.book_new()

    const sheetData = items.map(item => ({
      '수취인명': item.name,
      '수취인 연락처': item.phone,
      '배송지': item.address,
      '배송메세지': item.message || '',
      '옵션명': getOptionText(item),
      '수량': getTotalQty(item),
      '발송인': senderForm.sender_name || '',
      '발송인연락처': senderForm.sender_phone || '',
      '발송인주소': senderForm.sender_address || '',
      '운송장번호': '',
    }))
    const ws1 = XLSX.utils.json_to_sheet(sheetData)
    ws1['!cols'] = [
      { wch: 10 }, { wch: 15 }, { wch: 60 }, { wch: 35 }, { wch: 40 },
      { wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 50 }, { wch: 15 },
    ]
    XLSX.utils.book_append_sheet(wb, ws1, '발송내역')

    const msData = [
      ['거 래 명 세 표', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['품목', '수량', '단가', '공급가액', '세액(10%)', '소계'],
    ]

    summary.products.forEach(p => {
      const supply = p.qty * p.price
      const tax = Math.round(supply * 0.1)
      const sub = supply + tax
      msData.push([p.name, p.qty, p.price, supply, tax, sub])
    })

    const shippingSupply = summary.shippingCount * SHIPPING_COST
    const shippingTax = Math.round(shippingSupply * 0.1)
    const shippingSub = shippingSupply + shippingTax
    msData.push(['택배비', summary.shippingCount, SHIPPING_COST, shippingSupply, shippingTax, shippingSub])

    let totalSub = shippingSub
    summary.products.forEach(p => {
      const supply = p.qty * p.price
      const tax = Math.round(supply * 0.1)
      totalSub += supply + tax
    })
    msData.push(['총계', '', '', '', '', totalSub])

    const ws2 = XLSX.utils.aoa_to_sheet(msData)
    ws2['!cols'] = [{ wch: 35 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws2, '명세서')

    const d = new Date()
    const yy = String(d.getFullYear()).slice(2)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    XLSX.writeFile(wb, `택배양식_와이바이_${yy}${mm}${dd}.xlsx`)
  }

  const saveSenderProfile = async () => {
    if (!selectedSupplier) { alert('매입처를 먼저 선택하세요.'); return }
    const existing = senderProfiles.find(p => p.supplier_id === selectedSupplier.id)
    const data = { ...senderForm, supplier_id: selectedSupplier.id }
    if (existing) await supabase.from('sender_profiles').update(data).eq('id', existing.id)
    else await supabase.from('sender_profiles').insert(data)
    const { data: spData } = await supabase.from('sender_profiles').select('*')
    setSenderProfiles(spData || [])
    setShowSenderForm(false)
    alert('발송인 정보가 저장되었습니다.')
  }

  const saveOrderToDB = async () => {
    if (items.length === 0) { alert('주문 내역이 없습니다.'); return }
    if (!selectedSupplier) { alert('매입처를 선택해주세요.'); return }
    setSaving(true)
    const user = (await supabase.auth.getUser()).data.user
    const summary = getSummary()

    let totalAmount = 0
    summary.products.forEach(p => { totalAmount += p.qty * p.price })
    const shippingTotal = items.length * SHIPPING_COST
    const grandTotal = Math.round((totalAmount + shippingTotal) * 1.1)

    const { data: order, error } = await supabase.from('orders').insert({
      supplier_id: selectedSupplier.id, order_date: orderDate,
      total_amount: totalAmount, shipping_total: shippingTotal, grand_total: grandTotal,
      status: 'PENDING', created_by: user.id,
    }).select().single()

    if (error) { alert('저장 실패: ' + error.message); setSaving(false); return }

    for (const item of items) {
      const { data: oi } = await supabase.from('order_items').insert({
        order_id: order.id, recipient_name: item.name, recipient_phone: item.phone,
        recipient_address: item.address, delivery_message: item.message || null,
      }).select().single()

      if (oi) {
        for (const p of item.products) {
          const supply = (p.qty || 1) * (p.matched?.unit_price || 0)
          const tax = Math.round(supply * 0.1)
          await supabase.from('order_item_products').insert({
            order_item_id: oi.id, product_id: p.matched?.product_id || null,
            product_name: p.matched ? p.matched.product_full_name : p.keyword,
            quantity: p.qty || 1, unit_price: p.matched?.unit_price || 0,
            supply_amount: supply, tax_amount: tax, subtotal: supply + tax,
          })
        }
      }
    }

    alert('주문이 저장되었습니다.')
    setSaving(false)
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()
  const summary = getSummary()

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 매입처 선택 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">❶ 매입처 선택</h3>
          {selectedSupplier && (
            <button onClick={() => setShowSenderForm(!showSenderForm)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              ⚙️ 발송인 정보 {showSenderForm ? '닫기' : '설정'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {suppliers.map(s => (
            <button key={s.id} onClick={() => selectSupplier(s)}
              className={`p-4 rounded-xl border-2 transition-all text-center ${
                selectedSupplier?.id === s.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}>
              <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: s.color_code }}>{s.supplier_name.slice(0, 1)}</div>
              <p className="text-sm font-medium text-slate-700">{s.supplier_name}</p>
            </button>
          ))}
        </div>

        {/* 디버그 정보 */}
        {selectedSupplier && (
          <p className="mt-3 text-xs text-slate-400">📌 약어 로드: {debugInfo || '로딩 중...'}</p>
        )}

        {showSenderForm && (
          <div className="mt-4 p-4 bg-slate-50 rounded-xl space-y-3">
            <h4 className="text-sm font-medium text-slate-700">발송인 정보 (엑셀에 자동 입력됨)</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">발송인명</label>
                <input type="text" value={senderForm.sender_name} onChange={e => setSenderForm({...senderForm, sender_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">연락처</label>
                <input type="text" value={senderForm.sender_phone} onChange={e => setSenderForm({...senderForm, sender_phone: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">예금주</label>
                <input type="text" value={senderForm.deposit_name} onChange={e => setSenderForm({...senderForm, deposit_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">주소</label>
              <input type="text" value={senderForm.sender_address} onChange={e => setSenderForm({...senderForm, sender_address: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">결제계좌</label>
              <input type="text" value={senderForm.bank_info} onChange={e => setSenderForm({...senderForm, bank_info: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500"
                placeholder="예: 기업은행 551-046729-01-167" />
            </div>
            <button onClick={saveSenderProfile} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">저장</button>
          </div>
        )}
      </div>

      {/* 날짜 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-slate-800">주문일자</label>
          <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
        </div>
      </div>

      {/* 주문 입력 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">❷ 주문 입력</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">수취인명 *</label>
            <input type="text" value={currentItem.name} onChange={e => setCurrentItem({...currentItem, name: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="홍길동" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">연락처 *</label>
            <input type="text" value={currentItem.phone} onChange={e => setCurrentItem({...currentItem, phone: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              placeholder="01012345678" />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">배송지 *</label>
          <input type="text" value={currentItem.address} onChange={e => setCurrentItem({...currentItem, address: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="서울시 강남구 역삼동 123-45 ○○아파트 101동 202호" />
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">배송메세지</label>
          <input type="text" value={currentItem.message} onChange={e => setCurrentItem({...currentItem, message: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            placeholder="문 앞에 놓아주세요" />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-500">제품 (약어 입력 → 자동매칭)</label>
            <button type="button" onClick={addProductRow} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">+ 제품 추가</button>
          </div>
          {currentItem.products.map((p, idx) => (
            <div key={idx} className="flex gap-2 mb-2 items-start">
              <div className="flex-1">
                <input type="text" value={p.keyword}
                  onChange={e => updateProductKeyword(idx, e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-200 outline-none text-sm ${
                    p.keyword && p.matched ? 'border-emerald-400 bg-emerald-50' :
                    p.keyword && !p.matched ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                  }`}
                  placeholder={aliases.length > 0 ? `예: ${aliases.slice(0,3).map(a=>a.alias).join(', ')}` : '매입처를 먼저 선택하세요'} />
                {p.matched && (
                  <p className="text-xs text-emerald-600 mt-1 ml-1">✓ {p.matched.product_full_name} ({formatNumber(p.matched.unit_price)}원)</p>
                )}
                {p.keyword && !p.matched && aliases.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1 ml-1">⚠ 매칭 안됨 - 원본 그대로 사용 (등록된 약어: {aliases.map(a=>a.alias).join(', ')})</p>
                )}
                {p.keyword && !p.matched && aliases.length === 0 && (
                  <p className="text-xs text-red-500 mt-1 ml-1">❌ 약어 매핑 데이터가 없습니다. 약어 매핑 메뉴에서 등록해주세요.</p>
                )}
              </div>
              <div className="w-20">
                <input type="number" value={p.qty} onChange={e => updateProductQty(idx, e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-slate-300 text-center text-sm outline-none" min="1" placeholder="수량" />
              </div>
              {currentItem.products.length > 1 && (
                <button type="button" onClick={() => removeProductRow(idx)}
                  className="px-3 py-3 text-red-400 hover:text-red-600 text-sm">✕</button>
              )}
            </div>
          ))}
        </div>

        <button onClick={addItem}
          className="mt-4 w-full py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
          📦 주문 추가
        </button>
      </div>

      {/* 주문 목록 */}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800">📋 주문 목록 ({items.length}건)</h3>
          </div>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                    <span className="text-xs text-slate-400">{item.phone}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 truncate">{item.address}</p>
                  <p className="text-xs text-indigo-600 mt-1 font-medium">{getOptionText(item)}</p>
                  {item.message && <p className="text-xs text-slate-400 mt-0.5">💬 {item.message}</p>}
                </div>
                <button onClick={() => removeItem(idx)} className="ml-3 p-1 hover:bg-red-100 rounded text-sm">🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 명세서 미리보기 */}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">📊 거래명세서 미리보기</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-indigo-50">
                  <th className="text-left px-4 py-2 font-semibold text-slate-700">품목</th>
                  <th className="text-center px-4 py-2 font-semibold text-slate-700">수량</th>
                  <th className="text-right px-4 py-2 font-semibold text-slate-700">단가</th>
                  <th className="text-right px-4 py-2 font-semibold text-slate-700">공급가액</th>
                  <th className="text-right px-4 py-2 font-semibold text-slate-700">세액(10%)</th>
                  <th className="text-right px-4 py-2 font-semibold text-slate-700">소계</th>
                </tr>
              </thead>
              <tbody>
                {summary.products.map((p, i) => {
                  const supply = p.qty * p.price
                  const tax = Math.round(supply * 0.1)
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className={`px-4 py-2 ${p.price === 0 ? 'bg-yellow-50 text-amber-700' : 'text-slate-700'}`}>{p.name}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{p.qty}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{formatNumber(p.price)}</td>
                      <td className="px-4 py-2 text-right text-slate-700">{formatNumber(supply)}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{formatNumber(tax)}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-800">{formatNumber(supply + tax)}</td>
                    </tr>
                  )
                })}
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-2 text-slate-700">택배비</td>
                  <td className="px-4 py-2 text-center text-slate-600">{summary.shippingCount}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{formatNumber(SHIPPING_COST)}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{formatNumber(summary.shippingCount * SHIPPING_COST)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{formatNumber(Math.round(summary.shippingCount * SHIPPING_COST * 0.1))}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-800">{formatNumber(Math.round(summary.shippingCount * SHIPPING_COST * 1.1))}</td>
                </tr>
                <tr className="bg-slate-50 font-bold">
                  <td className="px-4 py-3 text-slate-800">총계</td>
                  <td colSpan="4"></td>
                  <td className="px-4 py-3 text-right text-indigo-600 text-lg">
                    {formatNumber((() => {
                      let total = Math.round(summary.shippingCount * SHIPPING_COST * 1.1)
                      summary.products.forEach(p => { total += p.qty * p.price + Math.round(p.qty * p.price * 0.1) })
                      return total
                    })())}원
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 하단 버튼 */}
      {items.length > 0 && (
        <div className="flex gap-3">
          <button onClick={downloadExcel}
            className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-semibold text-lg hover:bg-emerald-700 transition-colors">
            📥 엑셀 다운로드
          </button>
          <button onClick={saveOrderToDB} disabled={saving}
            className={`flex-1 py-4 rounded-2xl text-white font-semibold text-lg transition-colors ${
              saving ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}>{saving ? '저장 중...' : '💾 주문 저장'}</button>
        </div>
      )}

      {/* 등록된 약어 안내 */}
      {selectedSupplier && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
          <h4 className="text-xs font-semibold text-slate-500 mb-3">💡 사용 가능한 약어 ({aliases.length}개)</h4>
          {aliases.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {aliases.map(a => (
                <span key={a.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs">
                  <span className="font-semibold text-indigo-600">{a.alias}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-slate-600">{a.product_full_name}</span>
                  <span className="text-slate-400">({formatNumber(a.unit_price)}원)</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-red-500">약어 매핑이 없습니다. 왼쪽 메뉴 "🔗 약어 매핑"에서 먼저 등록해주세요.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default OrderInput
