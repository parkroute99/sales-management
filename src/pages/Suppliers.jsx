import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']
const emptyContact = () => ({ name: '', phone: '', email: '', role: '' })

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

  /* ── 담당자 관리 ── */
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
    // contacts에서 빈 항목 제거
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
      // 기존 컬럼 호환 (첫 번째 담당자)
      contact_name: mainContact.name || null,
      contact_phone: mainContact.phone || null,
      contact_email: mainContact.email || null,
      // 새 컬럼
      contacts: validContacts,
      payment_terms: form.payment_terms || null,
      payment_method: form.payment_method || null,
      payment_account: form.payment_account || null,
      description: form.description || null,
      note: form.note || null,
    }

    if (editId) {
      await supabase.from('suppliers').update(data).eq('id', editId)
    } else {
      data.created_by = user.id
      await supabase.from('suppliers').insert(data)
    }
    setShowForm(false); resetForm(); fetchSuppliers()
  }

  const handleEdit = (s) => {
    // contacts가 JSONB로 저장되어 있으면 사용, 없으면 기존 단일 담당자로 변환
    let contacts = []
    if (s.contacts && Array.isArray(s.contacts) && s.contacts.length > 0) {
      contacts = s.contacts.map(c => ({
        name: c.name || '', phone: c.phone || '', email: c.email || '', role: c.role || ''
      }))
    } else if (s.contact_name || s.contact_phone || s.contact_email) {
      contacts = [{ name: s.contact_name || '', phone: s.contact_phone || '', email: s.contact_email || '', role: '' }]
    } else {
      contacts = [emptyContact()]
    }

    setForm({
      supplier_name: s.supplier_name,
      supplier_code: s.supplier_code || '',
      business_number: s.business_number || '',
      memo: s.memo || '',
      color_code: s.color_code || '#6366f1',
      default_shipping_cost: s.default_shipping_cost ?? 4000,
      contacts,
      payment_terms: s.payment_terms || '',
      payment_method: s.payment_method || '',
      payment_account: s.payment_account || '',
      description: s.description || '',
      note: s.note || '',
    })
    setEditId(s.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 매입처를 삭제하시겠습니까?')) {
      await supabase.from('suppliers').update({ is_active: false }).eq('id', id); fetchSuppliers()
    }
  }

  const formatNumber = (num) => Number(num || 0).toLocaleString()

  // 담당자 목록 표시 헬퍼
  const getContacts = (s) => {
    if (s.contacts && Array.isArray(s.contacts) && s.contacts.length > 0) return s.contacts
    if (s.contact_name || s.contact_phone) return [{ name: s.contact_name, phone: s.contact_phone, email: s.contact_email, role: '' }]
    return []
  }

  /* ── 엑셀 ── */
  const handleExcelDownload = () => {
    const excelData = suppliers.map(s => {
      const contacts = getContacts(s)
      return {
        '매입처명': s.supplier_name, '코드': s.supplier_code || '', '사업자번호': s.business_number || '',
        '담당자1_이름': contacts[0]?.name || '', '담당자1_연락처': contacts[0]?.phone || '',
        '담당자1_이메일': contacts[0]?.email || '', '담당자1_직책': contacts[0]?.role || '',
        '담당자2_이름': contacts[1]?.name || '', '담당자2_연락처': contacts[1]?.phone || '',
        '담당자2_이메일': contacts[1]?.email || '', '담당자2_직책': contacts[1]?.role || '',
        '기본택배비': s.default_shipping_cost ?? 4000,
        '결제조건': s.payment_terms || '', '결제방법': s.payment_method || '',
        '결제계좌': s.payment_account || '', '업체설명': s.description || '',
        '비고': s.note || '', '메모': s.memo || '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '매입처목록')
    XLSX.writeFile(wb, `매입처목록_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      if (data.length === 0) { alert('엑셀에 데이터가 없습니다.'); return }

      const user = (await supabase.auth.getUser()).data.user
      const { data: latestSuppliers } = await supabase.from('suppliers').select('*').eq('is_active', true)
      const existingNames = new Set((latestSuppliers || []).map(s => s.supplier_name))
      const currentCount = (latestSuppliers || []).length

      let success = 0, skipped = 0, failed = 0
      const errors = []

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const name = String(row['매입처명'] || row['supplier_name'] || '').trim()
        if (!name) { skipped++; continue }
        if (existingNames.has(name)) { skipped++; continue }

        // 담당자 파싱 (담당자1, 담당자2...)
        const contacts = []
        for (let n = 1; n <= 5; n++) {
          const cName = String(row[`담당자${n}_이름`] || row[`담당자${n}`] || (n === 1 ? row['담당자'] : '') || '').trim()
          const cPhone = String(row[`담당자${n}_연락처`] || (n === 1 ? row['연락처'] : '') || '').trim()
          const cEmail = String(row[`담당자${n}_이메일`] || (n === 1 ? row['이메일'] : '') || '').trim()
          const cRole = String(row[`담당자${n}_직책`] || '').trim()
          if (cName || cPhone || cEmail) contacts.push({ name: cName, phone: cPhone, email: cEmail, role: cRole })
        }

        const { error } = await supabase.from('suppliers').insert({
          supplier_name: name,
          supplier_code: String(row['코드'] || row['supplier_code'] || '').trim() || null,
          business_number: String(row['사업자번호'] || '').trim() || null,
          contact_name: contacts[0]?.name || null,
          contact_phone: contacts[0]?.phone || null,
          contact_email: contacts[0]?.email || null,
          contacts: contacts.length > 0 ? contacts : [],
          default_shipping_cost: Number(row['기본택배비']) || 4000,
          payment_terms: String(row['결제조건'] || '').trim() || null,
          payment_method: String(row['결제방법'] || '').trim() || null,
          payment_account: String(row['결제계좌'] || '').trim() || null,
          description: String(row['업체설명'] || '').trim() || null,
          note: String(row['비고'] || '').trim() || null,
          memo: String(row['메모'] || '').trim() || null,
          color_code: COLORS[(currentCount + success) % COLORS.length],
          sort_order: currentCount + success,
          created_by: user.id,
        })

        if (error) { failed++; errors.push(`행 ${i+2}: "${name}" - ${error.message}`) }
        else { success++; existingNames.add(name) }
      }

      let msg = ''
      if (success > 0) msg += `✅ ${success}개 매입처 등록 완료!\n`
      if (skipped > 0) msg += `⏭️ ${skipped}개 건너뜀 (이름 없음 또는 중복)\n`
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

      {/* 매입처 카드 */}
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
                {/* 담당자 목록 */}
                {contacts.map((c, ci) => (
                  <div key={ci} className="flex justify-between items-center">
                    <span className="text-slate-500">담당자{contacts.length > 1 ? ` ${ci+1}` : ''}{c.role ? ` (${c.role})` : ''}</span>
                    <div className="text-right">
                      <span className="text-slate-700 font-medium">{c.name || '-'}</span>
                      {c.phone && <span className="text-slate-400 ml-2 text-xs">{c.phone}</span>}
                    </div>
                  </div>
                ))}
                {contacts.length === 0 && (
                  <div className="flex justify-between"><span className="text-slate-500">담당자</span><span className="text-slate-400">-</span></div>
                )}

                {s.business_number && <div className="flex justify-between"><span className="text-slate-500">사업자번호</span><span className="text-slate-700 font-medium">{s.business_number}</span></div>}
                <div className="flex justify-between">
                  <span className="text-slate-500">기본 택배비</span>
                  <span className="text-indigo-600 font-bold">{formatNumber(s.default_shipping_cost ?? 4000)}원</span>
                </div>

                {/* 펼치기/접기 */}
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
                        {s.payment_account && <div className="flex justify-between"><span className="text-slate-500">결제계좌</span><span className="text-slate-700">{s.payment_account}</span></div>}
                        {s.description && <div><span className="text-slate-500 text-xs">업체설명</span><p className="text-slate-700 mt-0.5">{s.description}</p></div>}
                        {s.note && <div><span className="text-slate-500 text-xs">비고</span><p className="text-slate-700 mt-0.5">{s.note}</p></div>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 등록/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '매입처 수정' : '매입처 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">매입처명 *</label>
                  <input type="text" value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="예: ○○제조" required /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">코드</label>
                  <input type="text" value={form.supplier_code} onChange={e => setForm({...form, supplier_code: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="SUP-001" /></div>
              </div>

              <div><label className="block text-sm font-medium text-slate-700 mb-1">사업자번호</label>
                <input type="text" value={form.business_number} onChange={e => setForm({...form, business_number: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="000-00-00000" /></div>

              {/* 담당자 (여러 명) */}
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
                        {form.contacts.length > 1 && (
                          <button type="button" onClick={() => removeContact(idx)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={c.name} onChange={e => updateContact(idx, 'name', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="이름" />
                        <input type="text" value={c.role} onChange={e => updateContact(idx, 'role', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="직책 (예: 대표, 영업)" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={c.phone} onChange={e => updateContact(idx, 'phone', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="연락처" />
                        <input type="text" value={c.email} onChange={e => updateContact(idx, 'email', e.target.value)}
                          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="이메일" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 택배비 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">기본 택배비 (건당)</label>
                <div className="relative">
                  <input type="number" value={form.default_shipping_cost} onChange={e => setForm({...form, default_shipping_cost: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none pr-10" placeholder="4000" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">원</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[3000, 3500, 4000, 4500, 5000].map(v => (
                    <button key={v} type="button" onClick={() => setForm({...form, default_shipping_cost: v})}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        Number(form.default_shipping_cost) === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                      }`}>{v.toLocaleString()}원</button>
                  ))}
                </div>
              </div>

              {/* 결제 정보 */}
              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-700 mb-3">💳 결제 정보</p>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs text-slate-500 mb-1">결제조건</label>
                    <input type="text" value={form.payment_terms} onChange={e => setForm({...form, payment_terms: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 월말 정산, 선불" /></div>
                  <div><label className="block text-xs text-slate-500 mb-1">결제방법</label>
                    <input type="text" value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 계좌이체, 카드" /></div>
                </div>
                <div className="mt-3"><label className="block text-xs text-slate-500 mb-1">결제계좌</label>
                  <input type="text" value={form.payment_account} onChange={e => setForm({...form, payment_account: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" placeholder="예: 국민은행 000-000-000 홍길동" /></div>
              </div>

              {/* 기타 정보 */}
              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-700 mb-3">📋 기타 정보</p>
                <div><label className="block text-xs text-slate-500 mb-1">업체설명</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" rows={2} placeholder="업체에 대한 설명" /></div>
                <div className="mt-3"><label className="block text-xs text-slate-500 mb-1">비고</label>
                  <textarea value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" rows={2} placeholder="비고사항" /></div>
                <div className="mt-3"><label className="block text-xs text-slate-500 mb-1">메모</label>
                  <textarea value={form.memo} onChange={e => setForm({...form, memo: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-indigo-500" rows={2} placeholder="내부 메모" /></div>
              </div>

              {/* 색상 */}
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
