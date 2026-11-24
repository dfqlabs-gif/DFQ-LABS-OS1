import React, { useCallback, useEffect, useMemo, useState } from "react";
import { G, G_DIM, G_BORDER, SURFACE, SURFACE2, BORDER, TEXT, MUTED, MUTED2, iStyle } from "../constants";
import type { Lead } from "../types";

type Config = { automation_mode: "queue_only" | "autopilot"; daily_outreach_cap: number; daily_value_dm_cap: number; brand_voice: string; buyer_psychology_pillars: string[] };
type QueueItem = { id: string; lead_id: string | null; agent_name: string; action_type: string; draft_content: string; reasoning: string; status: string; created_at: string; lead_name?: string; lead_company?: string; lead_phone?: string; metadata?: Record<string, unknown> };
type Props = { token: string; leads: Lead[] };

const ACTIONS = ["all","outreach_dm","value_dm","follow_up","new_lead","log_inbound","linkedin_article"];
const LABELS: Record<string,string> = { outreach_dm:"Outreach DM", value_dm:"Value DM", follow_up:"Follow-up", new_lead:"New Lead", log_inbound:"Inbound Reply", linkedin_article:"LinkedIn Article" };

export function AgentReviewQueue({ token, leads }: Props) {
  const [config,setConfig] = useState<Config | null>(null);
  const [items,setItems] = useState<QueueItem[]>([]);
  const [filter,setFilter] = useState("all");
  const [status,setStatus] = useState("pending_approval");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState<string | null>(null);
  const [edits,setEdits] = useState<Record<string,string>>({});
  const [logs,setLogs] = useState<any[]>([]);
  const [selectedLeadIds,setSelectedLeadIds] = useState<string[]>([]);
  const headers = useMemo(() => ({ "Content-Type":"application/json", Authorization:`Bearer ${token}` }),[token]);

  const request = useCallback(async (url:string, init:RequestInit = {}) => {
    const response = await fetch(url,{...init,headers:{...headers,...(init.headers || {})}});
    const body = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  },[headers]);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [c,q,l] = await Promise.all([
        request("/api/agents/config"),
        request(`/api/agents/queue?status=${encodeURIComponent(status)}&limit=100`),
        request("/api/agents/logs")
      ]);
      setConfig(c.config); setItems(q.items || []); setLogs(l.logs || []);
    } catch(e:any) { setError(e.message || "Could not load agent workspace"); }
    finally { setLoading(false); }
  },[request,status]);
  useEffect(()=>{ refresh(); },[refresh]);

  const generateDrafts = async (actionType:"outreach_dm"|"value_dm"|"follow_up") => {
    if (!selectedLeadIds.length) { setError("Select at least one CRM lead first."); return; }
    setBusy("generate"); setError("");
    try {
      const result = await request("/api/agents/generate",{method:"POST",body:JSON.stringify({leadIds:selectedLeadIds,actionType})});
      setSelectedLeadIds([]);
      await refresh();
      if (result.skipped?.length) setError(`Staged ${result.staged?.length || 0} draft(s). Skipped: ${result.skipped.join(" · ")}`);
    } catch(e:any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const updateConfig = async (patch:Partial<Config>) => {
    if (!config) return;
    setBusy("config");
    try { const result=await request("/api/agents/config",{method:"PATCH",body:JSON.stringify(patch)}); setConfig(result.config); }
    catch(e:any){setError(e.message);}
    finally{setBusy(null);}
  };
  const markDoNotContact = async (item:QueueItem) => {
    if (!item.lead_id || !window.confirm("Mark this lead as DO NOT CONTACT and cancel all pending/approved drafts?")) return;
    setBusy(item.id); setError("");
    try { await request(`/api/agents/leads/${item.lead_id}/do-not-contact`,{method:"POST",body:JSON.stringify({reason:"Founder marked from AI Review Queue"})}); await refresh(); }
    catch(e:any){setError(e.message);}
    finally{setBusy(null);}
  };

  const review = async (item:QueueItem, decision:"approve"|"reject", edited?:string) => {
    setBusy(item.id); setError("");
    try {
      if (edited !== undefined && edited !== item.draft_content) await request(`/api/agents/queue/${item.id}`,{method:"PATCH",body:JSON.stringify({draft_content:edited})});
      await request(`/api/agents/queue/${item.id}/review`,{method:"POST",body:JSON.stringify({decision})});
      await refresh();
    } catch(e:any){setError(e.message);}
    finally{setBusy(null);}
  };

  const counts = useMemo(()=>ACTIONS.slice(1).reduce((acc,key)=>{acc[key]=items.filter(i=>i.action_type===key).length;return acc;},{} as Record<string,number>),[items]);
  const pending = items.filter(i=>i.status==="pending_approval").length;
  const activeLeads=leads.filter(l=>!l.mergedInto);

  return <div style={{maxWidth:1180,margin:"0 auto",paddingBottom:36}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",marginBottom:18}}>
      <div><div style={{fontSize:10,color:G,fontWeight:800,letterSpacing:".16em"}}>DFQLABS INTELLIGENCE LAYER</div><h2 style={{fontSize:23,color:TEXT,margin:"5px 0"}}>AI Agents & Review Queue</h2><div style={{fontSize:11,color:MUTED}}>Founder-controlled agent operations. Every external action stays in review until explicitly approved.</div></div>
      <button onClick={refresh} style={{background:SURFACE2,border:`1px solid ${BORDER}`,color:TEXT,borderRadius:7,padding:"8px 13px",cursor:"pointer"}}>↻ Refresh</button>
    </div>
    {error && <div role="alert" style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.35)",color:"#FCA5A5",padding:10,borderRadius:8,marginBottom:12,fontSize:12}}>{error}</div>}
    {config && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:18}}>
      <div style={{background:SURFACE,border:`1px solid ${G_BORDER}`,borderRadius:10,padding:14}}>
        <div style={{fontSize:9,color:MUTED,letterSpacing:".12em",fontWeight:800}}>AUTOMATION MODE</div>
        <div style={{fontSize:17,fontWeight:800,color:G,margin:"7px 0"}}>{config.automation_mode==="queue_only"?"REVIEW QUEUE":"AUTOPILOT"}</div>
        <button disabled style={{background:G_DIM,border:`1px solid ${G_BORDER}`,color:G,borderRadius:6,padding:"7px 10px",fontSize:10,fontWeight:800,cursor:"not-allowed"}}>Review Queue — Active</button>
        <div style={{fontSize:9,color:MUTED,marginTop:7}}>Autopilot remains locked until sending, opt-out protection and the WhatsApp bridge are end-to-end verified.</div>
      </div>
      <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14}}><div style={{fontSize:9,color:MUTED,fontWeight:800}}>PENDING REVIEW</div><div style={{fontSize:28,fontWeight:900,color:TEXT,marginTop:5}}>{pending}</div><div style={{fontSize:10,color:MUTED}}>Awaiting founder decision</div></div>
      <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14}}><div style={{fontSize:9,color:MUTED,fontWeight:800}}>ACTIVE CRM LEADS</div><div style={{fontSize:28,fontWeight:900,color:TEXT,marginTop:5}}>{activeLeads.length}</div><div style={{fontSize:10,color:MUTED}}>Available for agent context</div></div>
      <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14}}><div style={{fontSize:9,color:MUTED,fontWeight:800}}>DAILY CAPS</div><div style={{fontSize:18,fontWeight:900,color:TEXT,marginTop:5}}>{config.daily_outreach_cap} / {config.daily_value_dm_cap}</div><div style={{fontSize:10,color:MUTED}}>Outreach / value DMs</div></div>
    </div>}
    <section style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:18}}>
      <div style={{fontSize:11,fontWeight:800,color:TEXT,marginBottom:5}}>Generate drafts from your CRM</div>
      <div style={{fontSize:10,color:MUTED,marginBottom:10}}>Select up to 10 active leads. Gemini reads each authoritative CRM record and thread, then stages the draft here. Nothing is sent.</div>
      <select multiple value={selectedLeadIds} onChange={e=>setSelectedLeadIds(Array.from(e.target.selectedOptions).map(o=>o.value).slice(0,10))} style={{...iStyle,width:"100%",minHeight:130,marginBottom:10}}>
        {activeLeads.filter(l=>!["Closed","Lost"].includes(l.status)).map(lead=><option key={lead.id} value={lead.id}>{lead.company||lead.name} — {lead.name||"No contact name"} · {lead.status}</option>)}
      </select>
      <div style={{fontSize:9,color:MUTED2,marginBottom:9}}>{selectedLeadIds.length}/10 leads selected</div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
        <button disabled={busy==="generate"||!selectedLeadIds.length} onClick={()=>generateDrafts("outreach_dm")} style={{background:G_DIM,border:`1px solid ${G_BORDER}`,color:G,borderRadius:6,padding:"8px 11px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Generate Outreach</button>
        <button disabled={busy==="generate"||!selectedLeadIds.length} onClick={()=>generateDrafts("value_dm")} style={{background:SURFACE2,border:`1px solid ${BORDER}`,color:TEXT,borderRadius:6,padding:"8px 11px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Generate Value DMs</button>
        <button disabled={busy==="generate"||!selectedLeadIds.length} onClick={()=>generateDrafts("follow_up")} style={{background:SURFACE2,border:`1px solid ${BORDER}`,color:TEXT,borderRadius:6,padding:"8px 11px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Generate Follow-ups</button>
        {busy==="generate"&&<span style={{fontSize:10,color:G,alignSelf:"center"}}>Gemini is reading CRM context…</span>}
      </div>
    </section>
    {config && <section style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:18}}>
      <div style={{fontSize:11,fontWeight:800,color:TEXT,marginBottom:12}}>Agent operating rules</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
        <label style={{fontSize:10,color:MUTED}}>Daily outreach cap<input type="number" min="1" max="100" value={config.daily_outreach_cap} onChange={e=>setConfig({...config,daily_outreach_cap:Number(e.target.value)})} onBlur={()=>updateConfig({daily_outreach_cap:config.daily_outreach_cap})} style={{...iStyle,marginTop:5,width:"100%"}} /></label>
        <label style={{fontSize:10,color:MUTED}}>Daily value DM cap<input type="number" min="1" max="100" value={config.daily_value_dm_cap} onChange={e=>setConfig({...config,daily_value_dm_cap:Number(e.target.value)})} onBlur={()=>updateConfig({daily_value_dm_cap:config.daily_value_dm_cap})} style={{...iStyle,marginTop:5,width:"100%"}} /></label>
      </div>
      <label style={{fontSize:10,color:MUTED}}>Brand voice<textarea value={config.brand_voice} onChange={e=>setConfig({...config,brand_voice:e.target.value})} onBlur={()=>updateConfig({brand_voice:config.brand_voice})} rows={3} style={{...iStyle,marginTop:5,width:"100%",lineHeight:1.6}} /></label>
      <div style={{fontSize:9,color:MUTED2,marginTop:7}}>Psychology pillars: {(config.buyer_psychology_pillars||[]).join(" · ")}</div>
    </section>}
    <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
      <select value={status} onChange={e=>setStatus(e.target.value)} style={{...iStyle,width:"auto"}}><option value="pending_approval">Pending approval</option><option value="approved">Approved (not dispatched)</option><option value="sent">Sent</option><option value="rejected">Rejected</option><option value="failed">Failed</option><option value="">All statuses</option></select>
      {ACTIONS.map(key=><button key={key} onClick={()=>setFilter(key)} style={{background:filter===key?G_DIM:"transparent",border:`1px solid ${filter===key?G_BORDER:BORDER}`,color:filter===key?G:MUTED,borderRadius:20,padding:"6px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{key==="all"?"All":LABELS[key]}{key!=="all"&&status==="pending_approval"?` (${counts[key]||0})`:""}</button>)}
    </div>
    {loading?<div style={{padding:30,textAlign:"center",color:MUTED}}>Loading founder workspace…</div>:items.filter(i=>filter==="all"||i.action_type===filter).length===0?<div style={{background:SURFACE,border:`1px dashed ${BORDER}`,borderRadius:10,padding:30,textAlign:"center"}}><div style={{fontSize:13,color:TEXT,fontWeight:700}}>Nothing in this view yet</div><div style={{fontSize:11,color:MUTED,marginTop:5}}>New agent-generated drafts will appear here before any message is sent.</div></div>:<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {items.filter(i=>filter==="all"||i.action_type===filter).map(item=><article key={item.id} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderLeft:`3px solid ${item.status==="pending_approval"?G:item.status==="failed"?"#EF4444":BORDER}`,borderRadius:9,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:9}}><div><div style={{fontSize:12,fontWeight:800,color:TEXT}}>{item.lead_name||item.lead_company||String(item.metadata?.company_name||"Unassigned item")}</div><div style={{fontSize:10,color:MUTED,marginTop:3}}>{LABELS[item.action_type]||item.action_type} · {item.agent_name} · {item.lead_phone||""}</div></div><span style={{fontSize:9,fontWeight:800,color:item.status==="pending_approval"?G:MUTED,background:item.status==="pending_approval"?G_DIM:SURFACE2,border:`1px solid ${item.status==="pending_approval"?G_BORDER:BORDER}`,borderRadius:20,padding:"5px 9px",height:"fit-content"}}>{item.status.replace("_"," ").toUpperCase()}</span></div>
        <textarea value={edits[item.id]??item.draft_content} onChange={e=>setEdits(p=>({...p,[item.id]:e.target.value}))} readOnly={item.status!=="pending_approval"} rows={Math.min(10,Math.max(3,Math.ceil((item.draft_content.length||100)/100)))} style={{...iStyle,width:"100%",lineHeight:1.65,resize:"vertical"}} />
        {item.reasoning&&<div style={{fontSize:10,color:MUTED,background:SURFACE2,padding:9,borderRadius:6,marginTop:8}}><b style={{color:G}}>AGENT REASONING</b><div style={{marginTop:4,lineHeight:1.6}}>{item.reasoning}</div></div>}
        {item.status==="pending_approval"&&<div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:10}}><button disabled={busy===item.id} onClick={()=>review(item,"approve",edits[item.id])} style={{background:G,color:"#001014",border:"none",borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:900,cursor:"pointer"}}>Approve for Dispatch</button><button disabled={busy===item.id} onClick={()=>review(item,"reject")} style={{background:"transparent",color:"#FCA5A5",border:"1px solid rgba(239,68,68,.35)",borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Reject</button>{item.lead_id&&<button disabled={busy===item.id} onClick={()=>markDoNotContact(item)} style={{background:"transparent",color:"#FCA5A5",border:"1px solid rgba(239,68,68,.35)",borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Mark Do Not Contact</button>}</div>}
      </article>)}
    </div>}
    <section style={{marginTop:20,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14}}><div style={{fontSize:11,fontWeight:800,color:TEXT,marginBottom:8}}>Agent activity</div>{logs.length===0?<div style={{fontSize:10,color:MUTED}}>No agent runs recorded yet.</div>:logs.slice(0,8).map(log=><div key={log.id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"7px 0",borderBottom:`1px solid ${BORDER}`,fontSize:10}}><span style={{color:TEXT}}>{log.agent_name} · {log.summary}</span><span style={{color:log.status==="error"||log.status==="halted_circuit_breaker"?"#FCA5A5":MUTED,whiteSpace:"nowrap"}}>{new Date(log.created_at).toLocaleString()}</span></div>)}</section>
  </div>;
}
