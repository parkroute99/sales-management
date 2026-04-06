import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']
const emptyContact = () => ({ name: '', phone: '', email: '', role: '' })

/* ── 엑셀 파싱: 거래처마스터 양식 ── */
function parseTradePartnerExcel(sheetData) {
  // 1) 헤더 행 찾기 — "거래처코드"와 "거래처명"이 있는 행
  let headerIdx = -1
  let headers = []
  for (let i = 0; i < Math.min(sheetData.length, 10); i++) {
    const row = sheetData[i]
    const vals = Object.values(row).map(v => String(v ?? '').trim())
    if (vals.some(v => v === '거래처명') && vals.some(v => v.includes('거래처코드'))) {
      headerIdx = i
      headers = vals
      break
    }
  }
  // 헤더를 못 찾으면 기본 매핑 시도
  if (headerIdx === -1) return null

  // 컬럼 인덱스 매핑
  const keys = Object.keys(sheetData[0])
  const colMap = {}
  const headerNames = ['거래처코드','거래처명','구분','사업자번호','담당자명','연락처','이메일','결제조건','결제방법','결제계좌','비고']
  for (const name of headerNames) {
    const idx = headers.findIndex(h => h.includes(name))
    if (idx >= 0) colMap[name] = keys[idx]
  }

  // 2) 데이터 행 파싱 (헤더 다음부터)
  const dataRows = sheetData.slice(headerIdx + 1)
  const partners = [] // { code, name, type, bizNum, contacts, ... }
  let current = null

  for (const row of dataRows) {
    const code = String(row[colMap['거래처코드']] ?? '').trim()
    const name = String(row[colMap['거래처명']] ?? '').trim()
    const type = String(row[colMap['구분']] ?? '').trim()
    const bizNum = String(row[colMap['사업자번호']] ?? '').trim()
    const contactName = String(row[colMap['담당자명']] ?? '').trim()
    const phone = String(row[colMap['연락처']] ?? '').trim()
    const email = String(row[colMap['이메일']] ?? '').trim()
    const payTerms = String(row[colMap['결제조건']] ?? '').trim()
    const payMethod = String(row[colMap['결제방법']] ?? '').trim()
    const payAccount = String(row[colMap['결제계좌']] ?? '').trim()
    const note = String(row[colMap['비고']] ?? '').trim()

    // 새 거래처 시작 (코드가 있거나 이름이 있으면)
    if (code && name) {
      current = {
        code, name, type,
        bizNum: bizNum === 'nan' ? '' : bizNum,
        contacts: [],
        payTerms: payTerms === 'nan' ? '' : payTerms,
        payMethod: payMethod === 'nan' ? '' : payMethod,
        payAccount: payAccount === 'nan' ? '' : payAccount,
        notes: [],
      }
      // 담당자
      if (contactName && contactName !== 'nan') {
        current.contacts.push({
          name: contactName, phone: phone === 'nan' ? '' : phone,
          email: email === 'nan' ? '' : email, role: '',
        })
      }
      if (note && note !== 'nan') current.notes.push(note)
      partners.push(current)
    }
    // 기존 거래처의 추가 행 (코드 없이 담당자/비고 추가)
    else if (current) {
      if (contactName && contactName !== 'nan') {
        current.contacts.push({
          name: contactName, phone: phone === 'nan' ? '' : phone,
          email: (email && email !== 'nan') ? email : '', role: '',
        })
      }
      // 이메일만 있는 행 (기존 담당자의 이메일 보충)
      if (!contactName && email && email !== 'nan' && current.contacts.length > 0) {
        const lastContact = current.contacts[current.contacts.length - 1]
        if (!lastContact.email) lastContact.email = email
        else lastContact.email += ', ' + email
      }
      // 결제조건/방법/계좌 보충
      if (payTerms && payTerms !== 'nan' && !current.payTerms) current.payTerms = payTerms
      if (payMethod && payMethod !== 'nan' && !current.payMethod) current.payMethod = payMethod
      if (payAccount && payAccount !== 'nan' && !current.payAccount) current.payAccount = payAccount
      // 비고 추가
      if (note && note !== 'nan') current.notes.push(note)
    }
  }

  return partners
}

