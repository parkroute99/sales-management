import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CHANNEL_COLORS = [
  '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#64748b',
]

function Channels() {
  const [channels, setChannels] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    channel_name: '',
    channel_type: 'open_market',
    default_commission_type: 'RATE',
    default_commission_rate: '',
    default_commission_fixed: '',
    default_shipping_policy: 'PAID',
    default_shipping_cost: '',
    color_code: '#6366f1',
    has_excel_format: true,
  })

  useEffect(() => {
    fetchChannels()
  }, [])

  const fetchChannels = async () => {
    const { data } = await supabase
      .from('channels')
      .select('*')
      .order('sort_order')
    setChannels(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setForm({
      channel_name: '',
      channel_type: 'open_market',
      default_commission_type: 'RATE',
      default_commission_rate: '',
      default_commission_fixed: '',
      default_shipping_policy: 'PAID',
      default_shipping_cost: '',
      color_code: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length],
      has_excel_format: true,
    })
    setEditId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user

    const data = {
      ...form,
      default_commission_rate: Number(form.default_commission_rate) || 0,
      default_commission_fixed: Number(form.default_commission_fixed) || 0,
      default_shipping_cost: Number(form.default_shipping_cost) || 0,
      sort_order: channels.length,
    }

    if (editId) {
      await supabase.from('channels').update(data).eq('id', editId)
    } else {
      data.created_by = user.id
      await supabase.from('channels').insert(data)
    }

    setShowForm(false)
    resetForm()
    fetchChannels()
  }

  const handleEdit = (channel) => {
    setForm({
      channel_name: channel.channel_name,
      channel_type: channel.channel_type,
      default_commission_type: channel.default_commission_type,
      default_commission_rate: channel.default_commission_rate || '',
      default_commission_fixed: channel.default_commission_fixed || '',
      default_shipping_policy: channel.default_shipping_policy,
      default_shipping_cost: channel.default_shipping_cost || '',
      color_code: channel.color_code || '#6366f1',
      has_excel_format: channel.has_excel_format,
    })
    setEditId(channel.id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('이 채널을 삭제하시겠습니까?')) {
      await supabase.from('channels').delete().eq('id', id)
      fetchChannels()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 상단 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">등록된 채널 {channels.length}개</p>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + 채널 추가
        </button>
      </div>

      {/* 채널 목록 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map((ch) => (
          <div key={ch.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: ch.color_code || '#6366f1' }}
                >
                  {ch.channel_name.slice(0, 1)}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{ch.channel_name}</h3>
                  <span className="text-xs text-slate-400">
                    {ch.channel_type === 'open_market' ? '오픈마켓' : '폐쇄몰'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(ch)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-sm"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(ch.id)}
                  className="p-2 hover:bg-red-50 rounded-lg text-sm"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">수수료</span>
                <span className="text-slate-700 font-medium">
                  {ch.default_commission_type === 'RATE'
                    ? `${ch.default_commission_rate}%`
                    : `${Number(ch.default_commission_fixed).toLocaleString()}원`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">배송비 정책</span>
                <span className="text-slate-700 font-medium">
                  {ch.default_shipping_policy === 'FREE' ? '무료배송'
                    : ch.default_shipping_policy === 'CONDITIONAL' ? '조건부 무료'
                    : '유료배송'}
                </span>
              </div>
              {ch.default_shipping_cost > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">택배비</span>
                  <span className="text-slate-700 font-medium">
                    {Number(ch.default_shipping_cost).toLocaleString()}원
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">엑셀 양식</span>
                <span className="text-slate-700 font-medium">
                  {ch.has_excel_format ? '있음' : '없음 (수기)'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 등록/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editId ? '채널 수정' : '채널 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">채널명</label>
                <input
                  type="text"
                  value={form.channel_name}
                  onChange={e => setForm({ ...form, channel_name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="예: 쿠팡, 스마트스토어"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">채널 유형</label>
                <div className="flex gap-3">
                  {[
                    { value: 'open_market', label: '오픈마켓' },
                    { value: 'closed_mall', label: '폐쇄몰' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, channel_type: opt.value })}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
                        form.channel_type === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">수수료 유형</label>
                <div className="flex gap-3">
                  {[
                    { value: 'RATE', label: '비율 (%)' },
                    { value: 'FIXED', label: '고정 (원)' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, default_commission_type: opt.value })}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
                        form.default_commission_type === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.default_commission_type === 'RATE' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">수수료율 (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.default_commission_rate}
                    onChange={e => setForm({ ...form, default_commission_rate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    placeholder="예: 10.5"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">고정 수수료 (원)</label>
                  <input
                    type="number"
                    value={form.default_commission_fixed}
                    onChange={e => setForm({ ...form, default_commission_fixed: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    placeholder="예: 1000"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">배송비 정책</label>
                <div className="flex gap-2">
                  {[
                    { value: 'FREE', label: '무료배송' },
                    { value: 'CONDITIONAL', label: '조건부 무료' },
                    { value: 'PAID', label: '유료배송' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, default_shipping_policy: opt.value })}
                      className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
                        form.default_shipping_policy === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">실제 택배비 (원)</label>
                <input
                  type="number"
                  value={form.default_shipping_cost}
                  onChange={e => setForm({ ...form, default_shipping_cost: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  placeholder="예: 3000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">테마 색상</label>
                <div className="flex gap-2">
                  {CHANNEL_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color_code: color })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        form.color_code === color ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-700">엑셀 양식 존재</label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, has_excel_format: !form.has_excel_format })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    form.has_excel_format ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                    form.has_excel_format ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className="text-sm text-slate-500">{form.has_excel_format ? '있음' : '없음 (수기 입력)'}</span>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm() }}
                  className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
                >
                  {editId ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Channels
