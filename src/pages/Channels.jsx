import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const CHANNEL_COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']
const emptyContact = () => ({ name: '', phone: '', email: '', role: '' })

/* ── 엑셀 파싱: 거래처마스터 양식 (Suppliers.jsx와 동일 로직) ── */
function parseTradePartnerExcel(sheetData) {
  let headerIdx = -1
  let headers = []
  for (let i = 0; i < Math.min(sheetData.length, 10); i++) {
    const row = sheetData[i]
    const vals = Object.values(row).map(v => String(v ?? '').trim())
    if (vals.some(v => v === '거래처명') && vals.some(v => v.includes('거래처코드'))) {
      headerIdx = i; headers = vals; break
    }
  }
  if (headerIdx === -1) return null
  const keys = Object.keys(sheetData[0])
  const colMap = {}
  const headerNames = ['거래처코드','거래처명','구분','사업자번호','담당자명','연락처','이메일','결제조건','결제방법','결제계좌','비고']
  for (const name of headerNames) {
    const idx = headers.findIndex(h => h.includes(name))
    if (idx >= 0) colMap[name] = keys[idx]
  }
  const dataRows = sheetData.slice(headerIdx + 1)
  const partners = []
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
      if (contactName && contactName !== 'nan') {
        current.contacts.push({ name: contactName, phone: phone === 'nan' ? '' : phone, email: email === 'nan' ? '' : email, role: '' })
      }
      if (note && note !== 'nan') current.notes.push(note)
      partners.push(current)
    } else if (current) {
      if (contactName && contactName !== 'nan') {
        current.contacts.push({ name: contactName, phone: phone === 'nan' ? '' : phone, email: (email && email !== 'nan') ? email : '', role: '' })
      }
      if (!contactName && email && email !== 'nan' && current.contacts.length > 0) {
        const lc = current.contacts[current.contacts.length - 1]
        if (!lc.email) lc.email = email; else lc.email += ', ' + email
      }
      if (payTerms && payTerms !== 'nan' && !current.payTerms) current.payTerms = payTerms
      if (payMethod && payMethod !== 'nan' && !current.payMethod) current.payMethod = payMethod
      if (payAccount && payAccount !== 'nan' && !current.payAccount) current.payAccount = payAccount
      if (note && note !== 'nan') current.notes.push(note)
    }
  }
  return partners
}

