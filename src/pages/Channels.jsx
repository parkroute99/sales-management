import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
    if (editId) { await supabase.from('channels').update(data).eq('id', editId) }
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

  const s = {
    card: { background:'#fff', borderRadius:16, border:'1px solid #e2e8f0', padding:20 },
    btn: { padding:'8px 16px', background:'#6366f1', color:'#fff', borderRadius:12, fontSize:14, fontWeight:500, border:'none', cursor:'pointer' },
    btnOutline: { padding:'8px 16px', borderRadius:12, fontSize:14, fontWeight:500, border:'1px solid #e2e8f0', background:'#fff', color:'#64748b', cursor:'pointer' },
    label: { display:'block', fontSize:13, fontWeight:500, color:'#475569', marginBottom:4 },
    input: { width:'100%', padding:'10px 14px', borderRadius:12, border:'1px solid #e2e8f0', outline:'none', fontSize:14, boxSizing:'border-box' },
    overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
    modal: { background:'#fff', borderRadius:16, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' },
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:256 }}>
      <div style={{ width:40, height:40, border:'4px solid #6366f1', borderTopColor:'transparent', borderRadius:'50%' }} className="animate-spin"></div>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <p style={{ fontSize:14, color:'#94a3b8' }}>등록된 채널 {channels.length}개</p>
        <button onClick={() => { resetForm(); setShowForm(true) }} style={s.btn}>+ 채널 추가</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
        {channels.map(ch => (
          <div key={ch.id} style={s.card}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:ch.color_code||'#6366f1', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14 }}>
                  {ch.channel_name.slice(0,1)}
                </div>
                <div>
                  <h3 style={{ fontWeight:600, color:'#1e293b', fontSize:15 }}>{ch.channel_name}</h3>
                  <span style={{ fontSize:12, color:'#94a3b8' }}>{ch.channel_type==='open_market'?'오픈마켓':'폐쇄몰'}</span>
                </div>
              </div>
              <div style={{ display:'flex', gap:4 }}>
                <button onClick={() => handleEdit(ch)} style={{ padding:6, border:'none', background:'none', cursor:'pointer', fontSize:14 }}>✏️</button>
                <button onClick={() => handleDelete(ch.id)} style={{ padding:6, border:'none', background:'none', cursor:'pointer', fontSize:14 }}>🗑️</button>
              </div>
            </div>
            <div style={{ fontSize:13 }}>
              {[
                ['수수료', ch.default_commission_type==='RATE'?`${ch.default_commission_rate}%`:`${Number(ch.default_commission_fixed).toLocaleString()}원`],
                ['배송비 정책', ch.default_shipping_policy==='FREE'?'무료배송':ch.default_shipping_policy==='CONDITIONAL'?'조건부 무료':'유료배송'],
                ...(ch.default_shipping_cost>0?[['택배비',`${Number(ch.default_shipping_cost).toLocaleString()}원`]]:[]),
                ['엑셀 양식', ch.has_excel_format?'있음':'없음 (수기)'],
              ].map(([k,v],i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}>
                  <span style={{ color:'#94a3b8' }}>{k}</span>
                  <span style={{ color:'#475569', fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h3 style={{ fontSize:17, fontWeight:600 }}>{editId?'채널 수정':'채널 추가'}</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} style={{ border:'none', background:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding:24 }}>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>채널명</label>
                <input type="text" value={form.channel_name} onChange={e=>setForm({...form,channel_name:e.target.value})} style={s.input} placeholder="예: 쿠팡, 스마트스토어" required />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>채널 유형</label>
                <div style={{ display:'flex', gap:8 }}>
                  {[{v:'open_market',l:'오픈마켓'},{v:'closed_mall',l:'폐쇄몰'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setForm({...form,channel_type:o.v})}
                      style={{ flex:1, padding:10, borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer',
                        border: form.channel_type===o.v?'2px solid #6366f1':'1px solid #e2e8f0',
                        background: form.channel_type===o.v?'#eef2ff':'#fff',
                        color: form.channel_type===o.v?'#4f46e5':'#64748b' }}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>수수료 유형</label>
                <div style={{ display:'flex', gap:8 }}>
                  {[{v:'RATE',l:'비율 (%)'},{v:'FIXED',l:'고정 (원)'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setForm({...form,default_commission_type:o.v})}
                      style={{ flex:1, padding:10, borderRadius:12, fontSize:14, fontWeight:500, cursor:'pointer',
                        border: form.default_commission_type===o.v?'2px solid #6366f1':'1px solid #e2e8f0',
                        background: form.default_commission_type===o.v?'#eef2ff':'#fff',
                        color: form.default_commission_type===o.v?'#4f46e5':'#64748b' }}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>{form.default_commission_type==='RATE'?'수수료율 (%)':'고정 수수료 (원)'}</label>
                <input type="number" step={form.default_commission_type==='RATE'?"0.1":"1"}
                  value={form.default_commission_type==='RATE'?form.default_commission_rate:form.default_commission_fixed}
                  onChange={e => setForm({...form, [form.default_commission_type==='RATE'?'default_commission_rate':'default_commission_fixed']:e.target.value})}
                  style={s.input} placeholder={form.default_commission_type==='RATE'?"예: 10.5":"예: 1000"} />
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>배송비 정책</label>
                <div style={{ display:'flex', gap:8 }}>
                  {[{v:'FREE',l:'무료배송'},{v:'CONDITIONAL',l:'조건부 무료'},{v:'PAID',l:'유료배송'}].map(o => (
                    <button key={o.
