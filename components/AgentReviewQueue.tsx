import React, { useCallback, useEffect, useMemo, useState } from "react";
import { G, G_DIM, G_BORDER, SURFACE, SURFACE2, BORDER, TEXT, MUTED, MUTED2, iStyle } from "../constants";
import type { Lead } from "../types";

type Config = { automation_mode: "queue_only" | "autopilot"; daily_outreach_cap: number; daily_value_dm_cap: number; brand_voice: string; buyer_psychology_pillars: string[] };
type QueueItem = { id: string; lead_id: string | null; agent_name: string; action_type: string; draft_content: string; reasoning: string; status: string; created_at: string; lead_name?: string; lead_company?: string; lead_phone?: string; metadata?: Record<string, unknown> };
type Props = { token: string; leads: Lead[] };
type WhatsAppStatus = { enabled:boolean; status:string; connectedPhone:string|null; lastError:string|null; lastConnectedAt:string|null; qrDataUrl:string|null; encryptionConfigured:boolean };

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
  const [contactControls,setContactControls] = useState<any[]>([]);
  const [phoneSuppressions,setPhoneSuppressions] = useState<any[]>([]);
  const [selectedLeadIds,setSelectedLeadIds] = useState<string[]>([]);
  const [whatsapp,setWhatsapp] = useState<WhatsAppStatus|null>(null);
  const [whatsappBusy,setWhatsappBusy] = useState(false);
  const [bulkExport,setBulkExport] = useState("");
  const [bulkPhone,setBulkPhone] = useState("");
  const [bulkMyName,setBulkMyName] = useState("You");
  const [bulkBusy,setBulkBusy] = useState(false);
  const [bulkResult,setBulkResult] = useState<any>(null);
  const [articleTopic,setArticleTopic] = useState("");
  const [articleBusy,setArticleBusy] = useState(false);
  const [selectedQueueIds,setSelectedQueueIds] = useState<string[]>([]);
  const [scoutCity,setScoutCity] = useState("Abuja");
  const [scoutBusy,setScoutBusy] = useState(false);
  const [scoutResult,setScoutResult] = useState<any>(null);
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
      const [c,q,l,dnc,phones] = await Promise.all([
        request("/api/agents/config"),
        request(`/api/agents/queue?status=${encodeURIComponent(status)}&limit=100`),
        request("/api/agents/logs"),
        request("/api/agents/contact-controls"),
        request("/api/agents/phone-suppressions")
      ]);
      setConfig(c.config); setCounters(c.counters || {}); setItems(q.items || []); setLogs(l.logs || []); setContactControls(dnc.controls || []); setPhoneSuppressions(phones.suppressions || []);
    } catch(e:any) { setError(e.message || "Could not load agent workspace"); }
    finally { setLoading(false); }
  },[request,status]);
  useEffect(()=>{ refresh(); },[refresh]);

  const refreshWhatsApp = useCallback(async () => {
    try { const result=await request("/api/agents/whatsapp/status"); setWhatsapp(result.status); }
    catch(e:any) { setError(e.message || "Could not read WhatsApp connection status."); }
  },[request]);
  useEffect(() => {
    refreshWhatsApp();
    const timer=setInterval(refreshWhatsApp,5000);
    return ()=>clearInterval(timer);
  },[refreshWhatsApp]);
  const connectWhatsApp = async () => {
    setWhatsappBusy(true); setError("");
    try { const result=await request("/api/agents/whatsapp/connect",{method:"POST"}); setWhatsapp(result.status); }
    catch(e:any) { setError(e.message); await refreshWhatsApp(); }
    finally { setWhatsappBusy(false); }
  };
  const disconnectWhatsApp = async () => {
    setWhatsappBusy(true); setError("");
    try { const result=await request("/api/agents/whatsapp/disconnect",{method:"POST"}); setWhatsapp(result.status); }
    catch(e:any) { setError(e.message); }
    finally { setWhatsappBusy(false); }
  };

  const syncWhatsAppExport = async () => {
    if (!bulkPhone.trim() || !bulkExport.trim()) { setError("Enter the contact number and paste the WhatsApp export."); return; }
    setBulkBusy(true); setError(""); setBulkResult(null);
    try {
      const result=await request("/api/agents/whatsapp/bulk-sync",{method:"POST",body:JSON.stringify({phone:bulkPhone,myName:bulkMyName,exportText:bulkExport})});
      setBulkResult(result); setBulkExport(""); await refresh();
    } catch(e:any) { setError(e.message); }
    finally { setBulkBusy(false); }
  };

  const runScout = async () => {
    if (!scoutCity.trim()) { setError("Enter a city for the Scout."); return; }
    setScoutBusy(true); setError(""); setScoutResult(null);
    try { const result=await request("/api/agents/scout",{method:"POST",body:JSON.stringify({city:scoutCity,limit:10})}); setScoutResult(result); await refresh(); }
    catch(e:any){setError(e.message);}
    finally{setScoutBusy(false);}
  };

  const generateLinkedInArticle = async () => {
    if (!articleTopic.trim()) { setError("Enter a LinkedIn article topic."); return; }
    setArticleBusy(true); setError("");
    try { await request("/api/agents/linkedin-article",{method:"POST",body:JSON.stringify({topic:articleTopic})}); setArticleTopic(""); await refresh(); }
    catch(e:any){setError(e.message);}
    finally{setArticleBusy(false);}
  };

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
  const removePhoneSuppression = async (phone:string) => {
    if (!window.confirm("Remove this phone-level suppression only after the sender has explicitly opted back in?")) return;
    setBusy(phone); setError("");
    try { await request("/api/agents/phone-suppressions/"+phone,{method:"DELETE"}); await refresh(); }
    catch(e:any){setError(e.message);}
    finally{setBusy(null);}
  };

  const removeDoNotContact = async (leadId:string) => {
    if (!window.confirm("Remove this lead from the do-not-contact list? Only do this if the contact has explicitly opted back in.")) return;
    setBusy(leadId); setError("");
    try { await request("/api/agents/leads/"+leadId+"/do-not-contact",{method:"DELETE"}); await refresh(); }
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

  const batchReview = async (decision:"approve"|"reject") => {
    if (!selectedQueueIds.length) return;
    setBusy("batch"); setError("");
    try {
      const result=await request("/api/agents/queue/batch-review",{method:"POST",body:JSON.stringify({ids:selectedQueueIds,decision})});
      setSelectedQueueIds([]);
      await refresh();
      if (result.skipped?.length) setError(`Reviewed ${result.updated?.length || 0} item(s); ${result.skipped.length} skipped.`);
    } catch(e:any){setError(e.message);}
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
  const latestAgentLogs = useMemo(() => {
    const latest:Record<string,any> = {};
    for (const log of logs) if (!latest[log.agent_name] || new Date(log.created_at) > new Date(latest[log.agent_name].created_at)) latest[log.agent_name] = log;
    return Object.values(latest);
  },[logs]);
  const haltedAgents = latestAgentLogs.filter(log=>log.status==="halted_circuit_breaker");
  const resetCircuitBreaker = async (agentName:string) => {
    setBusy(agentName); setError("");
    try { await request(`/api/agents/circuit-breakers/${agentName}/reset`,{method:"POST"}); await refresh(); }
    catch(e:any){setError(e.message);}
    finally{setBusy(null);}
  };
  const pending = items.filter(i=>i.status==="pending_approval").length;
  const activeLeads=leads.filter(l=>!l.mergedInto);

  return <div style={{maxWidth:1180,margin:"0 auto",paddingBottom:36}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",marginBottom:18}}>
      <div><div style={{fontSize:10,color:G,fontWeight:800,letterSpacing:".16em"}}>DFQLABS INTELLIGENCE LAYER</div><h2 style={{fontSize:23,color:TEXT,margin:"5px 0"}}>AI Agents & Review Queue</h2><div style={{fontSize:11,color:MUTED}}>Founder-controlled agent operations. Every external action stays in review until explicitly approved.</div></div>
      <button onClick={refresh} style={{background:SURFACE2,border:`1px solid ${BORDER}`,color:TEXT,borderRadius:7,padding:"8px 13px",cursor:"pointer"}}>↻ Refresh</button>
    </div>
    {error && <div role="alert" style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.35)",color:"#FCA5A5",padding:10,borderRadius:8,marginBottom:12,fontSize:12}}>{error}</div>}
    <div style={{background:SURFACE2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"9px 12px",marginBottom:14,fontSize:10,color:MUTED,lineHeight:1.7}}>
      <b style={{color:G}}>LAGOS-TIME OPERATING SCHEDULE</b> · 08:00 Scout · 09:00 Writer · 10:00 LinkedIn (Mon/Thu) · 14:00 Closer · Dispatcher checks approved items every 45–90 seconds. Every generated item is staged; only founder-approved WhatsApp items can send.
    </div>
    <section style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div><div style={{fontSize:11,fontWeight:900,color:TEXT}}>WhatsApp Web bridge</div><div style={{fontSize:10,color:MUTED,marginTop:4}}>QR-based connection · no Cloud API or paid provider</div></div>
        <span style={{fontSize:9,fontWeight:800,color:whatsapp?.status==="connected"?G:whatsapp?.status==="error"?"#FCA5A5":MUTED,background:SURFACE2,border:`1px solid ${BORDER}`,borderRadius:20,padding:"6px 10px"}}>{(whatsapp?.status||"checking").replace("_"," ").toUpperCase()}</span>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
        <button disabled={whatsappBusy||!whatsapp?.encryptionConfigured||whatsapp?.status==="connected"} onClick={connectWhatsApp} style={{background:G,color:"#001014",border:"none",borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:900,cursor:"pointer"}}>{whatsappBusy?"Connecting…":whatsapp?.status==="qr_required"?"Refresh connection":"Connect WhatsApp"}</button>
        <button disabled={whatsappBusy||!whatsapp?.enabled} onClick={disconnectWhatsApp} style={{background:"transparent",color:MUTED,border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Disconnect</button>
        {whatsapp?.connectedPhone&&<span style={{fontSize:10,color:G,alignSelf:"center"}}>Connected number: +{whatsapp.connectedPhone}</span>}
      </div>
      {!whatsapp?.encryptionConfigured&&<div style={{fontSize:10,color:"#FCA5A5",marginTop:10}}>Before connecting, add WHATSAPP_SESSION_ENCRYPTION_KEY (a random secret of at least 32 characters) to the OS1 Render environment. Session credentials are encrypted in PostgreSQL.</div>}
      {whatsapp?.qrDataUrl&&<div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",marginTop:14,padding:12,background:"#fff",borderRadius:8,width:"fit-content"}}><img src={whatsapp.qrDataUrl} alt="WhatsApp Web QR code" style={{width:220,height:220}}/><div style={{maxWidth:230,color:"#111",fontSize:11,lineHeight:1.6}}><b>Scan with your phone</b><br/>Open WhatsApp → Linked Devices → Link a Device. Scan this QR code to connect the account you are authorized to use.</div></div>}
      {whatsapp?.lastError&&<div style={{fontSize:10,color:"#FCA5A5",marginTop:8}}>{whatsapp.lastError}</div>}
      <div style={{fontSize:9,color:MUTED2,marginTop:10,lineHeight:1.6}}>Unofficial WhatsApp Web integration, not endorsed by WhatsApp. It may break or result in account restrictions. Use only an account you control or are authorized to connect. All outbound messages remain subject to founder approval.</div>
    </section>
    <section style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:18}}>
      <div style={{fontSize:11,fontWeight:900,color:TEXT,marginBottom:5}}>Quick bulk chat sync</div>
      <div style={{fontSize:10,color:MUTED,marginBottom:10}}>Paste a WhatsApp chat export. Gemini extracts dated messages, then OS1 appends them chronologically to the matching CRM lead. Historical messages are logged only; they are not sent again.</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9,marginBottom:9}}>
        <label style={{fontSize:10,color:MUTED}}>Contact WhatsApp number<input value={bulkPhone} onChange={e=>setBulkPhone(e.target.value)} placeholder="+2348012345678" style={{...iStyle,width:"100%",marginTop:5}} /></label>
        <label style={{fontSize:10,color:MUTED}}>Your name in the export<input value={bulkMyName} onChange={e=>setBulkMyName(e.target.value)} placeholder="You" style={{...iStyle,width:"100%",marginTop:5}} /></label>
      </div>
      <textarea value={bulkExport} onChange={e=>setBulkExport(e.target.value)} rows={5} placeholder="Paste the exported WhatsApp chat text here…" style={{...iStyle,width:"100%",lineHeight:1.6,marginBottom:9}} />
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><button disabled={bulkBusy||!bulkPhone.trim()||!bulkExport.trim()} onClick={syncWhatsAppExport} style={{background:G_DIM,border:`1px solid ${G_BORDER}`,color:G,borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:900,cursor:"pointer"}}>{bulkBusy?"Parsing and syncing…":"Parse & Sync Export"}</button>{bulkResult&&<span style={{fontSize:10,color:G}}>Imported {bulkResult.inbound} inbound · {bulkResult.outbound} outbound · {bulkResult.unmatched} unmatched · {bulkResult.skipped} skipped</span>}</div>
    </section>
    {config&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,marginBottom:14}}>
      <div style={{background:SURFACE,border:"1px solid "+BORDER,borderRadius:8,padding:12}}><div style={{fontSize:9,color:MUTED,fontWeight:800}}>OUTREACH / FOLLOW-UP CAP</div><div style={{fontSize:19,color:TEXT,fontWeight:900,marginTop:4}}>{Number(counters.outreach_sent||0)} <span style={{fontSize:11,color:MUTED,fontWeight:500}}>/ {config.daily_outreach_cap} sent today</span></div><div style={{fontSize:10,color:MUTED,marginTop:4}}>{Number(counters.outreach_queued||0)} queued / awaiting approval / sending</div><div style={{fontSize:9,color:G,marginTop:4}}>{Math.max(0,Number(config.daily_outreach_cap)-Number(counters.outreach_sent||0)-Number(counters.outreach_queued||0))} remaining capacity</div></div>
      <div style={{background:SURFACE,border:"1px solid "+BORDER,borderRadius:8,padding:12}}><div style={{fontSize:9,color:MUTED,fontWeight:800}}>VALUE DM CAP</div><div style={{fontSize:19,color:TEXT,fontWeight:900,marginTop:4}}>{Number(counters.value_sent||0)} <span style={{fontSize:11,color:MUTED,fontWeight:500}}>/ {config.daily_value_dm_cap} sent today</span></div><div style={{fontSize:10,color:MUTED,marginTop:4}}>{Number(counters.value_queued||0)} queued / awaiting approval / sending</div><div style={{fontSize:9,color:G,marginTop:4}}>{Math.max(0,Number(config.daily_value_dm_cap)-Number(counters.value_sent||0)-Number(counters.value_queued||0))} remaining capacity</div></div>
    </div>}
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
      <select multiple value={selectedLeadIds} onChange={(e: React.ChangeEvent<HTMLSelectElement>)=>setSelectedLeadIds(Array.from(e.currentTarget.selectedOptions).map((option: HTMLOptionElement)=>option.value).slice(0,10))} style={{...iStyle,width:"100%",minHeight:130,marginBottom:10}}>
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
    <section style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:18}}>
      <div style={{fontSize:11,fontWeight:900,color:TEXT,marginBottom:5}}>Real-estate Scout</div>
      <div style={{fontSize:10,color:MUTED,marginBottom:10}}>Gemini uses Google Search grounding to discover public real-estate businesses. Verified candidates are staged as New Lead items; no lead is created until you approve it.</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><input value={scoutCity} onChange={e=>setScoutCity(e.target.value)} placeholder="Abuja, Lagos, Port Harcourt…" style={{...iStyle,flex:"1 1 220px"}}/><button disabled={scoutBusy||!scoutCity.trim()} onClick={runScout} style={{background:G_DIM,border:`1px solid ${G_BORDER}`,color:G,borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:900,cursor:"pointer"}}>{scoutBusy?"Searching public sources…":"Run Scout"}</button></div>
      {scoutResult&&<div style={{fontSize:10,color:G,marginTop:9}}>Scout staged {scoutResult.staged?.length||0} candidate(s) for review; {scoutResult.skipped?.length||0} skipped.</div>}
    </section>
    <section style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14,marginBottom:18}}>
      <div style={{fontSize:11,fontWeight:900,color:TEXT,marginBottom:5}}>LinkedIn thought leadership</div>
      <div style={{fontSize:10,color:MUTED,marginBottom:10}}>Generate a 600–900 word DFQ Labs article. It will be staged for founder review; nothing is published automatically.</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><input value={articleTopic} onChange={e=>setArticleTopic(e.target.value)} placeholder="e.g. Why high-ticket property buyers hesitate after viewing" style={{...iStyle,flex:"1 1 300px"}}/><button disabled={articleBusy||!articleTopic.trim()} onClick={generateLinkedInArticle} style={{background:G_DIM,border:`1px solid ${G_BORDER}`,color:G,borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:900,cursor:"pointer"}}>{articleBusy?"Writing…":"Generate LinkedIn Article"}</button></div>
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
      <select value={status} onChange={e=>setStatus(e.target.value)} style={{...iStyle,width:"auto"}}><option value="pending_approval">Pending approval</option><option value="approved">Approved (not dispatched)</option><option value="sending">Sending</option><option value="sent">Sent</option><option value="completed">Completed</option><option value="rejected">Rejected</option><option value="failed">Failed</option><option value="">All statuses</option></select>
      {ACTIONS.map(key=><button key={key} onClick={()=>setFilter(key)} style={{background:filter===key?G_DIM:"transparent",border:`1px solid ${filter===key?G_BORDER:BORDER}`,color:filter===key?G:MUTED,borderRadius:20,padding:"6px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{key==="all"?"All":LABELS[key]}{key!=="all"&&status==="pending_approval"?` (${counts[key]||0})`:""}</button>)}
    </div>
    {items.some(i=>i.status==="pending_approval"&&(filter==="all"||i.action_type===filter))&&<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:10}}><span style={{fontSize:10,color:MUTED}}>{selectedQueueIds.length} selected</span><button disabled={!selectedQueueIds.length||busy==="batch"} onClick={()=>batchReview("approve")} style={{background:G_DIM,border:`1px solid ${G_BORDER}`,color:G,borderRadius:6,padding:"7px 10px",fontSize:10,fontWeight:900,cursor:"pointer"}}>Approve Selected</button><button disabled={!selectedQueueIds.length||busy==="batch"} onClick={()=>batchReview("reject")} style={{background:"transparent",border:`1px solid ${BORDER}`,color:MUTED,borderRadius:6,padding:"7px 10px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Reject Selected</button></div>}
    {loading?<div style={{padding:30,textAlign:"center",color:MUTED}}>Loading founder workspace…</div>:items.filter(i=>filter==="all"||i.action_type===filter).length===0?<div style={{background:SURFACE,border:`1px dashed ${BORDER}`,borderRadius:10,padding:30,textAlign:"center"}}><div style={{fontSize:13,color:TEXT,fontWeight:700}}>Nothing in this view yet</div><div style={{fontSize:11,color:MUTED,marginTop:5}}>New agent-generated drafts will appear here before any message is sent.</div></div>:<div style={{display:"flex",flexDirection:"column",gap:10}}>
      {items.filter(i=>filter==="all"||i.action_type===filter).map(item=><article key={item.id} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderLeft:`3px solid ${item.status==="pending_approval"?G:item.status==="failed"?"#EF4444":BORDER}`,borderRadius:9,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:9}}><div style={{display:"flex",gap:8,alignItems:"flex-start"}}>{item.status==="pending_approval"&&<input type="checkbox" checked={selectedQueueIds.includes(item.id)} onChange={e=>setSelectedQueueIds(p=>e.target.checked?(p.length<30?[...p,item.id]:p):p.filter(id=>id!==item.id))} aria-label="Select queue item" style={{marginTop:2}}/>}<div><div style={{fontSize:12,fontWeight:800,color:TEXT}}>{item.lead_name||item.lead_company||String(item.metadata?.company_name||item.metadata?.topic||"Unassigned item")}</div><div style={{fontSize:10,color:MUTED,marginTop:3}}>{LABELS[item.action_type]||item.action_type} · {item.agent_name} · {item.lead_phone||""}</div></div></div><span style={{fontSize:9,fontWeight:800,color:item.status==="pending_approval"?G:MUTED,background:item.status==="pending_approval"?G_DIM:SURFACE2,border:`1px solid ${item.status==="pending_approval"?G_BORDER:BORDER}`,borderRadius:20,padding:"5px 9px",height:"fit-content"}}>{item.status.replace("_"," ").toUpperCase()}</span></div>
        <textarea value={edits[item.id]??item.draft_content} onChange={e=>setEdits(p=>({...p,[item.id]:e.target.value}))} readOnly={item.status!=="pending_approval"} rows={Math.min(10,Math.max(3,Math.ceil((item.draft_content.length||100)/100)))} style={{...iStyle,width:"100%",lineHeight:1.65,resize:"vertical"}} />
        {item.reasoning&&<div style={{fontSize:10,color:MUTED,background:SURFACE2,padding:9,borderRadius:6,marginTop:8}}><b style={{color:G}}>AGENT REASONING</b><div style={{marginTop:4,lineHeight:1.6}}>{item.reasoning}</div></div>}
        {item.metadata?.buyer_psychology_observation&&<div style={{fontSize:10,color:TEXT,marginTop:8,lineHeight:1.6}}><b style={{color:G}}>BUYER PSYCHOLOGY OBSERVATION</b><div>{String(item.metadata.buyer_psychology_observation)}</div></div>}
        {item.metadata?.source_url&&<div style={{fontSize:10,marginTop:8}}><a href={String(item.metadata.source_url)} target="_blank" rel="noreferrer" style={{color:G,textDecoration:"underline"}}>Open primary source ↗</a>{item.metadata?.website&&<> · <a href={String(item.metadata.website)} target="_blank" rel="noreferrer" style={{color:G,textDecoration:"underline"}}>Company website ↗</a></>}</div>}
        {Array.isArray(item.metadata?.grounding_sources)&&item.metadata.grounding_sources.length>0&&<div style={{fontSize:9,color:MUTED,marginTop:8}}>GOOGLE-GROUNDED SOURCES: {(item.metadata.grounding_sources as any[]).slice(0,5).map((source:any,index:number)=><React.Fragment key={source.uri||index}>{index>0?" · ":""}<a href={source.uri} target="_blank" rel="noreferrer" style={{color:MUTED,textDecoration:"underline"}}>{source.title||"Source "+(index+1)}</a></React.Fragment>)}</div>}
        {typeof item.metadata?.search_entry_point==="string"&&<iframe title="Google Search grounding suggestions" sandbox="" srcDoc={String(item.metadata.search_entry_point)} style={{width:"100%",height:120,border:"1px solid "+BORDER,borderRadius:6,marginTop:8,background:"#fff"}} />}

        {item.status==="pending_approval"&&<div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:10}}><button disabled={busy===item.id} onClick={()=>review(item,"approve",edits[item.id])} style={{background:G,color:"#001014",border:"none",borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:900,cursor:"pointer"}}>{item.action_type==="new_lead"?"Approve & Create Lead":item.action_type==="linkedin_article"?"Approve for Manual Publishing":"Approve for Dispatch"}</button><button disabled={busy===item.id} onClick={()=>review(item,"reject")} style={{background:"transparent",color:"#FCA5A5",border:"1px solid rgba(239,68,68,.35)",borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Reject</button>{item.lead_id&&<button disabled={busy===item.id} onClick={()=>markDoNotContact(item)} style={{background:"transparent",color:"#FCA5A5",border:"1px solid rgba(239,68,68,.35)",borderRadius:6,padding:"8px 12px",fontSize:10,fontWeight:800,cursor:"pointer"}}>Mark Do Not Contact</button>}</div>}
      </article>)}
    </div>}
    {haltedAgents.length>0&&<section style={{marginTop:18,background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.35)",borderRadius:10,padding:14}}><div style={{fontSize:11,fontWeight:900,color:"#FCA5A5",marginBottom:8}}>Circuit breaker — agent halted</div>{haltedAgents.map(log=><div key={log.agent_name} style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",padding:"6px 0"}}><span style={{fontSize:10,color:TEXT}}>{log.agent_name}: {log.summary}</span><button disabled={busy===log.agent_name} onClick={()=>resetCircuitBreaker(log.agent_name)} style={{background:"transparent",border:"1px solid rgba(239,68,68,.4)",color:"#FCA5A5",borderRadius:6,padding:"6px 9px",fontSize:9,fontWeight:800,cursor:"pointer"}}>Reset circuit breaker</button></div>)}</section>}
    {phoneSuppressions.length>0&&<section style={{marginTop:18,background:SURFACE,border:"1px solid "+BORDER,borderRadius:10,padding:14}}><div style={{fontSize:11,fontWeight:900,color:"#FCA5A5",marginBottom:8}}>Unmatched phone suppressions ({phoneSuppressions.length})</div>{phoneSuppressions.map(entry=><div key={entry.phone} style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",padding:"7px 0",borderBottom:"1px solid "+BORDER}}><div><div style={{fontSize:10,color:TEXT,fontWeight:700}}>+{entry.phone}</div><div style={{fontSize:9,color:MUTED}}>{entry.reason} · {entry.source}</div></div><button disabled={busy===entry.phone} onClick={()=>removePhoneSuppression(entry.phone)} style={{background:"transparent",border:"1px solid rgba(239,68,68,.35)",color:"#FCA5A5",borderRadius:6,padding:"6px 9px",fontSize:9,fontWeight:800,cursor:"pointer"}}>Remove suppression</button></div>)}</section>}
    {contactControls.length>0&&<section style={{marginTop:18,background:SURFACE,border:"1px solid "+BORDER,borderRadius:10,padding:14}}><div style={{fontSize:11,fontWeight:900,color:"#FCA5A5",marginBottom:8}}>Do Not Contact list ({contactControls.length})</div>{contactControls.map(control=><div key={control.lead_id} style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",padding:"7px 0",borderBottom:"1px solid "+BORDER}}><div><div style={{fontSize:10,color:TEXT,fontWeight:700}}>{control.lead_company||control.lead_name||control.lead_id}</div><div style={{fontSize:9,color:MUTED}}>{control.reason} · {control.source}</div></div><button disabled={busy===control.lead_id} onClick={()=>removeDoNotContact(control.lead_id)} style={{background:"transparent",border:"1px solid rgba(239,68,68,.35)",color:"#FCA5A5",borderRadius:6,padding:"6px 9px",fontSize:9,fontWeight:800,cursor:"pointer"}}>Remove DNC</button></div>)}</section>}
    <section style={{marginTop:20,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,padding:14}}><div style={{fontSize:11,fontWeight:800,color:TEXT,marginBottom:8}}>Agent activity</div>{logs.length===0?<div style={{fontSize:10,color:MUTED}}>No agent runs recorded yet.</div>:logs.slice(0,8).map(log=><div key={log.id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"7px 0",borderBottom:`1px solid ${BORDER}`,fontSize:10}}><span style={{color:TEXT}}>{log.agent_name} · {log.summary}</span><span style={{color:log.status==="error"||log.status==="halted_circuit_breaker"?"#FCA5A5":MUTED,whiteSpace:"nowrap"}}>{new Date(log.created_at).toLocaleString()}</span></div>)}</section>
  </div>;
}