function Channels() {
  const [channels, setChannels] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [form, setForm] = useState({
    channel_name: '', channel_type: 'open_market', default_commission_type: 'RATE',
    default_commission_rate: '', default_commission_fixed: '', default_shipping_policy: 'PAID',
    default_shipping_cost: '', color_code: '#6366f1', has_excel_format: true,
    contacts: [emptyContact()],
    payment_terms: '', payment_method: '', payment_account: '', description: '', note: '',
  })

  useEffect(() => { fetchChannels() }, [])

  const fetchChannels = async () => {
    const { data } = await supabase.from('channels').select('*').order('sort_order')
    setChannels(data || []); setLoading(false)
  }

  const resetForm = () => {
    setForm({
      channel_name: '', channel_type: 'open_market', default_commission_type: 'RATE',
      default_commission_rate: '', default_commission_fixed: '', default_shipping_policy: 'PAID',
      default_shipping_cost: '', color_code: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length],
      has_excel_format: true, contacts: [emptyContact()],
      payment_terms: '', payment_method: '', payment_account: '', description: '', note: '',
    })
    setEditId(null)
  }

  const addContact = () => setForm({ ...form, contacts: [...form.contacts, emptyContact()] })
  const removeContact = (idx) => { if (form.contacts.length <= 1) return; setForm({ ...form, contacts: form.contacts.filter((_, i) => i !== idx) }) }
  const updateContact = (idx, field, value) => { const next = [...form.contacts]; next[idx] = { ...next[idx], [field]: value }; setForm({ ...form, contacts: next }) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    const validContacts = form.contacts.filter(c => c.name || c.phone || c.email)
    const data = {
      channel_name: form.channel_name, channel_type: form.channel_type,
      default_commission_type: form.default_commission_type,
      default_commission_rate: Number(form.default_commission_rate) || 0,
      default_commission_fixed: Number(form.default_commission_fixed) || 0,
      default_shipping_policy: form.default_shipping_policy,
      default_shipping_cost: Number(form.default_shipping_cost) || 0,
      color_code: form.color_code, has_excel_format: form.has_excel_format,
      sort_order: channels.length,
      contacts: validContacts,
      payment_terms: form.payment_terms || null, payment_method: form.payment_method || null,
      payment_account: form.payment_account || null, description: form.description || null, note: form.note || null,
    }
    if (editId) await supabase.from('channels').update(data).eq('id', editId)
    else { data.created_by = user.id; await supabase.from('channels').insert(data) }
    setShowForm(false); resetForm(); fetchChannels()
  }

  const handleEdit = (ch) => {
    let contacts = []
    if (ch.contacts && Array.isArray(ch.contacts) && ch.contacts.length > 0) {
      contacts = ch.contacts.map(c => ({ name: c.name || '', phone: c.phone || '', email: c.email || '', role: c.role || '' }))
    } else { contacts = [emptyContact()] }
    setForm({
      channel_name: ch.channel_name, channel_type: ch.channel_type,
      default_commission_type: ch.default_commission_type,
      default_commission_rate: ch.default_commission_rate || '',
      default_commission_fixed: ch.default_commission_fixed || '',
      default_shipping_policy: ch.default_shipping_policy,
      default_shipping_cost: ch.default_shipping_cost || '',
      color_code: ch.color_code || '#6366f1', has_excel_format: ch.has_excel_format,
      contacts,
      payment_terms: ch.payment_terms || '', payment_method: ch.payment_method || '',
      payment_account: ch.payment_account || '', description: ch.description || '', note: ch.note || '',
    })
    setEditId(ch.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 채널을 삭제하시겠습니까?')) { await supabase.from('channels').delete().eq('id', id); fetchChannels() }
  }

  const getContacts = (ch) => {
    if (ch.contacts && Array.isArray(ch.contacts) && ch.contacts.length > 0) return ch.contacts
    return []
  }

  const handleExcelDownload = () => {
    const rows = []
    rows.push({ '거래처코드': '🏢 매출처 목록', '거래처명': '', '구분': '', '사업자번호': '', '담당자명': '', '연락처': '', '이메일': '', '결제조건': '', '결제방법': '', '결제계좌': '', '비고': '' })
    rows.push({ '거래처코드': '', '거래처명': '', '구분': '', '사업자번호': '', '담당자명': '', '연락처': '', '이메일': '', '결제조건': '', '결제방법': '', '결제계좌': '', '비고': '' })
    channels.forEach(ch => {
      const contacts = getContacts(ch)
      const mc = contacts[0] || {}
      rows.push({
        '거래처코드': ch.channel_name.startsWith('C') ? ch.channel_name : '',
        '거래처명': ch.channel_name, '구분': '매출처', '사업자번호': '',
        '담당자명': mc.name || '', '연락처': mc.phone || '', '이메일': mc.email || '',
        '결제조건': ch.payment_terms || '', '결제방법': ch.payment_method || '',
        '결제계좌': ch.payment_account || '',
        '비고': [ch.description, ch.note].filter(Boolean).join(' / ') || `수수료 ${ch.default_commission_type === 'RATE' ? ch.default_commission_rate + '%' : ch.default_commission_fixed + '원'}`,
      })
      for (let i = 1; i < contacts.length; i++) {
        rows.push({ '거래처코드': '', '거래처명': '', '구분': '', '사업자번호': '', '담당자명': contacts[i].name || '', '연락처': contacts[i].phone || '', '이메일': contacts[i].email || '', '결제조건': '', '결제방법': '', '결제계좌': '', '비고': '' })
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch:12 },{ wch:25 },{ wch:8 },{ wch:15 },{ wch:25 },{ wch:15 },{ wch:25 },{ wch:10 },{ wch:15 },{ wch:40 },{ wch:50 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '거래처마스터')
    XLSX.writeFile(wb, `매출처목록_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  /* ── 🔥 엑셀 업로드 (거래처마스터 양식 호환) ── */
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const sheetData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      if (sheetData.length === 0) { alert('데이터가 없습니다.'); return }

      let partners = parseTradePartnerExcel(sheetData)
      if (!partners) {
        partners = []
        for (const row of sheetData) {
          const name = String(row['거래처명'] || row['채널명'] || row['channel_name'] || '').trim()
          if (!name) continue
          partners.push({
            code: String(row['거래처코드'] || '').trim(), name,
            type: String(row['구분'] || '').trim() || '매출처',
            bizNum: String(row['사업자번호'] || '').trim(),
            contacts: [{ name: String(row['담당자명'] || '').trim(), phone: String(row['연락처'] || '').trim(), email: String(row['이메일'] || '').trim(), role: '' }].filter(c => c.name || c.phone),
            payTerms: String(row['결제조건'] || '').trim(),
            payMethod: String(row['결제방법'] || '').trim(),
            payAccount: String(row['결제계좌'] || '').trim(),
            notes: [String(row['비고'] || '').trim()].filter(Boolean),
          })
        }
      }

      // 매출처만 필터 (구분이 '매출처'이거나 C코드)
      const channelsToAdd = partners.filter(p => {
        const t = p.type.toLowerCase()
        return t === '매출처' || p.code.startsWith('C')
      })

      if (channelsToAdd.length === 0) { alert('등록할 매출처가 없습니다.\n(구분이 "매입처"인 항목은 매입처 등록에서 업로드하세요)'); return }

      const preview = channelsToAdd.map(p => `• ${p.code || '(코드없음)'} ${p.name}`).join('\n')
      if (!window.confirm(`매출처 ${channelsToAdd.length}건을 등록합니다.\n\n${preview}\n\n진행하시겠습니까?`)) return

      const user = (await supabase.auth.getUser()).data.user
      const { data: latest } = await supabase.from('channels').select('*')
      const existingNames = new Set((latest || []).map(c => c.channel_name))
      let success = 0, skipped = 0, failed = 0; const errors = []

      for (const p of channelsToAdd) {
        if (existingNames.has(p.name)) { skipped++; continue }

        const { error } = await supabase.from('channels').insert({
          channel_name: p.name, channel_type: 'open_market',
          default_commission_type: 'RATE', default_commission_rate: 0, default_commission_fixed: 0,
          default_shipping_policy: 'PAID', default_shipping_cost: 0,
          has_excel_format: true,
          contacts: p.contacts.length > 0 ? p.contacts : [],
          payment_terms: p.payTerms || null, payment_method: p.payMethod || null,
          payment_account: p.payAccount || null, description: null,
          note: p.notes.length > 0 ? p.notes.join('\n') : null,
          color_code: CHANNEL_COLORS[(channels.length + success) % CHANNEL_COLORS.length],
          sort_order: channels.length + success, created_by: user.id,
        })
        if (error) { failed++; errors.push(`"${p.name}": ${error.message}`) }
        else { success++; existingNames.add(p.name) }
      }

      let msg = ''
      if (success > 0) msg += `✅ 매출처 ${success}개 등록!\n`
      if (skipped > 0) msg += `⏭️ ${skipped}개 건너뜀 (이미 등록됨)\n`
      if (failed > 0) { msg += `❌ ${failed}개 실패\n\n`; msg += errors.join('\n') }
      alert(msg || '등록할 데이터 없음')
      fetchChannels()
    }
    reader.readAsArrayBuffer(file); e.target.value = ''
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">등록된 매출처 {channels.length}개</p>
        <div className="flex gap-2">
          <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 엑셀 다운로드</button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 cursor-pointer">
            📤 엑셀 업로드<input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </label>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 추가</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map(ch => {
          const contacts = getContacts(ch)
          const isExpanded = expandedId === ch.id
          return (
            <div key={ch.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: ch.color_code || '#6366f1' }}>{ch.channel_name.slice(0,1)}</div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{ch.channel_name}</h3>
                    <span className="text-xs text-slate-400">{ch.channel_type === 'open_market' ? '오픈마켓' : '폐쇄몰'}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(ch)} className="p-2 hover:bg-slate-100 rounded-lg text-sm">✏️</button>
                  <button onClick={() => handleDelete(ch.id)} className="p-2 hover:bg-red-50 rounded-lg text-sm">🗑️</button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">수수료</span>
                  <span className="text-slate-700 font-medium">{ch.default_commission_type === 'RATE' ? `${ch.default_commission_rate}%` : `${Number(ch.default_commission_fixed).toLocaleString()}원`}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">배송정책</span>
                  <span className="text-slate-700 font-medium">{ch.default_shipping_policy === 'FREE' ? '무료' : ch.default_shipping_policy === 'CONDITIONAL' ? '조건부무료' : '유료'}</span></div>
                {ch.default_shipping_cost > 0 && <div className="flex justify-between"><span className="text-slate-500">기본배송비</span><span className="text-slate-700">{Number(ch.default_shipping_cost).toLocaleString()}원</span></div>}
                {contacts.map((c, ci) => (
                  <div key={ci} className="flex justify-between">
                    <span className="text-slate-500">담당자{contacts.length > 1 ? ` ${ci+1}` : ''}</span>
                    <div className="text-right">
                      <span className="text-slate-700 font-medium">{c.name || '-'}</span>
                      {c.phone && <span className="text-slate-400 ml-2 text-xs">{c.phone}</span>}
                    </div>
                  </div>
                ))}
                {(ch.payment_terms || ch.payment_method || ch.payment_account || ch.description || ch.note) && (
                  <>
                    <button onClick={() => setExpandedId(isExpanded ? null : ch.id)}
                      className="w-full text-center text-xs text-indigo-500 hover:text-indigo-700 pt-1">
                      {isExpanded ? '▲ 접기' : '▼ 상세 보기'}</button>
                    {isExpanded && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {ch.payment_terms && <div className="flex justify-between"><span className="text-slate-500">결제조건</span><span className="text-slate-700">{ch.payment_terms}</span></div>}
                        {ch.payment_method && <div className="flex justify-between"><span className="text-slate-500">결제방법</span><span className="text-slate-700">{ch.payment_method}</span></div>}
                        {ch.payment_account && <div><span className="text-slate-500 text-xs">결제계좌</span><p className="text-slate-700 mt-0.5 text-xs break-all">{ch.payment_account}</p></div>}
                        {ch.description && <div><span className="text-slate-500 text-xs">업체설명</span><p className="text-slate-700 mt-0.5">{ch.description}</p></div>}
                        {ch.note && <div><span className="text-slate-500 text-xs">비고</span><p className="text-slate-700 mt-0.5 whitespace-pre-line">{ch.note}</p></div>}
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
              <h3 className="text-lg font-semibold">{editId ? '매출처 수정' : '매출처 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">채널명 *</label>
                <input type="text" value={form.channel_name} onChange={e => setForm({...form, channel_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="예: 쿠팡, 파미웰" required /></div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">유형</label>
                <div className="flex gap-3">
                  {[{v:'open_market',l:'오픈마켓'},{v:'closed_mall',l:'폐쇄몰'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setForm({...form, channel_type: o.v})}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border ${form.channel_type===o.v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{o.l}</button>
                  ))}</div></div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">수수료 유형</label>
                <div className="flex gap-3">
                  {[{v:'RATE',l:'비율 (%)'},{v:'FIXED',l:'고정 (원)'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setForm({...form, default_commission_type: o.v})}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border ${form.default_commission_type===o.v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{o.l}</button>
                  ))}</div></div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">{form.default_commission_type==='RATE'?'수수료율 (%)':'고정수수료 (원)'}</label>
                <input type="number" step={form.default_commission_type==='RATE'?"0.1":"1"}
                  value={form.default_commission_type==='RATE'?form.default_commission_rate:form.default_commission_fixed}
                  onChange={e => setForm({...form, [form.default_commission_type==='RATE'?'default_commission_rate':'default_commission_fixed']:e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" /></div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">배송비 정책</label>
                <div className="flex gap-2">
                  {[{v:'FREE',l:'무료배송'},{v:'CONDITIONAL',l:'조건부 무료'},{v:'PAID',l:'유료배송'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setForm({...form, default_shipping_policy: o.v})}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border ${form.default_shipping_policy===o.v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{o.l}</button>
                  ))}</div></div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">기본 배송비 (원)</label>
                <input type="number" value={form.default_shipping_cost} onChange={e => setForm({...form, default_shipping_cost: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="3000" /></div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-slate-700">👤 담당자</p>
                  <button type="button" onClick={addContact} className="text-xs text-indigo-600 font-medium">+ 추가</button>
                </div>
                <div className="space-y-3">
                  {form.contacts.map((c, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">담당자 {idx+1}</span>
                        {form.contacts.length > 1 && <button type="button" onClick={() => removeContact(idx)} className="text-xs text-red-400">삭제</button>}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={c.name} onChange={e => updateContact(idx,'name',e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="이름" />
                        <input type="text" value={c.phone} onChange={e => updateContact(idx,'phone',e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="연락처" />
                      </div>
                      <input type="text" value={c.email} onChange={e => updateContact(idx,'email',e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="이메일" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-700 mb-3">💳 결제 정보</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-slate-500 mb-1">결제조건</label>
                    <input type="text" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 익월 16일" /></div>
                  <div><label className="block text-xs text-slate-500 mb-1">결제방법</label>
                    <input type="text" value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 계좌이체" /></div>
                </div>
                <div className="mt-3"><label className="block text-xs text-slate-500 mb-1">결제계좌</label>
                  <input type="text" value={form.payment_account} onChange={e => setForm({...form, payment_account: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" /></div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="grid grid-cols-1 gap-3">
                  <div><label className="block text-xs text-slate-500 mb-1">업체설명</label>
                    <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" rows={2} /></div>
                  <div><label className="block text-xs text-slate-500 mb-1">비고</label>
                    <textarea value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" rows={2} /></div>
                </div>
              </div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">테마 색상</label>
                <div className="flex gap-2">{CHANNEL_COLORS.map(c => (
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

export default Channels
