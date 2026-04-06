import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

/* ── 한글 초성 유틸 ── */
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const getChosung = (str) => {
  return [...str].map(c => {
    const code = c.charCodeAt(0) - 0xAC00
    if (code < 0 || code > 11171) return c
    return CHO[Math.floor(code / 588)]
  }).join('')
}

/* ── 자동 약어 생성 ── */
const STOP_WORDS = ['the','and','or','에','을','를','이','가','은','는','의','로','으로','과','와','x','X','g','ml','kg','L','개','팩','세트','입','EA','ea']
function generateAliases(productName) {
  if (!productName) return []
  const aliases = new Set()
  const name = productName.trim()

  // 1) 전체 초성
  const chosung = getChosung(name.replace(/\s/g,''))
  if (chosung.length >= 2) aliases.add(chosung)

  // 2) 공백 제거 버전
  const noSpace = name.replace(/\s/g, '')
  if (noSpace !== name) aliases.add(noSpace)

  // 3) 단어별 분리 → 핵심 단어 추출
  const rawWords = name.split(/[\s\-_/·()]+/).filter(Boolean)
  const words = rawWords.filter(w => {
    const lower = w.toLowerCase()
    if (STOP_WORDS.includes(lower)) return false
    if (/^\d+(g|ml|kg|l|개|팩|세트|입|ea)?$/i.test(w)) return false
    return true
  })

  // 4) 핵심 단어 1개짜리 (2글자 이상만)
  words.forEach(w => { if (w.length >= 2) aliases.add(w) })

  // 5) 핵심 단어 조합 (앞 2~3개)
  if (words.length >= 2) {
    aliases.add(words.slice(0, 2).join(''))
    aliases.add(words.slice(0, 2).join(' '))
  }
  if (words.length >= 3) {
    aliases.add(words.slice(0, 3).join(''))
  }

  // 6) 앞 2글자, 앞 3글자
  if (noSpace.length >= 2) aliases.add(noSpace.slice(0, 2))
  if (noSpace.length >= 3) aliases.add(noSpace.slice(0, 3))

  // 7) 단어별 첫 글자 조합
  if (words.length >= 2) {
    aliases.add(words.map(w => w[0]).join(''))
  }

  // 중복·원본 제거, 1글자 이하 제거
  aliases.delete(name)
  return [...aliases].filter(a => a.length >= 2).slice(0, 10)
}

