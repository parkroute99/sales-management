import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'

const CHANNEL_COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#64748b']

function Channels() {
  const [channels, setChannels] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    channel_name: '', channel_type: 'open_market', default_commission_type: 'RATE',
    default_commission_rate: '', default_commission_fixed: '', default_shipping_policy: 'PAID',
    default_shipping_cost: '', color_code: '#6366f1', has_excel_format: true,
  })

  useEffect(() => { fetchChannels() }, [])

  const fetchChannels = async () => {
    const { data } = await supabase.from('channels').select('*').order('sort_order')
    setChannels(data || []); setLoading(false)
  }

  const resetForm = () => {
    setForm({ channel_name: '', channel_type: 'open_market', default_commission_type: 'RATE',
      default_commission_rate: '', default_commission_fixed: '', default_shipping_policy: 'PAID',
      default_shipping_cost: '', color_code: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length], has_excel_format: true })
    setEditId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    const data = { ...form, default_commission_rate: Number(form.default_commission_rate)||0,
      default_commission_fixed: Number(form.default_commission_fixed)||0,
      default_shipping_cost: Number(form.default_shipping_cost)||0, sort_order: channels.length }
    if (editId) await supabase.from('channels').update(data).eq('id', editId)
    else { data.created_by = user.id; await supabase.from('channels').insert(data) }
    setShowForm(false); resetForm(); fetchChannels()
  }

  const handleEdit = (ch) => {
    setForm({ channel_name: ch.channel_name, channel_type: ch.channel_type,
      default_commission_type: ch.default_commission_type, default_commission_rate: ch.default_commission_rate||'',
      default_commission_fixed: ch.default_commission_fixed||'', default_shipping_policy: ch.default_shipping_policy,
      default_shipping_cost: ch.default_shipping_cost||'', color_code: ch.color_code||'#6366f1', has_excel_format: ch.has_excel_format })
    setEditId(ch.id); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 채널을 삭제하시겠습니까?')) {
      await supabase.from('channels').delete().eq('id', id); fetchChannels()
    }
  }

  const handleExcelDownload = () => {
    const excelData = channels.map(ch => ({
      '채널명': ch.channel_name, '유형': ch.channel_type === 'open_market' ? '오픈마켓' : '폐쇄몰',
      '수수료유형': ch.default_commission_type === 'RATE' ? '비율(%)' : '고정(원)',
      '수수료율': ch.default_commission_rate, '고정수수료': ch.default_commission_fixed,
      '배송정책': ch.default_shipping_policy === 'FREE' ? '무료' : ch.default_shipping_policy === 'CONDITIONAL' ? '조건부무료' : '유료',
      '기본배송비': ch.default_shipping_cost, '엑셀양식': ch.has_excel_format ? 'Y' : 'N',
    }))
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '매출처목록')
    XLSX.writeFile(wb, `매출처목록_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      const user = (await supabase.auth.getUser()).data.user
      let count = 0
      for (const row of data) {
        const name = row['채널명'] || row['channel_name']
        if (!name) continue
        const existing = channels.find(c => c.channel_name === name)
        if (existing) continue
        await supabase.from('channels').insert({
          channel_name: name,
          channel_type: (row['유형'] === '폐쇄몰' || row['channel_type'] === 'closed_mall') ? 'closed_mall' : 'open_market',
          default_commission_type: (row['수수료유형'] === '고정(원)' || row['commission_type'] === 'FIXED') ? 'FIXED' : 'RATE',
          default_commission_rate: Number(row['수수료율'] || row['commission_rate'] || 0),
          default_commission_fixed: Number(row['고정수수료'] || row['commission_fixed'] || 0),
          default_shipping_policy: row['배송정책'] === '무료' ? 'FREE' : row['배송정책'] === '조건부무료' ? 'CONDITIONAL' : 'PAID',
          default_shipping_cost: Number(row['기본배송비'] || row['shipping_cost'] || 0),
          has_excel_format: row['엑셀양식'] === 'N' ? false : true,
          color_code: CHANNEL_COLORS[(channels.length + count) % CHANNEL_COLORS.length],
          sort_order: channels.length + count,
          created_by: user.id,
        })
        count++
      }
      alert(`${count}개 매출처가 등록되었습니다.`)
      fetchChannels()
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
        <p className="text-sm text-slate-500">등록된 매출처 {channels.length}개</p>
        <div className="flex gap-2">
          <button onClick={handleExcelDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700">📥 엑셀 다운로드</button>
          <label className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 cursor-pointer">
            📤 엑셀 업로드
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
          </label>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">+ 추가</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map(ch => (
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
              <div className="flex justify-between"><span className="text-slate-500">수수료</span><span className="text-slate-700 font-medium">{ch.default_commission_type==='RATE'?`${ch.default_commission_rate}%`:`${Number(ch.default_commission_fixed).toLocaleString()}원`}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">배송정책</span><span className="text-slate-700 font-medium">{ch.default_shipping_policy==='FREE'?'무료배송':ch.default_shipping_policy==='CONDITIONAL'?'조건부 무료':'유료배송'}</span></div>
              {ch.default_shipping_cost > 0 && <div className="flex justify-between"><span className="text-slate-500">기본배송비</span><span className="text-slate-700 font-medium">{Number(ch.default_shipping_cost).toLocaleString()}원</span></div>}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '매출처 수정' : '매출처 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">채널명</label>
                <input type="text" value={form.channel_name} onChange={e => setForm({...form, channel_name: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="예: 쿠팡, 스마트스토어" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">유형</label>
                <div className="flex gap-3">
                  {[{v:'open_market',l:'오픈마켓'},{v:'closed_mall',l:'폐쇄몰'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setForm({...form, channel_type: o.v})}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border ${form.channel_type===o.v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">수수료 유형</label>
                <div className="flex gap-3">
                  {[{v:'RATE',l:'비율 (%)'},{v:'FIXED',l:'고정 (원)'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setForm({...form, default_commission_type: o.v})}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border ${form.default_commission_type===o.v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{form.default_commission_type==='RATE'?'수수료율 (%)':'고정수수료 (원)'}</label>
                <input type="number" step={form.default_commission_type==='RATE'?"0.1":"1"}
                  value={form.default_commission_type==='RATE'?form.default_commission_rate:form.default_commission_fixed}
                  onChange={e => setForm({...form, [form.default_commission_type==='RATE'?'default_commission_rate':'default_commission_fixed']:e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder={form.default_commission_type==='RATE'?"예: 10.5":"예: 1000"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">배송비 정책</label>
                <div className="flex gap-2">
                  {[{v:'FREE',l:'무료배송'},{v:'CONDITIONAL',l:'조건부 무료'},{v:'PAID',l:'유료배송'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setForm({...form, default_shipping_policy: o.v})}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border ${form.default_shipping_policy===o.v ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">기본 배송비 (원)</label>
                <input type="number" value={form.default_shipping_cost} onChange={e => setForm({...form, default_shipping_cost: e.target.value})}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="예: 3000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">테마 색상</label>
                <div className="flex gap-2">
                  {CHANNEL_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({...form, color_code: c})}
                      className={`w-8 h-8 rounded-full ${form.color_code===c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => { setShowForm(false); resetForm() }}
                  className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-medium hover:bg-slate-50">취소</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700">{editId ? '수정' : '추가'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Channels