function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [form, setForm] = useState({
    supplier_name: '', supplier_code: '', business_number: '', memo: '',
    color_code: '#6366f1', default_shipping_cost: 4000,
    contacts: [emptyContact()],
    payment_terms: '', payment_method: '', payment_account: '',
    description: '', note: '',
  })

  useEffect(() => { fetchSuppliers() }, [])

  const fetchSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    setSuppliers(data || []); setLoading(false)
  }

  const resetForm = () => {
    setForm({
      supplier_name: '', supplier_code: '', business_number: '', memo: '',
      color_code: COLORS[suppliers.length % COLORS.length], default_shipping_cost: 4000,
      contacts: [emptyContact()],
      payment_terms: '', payment_method: '', payment_account: '',
      description: '', note: '',
    })
    setEditId(null)
  }

  const addContact = () => setForm({ ...form, contacts: [...form.contacts, emptyContact()] })
  const removeContact = (idx) => {
    if (form.contacts.length <= 1) return
    setForm({ ...form, contacts: form.contacts.filter((_, i) => i !== idx) })
  }
  const updateContact = (idx, field, value) => {
    const next = [...form.contacts]
    next[idx] = { ...next[idx], [field]: value }
    setForm({ ...form, contacts: next })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    const validContacts = form.contacts.filter(c => c.name || c.phone || c.email)
    const mainContact = validContacts[0] || {}
    const data = {
      supplier_name: form.supplier_name,
      supplier_code: form.supplier_code || null,
      business_number: form.business_number || null,
      memo: form.memo || null,
      color_code: form.color_code,
      default_shipping_cost: Number(form.default_shipping_cost) || 4000,
      sort_order: suppliers.length,
      contact_name: mainContact.name || null,
      contact_phone: mainContact.phone || null,
      contact_email: mainContact.email || null,
      contacts: validContacts,
      payment_terms: form.payment_terms || null,
      payment_method: form.payment_method || null,
      payment_account: form.payment_account || null,
      description: form.description || null,
      note: form.note || null,
    }
    if (editId) await supabase.from('suppliers').update(data).eq('id', editId)
    else { data.created_by = user.id; await supabase.from('suppliers').insert(data) }
    setShowForm(false); resetForm(); fetchSuppliers()
  }

  const handleEdit = (s) => {
    let contacts = []
    if (s.contacts && Array.isArray(s.contacts) && s.contacts.length > 0) {
      contacts = s.contacts.map(c => ({ name: c.name || '', phone: c.phone || '', email: c.email || '', role: c.role || '' }))
    } else if (s.contact_name || s.contact_phone || s.contact_email) {
      contacts = [{ name: s.contact_name || '', phone: s.contact_phone || '', email: s.contact_email || '', role: '' }]
    } else { contacts = [emptyContact()] }
    setForm({
      supplier_name: s.supplier_name, supplier_code: s.supplier_code || '',
      business_number: s.business_number || '', memo: s.memo || '',
      color_code: s.color_code || '#6366f1', default_shipping_cost: s.default_shipping_cost ?? 4000,
      contacts,
      payment_terms: s.payment_terms || '', payment_method: s.payment_method || '',
      payment_account: s.payment_account || '', description: s.description || '', note: s.note || '',
    })
    setEditId(s.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 매입처를 삭제하시겠습니까?')) {
      await supabase.from('suppliers').update({ is_active: false }).eq('id', id); fetchSuppliers()
    }
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()
  const getContacts = (s) => {
    if (s.contacts && Array.isArray(s.contacts) && s.contacts.length > 0) return s.contacts
    if (s.contact_name || s.contact_phone) return [{ name: s.contact_name, phone: s.contact_phone, email: s.contact_email, role: '' }]
    return []
  }

  /* ── 엑셀 다운로드 (거래처마스터 양식) ── */
  const handleExcelDownload = () => {
    const rows = []
    // 헤더 설명
    rows.push({ '거래처코드': '🏢 매입처 목록', '거래처명': '', '구분': '', '사업자번호': '', '담당자명': '', '연락처': '', '이메일': '', '결제조건': '', '결제방법': '', '결제계좌': '', '비고': '' })
    rows.push({ '거래처코드': '', '거래처명': '', '구분': '', '사업자번호': '', '담당자명': '', '연락처': '', '이메일': '', '결제조건': '', '결제방법': '', '결제계좌': '', '비고': '' })

    suppliers.forEach(s => {
      const contacts = getContacts(s)
      const mainContact = contacts[0] || {}
      // 메인 행
      rows.push({
        '거래처코드': s.supplier_code || '',
        '거래처명': s.supplier_name,
        '구분': '매입처',
        '사업자번호': s.business_number || '',
        '담당자명': mainContact.name ? `${mainContact.name}${mainContact.role ? ' ' + mainContact.role : ''}` : '',
        '연락처': mainContact.phone || '',
        '이메일': mainContact.email || '',
        '결제조건': s.payment_terms || '',
        '결제방법': s.payment_method || '',
        '결제계좌': s.payment_account || '',
        '비고': s.note || s.description || '',
      })
      // 추가 담당자
      for (let i = 1; i < contacts.length; i++) {
        rows.push({
          '거래처코드': '', '거래처명': '', '구분': '', '사업자번호': '',
          '담당자명': contacts[i].name ? `${contacts[i].name}${contacts[i].role ? ' ' + contacts[i].role : ''}` : '',
          '연락처': contacts[i].phone || '', '이메일': contacts[i].email || '',
          '결제조건': '', '결제방법': '', '결제계좌': '', '비고': '',
        })
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch:12 },{ wch:25 },{ wch:8 },{ wch:15 },{ wch:25 },{ wch:15 },{ wch:25 },{ wch:10 },{ wch:15 },{ wch:40 },{ wch:50 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '거래처마스터')
    XLSX.writeFile(wb, `매입처목록_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  /* ── 🔥 엑셀 업로드 (거래처마스터 양식 호환) ── */
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const sheetData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })

      if (sheetData.length === 0) { alert('데이터가 없습니다.'); return }

      // 거래처마스터 양식 파싱 시도
      let partners = parseTradePartnerExcel(sheetData)

      // 양식 감지 실패 시 단순 매핑
      if (!partners) {
        partners = []
        for (const row of sheetData) {
          const name = String(row['거래처명'] || row['매입처명'] || row['supplier_name'] || '').trim()
          if (!name) continue
          partners.push({
            code: String(row['거래처코드'] || row['코드'] || '').trim(),
            name,
            type: String(row['구분'] || '').trim() || '매입처',
            bizNum: String(row['사업자번호'] || '').trim(),
            contacts: [{ name: String(row['담당자명'] || row['담당자'] || '').trim(), phone: String(row['연락처'] || '').trim(), email: String(row['이메일'] || '').trim(), role: '' }].filter(c => c.name || c.phone),
            payTerms: String(row['결제조건'] || '').trim(),
            payMethod: String(row['결제방법'] || '').trim(),
            payAccount: String(row['결제계좌'] || '').trim(),
            notes: [String(row['비고'] || '').trim()].filter(Boolean),
          })
        }
      }

      // 매입처만 필터 (구분이 '매출처'가 아닌 것)
      const suppliersToAdd = partners.filter(p => {
        const t = p.type.toLowerCase()
        return t !== '매출처' && !p.code.startsWith('C')
      })

      if (suppliersToAdd.length === 0) { alert('등록할 매입처가 없습니다.\n(구분이 "매출처"인 항목은 매출처 등록에서 업로드하세요)'); return }

      // 미리보기
      const preview = suppliersToAdd.map(p =>
        `• ${p.code || '(코드없음)'} ${p.name} — 담당자 ${p.contacts.length}명`
      ).join('\n')
      if (!window.confirm(`매입처 ${suppliersToAdd.length}건을 등록합니다.\n\n${preview}\n\n진행하시겠습니까?`)) return

      const user = (await supabase.auth.getUser()).data.user
      const { data: latest } = await supabase.from('suppliers').select('*').eq('is_active', true)
      const existingNames = new Set((latest || []).map(s => s.supplier_name))
      const currentCount = (latest || []).length
      let success = 0, skipped = 0, failed = 0; const errors = []

      for (let i = 0; i < suppliersToAdd.length; i++) {
        const p = suppliersToAdd[i]
        if (existingNames.has(p.name)) { skipped++; continue }
        const mainContact = p.contacts[0] || {}

        const { error } = await supabase.from('suppliers').insert({
          supplier_name: p.name,
          supplier_code: p.code || null,
          business_number: p.bizNum || null,
          contact_name: mainContact.name || null,
          contact_phone: mainContact.phone || null,
          contact_email: mainContact.email || null,
          contacts: p.contacts.length > 0 ? p.contacts : [],
          default_shipping_cost: 4000,
          payment_terms: p.payTerms || null,
          payment_method: p.payMethod || null,
          payment_account: p.payAccount || null,
          description: null,
          note: p.notes.length > 0 ? p.notes.join('\n') : null,
          memo: null,
          color_code: COLORS[(currentCount + success) % COLORS.length],
          sort_order: currentCount + success,
          created_by: user.id,
        })
        if (error) { failed++; errors.push(`"${p.name}": ${error.message}`) }
        else { success++; existingNames.add(p.name) }
      }

      let msg = ''
      if (success > 0) msg += `✅ 매입처 ${success}개 등록 완료!\n`
      if (skipped > 0) msg += `⏭️ ${skipped}개 건너뜀 (이미 등록됨)\n`
      if (failed > 0) { msg += `❌ ${failed}개 실패\n\n`; msg += errors.join('\n') }
      alert(msg || '등록할 데이터가 없습니다.')
      fetchSuppliers()
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">등록된 매입처 {suppliers.length}개</p>
        <div className="flex gap-2">
          <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 엑셀 다운로드</button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 cursor-pointer">
            📤 엑셀 업로드<input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </label>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 추가</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map(s => {
          const contacts = getContacts(s)
          const isExpanded = expandedId === s.id
          return (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: s.color_code || '#6366f1' }}>{s.supplier_name.slice(0,1)}</div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{s.supplier_name}</h3>
                    <span className="text-xs text-slate-400">{s.supplier_code || '코드 없음'}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(s)} className="p-2 hover:bg-slate-100 rounded-lg text-sm">✏️</button>
                  <button onClick={() => handleDelete(s.id)} className="p-2 hover:bg-red-50 rounded-lg text-sm">🗑️</button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {contacts.map((c, ci) => (
                  <div key={ci} className="flex justify-between items-center">
                    <span className="text-slate-500">담당자{contacts.length > 1 ? ` ${ci+1}` : ''}</span>
                    <div className="text-right">
                      <span className="text-slate-700 font-medium">{c.name || '-'}</span>
                      {c.phone && <span className="text-slate-400 ml-2 text-xs">{c.phone}</span>}
                    </div>
                  </div>
                ))}
                {contacts.length === 0 && <div className="flex justify-between"><span className="text-slate-500">담당자</span><span className="text-slate-400">-</span></div>}
                {s.business_number && <div className="flex justify-between"><span className="text-slate-500">사업자번호</span><span className="text-slate-700 font-medium">{s.business_number}</span></div>}
                <div className="flex justify-between">
                  <span className="text-slate-500">기본 택배비</span>
                  <span className="text-indigo-600 font-bold">{formatNumber(s.default_shipping_cost ?? 4000)}원</span>
                </div>
                {(s.payment_terms || s.payment_method || s.payment_account || s.description || s.note) && (
                  <>
                    <button onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      className="w-full text-center text-xs text-indigo-500 hover:text-indigo-700 pt-1">
                      {isExpanded ? '▲ 접기' : '▼ 상세 보기'}
                    </button>
                    {isExpanded && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {s.payment_terms && <div className="flex justify-between"><span className="text-slate-500">결제조건</span><span className="text-slate-700">{s.payment_terms}</span></div>}
                        {s.payment_method && <div className="flex justify-between"><span className="text-slate-500">결제방법</span><span className="text-slate-700">{s.payment_method}</span></div>}
                        {s.payment_account && <div><span className="text-slate-500 text-xs">결제계좌</span><p className="text-slate-700 mt-0.5 text-xs break-all">{s.payment_account}</p></div>}
                        {s.description && <div><span className="text-slate-500 text-xs">업체설명</span><p className="text-slate-700 mt-0.5">{s.description}</p></div>}
                        {s.note && <div><span className="text-slate-500 text-xs">비고</span><p className="text-slate-700 mt-0.5 whitespace-pre-line">{s.note}</p></div>}
                        {contacts.some(c => c.email) && (
                          <div><span className="text-slate-500 text-xs">이메일</span>
                            {contacts.filter(c => c.email).map((c, i) => (
                              <p key={i} className="text-slate-700 text-xs">{c.name}: {c.email}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '매입처 수정' : '매입처 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">매입처명 *</label>
                  <input type="text" value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="예: ○○제조" required /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">거래처코드</label>
                  <input type="text" value={form.supplier_code} onChange={e => setForm({...form, supplier_code: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="V001" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">사업자번호</label>
                <input type="text" value={form.business_number} onChange={e => setForm({...form, business_number: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="000-00-00000" /></div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">담당자</label>
                  <button type="button" onClick={addContact} className="text-xs text-indigo-600 font-medium hover:text-indigo-800">+ 담당자 추가</button>
                </div>
                <div className="space-y-3">
                  {form.contacts.map((c, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">담당자 {idx + 1}</span>
                        {form.contacts.length > 1 && <button type="button" onClick={() => removeContact(idx)} className="text-xs text-red-400 hover:text-red-600">삭제</button>}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={c.name} onChange={e => updateContact(idx, 'name', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="이름 (직책 포함 가능)" />
                        <input type="text" value={c.phone} onChange={e => updateContact(idx, 'phone', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="연락처" />
                      </div>
                      <input type="text" value={c.email} onChange={e => updateContact(idx, 'email', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="이메일" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">기본 택배비 (건당)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={form.default_shipping_cost} onChange={e => setForm({...form, default_shipping_cost: e.target.value})}
                    className="w-40 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="4000" />
                  <span className="text-sm text-slate-400">원</span>
                  <div className="flex gap-1 ml-2">
                    {[3000,3500,4000,4500,5000].map(v => (
                      <button key={v} type="button" onClick={() => setForm({...form, default_shipping_cost: v})}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${Number(form.default_shipping_cost)===v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}>{(v/1000).toFixed(1)}k</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-700 mb-3">💳 결제 정보</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-slate-500 mb-1">결제조건</label>
                    <input type="text" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 주단위, 월말" /></div>
                  <div><label className="block text-xs text-slate-500 mb-1">결제방법</label>
                    <input type="text" value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 계좌이체, 선결제" /></div>
                </div>
                <div className="mt-3"><label className="block text-xs text-slate-500 mb-1">결제계좌</label>
                  <input type="text" value={form.payment_account} onChange={e => setForm({...form, payment_account: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 827901-04-068608 국민은행 / 주식회사 혜인건강" /></div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="grid grid-cols-1 gap-3">
                  <div><label className="block text-xs text-slate-500 mb-1">업체설명</label>
                    <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" rows={2} placeholder="업체 설명" /></div>
                  <div><label className="block text-xs text-slate-500 mb-1">비고</label>
                    <textarea value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" rows={2} placeholder="비고사항" /></div>
                  <div><label className="block text-xs text-slate-500 mb-1">메모</label>
                    <textarea value={form.memo} onChange={e => setForm({...form, memo: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" rows={2} placeholder="내부 메모" /></div>
                </div>
              </div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">색상</label>
                <div className="flex gap-2">{COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm({...form, color_code: c})}
                    className={`w-8 h-8 rounded-full ${form.color_code===c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''}`} style={{ backgroundColor: c }} />
                ))}</div></div>

              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => { setShowForm(false); resetForm() }} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-medium">취소</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium">{editId ? '수정' : '추가'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Suppliers