function ProductAliases() {
  const [aliases, setAliases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterSupplier, setFilterSupplier] = useState('all')
  const [filterType, setFilterType] = useState('all') // all, manual, auto
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({
    alias: '', product_full_name: '', unit_price: '', supplier_id: '', product_id: ''
  })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: aData } = await supabase.from('product_aliases').select('*, suppliers(supplier_name), products(product_name, product_code, total_cost)').order('supplier_id').order('alias')
    const { data: sData } = await supabase.from('suppliers').select('*').eq('is_active', true).order('sort_order')
    const { data: pData } = await supabase.from('products').select('*').eq('is_active', true).order('product_name')
    setAliases(aData || [])
    setSuppliers(sData || [])
    setProducts(pData || [])
    setLoading(false)
  }

  const resetForm = () => {
    setForm({ alias: '', product_full_name: '', unit_price: '', supplier_id: '', product_id: '' })
    setEditId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const data = {
      alias: form.alias,
      product_full_name: form.product_full_name,
      unit_price: Number(form.unit_price) || 0,
      supplier_id: form.supplier_id || null,
      product_id: form.product_id || null,
      is_auto: false,
    }
    if (editId) await supabase.from('product_aliases').update(data).eq('id', editId)
    else await supabase.from('product_aliases').insert(data)
    setShowForm(false); resetForm(); fetchAll()
  }

  const handleEdit = (a) => {
    setForm({
      alias: a.alias,
      product_full_name: a.product_full_name,
      unit_price: a.unit_price || '',
      supplier_id: a.supplier_id || '',
      product_id: a.product_id || ''
    })
    setEditId(a.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('삭제하시겠습니까?')) {
      await supabase.from('product_aliases').delete().eq('id', id)
      fetchAll()
    }
  }

  /* ── 🔥 자동 약어 일괄 생성 ── */
  const handleAutoGenerate = async () => {
    if (products.length === 0) { alert('등록된 제품이 없습니다.'); return }
    const ok = window.confirm(
      `📦 제품 ${products.length}개에서 약어를 자동 생성합니다.\n\n기존 자동생성 약어는 삭제 후 새로 만듭니다.\n계속하시겠습니까?`
    )
    if (!ok) return

    setGenerating(true)
    try {
      // 기존 자동생성 약어 삭제
      await supabase.from('product_aliases').delete().eq('is_auto', true)

      // 수동 등록된 약어 목록 (중복 방지)
      const { data: manualAliases } = await supabase.from('product_aliases').select('alias')
      const existingSet = new Set((manualAliases || []).map(a => a.alias.toLowerCase()))

      let created = 0
      for (const product of products) {
        const autoAliases = generateAliases(product.product_name)

        for (const alias of autoAliases) {
          if (existingSet.has(alias.toLowerCase())) continue
          existingSet.add(alias.toLowerCase())

          const { error } = await supabase.from('product_aliases').insert({
            alias,
            product_full_name: product.product_name,
            unit_price: product.total_cost || product.purchase_cost || 0,
            supplier_id: product.supplier_id || null,
            product_id: product.id,
            is_auto: true,
          })
          if (!error) created++
        }
      }

      alert(`✅ 자동 약어 ${created}개가 생성되었습니다!`)
      fetchAll()
    } catch (err) {
      alert('오류: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  /* ── 특정 제품 약어만 재생성 ── */
  const handleRegenProduct = async (product) => {
    // 이 제품의 자동 약어만 삭제
    await supabase.from('product_aliases').delete().eq('product_id', product.id).eq('is_auto', true)

    const { data: manualAliases } = await supabase.from('product_aliases').select('alias')
    const existingSet = new Set((manualAliases || []).map(a => a.alias.toLowerCase()))

    const autoAliases = generateAliases(product.product_name)
    let created = 0
    for (const alias of autoAliases) {
      if (existingSet.has(alias.toLowerCase())) continue
      existingSet.add(alias.toLowerCase())
      const { error } = await supabase.from('product_aliases').insert({
        alias,
        product_full_name: product.product_name,
        unit_price: product.total_cost || product.purchase_cost || 0,
        supplier_id: product.supplier_id || null,
        product_id: product.id,
        is_auto: true,
      })
      if (!error) created++
    }
    alert(`"${product.product_name}" 약어 ${created}개 생성`)
    fetchAll()
  }

  /* ── 자동 약어 전체 삭제 ── */
  const handleDeleteAllAuto = async () => {
    const autoCount = aliases.filter(a => a.is_auto).length
    if (autoCount === 0) { alert('자동 생성된 약어가 없습니다.'); return }
    if (!window.confirm(`자동 생성 약어 ${autoCount}개를 모두 삭제하시겠습니까?\n(수동 등록 약어는 유지됩니다)`)) return
    await supabase.from('product_aliases').delete().eq('is_auto', true)
    alert('삭제 완료')
    fetchAll()
  }

  /* ── 엑셀 다운/업로드 ── */
  const handleExcelDownload = () => {
    const excelData = filtered.map(a => ({
      '약어': a.alias, '정식명칭': a.product_full_name, '단가': a.unit_price,
      '매입처': a.suppliers?.supplier_name || '', '제품코드': a.products?.product_code || '',
      '자동생성': a.is_auto ? 'Y' : 'N', '매칭횟수': a.match_count || 0,
    }))
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '약어매핑')
    XLSX.writeFile(wb, `약어매핑_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
      let count = 0
      for (const row of data) {
        const alias = row['약어'] || row['alias']
        if (!alias) continue
        const existing = aliases.find(a => a.alias === alias)
        if (existing) continue
        const supplierId = row['매입처'] ? suppliers.find(s => s.supplier_name === row['매입처'])?.id : null
        const productId = row['제품코드'] ? products.find(p => p.product_code === row['제품코드'])?.id : null
        await supabase.from('product_aliases').insert({
          alias, product_full_name: row['정식명칭'] || row['product_full_name'] || alias,
          unit_price: Number(row['단가'] || row['unit_price'] || 0),
          supplier_id: supplierId, product_id: productId, is_auto: false,
        })
        count++
      }
      alert(`${count}개 약어가 등록되었습니다.`)
      fetchAll()
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  /* ── 필터링 ── */
  let filtered = aliases
  if (filterSupplier !== 'all') filtered = filtered.filter(a => a.supplier_id === filterSupplier)
  if (filterType === 'manual') filtered = filtered.filter(a => !a.is_auto)
  if (filterType === 'auto') filtered = filtered.filter(a => a.is_auto)

  const formatNumber = (num) => Number(num || 0).toLocaleString()
  const autoCount = aliases.filter(a => a.is_auto).length
  const manualCount = aliases.filter(a => !a.is_auto).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* 상단 통계 + 자동생성 버튼 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">전체 약어</p>
          <p className="text-2xl font-bold text-slate-800">{aliases.length}개</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-blue-500">수동 등록</p>
          <p className="text-2xl font-bold text-blue-700">{manualCount}개</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-emerald-500">자동 생성</p>
          <p className="text-2xl font-bold text-emerald-700">{autoCount}개</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">등록 제품</p>
          <p className="text-2xl font-bold text-slate-800">{products.length}개</p>
        </div>
      </div>

      {/* 자동 생성 영역 */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-emerald-800">🤖 자동 약어 생성</h3>
            <p className="text-xs text-emerald-600 mt-1">
              등록된 제품명에서 초성, 핵심단어, 줄임말을 자동으로 추출합니다
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleAutoGenerate} disabled={generating}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all ${
              generating ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg'
            }`}>
            {generating ? '생성 중...' : `🔄 전체 자동 생성 (${products.length}개 제품)`}
          </button>
          {autoCount > 0 && (
            <button onClick={handleDeleteAllAuto}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50">
              🗑️ 자동 약어 전체 삭제 ({autoCount}개)
            </button>
          )}
        </div>

        {/* 미리보기: 제품별 생성될 약어 */}
        {products.length > 0 && (
          <div className="mt-4 bg-white/70 rounded-xl p-4 max-h-60 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-500 mb-2">미리보기 (제품별 생성될 약어)</p>
            <div className="space-y-2">
              {products.slice(0, 10).map(p => (
                <div key={p.id} className="flex items-start gap-3">
                  <span className="text-sm font-medium text-slate-700 w-40 shrink-0 truncate">{p.product_name}</span>
                  <div className="flex flex-wrap gap-1">
                    {generateAliases(p.product_name).map((a, i) => (
                      <span key={i} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">{a}</span>
                    ))}
                  </div>
                </div>
              ))}
              {products.length > 10 && (
                <p className="text-xs text-slate-400">... 외 {products.length - 10}개 제품</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 필터 + 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none text-sm">
            <option value="all">전체 매입처</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
          </select>
          <div className="flex rounded-xl border border-slate-300 overflow-hidden">
            {[{v:'all',l:'전체'},{v:'manual',l:'수동'},{v:'auto',l:'자동'}].map(t => (
              <button key={t.v} onClick={() => setFilterType(t.v)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  filterType === t.v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}>{t.l}</button>
            ))}
          </div>
          <p className="text-sm text-slate-500">{filtered.length}개 매핑</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 다운로드</button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 cursor-pointer">
            📤 업로드<input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </label>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 수동 추가</button>
        </div>
      </div>

      {/* 약어 테이블 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">약어</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">정식 제품명</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500">단가</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500">매입처</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">유형</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">매칭</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-4 text-sm font-semibold text-indigo-600">{a.alias}</td>
                  <td className="px-5 py-4 text-sm text-slate-800">{a.product_full_name}</td>
                  <td className="px-5 py-4 text-sm text-right text-slate-700">{formatNumber(a.unit_price)}원</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{a.suppliers?.supplier_name || '-'}</td>
                  <td className="px-5 py-4 text-center">
                    {a.is_auto
                      ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">자동</span>
                      : <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">수동</span>
                    }
                  </td>
                  <td className="px-5 py-4 text-center text-xs text-slate-400">{a.match_count || 0}회</td>
                  <td className="px-5 py-4 text-center">
                    <button onClick={() => handleEdit(a)} className="p-1 hover:bg-slate-100 rounded text-sm mr-1">✏️</button>
                    <button onClick={() => handleDelete(a.id)} className="p-1 hover:bg-red-50 rounded text-sm">🗑️</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="7" className="px-5 py-12 text-center text-slate-400">
                  등록된 약어 매핑이 없습니다. 위의 "자동 생성" 버튼을 눌러보세요!
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 수동 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '약어 수정' : '약어 수동 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">약어 (입력값) *</label>
                <input type="text" value={form.alias} onChange={e => setForm({...form, alias: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="예: 오돌, 국물, 직화무뼈" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">정식 제품명 *</label>
                <input type="text" value={form.product_full_name} onChange={e => setForm({...form, product_full_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="예: 직화오돌뼈 200g" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">단가 (원) *</label>
                  <input type="number" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="3000" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">매입처</label>
                  <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none">
                    <option value="">선택안함</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">연결 제품 (선택)</label>
                <select value={form.product_id} onChange={e => {
                  const pid = e.target.value
                  const p = products.find(pp => pp.id === pid)
                  setForm({
                    ...form,
                    product_id: pid,
                    product_full_name: p ? p.product_name : form.product_full_name,
                    unit_price: p ? (p.total_cost || p.purchase_cost || form.unit_price) : form.unit_price,
                  })
                }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none">
                  <option value="">선택안함</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.product_code} - {p.product_name}</option>)}
                </select>
              </div>
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

export default ProductAliases
