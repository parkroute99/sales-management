import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const DEFAULT_SENDER = {
  sender_name: '와이바이',
  sender_phone: '010-3933-6301',
  sender_address: '경기도 안양시 동안구 시민대로 361, 에이스평촌타워 103호'
}

/* ── 초성 유틸 ── */
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const getChosung = (str) => [...(str||'')].map(c => {
  const code = c.charCodeAt(0) - 0xAC00
  if (code < 0 || code > 11171) return c
  return CHO[Math.floor(code / 588)]
}).join('')

const isChosung = (str) => [...str].every(c => CHO.includes(c))

function OrderInput() {
  const [suppliers, setSuppliers] = useState([])
  const [aliases, setAliases] = useState([])
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [shippingCost, setShippingCost] = useState(4000)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [items, setItems] = useState([])
  const [currentItem, setCurrentItem] = useState({
    name: '', phone: '', address: '', message: '',
    products: [{ keyword: '', matched: null, qty: 1, candidates: [], showCandidates: false }]
  })
  const [saving, setSaving] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')

  const [senderProfiles, setSenderProfiles] = useState([])
  const [selectedSenderId, setSelectedSenderId] = useState(null)
  const [activeSender, setActiveSender] = useState({ ...DEFAULT_SENDER })
  const [showSenderManager, setShowSenderManager] = useState(false)
  const [senderEditId, setSenderEditId] = useState(null)
  const [senderForm, setSenderForm] = useState({ profile_name: '', sender_name: '', sender_phone: '', sender_address: '' })

  /* ── 엑셀 업로드 관련 ── */
  const [showExcelUpload, setShowExcelUpload] = useState(false)
  const [excelUploading, setExcelUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const excelFileRef = useRef(null)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (selectedSupplier) fetchAliases() }, [selectedSupplier])

  const fetchData = async () => {
    const { data: sData } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    setSuppliers(sData || [])
    await fetchSenderProfiles()
  }

  const fetchSenderProfiles = async () => {
    const { data: spData } = await supabase.from('sender_profiles').select('*').order('is_default', { ascending: false }).order('created_at')
    const profiles = spData || []
    setSenderProfiles(profiles)
    const defaultProfile = profiles.find(p => p.is_default)
    if (defaultProfile) {
      setSelectedSenderId(defaultProfile.id)
      setActiveSender({ sender_name: defaultProfile.sender_name, sender_phone: defaultProfile.sender_phone, sender_address: defaultProfile.sender_address })
    } else if (profiles.length > 0) {
      setSelectedSenderId(profiles[0].id)
      setActiveSender({ sender_name: profiles[0].sender_name, sender_phone: profiles[0].sender_phone, sender_address: profiles[0].sender_address })
    } else {
      setSelectedSenderId(null)
      setActiveSender({ ...DEFAULT_SENDER })
    }
  }

  const selectSenderProfile = (profile) => {
    setSelectedSenderId(profile.id)
    setActiveSender({ sender_name: profile.sender_name, sender_phone: profile.sender_phone, sender_address: profile.sender_address })
  }

  const fetchAliases = async () => {
    const { data: data1 } = await supabase.from('product_aliases').select('*').eq('supplier_id', selectedSupplier.id)
    const { data: data2 } = await supabase.from('product_aliases').select('*').is('supplier_id', null)
    const { data: dataAll } = await supabase.from('product_aliases').select('*')
    const combined = [...(data1 || []), ...(data2 || [])]
    const finalAliases = combined.length > 0 ? combined : (dataAll || [])
    setAliases(finalAliases)
    setDebugInfo(`매입처별: ${(data1||[]).length}개, 미지정: ${(data2||[]).length}개, 전체: ${(dataAll||[]).length}개 → 사용: ${finalAliases.length}개`)
  }

  const selectSupplier = (s) => {
    setSelectedSupplier(s)
    setShippingCost(s.default_shipping_cost ?? 4000)
  }

  /* ── 발송인 관리 ── */
  const resetSenderForm = () => { setSenderForm({ profile_name: '', sender_name: '', sender_phone: '', sender_address: '' }); setSenderEditId(null) }
  const handleSaveSender = async () => {
    if (!senderForm.sender_name || !senderForm.sender_phone) { alert('발송인명과 연락처를 입력해주세요.'); return }
    const profileName = senderForm.profile_name || senderForm.sender_name
    const data = { ...senderForm, profile_name: profileName }
    if (senderEditId) await supabase.from('sender_profiles').update(data).eq('id', senderEditId)
    else { const isFirst = senderProfiles.length === 0; await supabase.from('sender_profiles').insert({ ...data, is_default: isFirst }) }
    resetSenderForm(); await fetchSenderProfiles()
  }
  const handleEditSender = (p) => { setSenderEditId(p.id); setSenderForm({ profile_name: p.profile_name || '', sender_name: p.sender_name, sender_phone: p.sender_phone, sender_address: p.sender_address }) }
  const handleDeleteSender = async (id) => { if (!window.confirm('삭제?')) return; await supabase.from('sender_profiles').delete().eq('id', id); await fetchSenderProfiles() }
  const handleSetDefault = async (id) => { await supabase.from('sender_profiles').update({ is_default: false }).neq('id', id); await supabase.from('sender_profiles').update({ is_default: true }).eq('id', id); await fetchSenderProfiles() }

  /* ── 스마트 매칭 ── */
  const matchProduct = (keyword) => {
    if (!keyword || aliases.length === 0) return { best: null, candidates: [] }
    const lower = keyword.trim().toLowerCase()
    const choInput = getChosung(keyword.trim())
    const results = []

    for (const a of aliases) {
      let score = 0
      const aliasLower = a.alias.toLowerCase()
      const nameLower = a.product_full_name.toLowerCase()

      if (aliasLower === lower) { score = 100 }
      else if (aliasLower.includes(lower)) { score = 80 }
      else if (lower.includes(aliasLower)) { score = 75 }
      else if (nameLower.includes(lower)) { score = 70 }
      else if (isChosung(keyword.trim())) {
        const aliasChosung = getChosung(a.alias)
        const nameChosung = getChosung(a.product_full_name.replace(/\s/g, ''))
        if (aliasChosung.startsWith(keyword.trim())) { score = 65 }
        else if (nameChosung.startsWith(keyword.trim())) { score = 60 }
        else if (nameChosung.includes(keyword.trim())) { score = 55 }
      } else {
        const nameChosung = getChosung(a.product_full_name.replace(/\s/g, ''))
        if (nameChosung.includes(choInput)) { score = 40 }
      }

      if (score > 0) {
        score += Math.min(10, (a.match_count || 0) * 0.5)
        results.push({ alias: a, score })
      }
    }

    results.sort((a, b) => b.score - a.score)
    const best = results.length > 0 && results[0].score >= 55 ? results[0].alias : null
    const candidates = results.slice(0, 5).map(r => r.alias)
    return { best, candidates }
  }

  const updateProductKeyword = (idx, keyword) => {
    const newProducts = [...currentItem.products]
    const { best, candidates } = matchProduct(keyword)
    newProducts[idx] = {
      ...newProducts[idx], keyword, matched: best, candidates,
      showCandidates: !best && keyword.length >= 1 && candidates.length > 0,
    }
    setCurrentItem({ ...currentItem, products: newProducts })
  }

  const selectCandidate = async (prodIdx, alias) => {
    const newProducts = [...currentItem.products]
    newProducts[prodIdx] = { ...newProducts[prodIdx], matched: alias, showCandidates: false }
    setCurrentItem({ ...currentItem, products: newProducts })

    const keyword = newProducts[prodIdx].keyword.trim()
    if (keyword && keyword.toLowerCase() !== alias.alias.toLowerCase()) {
      const { data: exists } = await supabase.from('product_aliases').select('id').eq('alias', keyword).maybeSingle()
      if (!exists) {
        await supabase.from('product_aliases').insert({
          alias: keyword, product_full_name: alias.product_full_name,
          unit_price: alias.unit_price, supplier_id: alias.supplier_id || null,
          product_id: alias.product_id || null, is_auto: true,
        })
        setAliases(prev => [...prev, { alias: keyword, product_full_name: alias.product_full_name, unit_price: alias.unit_price, supplier_id: alias.supplier_id, product_id: alias.product_id, is_auto: true }])
      }
    }
    if (alias.id) {
      await supabase.from('product_aliases').update({ match_count: (alias.match_count || 0) + 1 }).eq('id', alias.id)
    }
  }

  const updateProductQty = (idx, qty) => {
    const newProducts = [...currentItem.products]
    newProducts[idx].qty = Number(qty) || 1
    setCurrentItem({ ...currentItem, products: newProducts })
  }

  const addProductRow = () => {
    setCurrentItem({ ...currentItem, products: [...currentItem.products, { keyword: '', matched: null, qty: 1, candidates: [], showCandidates: false }] })
  }

  const removeProductRow = (idx) => {
    if (currentItem.products.length <= 1) return
    setCurrentItem({ ...currentItem, products: currentItem.products.filter((_, i) => i !== idx) })
  }

  const formatPhone = (phone) => {
    const nums = phone.replace(/[^0-9]/g, '')
    if (nums.length === 11) return `${nums.slice(0,3)}-${nums.slice(3,7)}-${nums.slice(7)}`
    if (nums.length === 10) return `${nums.slice(0,3)}-${nums.slice(3,6)}-${nums.slice(6)}`
    return phone
  }

  const addItem = () => {
    if (!currentItem.name || !currentItem.phone || !currentItem.address) { alert('수취인명, 연락처, 주소를 입력해주세요.'); return }
    if (currentItem.products.every(p => !p.keyword)) { alert('제품을 최소 1개 입력해주세요.'); return }
    const newItem = { ...currentItem, phone: formatPhone(currentItem.phone), products: currentItem.products.filter(p => p.keyword) }
    setItems([...items, newItem])
    setCurrentItem({ name: '', phone: '', address: '', message: '', products: [{ keyword: '', matched: null, qty: 1, candidates: [], showCandidates: false }] })
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
        if (!productMap[name]) productMap[name] = { name, qty: 0, price }
        productMap[name].qty += (p.qty || 1)
      })
    })
    return { products: Object.values(productMap), shippingCount: items.length }
  }

  const downloadExcel = () => {
    if (items.length === 0) { alert('주문 내역이 없습니다.'); return }
    const summary = getSummary()
    const wb = XLSX.utils.book_new()
    const sheetData = items.map(item => ({
      '수취인명': item.name, '수취인 연락처': item.phone,
      '배송지': item.address, '배송메세지': item.message || '',
      '옵션명': getOptionText(item), '수량': getTotalQty(item),
      '발송인': activeSender.sender_name, '발송인연락처': activeSender.sender_phone,
      '발송인주소': activeSender.sender_address, '운송장번호': '',
    }))
    const ws1 = XLSX.utils.json_to_sheet(sheetData)
    ws1['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 60 }, { wch: 35 }, { wch: 40 }, { wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 50 }, { wch: 15 }]
    XLSX.utils.book_append_sheet(wb, ws1, '발송내역')

    const msData = [['거 래 명 세 표', '', '', '', '', ''], ['', '', '', '', '', ''], ['품목', '수량', '단가', '공급가액', '세액(10%)', '소계']]
    summary.products.forEach(p => {
      const supply = p.qty * p.price; const tax = Math.round(supply * 0.1)
      msData.push([p.name, p.qty, p.price, supply, tax, supply + tax])
    })
    const ss = summary.shippingCount * shippingCost; const st = Math.round(ss * 0.1)
    msData.push(['택배비', summary.shippingCount, shippingCost, ss, st, ss + st])
    let totalSub = ss + st
    summary.products.forEach(p => { const s = p.qty * p.price; totalSub += s + Math.round(s * 0.1) })
    msData.push(['총계', '', '', '', '', totalSub])
    const ws2 = XLSX.utils.aoa_to_sheet(msData)
    ws2['!cols'] = [{ wch: 35 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws2, '명세서')

    const d = new Date()
    const yy = String(d.getFullYear()).slice(2); const mm = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0')
    XLSX.writeFile(wb, `택배양식_와이바이_${yy}${mm}${dd}.xlsx`)
  }

  const saveOrderToDB = async () => {
    if (items.length === 0) { alert('주문 내역이 없습니다.'); return }
    if (!selectedSupplier) { alert('매입처를 선택해주세요.'); return }
    setSaving(true)
    const user = (await supabase.auth.getUser()).data.user
    const summary = getSummary()
    let totalAmount = 0
    summary.products.forEach(p => { totalAmount += p.qty * p.price })
    const shippingTotal = items.length * shippingCost
    const grandTotal = Math.round((totalAmount + shippingTotal) * 1.1)

    const { data: order, error } = await supabase.from('orders').insert({
      supplier_id: selectedSupplier.id, order_date: orderDate,
      total_amount: totalAmount, shipping_total: shippingTotal,
      shipping_cost_per_order: shippingCost, grand_total: grandTotal, status: 'PENDING', created_by: user.id,
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
    setItems([])
    setSaving(false)
  }

  /* ── 엑셀 업로드: 샘플 다운로드 ── */
  const handleSampleDownload = () => {
    const sample = [
      { '수취인명': '홍길동', '연락처': '010-1234-5678', '주소': '서울시 강남구 테헤란로 123 아파트 101호', '배송메세지': '문 앞에 놓아주세요', '제품1': '간장불고기', '수량1': 5, '제품2': '고추장불고기', '수량2': 5 },
      { '수취인명': '김철수', '연락처': '010-9876-5432', '주소': '경기도 성남시 분당구 판교역로 456', '배송메세지': '경비실 맡겨주세요', '제품1': '오돌뼈', '수량1': 3, '제품2': '', '수량2': '' },
      { '수취인명': '이영희', '연락처': '01055556666', '주소': '부산시 해운대구 해운대로 789', '배송메세지': '', '제품1': '달팽이크림', '수량1': 2, '제품2': '오메가3', '수량2': 1 },
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 45 }, { wch: 25 }, { wch: 15 }, { wch: 6 }, { wch: 15 }, { wch: 6 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '주문입력양식')
    XLSX.writeFile(wb, '주문입력_샘플양식.xlsx')
  }

  /* ── 엑셀 업로드: 파일 처리 ── */
  const handleExcelUpload = (e) => {
    const file = e.target.files[0]; if (!file) return
    setExcelUploading(true)
    setUploadResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' })
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
        if (data.length === 0) { alert('데이터가 없습니다.'); setExcelUploading(false); return }

        let success = 0, failed = 0, errors = []
        const newItems = []

        for (let i = 0; i < data.length; i++) {
          const row = data[i]
          const name = String(row['수취인명'] || '').trim()
          const phone = String(row['연락처'] || '').trim()
          const address = String(row['주소'] || '').trim()
          const message = String(row['배송메세지'] || '').trim()

          if (!name) { failed++; errors.push(`${i + 2}행: 수취인명 없음`); continue }
          if (!phone) { failed++; errors.push(`${i + 2}행: 연락처 없음`); continue }
          if (!address) { failed++; errors.push(`${i + 2}행: 주소 없음`); continue }

          const products = []
          for (let j = 1; j <= 5; j++) {
            const pKey = row[`제품${j}`] || (j === 1 ? row['제품'] : '')
            const qKey = row[`수량${j}`] || (j === 1 ? row['수량'] : '')
            const keyword = String(pKey || '').trim()
            if (!keyword) continue

            const qty = Number(qKey) || 1
            const { best, candidates } = matchProduct(keyword)
            products.push({ keyword, matched: best, qty, candidates, showCandidates: false })
          }

          if (products.length === 0) { failed++; errors.push(`${i + 2}행: 제품 정보 없음`); continue }

          const unmatchedProducts = products.filter(p => !p.matched)
          if (unmatchedProducts.length > 0) {
            errors.push(`${i + 2}행: "${unmatchedProducts.map(p => p.keyword).join(', ')}" 매칭 안됨 (수동 확인 필요)`)
          }

          newItems.push({ name, phone: formatPhone(phone), address, message, products })
          success++
        }

        setItems(prev => [...prev, ...newItems])
        setUploadResult({ success, failed, errors, total: data.length })
      } catch (err) {
        alert('파일 읽기 실패: ' + err.message)
      }
      setExcelUploading(false)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()
  const summary = getSummary()

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* 상단 타이틀 + 엑셀 업로드 버튼 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">주문 입력</h1>
        <button onClick={() => { setShowExcelUpload(!showExcelUpload); setUploadResult(null) }}
          className={`px-4 py-2 text-sm rounded-xl border font-medium transition ${showExcelUpload ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
          📤 엑셀 대량 업로드
        </button>
      </div>

      {/* ── 엑셀 업로드 가이드 ── */}
      {showExcelUpload && (
        <div className="bg-white rounded-2xl border border-indigo-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-800">📤 엑셀로 주문 대량 입력</h3>
            <button onClick={() => { setShowExcelUpload(false); setUploadResult(null) }} className="text-slate-400 hover:text-slate-600 text-sm">✕ 닫기</button>
          </div>

          <div className="bg-indigo-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-indigo-800">엑셀 파일 형식 안내</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-indigo-100">
                  <th className="px-3 py-2 text-left font-semibold text-indigo-800 border border-indigo-200">컬럼명</th>
                  <th className="px-3 py-2 text-center font-semibold text-indigo-800 border border-indigo-200">필수</th>
                  <th className="px-3 py-2 text-left font-semibold text-indigo-800 border border-indigo-200">설명</th>
                  <th className="px-3 py-2 text-left font-semibold text-indigo-800 border border-indigo-200">예시</th>
                </tr></thead>
                <tbody>
                  {[
                    ['수취인명', '필수', '받는 사람 이름', '홍길동'],
                    ['연락처', '필수', '받는 사람 전화번호 (자동 포맷)', '01012345678'],
                    ['주소', '필수', '배송 주소 (상세주소 포함)', '서울시 강남구 테헤란로 123'],
                    ['배송메세지', '선택', '배송 시 요청사항', '문 앞에 놓아주세요'],
                    ['제품1', '필수', '첫번째 제품 약어 또는 이름', '간장불고기'],
                    ['수량1', '선택', '첫번째 제품 수량 (미입력시 1)', '5'],
                    ['제품2', '선택', '두번째 제품 (최대 제품5까지)', '고추장불고기'],
                    ['수량2', '선택', '두번째 제품 수량', '5'],
                  ].map(([col, req, desc, ex], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-indigo-50/50'}>
                      <td className="px-3 py-2 font-semibold text-slate-700 border border-indigo-200">{col}</td>
                      <td className={`px-3 py-2 text-center font-bold border border-indigo-200 ${req === '필수' ? 'text-red-500' : 'text-slate-400'}`}>{req}</td>
                      <td className="px-3 py-2 text-slate-600 border border-indigo-200">{desc}</td>
                      <td className="px-3 py-2 text-slate-500 border border-indigo-200">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-indigo-700 space-y-1 pt-2">
              <p>• <strong>매입처를 먼저 선택</strong>해야 제품 약어 매칭이 동작합니다</p>
              <p>• 제품명은 등록된 <strong>약어·초성·부분명</strong>으로 자동 매칭됩니다</p>
              <p>• 한 행에 최대 <strong>5개 제품</strong>까지 입력 가능 (제품1~제품5, 수량1~수량5)</p>
              <p>• 매칭되지 않는 제품은 <strong>경고 표시</strong>되며, 주문 목록에서 수동 확인하세요</p>
              <p>• .xlsx, .xls, .csv 파일 지원</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSampleDownload} className="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 border border-slate-300">
              📋 샘플 양식 다운로드
            </button>
            <button onClick={() => excelFileRef.current?.click()} disabled={excelUploading || !selectedSupplier}
              className={`flex-1 px-5 py-3 rounded-xl text-sm font-semibold transition ${
                !selectedSupplier ? 'bg-slate-200 text-slate-400 cursor-not-allowed' :
                excelUploading ? 'bg-slate-300 text-slate-500 cursor-wait' :
                'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}>
              {excelUploading ? '처리 중...' : !selectedSupplier ? '⚠ 매입처를 먼저 선택하세요' : '📤 엑셀 파일 선택하여 업로드'}
            </button>
            <input ref={excelFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </div>

          {uploadResult && (
            <div className={`rounded-xl p-4 ${uploadResult.failed > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              <p className="text-sm font-semibold mb-2">업로드 결과</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-2"><p className="text-lg font-bold text-emerald-600">{uploadResult.success}</p><p className="text-xs text-slate-500">성공 (주문 추가)</p></div>
                <div className="bg-white rounded-lg p-2"><p className="text-lg font-bold text-red-600">{uploadResult.failed}</p><p className="text-xs text-slate-500">실패 (건너뜀)</p></div>
                <div className="bg-white rounded-lg p-2"><p className="text-lg font-bold text-slate-500">{uploadResult.total}</p><p className="text-xs text-slate-500">전체 행</p></div>
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="mt-3 bg-white rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-slate-500 mb-2">상세 내역:</p>
                  {uploadResult.errors.map((err, i) => <p key={i} className="text-xs text-amber-700">• {err}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ❶ 매입처 선택 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">❶ 매입처 선택</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {suppliers.map(s => (
            <button key={s.id} onClick={() => selectSupplier(s)}
              className={`p-4 rounded-xl border-2 transition-all text-center ${
                selectedSupplier?.id === s.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}>
              <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: s.color_code }}>{s.supplier_name.slice(0, 1)}</div>
              <p className="text-sm font-medium text-slate-700">{s.supplier_name}</p>
              <p className="text-xs text-slate-400 mt-1">택배비 {formatNumber(s.default_shipping_cost ?? 4000)}원</p>
            </button>
          ))}
        </div>
        {selectedSupplier && (
          <p className="mt-3 text-xs text-slate-400">📌 약어 로드: {debugInfo || '로딩 중...'}</p>
        )}
      </div>

      {/* 발송인 선택 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">📮 발송인 선택</h3>
          <button onClick={() => { setShowSenderManager(!showSenderManager); resetSenderForm() }}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            {showSenderManager ? '닫기' : '⚙️ 발송인 관리'}
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {senderProfiles.map(p => (
            <button key={p.id} onClick={() => selectSenderProfile(p)}
              className={`relative px-4 py-3 rounded-xl border-2 transition-all text-left min-w-[200px] ${
                selectedSenderId === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}>
              {p.is_default && <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">기본</span>}
              <p className="text-sm font-semibold text-slate-800">{p.profile_name || p.sender_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{p.sender_name} · {p.sender_phone}</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[250px]">{p.sender_address}</p>
            </button>
          ))}
          {senderProfiles.length === 0 && (
            <div className="text-sm text-slate-400 py-3">
              등록된 발송인이 없습니다. 기본값 사용 중: <span className="font-medium text-slate-600">{DEFAULT_SENDER.sender_name}</span>
            </div>
          )}
        </div>
        <div className="mt-4 p-3 bg-slate-50 rounded-xl flex items-center gap-4 text-sm">
          <span className="text-slate-500">현재 발송인:</span>
          <span className="font-semibold text-slate-800">{activeSender.sender_name}</span>
          <span className="text-slate-500">{activeSender.sender_phone}</span>
          <span className="text-slate-400 truncate flex-1">{activeSender.sender_address}</span>
        </div>

        {showSenderManager && (
          <div className="mt-4 p-5 bg-slate-50 rounded-xl space-y-4 border border-slate-200">
            <h4 className="text-sm font-semibold text-slate-700">{senderEditId ? '발송인 수정' : '새 발송인 등록'}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">프로필명</label>
                <input type="text" value={senderForm.profile_name} onChange={e => setSenderForm({...senderForm, profile_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 와이바이 본점" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">발송인명 *</label>
                <input type="text" value={senderForm.sender_name} onChange={e => setSenderForm({...senderForm, sender_name: e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="와이바이" /></div>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">연락처 *</label>
              <input type="text" value={senderForm.sender_phone} onChange={e => setSenderForm({...senderForm, sender_phone: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="010-0000-0000" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">주소 *</label>
              <input type="text" value={senderForm.sender_address} onChange={e => setSenderForm({...senderForm, sender_address: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="경기도 안양시..." /></div>
            <div className="flex gap-2">
              <button onClick={handleSaveSender} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                {senderEditId ? '수정 완료' : '등록'}</button>
              {senderEditId && <button onClick={resetSenderForm} className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">취소</button>}
            </div>
            {senderProfiles.length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold text-slate-500 mb-3">등록된 발송인 ({senderProfiles.length}개)</p>
                <div className="space-y-2">
                  {senderProfiles.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{p.profile_name || p.sender_name}</span>
                          {p.is_default && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">기본</span>}
                        </div>
                        <p className="text-xs text-slate-500">{p.sender_name} · {p.sender_phone} · {p.sender_address}</p>
                      </div>
                      <div className="flex gap-1 ml-3">
                        {!p.is_default && <button onClick={() => handleSetDefault(p.id)} className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded font-medium">기본설정</button>}
                        <button onClick={() => handleEditSender(p)} className="p-1.5 hover:bg-slate-100 rounded text-sm">✏️</button>
                        <button onClick={() => handleDeleteSender(p.id)} className="p-1.5 hover:bg-red-50 rounded text-sm">🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 날짜 + 택배비 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-800">주문일자</label>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
              className="px-4 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-800">건당 택배비</label>
            <div className="relative">
              <input type="number" value={shippingCost} onChange={e => setShippingCost(Number(e.target.value) || 0)}
                className="w-32 px-4 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm text-right pr-8" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">원</span>
            </div>
            <div className="flex gap-1">
              {[3000, 3500, 4000, 4500, 5000].map(v => (
                <button key={v} type="button" onClick={() => setShippingCost(v)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    shippingCost === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-300 hover:border-indigo-400'
                  }`}>{(v/1000).toFixed(1)}k</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ❷ 주문 입력 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">❷ 주문 입력</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-slate-500 mb-1">수취인명 *</label>
            <input type="text" value={currentItem.name} onChange={e => setCurrentItem({...currentItem, name: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="홍길동" /></div>
          <div><label className="block text-xs font-medium text-slate-500 mb-1">연락처 *</label>
            <input type="text" value={currentItem.phone} onChange={e => setCurrentItem({...currentItem, phone: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="01012345678" /></div>
        </div>
        <div className="mt-3"><label className="block text-xs font-medium text-slate-500 mb-1">배송지 *</label>
          <input type="text" value={currentItem.address} onChange={e => setCurrentItem({...currentItem, address: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="서울시 강남구..." /></div>
        <div className="mt-3"><label className="block text-xs font-medium text-slate-500 mb-1">배송메세지</label>
          <input type="text" value={currentItem.message} onChange={e => setCurrentItem({...currentItem, message: e.target.value})}
            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="문 앞에 놓아주세요" /></div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-500">제품 (약어·초성·부분 검색 가능)</label>
            <button type="button" onClick={addProductRow} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">+ 제품 추가</button>
          </div>
          {currentItem.products.map((p, idx) => (
            <div key={idx} className="mb-3">
              <div className="flex gap-2 items-start">
                <div className="flex-1 relative">
                  <input type="text" value={p.keyword}
                    onChange={e => updateProductKeyword(idx, e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-indigo-200 outline-none text-sm ${
                      p.keyword && p.matched ? 'border-emerald-400 bg-emerald-50' :
                      p.keyword && !p.matched ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                    }`}
                    placeholder={aliases.length > 0 ? `약어, 초성(ㅈㅎ), 부분명(직화) 모두 가능` : '매입처를 먼저 선택하세요'} />
                  {p.matched && (
                    <p className="text-xs text-emerald-600 mt-1 ml-1">✓ {p.matched.product_full_name} ({formatNumber(p.matched.unit_price)}원)</p>
                  )}
                  {p.showCandidates && p.candidates.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      <p className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50">혹시 이 제품인가요? (클릭하면 자동 학습됩니다)</p>
                      {p.candidates.map((c, ci) => (
                        <button key={ci} onClick={() => selectCandidate(idx, c)}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 border-b last:border-0 flex items-center justify-between">
                          <div>
                            <span className="text-indigo-600 font-medium">{c.alias}</span>
                            <span className="text-slate-400 mx-1">→</span>
                            <span className="text-slate-700">{c.product_full_name}</span>
                          </div>
                          <span className="text-xs text-slate-400 ml-2">{formatNumber(c.unit_price)}원</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {p.keyword && !p.matched && p.candidates.length === 0 && aliases.length > 0 && (
                    <p className="text-xs text-amber-600 mt-1 ml-1">⚠ 매칭 안됨 - 약어 매핑에서 등록하거나 자동 생성을 해주세요</p>
                  )}
                  {p.keyword && !p.matched && aliases.length === 0 && (
                    <p className="text-xs text-red-500 mt-1 ml-1">❌ 약어 매핑이 없습니다. 약어 매핑 → 자동 생성 버튼을 눌러주세요.</p>
                  )}
                </div>
                <div className="w-20">
                  <input type="number" value={p.qty} onChange={e => updateProductQty(idx, e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-slate-300 text-center text-sm outline-none" min="1" placeholder="수량" />
                </div>
                {currentItem.products.length > 1 && (
                  <button type="button" onClick={() => removeProductRow(idx)} className="px-3 py-3 text-red-400 hover:text-red-600 text-sm">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button onClick={addItem} className="mt-4 w-full py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors">
          📦 주문 추가
        </button>
      </div>

      {/* 주문 목록 */}
      {items.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">📋 주문 목록 ({items.length}건)</h3>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-start justify-between p-4 bg-slate-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                    <span className="text-xs text-slate-400">{item.phone}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 truncate">{item.address}</p>
                  <div className="mt-1">
                    {item.products.map((p, pi) => (
                      <span key={pi} className={`inline-block text-xs mr-2 px-2 py-0.5 rounded ${p.matched ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {p.matched ? p.matched.product_full_name : p.keyword} ×{p.qty}
                        {!p.matched && ' ⚠'}
                      </span>
                    ))}
                  </div>
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
                  const supply = p.qty * p.price; const tax = Math.round(supply * 0.1)
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
                  <td className="px-4 py-2 text-right text-slate-600">{formatNumber(shippingCost)}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{formatNumber(summary.shippingCount * shippingCost)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{formatNumber(Math.round(summary.shippingCount * shippingCost * 0.1))}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-800">{formatNumber(Math.round(summary.shippingCount * shippingCost * 1.1))}</td>
                </tr>
                <tr className="bg-slate-50 font-bold">
                  <td className="px-4 py-3 text-slate-800">총계</td>
                  <td colSpan="4"></td>
                  <td className="px-4 py-3 text-right text-indigo-600 text-lg">
                    {formatNumber((() => {
                      let total = Math.round(summary.shippingCount * shippingCost * 1.1)
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
          <button onClick={downloadExcel} className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-semibold text-lg hover:bg-emerald-700 transition-colors">
            📥 엑셀 다운로드
          </button>
          <button onClick={saveOrderToDB} disabled={saving}
            className={`flex-1 py-4 rounded-2xl text-white font-semibold text-lg transition-colors ${
              saving ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}>{saving ? '저장 중...' : '💾 주문 저장'}</button>
        </div>
      )}

      {/* 사용 가능한 약어 */}
      {selectedSupplier && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
          <h4 className="text-xs font-semibold text-slate-500 mb-3">💡 사용 가능한 약어 ({aliases.length}개) — 초성, 부분 입력도 자동 매칭됩니다</h4>
          {aliases.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {aliases.slice(0, 50).map((a, i) => (
                <span key={a.id || i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${
                  a.is_auto ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
                }`}>
                  <span className="font-semibold text-indigo-600">{a.alias}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-slate-600">{a.product_full_name}</span>
                  <span className="text-slate-400">({formatNumber(a.unit_price)}원)</span>
                </span>
              ))}
              {aliases.length > 50 && <span className="text-xs text-slate-400 self-center">... 외 {aliases.length - 50}개</span>}
            </div>
          ) : (
            <p className="text-xs text-red-500">약어 매핑이 없습니다. 약어 매핑 메뉴 → "자동 생성" 버튼을 눌러주세요.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default OrderInput
