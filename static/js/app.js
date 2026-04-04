const { useState, useEffect, useRef, useCallback } = React;
const {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} = Recharts;

/* ─── THEME ─── */
const DARK = {
  bg:"#06090f",surface:"#0c1220",card:"#111a2e",
  border:"#1a2744",borderLight:"#243352",
  accent:"#00e5a0",accentDim:"#00e5a022",
  blue:"#3391ff",blueDim:"#3391ff20",
  orange:"#ff8c42",orangeDim:"#ff8c4220",
  red:"#ff4757",redDim:"#ff475720",
  purple:"#a855f7",purpleDim:"#a855f720",
  cyan:"#06d6a0",
  text:"#e8edf5",textSec:"#7a8baa",textMuted:"#4a5878",
  gradient1:"linear-gradient(135deg, #00e5a0, #3391ff)",
};
const LIGHT = {
  bg:"#f0f4f9",surface:"#ffffff",card:"#ffffff",
  border:"#dce3ef",borderLight:"#e8edf8",
  accent:"#00a370",accentDim:"#00a37018",
  blue:"#2070e0",blueDim:"#2070e018",
  orange:"#d96f20",orangeDim:"#d96f2018",
  red:"#d93040",redDim:"#d9304018",
  purple:"#7c3acd",purpleDim:"#7c3acd18",
  cyan:"#059e74",
  text:"#1a2235",textSec:"#445068",textMuted:"#7a8baa",
  gradient1:"linear-gradient(135deg, #00a370, #2070e0)",
};
/* Mutable theme reference — mutated by the dark-mode toggle */
const T = { ...DARK };

/* ─── API HELPER ─── */
const api = {
  token: null,
  async call(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    try {
      const res = await fetch(`/api${path}`, { ...opts, headers });
      if (res.status === 401) {
        // Token expired or invalid — broadcast so the app can auto-logout
        window.dispatchEvent(new CustomEvent("session-expired"));
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`API ${path}:`, e.message);
      return null;
    }
  },
  // Auth-specific post: always reads JSON body even on error, so server messages surface
  async authPost(path, body) {
    try {
      const res = await fetch(`/api${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await res.json();
    } catch (e) {
      return { error: "Server unreachable — make sure the backend is running." };
    }
  },
  get: (p) => api.call(p),
  post: (p, b) => api.call(p, { method: "POST", body: JSON.stringify(b) }),
  put: (p, b) => api.call(p, { method: "PUT", body: b ? JSON.stringify(b) : undefined }),
  del: (p) => api.call(p, { method: "DELETE" }),
};

/* ─── SOUND ALERTS (Web Audio API) ─── */
let _audioCtx = null;
function playAlertBeep(isHighSeverity) {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    // High severity = two short high beeps; medium/info = one low beep
    const freq = isHighSeverity ? 880 : 520;
    const dur  = isHighSeverity ? 0.12 : 0.18;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, _audioCtx.currentTime);
    gain.gain.setValueAtTime(0.25, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + dur);
    osc.start(_audioCtx.currentTime);
    osc.stop(_audioCtx.currentTime + dur);
    if (isHighSeverity) {
      // second beep
      const osc2 = _audioCtx.createOscillator();
      const gain2 = _audioCtx.createGain();
      osc2.connect(gain2); gain2.connect(_audioCtx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq, _audioCtx.currentTime + dur + 0.06);
      gain2.gain.setValueAtTime(0.25, _audioCtx.currentTime + dur + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + dur*2 + 0.06);
      osc2.start(_audioCtx.currentTime + dur + 0.06);
      osc2.stop(_audioCtx.currentTime + dur*2 + 0.06);
    }
  } catch(e) { /* AudioContext unavailable */ }
}

/* ─── FALLBACK DATA ─── */
const genPowerHistory = () => Array.from({ length: 24 }, (_, i) => {
  const base = i >= 6 && i <= 22 ? 1.5 : 0.5;
  const peak = (i >= 9 && i <= 11) || (i >= 18 && i <= 21) ? 2.0 : 0;
  return { hour: `${String(i).padStart(2,"0")}:00`, kw: +(base + peak + Math.random()*0.6).toFixed(2) };
});
const genWeekly = () => ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>({day:d,kwh:+(8+Math.random()*12).toFixed(1),cost:+(50+Math.random()*80).toFixed(0)}));
const genBandwidth = () => Array.from({length:24},(_,i)=>({hour:`${String(i).padStart(2,"0")}:00`,down:+(Math.random()*35+5).toFixed(1),up:+(Math.random()*8+1).toFixed(1)}));

const INIT_APPLIANCES = [
  {id:1,name:"Split AC — Bedroom",icon:"❄️",watts:1480,room:"Bedroom",on:true},
  {id:2,name:"Refrigerator",icon:"🧊",watts:185,room:"Kitchen",on:true},
  {id:3,name:"Washing Machine",icon:"👔",watts:520,room:"Bathroom",on:false},
  {id:4,name:"Geyser",icon:"🔥",watts:2000,room:"Bathroom",on:true},
  {id:5,name:"LED TV 55″",icon:"📺",watts:120,room:"Living Room",on:true},
  {id:6,name:"Ceiling Fans (×4)",icon:"💨",watts:300,room:"All Rooms",on:true},
  {id:7,name:"Tube Lights (×6)",icon:"💡",watts:216,room:"All Rooms",on:true},
  {id:8,name:"Wi-Fi Router",icon:"📡",watts:12,room:"Living Room",on:true},
  {id:9,name:"Laptop Charger",icon:"💻",watts:65,room:"Bedroom",on:true},
  {id:10,name:"Mixer Grinder",icon:"🍹",watts:750,room:"Kitchen",on:false},
];
const INIT_DEVICES = [
  {id:1,name:"Arishem's iPhone",ip:"192.168.1.4",mac:"A4:B1:C2:3D:E5:F6",type:"phone",bw:2.4,online:true,wl:true,blocked:false},
  {id:2,name:"Dad's Laptop",ip:"192.168.1.7",mac:"F6:G7:H8:I9:J0:K1",type:"laptop",bw:5.8,online:true,wl:true,blocked:false},
  {id:3,name:"Smart TV",ip:"192.168.1.10",mac:"K1:L2:M3:N4:O5:P6",type:"tv",bw:14.2,online:true,wl:true,blocked:false},
  {id:4,name:"Mom's Phone",ip:"192.168.1.12",mac:"P6:Q7:R8:S9:T0:U1",type:"phone",bw:1.3,online:true,wl:true,blocked:false},
  {id:5,name:"PS5",ip:"192.168.1.15",mac:"U1:V2:W3:X4:Y5:Z6",type:"gaming",bw:0,online:false,wl:true,blocked:false},
  {id:6,name:"Unknown Device",ip:"192.168.1.22",mac:"Z6:A7:B8:C9:D0:E1",type:"unknown",bw:0.8,online:true,wl:false,blocked:false},
];
const INIT_CAMERAS = [
  {id:1,name:"Front Door",location:"Main Entrance",status:"active",motionEvents:14},
  {id:2,name:"Backyard",location:"Garden Area",status:"active",motionEvents:6},
  {id:3,name:"Garage",location:"Parking",status:"active",motionEvents:3},
  {id:4,name:"Living Room",location:"Indoor",status:"offline",motionEvents:0},
];

const MOTION_TYPES = [
  {type:"Person",severity:"high",img:"👤"},{type:"Motion",severity:"medium",img:"🔵"},
  {type:"Animal",severity:"low",img:"🐈"},{type:"Delivery",severity:"medium",img:"📦"},
  {type:"Vehicle",severity:"low",img:"🚗"},
];

/* ─── COMPONENTS ─── */
function Card({children,style,glow,onClick,className}){
  const base="card"+(className?" "+className:"");
  return React.createElement("div",{
    onClick,className:base,
    style:{
      ...(glow&&{borderColor:T.accent+"66",boxShadow:`0 0 28px ${T.accent}14`}),
      ...(onClick&&{cursor:"pointer"}),
      ...style
    }
  },children);
}
function Stat({label,value,unit,icon,color=T.accent,trend,sub}){
  const h=React.createElement;
  return h("div",{className:"stat-card","data-tooltip":label},
    h("div",{style:{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:color+"0a",pointerEvents:"none"}}),
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",position:"relative"}},
      h("div",null,
        h("div",{className:"section-title",style:{marginBottom:10}},label),
        h("div",{style:{display:"flex",alignItems:"baseline",gap:5}},
          h("span",{style:{fontSize:30,fontWeight:700,color,fontFamily:"'IBM Plex Mono',monospace",lineHeight:1}},value),
          unit&&h("span",{style:{fontSize:13,color:"var(--text-muted)",fontWeight:500}},unit)
        ),
        trend&&h("div",{style:{fontSize:11,marginTop:8,color:trend.good?T.accent:T.red,fontWeight:600}},trend.text),
        sub&&h("div",{style:{fontSize:11,marginTop:4,color:"var(--text-muted)"}},sub)
      ),
      h("div",{style:{fontSize:26,width:46,height:46,borderRadius:12,background:color+"14",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},icon)
    )
  );
}
function Badge({text,color}){
  // Map runtime colour values to CSS badge classes where possible
  const colorMap={
    [T.red]:"badge-danger",[T.orange]:"badge-warn",[T.accent]:"badge-teal",
    [T.blue]:"badge-blue",[T.purple]:"badge-blue",[T.cyan]:"badge-teal",
    "#ff4757":"badge-danger","#ff8c42":"badge-warn","#00e5a0":"badge-teal","#3391ff":"badge-blue",
    [T.green??"#22c55e"]:"badge-success","#22c55e":"badge-success",
  };
  const cls=colorMap[color];
  if(cls) return React.createElement("span",{className:"badge "+cls},text);
  // Fallback: inline colour for custom values
  return React.createElement("span",{className:"badge",style:{background:color+"22",color}},text);
}
function Toggle({on,onToggle,disabled}){
  return React.createElement("button",{
    onClick:disabled?undefined:onToggle,
    className:"toggle"+(on?" on":""),
    style:{opacity:disabled?.45:1,cursor:disabled?"not-allowed":"pointer"},
    "aria-label":on?"Turn off":"Turn on"
  });
}
function ProgressBar({value,max,color}){
  const pct=Math.min((value/max)*100,100);
  return React.createElement("div",{style:{height:5,background:T.border,borderRadius:3,overflow:"hidden",marginTop:4}},
    React.createElement("div",{style:{height:"100%",width:pct+"%",background:color,borderRadius:3,transition:"width .5s"}})
  );
}
function TabBtn({active,icon,label,count,onClick,tooltip}){
  return React.createElement("button",{
    "data-tooltip":tooltip,onClick,
    style:{
      padding:"9px 15px",borderRadius:10,border:"none",
      background:active?"var(--teal-glow)":"transparent",
      color:active?"var(--teal)":"var(--text-muted)",
      fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",
      gap:7,whiteSpace:"nowrap",transition:"var(--transition)",fontFamily:"'DM Sans',sans-serif",
      boxShadow:active?"inset 0 0 0 1px var(--teal-glow)":"none",
    }},
    icon," ",label,
    count!=null&&count>0&&React.createElement("span",{
      style:{background:"var(--danger)",color:"#fff",fontSize:9,padding:"2px 6px",borderRadius:10,fontWeight:700}
    },count)
  );
}
function Toast({toasts,onDismiss}){
  const h=React.createElement;
  return h("div",{style:{
    position:"fixed",top:72,left:"50%",transform:"translateX(-50%)",
    zIndex:9998,display:"flex",flexDirection:"column",gap:8,
    alignItems:"center",pointerEvents:"none",width:"max-content",maxWidth:400,
  }},
    toasts.map(t=>h("div",{key:t.id,
      style:{
        pointerEvents:"all",position:"relative",overflow:"hidden",
        display:"flex",alignItems:"center",gap:12,
        padding:"12px 16px",minWidth:290,
        background:"var(--bg-card)",
        backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
        border:"1px solid var(--border)",
        borderLeft:`3px solid ${t.color||"var(--teal)"}`,
        borderRadius:"var(--radius-sm)",
        boxShadow:"0 8px 32px rgba(0,0,0,0.22)",
        animation:"toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
      }
    },
      h("span",{style:{fontSize:18,flexShrink:0}},t.icon),
      h("div",{style:{flex:1,minWidth:0}},
        h("div",{style:{fontSize:12,fontWeight:700,color:t.color||"var(--teal)"}},t.title),
        h("div",{style:{fontSize:11,color:"var(--text-muted)",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},t.msg)
      ),
      h("button",{onClick:()=>onDismiss(t.id),style:{
        background:"none",border:"none",color:"var(--text-dim)",
        fontSize:17,cursor:"pointer",padding:"0 2px",lineHeight:1,flexShrink:0
      }},"\xD7"),
      /* Progress countdown bar */
      h("div",{style:{
        position:"absolute",bottom:0,left:0,height:2,
        background:t.color||"var(--teal)",opacity:.7,
        animation:"shrink 3.5s linear forwards",
      }})
    ))
  );
}

/* PDF REPORT TEMPLATE */
function ReportTemplate({user, appliances, devices, cameras, alerts, powerData}){
  const h = React.createElement;
  const apps = appliances || [];
  const devs = devices || [];
  const cams = cameras || [];
  const alts = alerts || [];
  
  const totalWatts = apps.filter(a=>a && a.on).reduce((s,a)=>s+(a.watts||0), 0);
  const activeCams = cams.filter(c=>c && c.status==="active").length;
  const onlineDevs = devs.filter(d=>d && d.online).length;

  return h("div", {id: "pdf-report-template", style: {
    padding: "20mm", width: "210mm", height: "auto", minHeight: "297mm", 
    background: "#fff", color: "#111", fontFamily: "'DM Sans', sans-serif",
    display: "block", boxSizing: "border-box"
  }},
    h("div", {style: {display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #00e5a0", paddingBottom: "20px", marginBottom: "30px"}},
      h("div", null,
        h("h1", {style: {margin: 0, color: "#00e5a0", fontSize: "28px"}}, "GrihaNet"),
        h("p", {style: {margin: 0, color: "#666", fontSize: "14px"}}, "Unified Smart Home Monitoring")
      ),
      h("div", {style: {textAlign: "right"}},
        h("h2", {style: {margin: 0, fontSize: "18px"}}, "System Usage Report"),
        h("p", {style: {margin: 0, color: "#666", fontSize: "12px"}}, new Date().toLocaleString())
      )
    ),
    h("div", {style: {display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "30px"}},
      h("div", {style: {padding: "15px", border: "1px solid #eee", borderRadius: "10px"}},
        h("h3", {style: {margin: "0 0 10px 0", fontSize: "14px", color: "#00e5a0"}}, "User Profile"),
        h("p", {style: {margin: "5px 0", fontSize: "13px"}}, h("strong", null, "Name: "), user?.name || "Guest"),
        h("p", {style: {margin: "5px 0", fontSize: "13px"}}, h("strong", null, "Email: "), user?.email || "N/A"),
        h("p", {style: {margin: "5px 0", fontSize: "13px"}}, h("strong", null, "Role: "), user?.role || "user")
      ),
      h("div", {style: {padding: "15px", border: "1px solid #eee", borderRadius: "10px"}},
        h("h3", {style: {margin: "0 0 10px 0", fontSize: "14px", color: "#00e5a0"}}, "System Health"),
        h("p", {style: {margin: "5px 0", fontSize: "13px"}}, "Power Consumption: ", (totalWatts/1000).toFixed(2), " kW"),
        h("p", {style: {margin: "5px 0", fontSize: "13px"}}, "Active Cameras: ", activeCams, " / ", cameras.length),
        h("p", {style: {margin: "5px 0", fontSize: "13px"}}, "Devices Online: ", onlineDevs, " / ", devices.length)
      )
    ),
    h("h3", {style: {borderBottom: "1px solid #eee", paddingBottom: "5px", fontSize: "16px"}}, "Recent Activity"),
    h("table", {style: {width: "100%", borderCollapse: "collapse", marginTop: "10px"}},
      h("thead", null, 
        h("tr", {style: {background: "#f9f9f9", textAlign: "left"}},
          ["Time", "Module", "Message"].map(t=>h("th", {key: t, style: {padding: "10px", fontSize: "12px", border: "1px solid #eee"}}, t))
        )
      ),
      h("tbody", null,
        alerts.slice(0, 10).map((a, i)=>h("tr", {key: i},
          [a.time, a.module, a.msg].map(v=>h("td", {key: v, style: {padding: "10px", fontSize: "11px", border: "1px solid #eee"}}, v))
        ))
      )
    ),
    h("div", {style: {marginTop: "40px", paddingTop: "20px", borderTop: "1px solid #eee", textAlign: "center", fontSize: "11px", color: "#999"}},
      "This document is an automatically generated system snapshot from GrihaNet v1.0 • VIT Vellore © 2026"
    )
  );
}

/* 👩‍💻 RAW LOGS TERMINAL WIDGET */
function TerminalWidget() {
  const h = React.createElement;
  const [logs, setLogs] = useState([]);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const topics = [
      "sensor/front_door/motion", "system/heartbeat", "camera/backyard/status",
      "power/meter/main", "network/router/bandwidth", "sensor/garage/pir",
      "camera/living_room/status", "power/geyser/watts",
    ];

    const makePayload = (t) => {
      if (t.includes("power") || t.includes("watts")) return `{"watts":${Math.floor(Math.random()*2000+200)}}`;
      if (t.includes("motion") || t.includes("pir"))  return `{"motion":${Math.random()>0.4}}`;
      if (t.includes("network"))                        return `{"ping":${Math.floor(Math.random()*30+5)},"mbps":${(Math.random()*120+20).toFixed(1)}}`;
      if (t.includes("camera"))                         return `{"active":${Math.random()>0.2}}`;
      return `{"status":"ok"}`;
    };

    // Seed 12 back-dated logs so the terminal looks alive from first render
    const now = Date.now();
    const initLogs = Array.from({length: 12}, (_, i) => {
      const t = topics[Math.floor(Math.random()*topics.length)];
      return `[${new Date(now-(12-i)*1200).toISOString()}] MQTT: recv topic '${t}' payload=${makePayload(t)}`;
    });
    setLogs(initLogs);

    // Recursive setTimeout gives each tick an independent random delay
    let timer;
    const tick = () => {
      const t = topics[Math.floor(Math.random()*topics.length)];
      const newLog = `[${new Date().toISOString()}] MQTT: recv topic '${t}' payload=${makePayload(t)}`;
      setLogs(l => [...l, newLog].slice(-60));
      timer = setTimeout(tick, 700 + Math.random()*1400);
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll to bottom whenever logs update — use scrollTop (more reliable in fixed-height containers than scrollIntoView)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return h("div", {style: {marginTop: 24, background: "#06090f", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden"}},
    h("div", {style: {background: T.surface, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`}},
      h("span", {style: {fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: T.textMuted, fontWeight: 600}}, "Terminal / Raw MQTT Logs"),
      h("div", {style: {display: "flex", gap: 6}},
        ["#ff5f56", "#ffbd2e", "#27c93f"].map(c => h("div", {key: c, style: {width: 10, height: 10, borderRadius: "50%", background: c}}))
      )
    ),
    h("div", {ref: containerRef, style: {padding: "12px 16px", height: 260, overflowY: "auto", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.accent, lineHeight: 1.6}},
      logs.map((l, i) => h("div", {key: i, style: {whiteSpace: "pre-wrap", wordBreak: "break-all", opacity: i === logs.length - 1 ? 1 : 0.7, marginBottom: 4}}, l)),
      h("div", {ref: bottomRef})
    )
  );
}


/* Camera Feed */
function CamFeed({cam,onToggle,onDelete}){
  const h=React.createElement;
  const isOn=cam.status==="active";
  const [tick,setTick]=useState(0);
  useEffect(()=>{if(!isOn)return;const i=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(i);},[isOn]);

  return h("div",{style:{
    background:"var(--bg-card)",border:"1px solid var(--border)",
    borderRadius:"var(--radius)",overflow:"hidden",
    transition:"var(--transition)",
  }},
    /* Viewport — true 16/9 */
    h("div",{style:{
      position:"relative",paddingTop:"56.25%",
      background:isOn
        ?`linear-gradient(${120+tick%60}deg,#060d1a,#0d1a2e,#081422)`
        :"#0c0c0c",
      filter:isOn?"none":"grayscale(0.8) brightness(0.5)",
      overflow:"hidden",
    }},
      /* Active camera content */
      isOn&&h(React.Fragment,null,
        /* Scan line */
        h("div",{className:"cam-scan",style:{
          position:"absolute",left:0,right:0,height:"1px",zIndex:2,
          background:"linear-gradient(90deg,transparent,rgba(0,229,160,0.5),transparent)",
          boxShadow:"0 0 8px rgba(0,229,160,0.3)",
        }}),
        /* REC badge top-left */
        h("div",{style:{position:"absolute",top:10,left:12,display:"flex",alignItems:"center",gap:5,zIndex:3}},
          h("div",{style:{width:6,height:6,borderRadius:"50%",background:"var(--danger)",animation:"pulse 1.5s infinite"}}),
          h("span",{style:{fontSize:9,color:"var(--danger)",fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,letterSpacing:1}},"REC")
        ),
        /* Status badge top-right */
        h("span",{className:"badge badge-teal",style:{position:"absolute",top:10,right:10,zIndex:3,fontSize:8,padding:"2px 7px"}},"ACTIVE"),
        /* Timestamp top-right below badge */
        h("div",{style:{position:"absolute",top:30,right:10,fontSize:8,color:"rgba(255,255,255,0.35)",fontFamily:"'IBM Plex Mono',monospace",zIndex:3}},new Date().toLocaleTimeString()),
        /* Center icon */
        h("div",{style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:1}},
          h("div",{style:{textAlign:"center",opacity:.25}},
            h("div",{style:{fontSize:36}},"📹"),
            h("div",{style:{fontSize:8,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:3,marginTop:4}},"LIVE FEED")
          )
        ),
        /* Camera ID bottom-left */
        h("div",{style:{position:"absolute",bottom:8,left:10,fontSize:8,color:"rgba(255,255,255,0.3)",fontFamily:"'IBM Plex Mono',monospace",zIndex:3}},"CAM-0"+cam.id+" • "+cam.location)
      ),
      /* Offline overlay */
      !isOn&&h("div",{style:{
        position:"absolute",inset:0,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",gap:8,
        background:"rgba(0,0,0,0.5)",zIndex:2
      }},
        /* Status badge top-right even when offline */
        h("span",{className:"badge badge-danger",style:{position:"absolute",top:10,right:10,fontSize:8,padding:"2px 7px"}},"OFFLINE"),
        h("div",{style:{fontSize:32,opacity:.3}},"📷"),
        h("div",{style:{fontSize:9,letterSpacing:3,color:"var(--text-dim)",fontFamily:"'IBM Plex Mono',monospace"}},"CAMERA OFFLINE")
      )
    ),
    /* Footer row */
    h("div",{style:{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid var(--border)"}},
      h("div",null,
        h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text)"}},cam.name),
        h("div",{style:{fontSize:10,color:"var(--text-dim)",marginTop:1,fontFamily:"'IBM Plex Mono',monospace"}},cam.location+" • "+cam.motionEvents+" events")
      ),
      h("div",{style:{display:"flex",gap:8,alignItems:"center"}},
        h(Toggle,{on:isOn,onToggle:()=>onToggle(cam.id)}),
        onDelete&&h("button",{"data-tooltip":"Remove this camera",onClick:()=>onDelete(cam),
          style:{background:"transparent",border:"1px solid rgba(239,68,68,0.3)",color:"var(--danger)",
            width:28,height:28,borderRadius:6,cursor:"pointer",fontSize:13,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
            transition:"var(--transition)"},
          onMouseEnter:e=>e.currentTarget.style.background="rgba(239,68,68,0.1)",
          onMouseLeave:e=>e.currentTarget.style.background="transparent"
        },"🗑️")
      )
    )
  );
}

/* Speed Test */
function SpeedTest(){
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState(0);
  const [result,setResult]=useState(null);
  const h=React.createElement;

  const runTest=async()=>{
    setRunning(true);setProgress(0);setResult(null);
    let p=0;
    const iv=setInterval(()=>{p+=Math.random()*15+5;if(p>=100){p=100;clearInterval(iv);}setProgress(Math.min(p,100));},200);
    const data=await api.post("/network/speedtest");
    clearInterval(iv);setProgress(100);
    setTimeout(()=>{setResult(data||{download:75.2,upload:38.1,ping:12});setRunning(false);},400);
  };

  /* Speed quality helpers */
  const dlColor=(v)=>v>=50?"var(--success)":v>=20?"var(--warn)":"var(--danger)";
  const ulColor=(v)=>v>=20?"var(--success)":v>=10?"var(--warn)":"var(--danger)";
  const pingColor=(v)=>v<=20?"var(--success)":v<=60?"var(--warn)":"var(--danger)";

  const metrics=[
    {label:"Download",unit:"Mbps",icon:"⬇️",valKey:"download",colorFn:dlColor},
    {label:"Upload",unit:"Mbps",icon:"⬆️",valKey:"upload",colorFn:ulColor},
    {label:"Ping",unit:"ms",icon:"📡",valKey:"ping",colorFn:pingColor},
  ];

  return h(Card,{className:"fadeUp d5",style:{marginTop:14}},
    h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
      h("div",null,
        h("div",{style:{fontSize:14,fontWeight:700}},"🚀 Speed Test"),
        h("div",{style:{fontSize:11,color:"var(--text-dim)",marginTop:2}},result?"Last result · tap Re-run to refresh":"Test your connection speed")
      ),
      h("button",{onClick:runTest,disabled:running,className:"btn "+(running?"btn-ghost":"btn-primary"),style:{fontSize:12}},
        running?"Testing…":result?"Re-run":"Run Test")
    ),

    /* Progress bar while running */
    running&&h("div",{style:{marginBottom:16}},
      h("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
        h("span",{style:{fontSize:11,color:"var(--text-muted)"}},"Testing connection…"),
        h("span",{style:{fontSize:11,color:"var(--teal)",fontFamily:"'IBM Plex Mono'"}},""+progress.toFixed(0)+"%")
      ),
      h("div",{style:{height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}},
        h("div",{style:{height:"100%",width:progress+"%",background:"linear-gradient(90deg,var(--teal),var(--blue))",borderRadius:3,transition:"width .18s ease"}})
      )
    ),

    /* Metric cards — idle / running / done */
    h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}},
      metrics.map((m,i)=>{
        const val=result?result[m.valKey]:null;
        const color=val!=null?m.colorFn(val):"var(--text-dim)";
        return h("div",{key:i,style:{
          textAlign:"center",padding:"16px 8px",borderRadius:"var(--radius-sm)",
          background:val!=null?color+"12":"var(--bg-input)",
          border:`1px solid ${val!=null?color+"30":"var(--border)"}`,
          transition:"all .3s ease",
        }},
          h("div",{style:{fontSize:18,marginBottom:6}},m.icon),
          running
            /* Spinner */
            ? h("div",{style:{
                width:28,height:28,border:"3px solid var(--border)",
                borderTop:`3px solid var(--teal)`,
                borderRadius:"50%",margin:"6px auto",
                animation:"spin .7s linear infinite"
              }})
            : h("div",{style:{
                fontSize:val!=null?26:20,fontWeight:700,
                fontFamily:"'IBM Plex Mono',monospace",
                color,lineHeight:1,minHeight:32,
                display:"flex",alignItems:"center",justifyContent:"center"
              }},val!=null?val:"—"),
          h("div",{style:{fontSize:9,color:"var(--text-dim)",marginTop:4,letterSpacing:.5,textTransform:"uppercase"}},m.unit),
          h("div",{style:{fontSize:10,color:"var(--text-muted)",marginTop:2,fontWeight:600}},m.label)
        );
      })
    )
  );
}

/* ─── AUTH SCREEN (Login + Register) ─── */
function AuthScreen({onLogin}){
  const [mode,setMode]=useState("login");  // "login" | "register"
  // Login fields
  const [email,setEmail]=useState("admin@grihanet.com");
  const [pass,setPass]=useState("password123");
  // Register fields
  const [rName,setRName]=useState("");
  const [rEmail,setREmail]=useState("");
  const [rPass,setRPass]=useState("");
  const [rConf,setRConf]=useState("");

  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  const inp=(val,set,type="text",ph="")=>React.createElement("input",{
    type,placeholder:ph,value:val,
    onChange:e=>{set(e.target.value);setError("");},
    style:{width:"100%",padding:"12px 16px",borderRadius:10,
      border:"1px solid var(--border)",background:"var(--bg-card)",
      color:"var(--text)",fontSize:14,fontFamily:"'DM Sans'",outline:"none",
      marginBottom:12},
  });

  const handleLogin=async()=>{
    if(!email||!pass){setError("Please fill all fields");return;}
    setLoading(true);setError("");
    try{
      const res=await api.authPost("/auth/login",{email,password:pass});
      if(res&&res.token){api.token=res.token;onLogin(res.user);}
      else setError(res?.error||"Login failed — check credentials.");
    }finally{setLoading(false);}
  };

  const handleRegister=async()=>{
    if(!rName||!rEmail||!rPass||!rConf){setError("Please fill all fields");return;}
    if(rPass.length<6){setError("Password must be at least 6 characters");return;}
    if(rPass!==rConf){setError("Passwords do not match");return;}
    setLoading(true);setError("");
    try{
      const res=await api.authPost("/auth/register",{
        name:rName,email:rEmail,password:rPass,confirm_password:rConf,
      });
      if(res&&res.token){api.token=res.token;onLogin(res.user);}
      else setError(res?.error||"Registration failed. Please try again.");
    }finally{setLoading(false);}
  };

  const isLogin=mode==="login";
  const h=React.createElement;

  return h("div",{style:{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans'"}},
    h("div",{style:{position:"absolute",inset:0,background:`radial-gradient(circle at 30% 40%,${T.accent}08 0%,transparent 50%),radial-gradient(circle at 70% 70%,${T.blue}06 0%,transparent 50%)`}}),
    h("div",{className:"fadeUp",style:{width:400,position:"relative",zIndex:1}},
      h("div",{style:{textAlign:"center",marginBottom:28}},
        h("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:60,height:60,borderRadius:18,background:T.gradient1,fontSize:28,marginBottom:14,boxShadow:`0 8px 32px ${T.accent}33`}},"🏠"),
        h("h1",{style:{fontSize:26,fontWeight:700,color:"var(--text)",margin:0}},"Griha",h("span",{style:{color:"var(--teal)"}},"Net")),
        h("p",{style:{color:"var(--text-muted)",fontSize:13,marginTop:5}},"Unified Smart Home Monitoring System")
      ),
      // Tab switcher
      h("div",{style:{display:"flex",background:"var(--bg-card)",borderRadius:12,padding:4,marginBottom:20,border:"1px solid var(--border)"}},
        ["login","register"].map(m=>
          h("button",{key:m,onClick:()=>{setMode(m);setError("");},
            style:{flex:1,padding:"10px 0",borderRadius:9,border:"none",
              background:mode===m?T.gradient1:"transparent",
              color:mode===m?"#000":T.textSec,
              fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'",
              transition:"all .2s"}},
            m==="login"?"Sign In":"Create Account")
        )
      ),
      h(Card,{style:{padding:24}},
        // ── LOGIN FORM ──
        isLogin&&h(React.Fragment,null,
          h("label",{style:{fontSize:12,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"Email"),
          inp(email,setEmail,"email"),
          h("label",{style:{fontSize:12,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"Password"),
          inp(pass,setPass,"password"),
          error&&h("div",{style:{fontSize:12,color:"var(--danger)",marginBottom:10,padding:"6px 10px",borderRadius:6,background:"rgba(239,68,68,0.12)"}},error),
          h("button",{onClick:handleLogin,disabled:loading,
            style:{width:"100%",padding:"13px 0",borderRadius:10,border:"none",
              background:loading?T.border:T.gradient1,color:loading?T.textMuted:"#000",
              fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",
              fontFamily:"'DM Sans'",boxShadow:loading?"none":`0 4px 20px ${T.accent}33`,marginTop:4}},
            loading?"Signing in...":"Sign In"),
          h("p",{style:{textAlign:"center",fontSize:11,color:"var(--text-muted)",marginTop:12}},"Demo: admin@grihanet.com / password123")
        ),
        // ── REGISTER FORM ──
        !isLogin&&h(React.Fragment,null,
          h("label",{style:{fontSize:12,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"Full Name"),
          inp(rName,setRName,"text","e.g. Priya Sharma"),
          h("label",{style:{fontSize:12,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"Email"),
          inp(rEmail,setREmail,"email","you@example.com"),
          h("label",{style:{fontSize:12,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"Password"),
          inp(rPass,setRPass,"password","Min. 6 characters"),
          h("label",{style:{fontSize:12,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"Confirm Password"),
          inp(rConf,setRConf,"password","Repeat your password"),
          error&&h("div",{style:{fontSize:12,color:"var(--danger)",marginBottom:10,padding:"6px 10px",borderRadius:6,background:"rgba(239,68,68,0.12)"}},error),
          h("button",{onClick:handleRegister,disabled:loading,
            style:{width:"100%",padding:"13px 0",borderRadius:10,border:"none",
              background:loading?T.border:T.gradient1,color:loading?T.textMuted:"#000",
              fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",
              fontFamily:"'DM Sans'",boxShadow:loading?"none":`0 4px 20px ${T.accent}33`,marginTop:4}},
            loading?"Creating account...":"Create Account"),
          h("p",{style:{textAlign:"center",fontSize:11,color:"var(--text-muted)",marginTop:12}},"Your data is isolated — each account gets its own home 🏠")
        )
      )
    )
  );
}

/* ─── AUTOMATION MODAL ─── */
function AutomationModal({appliances,onClose,onCreate}){
  const [step,setStep]=useState(1);
  const [trigType,setTrigType]=useState("power_exceeds");
  const [trigParams,setTrigParams]=useState({kw:"5",event:"Person",time:"23:00",appliance_id:"1",hours:"2"});
  const [actType,setActType]=useState("create_alert");
  const [actParams,setActParams]=useState({appliance_id:"1",message:"⚡ Alert from automation",module:"Power",type:"warning"});
  const [ruleName,setRuleName]=useState("");
  const [saving,setSaving]=useState(false);
  const h=React.createElement;

  const sel=(val,onChange,opts)=>h("select",{value:val,onChange:e=>onChange(e.target.value),
    style:{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid var(--border)",
      background:"var(--bg-card)",color:"var(--text)",fontSize:13,fontFamily:"'DM Sans'",marginBottom:12}},
    opts.map(([v,l])=>h("option",{key:v,value:v},l))
  );
  const inp2=(val,onChange,ph="",type="text")=>h("input",{type,placeholder:ph,value:val,
    onChange:e=>onChange(e.target.value),
    style:{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid var(--border)",
      background:"var(--bg-card)",color:"var(--text)",fontSize:13,fontFamily:"'DM Sans'",marginBottom:12}});

  const overlay={position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",
    alignItems:"center",justifyContent:"center",zIndex:500,backdropFilter:"blur(6px)"};

  const handleCreate=async()=>{
    if(!ruleName.trim()){return;}
    setSaving(true);
    const rule={
      name:ruleName.trim(),
      trigger_type:trigType,
      trigger_params:trigType==="power_exceeds"?{kw:parseFloat(trigParams.kw)}:trigType==="camera_detects"?{event:trigParams.event}:trigType==="time_is"?{time:trigParams.time}:{appliance_id:parseInt(trigParams.appliance_id),hours:parseFloat(trigParams.hours)},
      action_type:actType,
      action_params:actType==="create_alert"?{message:actParams.message,module:actParams.module,type:actParams.type,icon:"🤖"}:{appliance_id:parseInt(actParams.appliance_id)},
    };
    await onCreate(rule);
    setSaving(false);
  };

  const stepLabel=["1. Trigger","2. Action","3. Name"];
  return h("div",{style:overlay,onClick:onClose},
    h("div",{onClick:e=>e.stopPropagation(),
      style:{width:480,borderRadius:16,background:"var(--bg-card)",border:"1px solid var(--border)",
        padding:28,boxShadow:"0 24px 60px rgba(0,0,0,.5)"}},
      h("div",{style:{display:"flex",gap:8,marginBottom:20}},
        stepLabel.map((l,i)=>h("div",{key:i,style:{flex:1,textAlign:"center",padding:"6px 0",
          borderRadius:8,fontSize:11,fontWeight:700,
          background:step===i+1?T.gradient1:step>i+1?T.accentDim:T.surface,
          color:step===i+1?"#000":step>i+1?T.accent:T.textMuted,border:"1px solid var(--border)"}},l))
      ),
      h("h3",{style:{fontSize:15,fontWeight:700,marginBottom:16,color:"var(--text)"}},
        step===1?"Choose what triggers this rule":step===2?"Choose what happens":"Name your rule"
      ),
      step===1&&h(React.Fragment,null,
        h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"TRIGGER TYPE"),
        sel(trigType,setTrigType,[["power_exceeds","⚡ Power exceeds X kW"],["camera_detects","📹 Camera detects event"],["time_is","🕐 Time is (daily schedule)"],["appliance_on","🔌 Appliance on for X hours"]]),
        trigType==="power_exceeds"&&h(React.Fragment,null,h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"THRESHOLD (kW)"),inp2(trigParams.kw,v=>setTrigParams(p=>({...p,kw:v})),"e.g. 5.0","number")),
        trigType==="camera_detects"&&h(React.Fragment,null,h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"EVENT TYPE"),sel(trigParams.event,v=>setTrigParams(p=>({...p,event:v})),[["Person","👤 Person"],["Delivery","📦 Delivery"],["Vehicle","🚗 Vehicle"],["Animal","🐈 Animal"],["Motion","🔵 Motion"]])),
        trigType==="time_is"&&h(React.Fragment,null,h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"TIME (24hr)"),inp2(trigParams.time,v=>setTrigParams(p=>({...p,time:v})),"23:00")),
        trigType==="appliance_on"&&h(React.Fragment,null,
          h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"APPLIANCE"),
          sel(trigParams.appliance_id,v=>setTrigParams(p=>({...p,appliance_id:v})),appliances.map(a=>[String(a.id),a.icon+" "+a.name])),
          h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"HOURS RUNNING"),
          inp2(trigParams.hours,v=>setTrigParams(p=>({...p,hours:v})),"2","number")
        )
      ),
      step===2&&h(React.Fragment,null,
        h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"ACTION TYPE"),
        sel(actType,setActType,[["create_alert","🔔 Create an alert"],["turn_on","✅ Turn ON an appliance"],["turn_off","❌ Turn OFF an appliance"]]),
        (actType==="turn_on"||actType==="turn_off")&&h(React.Fragment,null,
          h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"APPLIANCE"),
          sel(actParams.appliance_id,v=>setActParams(p=>({...p,appliance_id:v})),appliances.map(a=>[String(a.id),a.icon+" "+a.name]))
        ),
        actType==="create_alert"&&h(React.Fragment,null,
          h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"ALERT MESSAGE"),
          inp2(actParams.message,v=>setActParams(p=>({...p,message:v})),"Alert message..."),
          h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"SEVERITY"),
          sel(actParams.type,v=>setActParams(p=>({...p,type:v})),[["danger","🔴 Danger"],["warning","🟠 Warning"],["info","🔵 Info"],["success","🟢 Success"]])
        )
      ),
      step===3&&h(React.Fragment,null,
        h("label",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:600,display:"block",marginBottom:6}},"RULE NAME"),
        inp2(ruleName,setRuleName,"e.g. Night Power Saver"),
        h("div",{style:{padding:"12px 14px",borderRadius:10,background:"var(--bg-card)",border:"1px solid var(--border)",fontSize:12,color:"var(--text-muted)"}},
          h("div",{style:{marginBottom:6}},h("strong",{style:{color:T.blue}},"IF "),
            ({power_exceeds:`Power > ${trigParams.kw} kW`,camera_detects:`Camera detects ${trigParams.event}`,time_is:`Time is ${trigParams.time}`,appliance_on:`${appliances.find(a=>String(a.id)===String(trigParams.appliance_id))?.name||"Appliance"} on for ${trigParams.hours}h`}[trigType]||trigType)
          ),
          h("div",null,h("strong",{style:{color:"var(--teal)"}},"THEN "),actType==="create_alert"?`Alert: "${actParams.message}"`:((actType==="turn_on"?"Turn ON ":"Turn OFF ")+(appliances.find(a=>String(a.id)===String(actParams.appliance_id))?.name||"appliance #"+actParams.appliance_id)))
        )
      ),
      h("div",{style:{display:"flex",justifyContent:"space-between",marginTop:20}},
        h("button",{onClick:step===1?onClose:()=>setStep(s=>s-1),
          style:{padding:"10px 20px",borderRadius:10,border:"1px solid var(--border)",
            background:"transparent",color:"var(--text-muted)",fontSize:13,fontWeight:600,
            cursor:"pointer",fontFamily:"'DM Sans'"}},step===1?"Cancel":"← Back"),
        step<3?h("button",{onClick:()=>setStep(s=>s+1),
          style:{padding:"10px 20px",borderRadius:10,border:"none",
            background:T.gradient1,color:"#000",fontSize:13,fontWeight:700,
            cursor:"pointer",fontFamily:"'DM Sans'"}},"Next →"):
        h("button",{onClick:handleCreate,disabled:saving||!ruleName.trim(),
          style:{padding:"10px 20px",borderRadius:10,border:"none",
            background:saving||!ruleName.trim()?T.border:T.gradient1,
            color:saving||!ruleName.trim()?T.textMuted:"#000",
            fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'"}},
          saving?"Creating...":"🤖 Create Rule")
      )
    )
  );
}

/* ─── ADMIN PANEL ─── */
function AdminPanel({user,addToast}){
  const [users,setUsers]=useState([]);
  const [stats,setStats]=useState(null);
  const [loadErr,setLoadErr]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const h=React.createElement;

  const fetchUsers=useCallback(async()=>{
    setLoadErr(false);
    const [res, s] = await Promise.all([
      api.get("/admin/users"),
      api.get("/admin/stats"),
    ]);
    if(res&&res.users) setUsers(res.users);
    if(s) setStats(s);
    // If both calls returned null the panel would freeze — show error instead
    if(!res && !s) setLoadErr(true);
  },[]);

  useEffect(()=>{fetchUsers();},[fetchUsers]);

  const toggleRole=async(u)=>{
    if(u.id===user.id){addToast("❌","Error","Cannot change your own role",T.red);return;}
    if(u.is_superadmin){addToast("👑","Protected","Super Admin role cannot be changed",T.orange);return;}
    const res=await api.put(`/admin/users/${u.id}/role`);
    if(res&&res.message){addToast("🛡️","Role Updated",res.message,T.blue);fetchUsers();}
    else if(res&&res.error){addToast("❌","Error",res.error,T.red);}
  };
  const deactivate=async(u)=>{
    if(u.id===user.id){addToast("❌","Error","Cannot deactivate yourself",T.red);return;}
    if(u.is_superadmin){addToast("👑","Protected","Super Admin cannot be suspended",T.orange);return;}
    if(!confirm(`Are you sure you want to ${u.is_active?"deactivate":"activate"} ${u.name}?`))return;
    const res=await api.put(`/admin/users/${u.id}/active`);
    if(res&&res.message){addToast("⚠️","Status Changed",res.message,T.orange);fetchUsers();}
    else if(res&&res.error){addToast("❌","Error",res.error,T.red);}
  };
  const deleteUser=async(u)=>{
    if(u.id===user.id){addToast("❌","Error","Cannot delete yourself",T.red);return;}
    if(u.is_superadmin){addToast("👑","Protected","Super Admin account cannot be deleted",T.orange);return;}
    if(confirm(`WARNING: Deleting ${u.name} will erase all their devices, appliances, and data forever. Proceed?`)){
      const res=await api.del(`/admin/users/${u.id}`);
      if(res&&res.message){addToast("🗑","User Deleted",res.message,T.red);fetchUsers();}
      else if(res&&res.error){addToast("❌","Error",res.error,T.red);}
    }
  };
  const resetPassword=async(u)=>{
    const np=prompt(`Enter new password for ${u.name} (min 6 chars):`);
    if(!np)return;
    if(np.length<6){addToast("❌","Error","Password too short",T.red);return;}
    const res=await api.put(`/admin/users/${u.id}/password`,{password:np});
    if(res)addToast("🔑","Password Reset",res.message,T.accent);
  };

  const handleCreate=async(e)=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    const res=await api.post("/admin/users",Object.fromEntries(fd));
    if(res){
      addToast("✅","Member Created",res.message,T.accent);
      setShowAdd(false);fetchUsers();
    }
  };

  if(loadErr)return h("div",{style:{padding:40,textAlign:"center"}},
    h("div",{style:{fontSize:32,marginBottom:12}},"⚠️"),
    h("div",{style:{fontSize:15,fontWeight:600,color:"var(--danger)",marginBottom:8}},"Admin Panel Unavailable"),
    h("div",{style:{fontSize:12,color:"var(--text-muted)",marginBottom:20}},"Your session may have expired. Please log out and log back in."),
    h("button",{onClick:fetchUsers,style:{padding:"10px 24px",borderRadius:10,border:"none",background:"var(--teal-glow)",color:"var(--teal)",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'"}},"🔄 Retry")
  );
  if(!stats)return h("div",{style:{padding:40,textAlign:"center",color:"var(--text-muted)"}},
    h("div",{style:{fontSize:24,marginBottom:8}},"⏳"),"Loading admin panel...");

  return h("div",{style:{display:"flex",flexDirection:"column",gap:16}},
    /* Platform Stats */
    h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:8}},
      h("div",{className:"fadeUp d1"},h(Stat,{label:"Total Users",value:stats.total_users,unit:`(${stats.active_users} active)`,icon:"👥",color:T.blue})),
      h("div",{className:"fadeUp d2"},h(Stat,{label:"Total Appliances",value:stats.total_appliances,unit:"",icon:"🔌",color:"var(--teal)"})),
      h("div",{className:"fadeUp d3"},h(Stat,{label:"Network Devices",value:stats.total_devices,unit:"",icon:"🌐",color:T.purple})),
      h("div",{className:"fadeUp d4"},h(Stat,{label:"Active Automations",value:stats.total_automations,unit:"",icon:"🤖",color:T.orange}))
    ),
    /* Members Table */
    h(Card,{className:"fadeUp d5"},
      h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}},
        h("div",{style:{fontSize:16,fontWeight:600}},"👥 Member Management"),
        h("button",{onClick:()=>setShowAdd(true),style:{background:T.accent,color:"#111",border:"none",padding:"8px 16px",borderRadius:8,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans'"}},"➕ Add Member")
      ),
      h("div",{style:{overflowX:"auto"}},
        h("table",{style:{width:"100%",borderCollapse:"collapse",textAlign:"left"}},
          h("thead",null,h("tr",{style:{borderBottom:`1px solid ${T.border}44`,color:"var(--text-muted)",fontSize:11,textTransform:"uppercase",letterSpacing:1}},
            h("th",{style:{padding:"12px 0",fontWeight:600}},"User"),
            h("th",{style:{padding:"12px 0",fontWeight:600}},"Role"),
            h("th",{style:{padding:"12px 0",fontWeight:600}},"Status"),
            h("th",{style:{padding:"12px 0",fontWeight:600}},"Joined"),
            h("th",{style:{padding:"12px 0",fontWeight:600,textAlign:"right"}},"Actions")
          )),
          h("tbody",null,
            users.map(u=>h("tr",{key:u.id,style:{borderBottom:"1px solid rgba(30,41,59,0.2)"}},
              h("td",{style:{padding:"12px 0",display:"flex",alignItems:"center",gap:12}},
                /* Avatar — gold crown ring for super admin */
                h("div",{style:{
                  width:32,height:32,borderRadius:8,
                  background:u.is_superadmin?"linear-gradient(135deg,#f59e0b,#d97706)":u.role==="admin"?T.accentDim:T.blueDim,
                  color:u.is_superadmin?"#fff":u.role==="admin"?T.accent:T.blue,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:700,fontSize:u.is_superadmin?16:14,
                  boxShadow:u.is_superadmin?"0 0 0 2px #f59e0b, 0 0 12px #f59e0b66":"none",
                  transition:"all .3s"
                }},u.is_superadmin?"👑":u.name.charAt(0).toUpperCase()),
                h("div",null,
                  h("div",{style:{fontSize:13,fontWeight:600}},u.name,u.id===user.id&&" (You)"),
                  h("div",{style:{fontSize:11,color:"var(--text-muted)"}},u.email)
                )
              ),
              /* Role badge */
              h("td",{style:{padding:"12px 0"}},
                u.is_superadmin
                  ?h("span",{style:{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:6,
                      background:"#f59e0b22",border:"1px solid #f59e0b66",
                      color:"#f59e0b",fontSize:10,fontWeight:700,letterSpacing:.8}},"👑 SUPER ADMIN")
                  :h(Badge,{text:u.role.toUpperCase(),color:u.role==="admin"?T.accent:T.blue})
              ),
              h("td",{style:{padding:"12px 0"}},h(Badge,{text:u.is_active?"ACTIVE":"SUSPENDED",color:u.is_active?T.accent:T.red})),
              h("td",{style:{padding:"12px 0",fontSize:12,color:"var(--text-muted)"}},u.created_at),
              /* Action buttons */
              h("td",{style:{padding:"12px 0",textAlign:"right"}},
                u.is_superadmin
                  /* Super admin row — only password reset, rest locked */
                  ?h("div",{style:{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}},
                      h("span",{title:"Super Admin — protected",style:{fontSize:18,opacity:.7}},"👑"),
                      h("button",{onClick:()=>resetPassword(u),title:"Reset Password",
                        style:{background:"transparent",border:"1px solid var(--border)",color:"var(--text)",
                          padding:"6px 10px",borderRadius:6,cursor:"pointer",fontSize:13}},"🔑"),
                      h("button",{disabled:true,title:"Cannot promote/demote Super Admin",
                        style:{background:"transparent",border:`1px solid ${T.border}33`,color:"var(--text-muted)",
                          padding:"6px 10px",borderRadius:6,cursor:"not-allowed",fontSize:13,opacity:.3}},"🛡️"),
                      h("button",{disabled:true,title:"Cannot suspend Super Admin",
                        style:{background:"transparent",border:`1px solid ${T.border}33`,color:"var(--text-muted)",
                          padding:"6px 10px",borderRadius:6,cursor:"not-allowed",fontSize:13,opacity:.3}},"⏸"),
                      h("button",{disabled:true,title:"Cannot delete Super Admin",
                        style:{background:"transparent",border:`1px solid ${T.border}33`,color:"var(--text-muted)",
                          padding:"6px 10px",borderRadius:6,cursor:"not-allowed",fontSize:13,opacity:.3}},"🗑️")
                    )
                  /* Normal user/admin row — all actions available */
                  :h("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
                      h("button",{onClick:()=>toggleRole(u),title:"Promote/Demote Role",
                        style:{background:"transparent",border:"1px solid var(--border)",color:"var(--text)",
                          padding:"6px 10px",borderRadius:6,cursor:"pointer",fontSize:13}},"🛡️"),
                      h("button",{onClick:()=>resetPassword(u),title:"Reset Password",
                        style:{background:"transparent",border:"1px solid var(--border)",color:"var(--text)",
                          padding:"6px 10px",borderRadius:6,cursor:"pointer",fontSize:13}},"🔑"),
                      h("button",{onClick:()=>deactivate(u),title:u.is_active?"Suspend user":"Activate user",
                        style:{background:"transparent",border:"1px solid var(--border)",
                          color:u.is_active?T.orange:T.accent,padding:"6px 10px",borderRadius:6,cursor:"pointer",fontSize:13}},
                        u.is_active?"⏸":"▶"),
                      h("button",{onClick:()=>deleteUser(u),title:"Delete entirely",
                        style:{background:"transparent",border:`1px solid ${T.red}44`,color:"var(--danger)",
                          padding:"6px 10px",borderRadius:6,cursor:"pointer",fontSize:13}},"🗑️")
                    )
              )
            ))
          )
        )
      )
    ),
    /* Add Member Modal */
    showAdd&&h("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",backdropFilter:"blur(4px)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center"}},
      h("div",{style:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:24,padding:32,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,.5)",animation:"zoomIn .3s ease"}},
        h("h3",{style:{margin:"0 0 20px 0",fontSize:20}},"Add New Member"),
        h("form",{onSubmit:handleCreate,style:{display:"flex",flexDirection:"column",gap:16}},
          h("input",{placeholder:"Full Name",name:"name",required:true,style:{padding:"12px 16px",borderRadius:12,border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text)",fontSize:14,fontFamily:"inherit"}}),
          h("input",{type:"email",placeholder:"Email Address",name:"email",required:true,style:{padding:"12px 16px",borderRadius:12,border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text)",fontSize:14,fontFamily:"inherit"}}),
          h("input",{type:"password",placeholder:"Temporary Password",name:"password",required:true,minLength:6,style:{padding:"12px 16px",borderRadius:12,border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text)",fontSize:14,fontFamily:"inherit"}}),
          h("div",{style:{display:"flex",gap:20,padding:"0 4px"}},
            h("label",{style:{fontSize:13,display:"flex",alignItems:"center",gap:6,cursor:"pointer"}},h("input",{type:"radio",name:"role",value:"user",defaultChecked:true})," Standard User"),
            h("label",{style:{fontSize:13,display:"flex",alignItems:"center",gap:6,cursor:"pointer"}},h("input",{type:"radio",name:"role",value:"admin"})," Admin Role")
          ),
          h("div",{style:{display:"flex",gap:12,marginTop:10}},
            h("button",{type:"button",onClick:()=>setShowAdd(false),style:{flex:1,padding:"10px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text)",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}},"Cancel"),
            h("button",{type:"submit",style:{flex:1,padding:"10px",borderRadius:10,border:"none",background:T.accent,color:"#111",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}},"Create Member")
          )
        )
      )
    )
  );
}

/* ─── CHAT WIDGET ─── */
function ChatWidget({user, appliances, devices, cameras, alerts}){
  const [open,setOpen]=useState(false);
  const [msgs,setMsgs]=useState([{role:"bot",text:"Hi! I'm the GrihaNet AI assistant. How can I help you today?"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const scrollRef=useRef(null);
  const h=React.createElement;

  useEffect(()=>{
    if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight;
  },[msgs,open]);

  const send=async(e)=>{
    e.preventDefault();
    if(!input.trim()||loading)return;
    const userMsg=input.trim();
    setInput("");
    const prevMsgs=[...msgs];
    setMsgs([...prevMsgs,{role:"user",text:userMsg}]);
    setLoading(true);
    const activeCams=cameras?.filter(c=>c.status==="active").length||0;
    const unreadAlerts=alerts?.filter(a=>!a.read).length||0;
    const powerKW=appliances?(appliances.reduce((s,a)=>s+(a.on?a.watts:0),0)/1000).toFixed(2):0;
    const activeAppliances=appliances?appliances.filter(a=>a.on).length:0;
    const onlineDevices=devices?devices.filter(d=>d.online).length:0;
    const liveState=`User: ${(user&&user.name)?user.name:"Guest"} | Power: ${powerKW}kW (${activeAppliances} appliances ON) | Network: ${onlineDevices} devices online | Cameras: ${activeCams} active | Unread Alerts: ${unreadAlerts}`;
    const res=await api.post("/chat/ask",{message:userMsg,history:prevMsgs,live_state:liveState});
    if(res&&res.reply) setMsgs([...prevMsgs,{role:"user",text:userMsg},{role:"bot",text:res.reply}]);
    else setMsgs([...prevMsgs,{role:"user",text:userMsg},{role:"bot",text:"Sorry, I'm offline right now."}]);
    setLoading(false);
  };

  const parseMd=txt=>txt.split("\n").map((line,i)=>h("div",{key:i,dangerouslySetInnerHTML:{__html:line.replace(/\*\*(.*?)\*\*/g,"<b>$1</b>").replace(/\*(.*?)\*/g,"<i>$1</i>")},style:{marginBottom:line?"3px":0,minHeight:line?0:"4px"}}));

  return h(React.Fragment,null,
    /* Floating bubble button */
    !open&&h("button",{className:"chat-bubble-btn",onClick:()=>setOpen(true),"aria-label":"Open AI chat"},"💬"),

    /* Chat window */
    open&&h("div",{className:"chat-window"},
      /* Header */
      h("div",{style:{
        padding:"14px 18px",
        borderBottom:"1px solid var(--border)",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        background:"linear-gradient(135deg,rgba(0,229,160,0.08),rgba(59,130,246,0.06))",
      }},
        h("div",{style:{display:"flex",alignItems:"center",gap:10}},
          h("div",{style:{
            width:30,height:30,borderRadius:10,
            background:"linear-gradient(135deg,var(--teal),var(--blue))",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:14
          }},"🤖"),
          h("div",null,
            h("div",{style:{fontWeight:700,fontSize:14,color:"var(--text)"}},"GrihaNet AI"),
            h("div",{style:{fontSize:10,color:"var(--teal)",display:"flex",alignItems:"center",gap:4}},
              h("span",{style:{width:5,height:5,borderRadius:"50%",background:"var(--teal)",display:"inline-block",animation:"pulse 2s infinite"}}),
              "Online"
            )
          )
        ),
        h("button",{onClick:()=>setOpen(false),style:{
          background:"none",border:"1px solid var(--border)",borderRadius:8,
          color:"var(--text-muted)",fontSize:16,cursor:"pointer",
          width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center"
        }},"×")
      ),
      /* Message area */
      h("div",{ref:scrollRef,style:{
        flex:1,padding:"16px",overflowY:"auto",
        display:"flex",flexDirection:"column",gap:10,
      }},
        msgs.map((m,i)=>h("div",{key:i,style:{
          display:"flex",
          justifyContent:m.role==="user"?"flex-end":"flex-start",
          alignItems:"flex-end",gap:8,
        }},
          m.role==="bot"&&h("div",{style:{
            width:24,height:24,borderRadius:8,flexShrink:0,
            background:"linear-gradient(135deg,var(--teal),var(--blue))",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:12
          }},"🤖"),
          h("div",{style:{
            maxWidth:"80%",padding:"10px 14px",
            borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",
            background:m.role==="user"
              ?"linear-gradient(135deg,var(--teal),var(--blue))"
              :"var(--bg-card-hover)",
            color:m.role==="user"?"#fff":"var(--text)",
            fontSize:13,lineHeight:1.55,
            border:m.role==="bot"?"1px solid var(--border)":"none",
          }},parseMd(m.text))
        )),
        loading&&h("div",{style:{display:"flex",alignItems:"flex-end",gap:8}},
          h("div",{style:{
            width:24,height:24,borderRadius:8,
            background:"linear-gradient(135deg,var(--teal),var(--blue))",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:12
          }},"🤖"),
          h("div",{style:{
            padding:"10px 16px",borderRadius:"18px 18px 18px 4px",
            background:"var(--bg-card-hover)",border:"1px solid var(--border)",
            display:"flex",gap:5,alignItems:"center",
          }},
            [0,1,2].map(i=>h("div",{key:i,style:{
              width:6,height:6,borderRadius:"50%",background:"var(--teal)",opacity:.6,
              animation:"pulse 1.2s ease infinite",animationDelay:(i*0.2)+"s"
            }}))
          )
        )
      ),
      /* Input area */
      h("form",{onSubmit:send,style:{
        padding:"10px 14px 14px",
        borderTop:"1px solid var(--border)",
        display:"flex",gap:8,alignItems:"center",
      }},
        h("input",{value:input,onChange:e=>setInput(e.target.value),
          placeholder:"Ask me anything\u2026",className:"inp",
          style:{flex:1,borderRadius:24,fontSize:13,padding:"9px 16px"}
        }),
        h("button",{type:"submit",disabled:!input.trim(),
          style:{
            width:36,height:36,borderRadius:"50%",border:"none",flexShrink:0,
            background:input.trim()
              ?"linear-gradient(135deg,var(--teal),var(--blue))"
              :"var(--border)",
            color:input.trim()?"#fff":"var(--text-dim)",
            cursor:input.trim()?"pointer":"default",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:15,transition:"all .2s",
          }
        },"\u2191")
      )
    )
  );
}

/* ─── VOICE COMMAND HOOK ─── */
function useVoiceCommands({appliances,setTab,toggleAppliance,addToast}){
  const [listening,setListening]=useState(false);
  const [transcript,setTranscript]=useState("");
  const [feedback,setFeedback]=useState(null);
  const recogRef=useRef(null);

  const TABS={overview:"overview",power:"power",network:"network",cameras:"cameras",camera:"cameras",alerts:"alerts",alert:"alerts",automations:"automations",automation:"automations",settings:"settings",setting:"settings",home:"overview"};

  const showFeedback=(ok,msg)=>{
    setFeedback({ok,msg});
    setTimeout(()=>setFeedback(null),3000);
    addToast(ok?"🎤":"❌",ok?"Voice Command":"Not understood",msg,ok?T.accent:T.orange);
  };

  const processCommand=useCallback((raw)=>{
    const txt=raw.toLowerCase().trim();
    setTranscript(txt);

    // ─── Tab navigation ───
    const navMatch=txt.match(/(?:show|go to|navigate to|open)\s+(\w+)/);
    if(navMatch){
      const dest=TABS[navMatch[1]];
      if(dest){setTab(dest);showFeedback(true,`Navigating to ${navMatch[1]}`);return;}
    }
    // Plain tab name as command
    for(const [word,id] of Object.entries(TABS)){
      if(txt===word||txt===word+"s"){setTab(id);showFeedback(true,`Switched to ${id}`);return;}
    }

    // ─── Appliance toggle ───
    const onMatch=txt.match(/turn on(?:\s+the)?\s+(.+)/);
    const offMatch=txt.match(/turn off(?:\s+the)?\s+(.+)/);
    const target=onMatch?onMatch[1]:offMatch?offMatch[1]:null;
    const wantOn=!!onMatch;
    if(target){
      if(target==="everything"||target==="all"){
        appliances.forEach(a=>{if(a.on!==wantOn)toggleAppliance(a.id);});
        showFeedback(true,wantOn?"Turning on everything":"Turning off everything");return;
      }
      if(target.includes("light")||target.includes("lights")){
        const lights=appliances.filter(a=>a.name.toLowerCase().includes("light")||a.name.toLowerCase().includes("tube")||a.name.toLowerCase().includes("lamp"));
        lights.forEach(a=>{if(a.on!==wantOn)toggleAppliance(a.id);});
        showFeedback(true,(wantOn?"Turning on":"Turning off")+` ${lights.length} light(s)`);return;
      }
      const found=appliances.find(a=>a.name.toLowerCase().includes(target)||target.includes(a.name.toLowerCase().split(" ")[0].toLowerCase()));
      if(found){
        if(found.on!==wantOn)toggleAppliance(found.id);
        showFeedback(true,`${wantOn?"Turning on":"Turning off"} ${found.name}`);return;
      }
      showFeedback(false,`Couldn't find "${target}"`);return;
    }

    showFeedback(false,`"${txt}" — try: "turn on geyser" or "show power"`);
  },[appliances,setTab,toggleAppliance]);

  const startListening=useCallback(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){addToast("❌","Not supported","Your browser does not support voice commands",T.red);return;}
    if(listening){recogRef.current&&recogRef.current.stop();setListening(false);return;}
    const r=new SR();
    r.continuous=false;r.interimResults=true;r.lang="en-IN";
    r.onstart=()=>setListening(true);
    r.onresult=(e)=>{
      const t=Array.from(e.results).map(x=>x[0].transcript).join(" ");
      setTranscript(t);
      if(e.results[e.results.length-1].isFinal)processCommand(t);
    };
    r.onerror=()=>setListening(false);
    r.onend=()=>{setListening(false);setTranscript("");};
    r.start();
    recogRef.current=r;
  },[listening,processCommand,addToast]);

  return {listening,transcript,feedback,startListening};
}

/* ════════════════════════ MAIN APP ════════════════════════ */
function GrihaNet(){
  const [loggedIn,setLoggedIn]=useState(false);
  const [user,setUser]=useState(null);

  const doLogout=useCallback(()=>{
    api.token=null;
    setLoggedIn(false);
    setUser(null);
    try{
      localStorage.removeItem('grihanet_token');
      localStorage.removeItem('grihanet_user');
    }catch(e){}
  },[]);

  // Auto-logout when any API call receives a 401 (expired token)
  useEffect(()=>{
    const handler=()=>{
      doLogout();
      // Show a toast — but addToast isn't available here yet, use a brief alert-style div approach
      // We'll set a flag so AuthScreen can show a message
      sessionStorage.setItem('grihanet_session_msg','Your session has expired. Please log in again.');
    };
    window.addEventListener('session-expired', handler);
    return ()=>window.removeEventListener('session-expired', handler);
  },[doLogout]);

  useEffect(()=>{
    try{
      const t=localStorage.getItem('grihanet_token');
      const u=localStorage.getItem('grihanet_user');
      if(t && u){api.token=t;setUser(JSON.parse(u));setLoggedIn(true);}
      const dm=localStorage.getItem('grihanet_darkMode');
      if(dm!==null)setSettings(s=>({...s,darkMode:dm==='true'}));
    }catch(e){}
  },[]);
  const [tab,setTab]=useState("overview");
  const [appliances,setAppliances]=useState(INIT_APPLIANCES);
  const [devices,setDevices]=useState(INIT_DEVICES);
  const [cameras,setCameras]=useState(INIT_CAMERAS);
  const [showAddCamera,setShowAddCamera]=useState(false);
  const [camForm,setCamForm]=useState({name:"",location:"",stream_url:""});
  const [motionLog,setMotionLog]=useState([
    {id:1,cam:"Front Door",time:"14:42:18",type:"Person",severity:"high",img:"👤"},
    {id:2,cam:"Front Door",time:"14:31:05",type:"Motion",severity:"medium",img:"🔵"},
    {id:3,cam:"Backyard",time:"13:58:22",type:"Animal",severity:"low",img:"🐈"},
    {id:4,cam:"Front Door",time:"12:15:44",type:"Delivery",severity:"medium",img:"📦"},
    {id:5,cam:"Garage",time:"10:30:11",type:"Vehicle",severity:"low",img:"🚗"},
  ]);
  const [alerts,setAlerts]=useState([]);
  const [automations,setAutomations]=useState([]);
  const [showAutoModal,setShowAutoModal]=useState(false);
  const [toasts,setToasts]=useState([]);
  const [powerData,setPowerData]=useState(genPowerHistory);
  const [weeklyData,setWeeklyData]=useState(genWeekly);
  const [bandwidthData,setBandwidthData]=useState(genBandwidth);
  const [now,setNow]=useState(new Date());
  const [settingsTab,setSettingsTab]=useState("general");
  const nextAlertId=useRef(100);
  const nextMotionId=useRef(100);
  const toastIdRef=useRef(0);
  const soundAlertsRef=useRef(false);
  const [togglingIds,setTogglingIds]=useState(new Set());
  const [deviceSearch,setDeviceSearch]=useState("");
  const [alertFilter,setAlertFilter]=useState("all");
  const [isLoading,setIsLoading]=useState(false);
  const [selectedRoom,setSelectedRoom]=useState(null); // null = all rooms shown
  const [showAddAppliance,setShowAddAppliance]=useState(false);
  const [newAppl,setNewAppl]=useState({name:"",icon:"🔌",watts:"100",room:"Bedroom"});
  const [themeVersion,setThemeVersion]=useState(0);
  const [settings,setSettings]=useState({
    darkMode:true,autoRefresh:true,pushNotifications:true,soundAlerts:false,simulationMode:true,
    rate:6.5,highUsageThreshold:4.5,runtimeAlert:2,monthlyBudget:2500,
    autoBlockUnknown:false,bandwidthAlert:true,bandwidthThreshold:10,parentalControls:false,
    motionSensitivity:"High",alertHoursStart:"23:00",alertHoursEnd:"06:00",
    snapshotOnMotion:true,recordClips:false,
  });

  /* ─── Apply theme whenever darkMode setting changes ─── */
  useEffect(()=>{
    const theme=settings.darkMode?DARK:LIGHT;
    Object.assign(T,theme);
    /* Drive CSS variables via data-theme attribute */
    document.documentElement.setAttribute("data-theme", settings.darkMode?"dark":"light");
    /* Keep body bg/color in sync for components still using T.xxx inline styles */
    document.body.style.background=theme.bg;
    document.body.style.color=theme.text;
    setThemeVersion(v=>v+1);
  },[settings.darkMode]);

  /* Keep soundAlertsRef in sync so the stable addToast closure can read it */
  useEffect(()=>{soundAlertsRef.current=settings.soundAlerts;},[settings.soundAlerts]);

  const addToast=useCallback((icon,title,msg,color)=>{
    const id=++toastIdRef.current;
    setToasts(t=>[{id,icon,title,msg,color},...t].slice(0,3));
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);
    if(soundAlertsRef.current) playAlertBeep(color===DARK.red||color===LIGHT.red||color===DARK.orange||color===LIGHT.orange);
  },[]);
  const dismissToast=useCallback((id)=>setToasts(t=>t.filter(x=>x.id!==id)),[]);

  /* ─── Fetch data from backend on login ─── */
  const fetchAll=useCallback(async()=>{
    setIsLoading(true);
    const [appData,devData,camData,alertData,settData,histData,wkData,bwData,autoData]=await Promise.all([
      api.get("/power/appliances"),api.get("/network/devices"),api.get("/cameras/"),
      api.get("/alerts/"),api.get("/settings/"),api.get("/power/history"),
      api.get("/power/weekly"),api.get("/network/bandwidth"),api.get("/automations/"),
    ]);
    if(appData)setAppliances(appData);
    if(devData)setDevices(devData);
    if(camData)setCameras(camData);
    if(alertData)setAlerts(alertData.alerts||[]);
    if(settData)setSettings(s=>({...s,...settData}));
    if(histData)setPowerData(histData);
    if(wkData)setWeeklyData(wkData);
    if(bwData)setBandwidthData(bwData);
    if(autoData)setAutomations(autoData.automations||[]);
    setIsLoading(false);
  },[]);

  const generatePDF = async () => {
    try {
      addToast("⏳", "Generating", "Compiling system report... This may take a moment.", T.orange);
      // Fetch PDF directly with Bearer token from api.token
      const token = api.token;
      if (!token) { addToast("❌", "Not Logged In", "Please log in before downloading a report.", T.red); return; }
      const res = await fetch('/api/settings/report.pdf', {
        headers: { "Authorization": `Bearer ${token}`, "Accept": "application/pdf" }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const contentDisp = res.headers.get("Content-Disposition");
      let filename = `GrihaNet_Report_${new Date().toISOString().slice(0,10)}.pdf`;
      if(contentDisp && contentDisp.includes("filename=")) {
         filename = contentDisp.split("filename=")[1].replace(/"/g, "").trim();
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      addToast("📄", "Report Ready", "Your system report has been downloaded.", T.accent);
    } catch (e) {
      console.error("PDF Generate Error:", e);
      addToast("❌", "Export Error", e.message||"Failed to generate report on the server.", T.red);
    }
  };

  const handleLogin=useCallback((u)=>{
    setUser(u);setLoggedIn(true);
    try{localStorage.setItem('grihanet_token',api.token);localStorage.setItem('grihanet_user',JSON.stringify(u));}catch(e){}
  },[]);

  useEffect(()=>{if(loggedIn)fetchAll();},[loggedIn,fetchAll]);

  /* ─── Live updates ─── */
  useEffect(()=>{
    if(!loggedIn)return;
    const i=setInterval(()=>{
      setNow(new Date());
      if(settings.autoRefresh){
        setDevices(d=>d.map(x=>x.online?{...x,bw:+(x.bw+Math.random()*0.05).toFixed(2)}:x));
      }
    },2500);
    return()=>clearInterval(i);
  },[loggedIn,settings.autoRefresh]);

  /* ─── Simulated motion events ─── */
  useEffect(()=>{
    if(!loggedIn||!settings.simulationMode)return;
    const i=setInterval(async()=>{
      const res=await api.post("/cameras/motions/simulate");
      if(res){
        setMotionLog(l=>[{id:++nextMotionId.current,cam:res.cam,time:res.time,type:res.type,severity:res.severity,img:res.img},...l].slice(0,20));
        setCameras(c=>c.map(x=>x.name===res.cam?{...x,motionEvents:(x.motionEvents||0)+1}:x));
        if(res.alert_generated&&settings.pushNotifications){
          addToast("📹","Motion Alert",`${res.type} at ${res.cam}`,T.orange);
          fetchAll();
        }
      }
    },8000);
    return()=>clearInterval(i);
  },[loggedIn,settings.simulationMode,settings.pushNotifications,addToast,fetchAll]);

  const toggleAppliance=async(id)=>{
    setTogglingIds(s=>new Set([...s,id]));
    const res=await api.put(`/power/appliances/${id}/toggle`);
    if(res){
      setAppliances(a=>a.map(x=>x.id===id?{...x,on:res.on}:x));
      if(res.on&&res.watts>1000)addToast("⚡","High Power",`${res.name} ON (${res.watts}W)`,T.orange);
    }
    setTogglingIds(s=>{const n=new Set(s);n.delete(id);return n;});
  };
  const toggleCam=async(id)=>{
    const res=await api.put(`/cameras/${id}/toggle`);
    if(res) setCameras(c=>c.map(x=>x.id===id?{...x,status:res.status}:x));
  };
  const addCamera=async(e)=>{
    e.preventDefault();
    const res=await api.post("/cameras/",camForm);
    if(res&&res.camera){
      setCameras(c=>[...c,res.camera]);
      addToast("📹","Camera Added",res.message,T.accent);
      setShowAddCamera(false);
      setCamForm({name:"",location:"",stream_url:""});
    } else if(res&&res.error){
      addToast("❌","Error",res.error,T.red);
    }
  };
  const deleteCamera=async(cam)=>{
    if(!confirm(`Remove camera '${cam.name}'? All motion events will be deleted.`))return;
    const res=await api.del(`/cameras/${cam.id}`);
    if(res&&res.message){
      setCameras(c=>c.filter(x=>x.id!==cam.id));
      addToast("🗑️","Camera Removed",res.message,T.red);
    }
  };
  const toggleDeviceBlock=async(id)=>{
    const res=await api.put(`/network/devices/${id}/block`);
    if(res){
      setDevices(d=>d.map(x=>x.id===id?{...x,blocked:res.blocked,online:res.online}:x));
      addToast("🌐",res.blocked?"Blocked":"Allowed",res.name,res.blocked?T.red:T.accent);
    }
  };
  const dismissAlert=async(id)=>{
    await api.put(`/alerts/${id}/dismiss`);
    setAlerts(a=>a.map(x=>x.id===id?{...x,read:true}:x));
  };
  const markAllRead=async()=>{await api.put("/alerts/read-all");setAlerts(a=>a.map(x=>({...x,read:true})));};
  const clearRead=async()=>{await api.del("/alerts/clear-read");setAlerts(a=>a.filter(x=>!x.read));};
  const updateSetting=async(key,val)=>{
    setSettings(s=>({...s,[key]:val}));
    await api.put("/settings/",{[key]:val});
    if(key==="darkMode"){try{localStorage.setItem('grihanet_darkMode',String(val));}catch(e){}}
    addToast("⚙️","Settings Updated",key.replace(/([A-Z])/g," $1")+" changed",T.accent);
  };
  const addAppliance=async()=>{
    if(!newAppl.name.trim()||!newAppl.room.trim())return;
    const res=await api.post("/power/appliances",{...newAppl,watts:parseInt(newAppl.watts)||100});
    if(res&&res.id){
      setAppliances(a=>[...a,{...res,on:res.on||false}]);
      addToast("✅","Appliance Added",res.name,T.accent);
      setShowAddAppliance(false);
      setNewAppl({name:"",icon:"🔌",watts:"100",room:"Bedroom"});
    }
  };
  const deleteAppliance=async(id)=>{
    const a=appliances.find(x=>x.id===id);
    if(!a||!confirm(`Remove "${a.name}"?`))return;
    const res=await api.del(`/power/appliances/${id}`);
    if(res){setAppliances(prev=>prev.filter(x=>x.id!==id));addToast("🗑","Removed",a.name,T.red);}
  };
  const createAutomation=async(rule)=>{
    const res=await api.post("/automations/",rule);
    if(res&&res.automation){
      setAutomations(a=>[res.automation,...a]);
      addToast("🤖","Automation Created",res.automation.name,T.accent);
    }
  };
  const deleteAutomation=async(id)=>{
    await api.del("/automations/"+id);
    setAutomations(a=>a.filter(x=>x.id!==id));
    addToast("🗑","Automation Deleted","",T.red);
  };
  const toggleAutomation=async(a)=>{
    const res=await api.put("/automations/"+a.id,{enabled:!a.enabled});
    if(res&&res.automation)setAutomations(list=>list.map(x=>x.id===a.id?res.automation:x));
  };

  const {listening,transcript,feedback,startListening}=useVoiceCommands({appliances,setTab,toggleAppliance,addToast});

  const liveWatts=appliances.filter(a=>a.on).reduce((s,a)=>s+a.watts,0);
  const liveKw=(liveWatts/1000).toFixed(2);
  const todayKwh=powerData.reduce((s,d)=>s+d.kw,0).toFixed(1);
  const todayCost=(todayKwh*settings.rate).toFixed(0);
  const onlineCount=devices.filter(d=>d.online).length;
  const totalBw=devices.reduce((s,d)=>s+d.bw,0).toFixed(1);
  const activeCams=cameras.filter(c=>c.status==="active").length;
  const unreadAlerts=alerts.filter(a=>!a.read).length;
  const totalMotion=cameras.reduce((s,c)=>s+(c.motionEvents||0),0);
  const roomData=[{name:"Bedroom",color:T.blue},{name:"Kitchen",color:T.orange},{name:"Living Room",color:T.purple},{name:"Bathroom",color:T.cyan},{name:"All Rooms",color:"var(--teal)"}].map(r=>({...r,value:appliances.filter(a=>a.room===r.name&&a.on).reduce((s,a)=>s+a.watts,0)})).filter(r=>r.value>0);
  const alertColor={danger:T.red,warning:T.orange,info:T.blue,success:T.accent};
  const devIcons={phone:"📱",laptop:"💻",tv:"📺",gaming:"🎮",unknown:"❓"};
  const sevColor={high:T.red,medium:T.orange,low:T.textSec};

  if(!loggedIn)return React.createElement(AuthScreen,{onLogin:handleLogin});

  /* ─── Layout builder helpers ─── */
  const h=React.createElement;
  const tabs=[
    {id:"overview",icon:"🏠",label:"Overview",tooltip:"Home dashboard summary"},
    {id:"power",icon:"⚡",label:"Power",tooltip:"Manage power & appliances"},
    {id:"network",icon:"🌐",label:"Network",tooltip:"Monitor connected devices"},
    {id:"cameras",icon:"📹",label:"Cameras",tooltip:"Live security cameras"},
    {id:"alerts",icon:"🔔",label:"Alerts",count:unreadAlerts,tooltip:"System notifications"},
    {id:"automations",icon:"🤖",label:"Automations",tooltip:"Scheduled smart rules"},
  ];
  if(user?.role==="admin") tabs.push({id:"admin",icon:"🛡️",label:"Admin",tooltip:"Admin control panel"});
  tabs.push({id:"settings",icon:"⚙️",label:"Settings",tooltip:"App preferences & reports"});

  return h("div",{style:{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",fontFamily:"'DM Sans',sans-serif"}},
    h(Toast,{toasts,onDismiss:dismissToast}),

    /* ═══ HEADER — fixed frosted glass bar ═══ */
    h("header",{
      style:{
        position:"fixed",top:0,left:0,right:0,height:60,zIndex:1000,
        background:"var(--bg-card)",
        backdropFilter:"blur(20px) saturate(180%)",
        WebkitBackdropFilter:"blur(20px) saturate(180%)",
        borderBottom:"1px solid var(--border)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 24px",
        boxShadow:"0 1px 16px rgba(0,0,0,0.18)",
      }
    },
      /* Left — logo */
      h("div",{style:{display:"flex",alignItems:"center",gap:10}},
        h("div",{style:{
          width:34,height:34,borderRadius:10,flexShrink:0,
          background:"linear-gradient(135deg,var(--teal),var(--blue))",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,
          boxShadow:"var(--shadow-teal)"
        }},"🏠"),
        h("div",null,
          h("div",{style:{fontSize:20,fontWeight:700,color:"var(--teal)",lineHeight:1.1,letterSpacing:-0.3}},"GrihaNet"),
          h("div",{style:{fontSize:11,color:"var(--text-dim)",letterSpacing:0.4}},"Smart Home Monitor")
        )
      ),

      /* Right — controls */
      h("div",{style:{display:"flex",alignItems:"center",gap:12}},
        /* Simulation badge */
        settings.simulationMode&&h("span",{className:"badge badge-warn"},"Simulation"),

        /* Clock */
        h("div",{style:{textAlign:"right"}},
          h("div",{style:{fontSize:13,fontFamily:"'IBM Plex Mono'",fontWeight:500,color:"var(--text)"}},now.toLocaleTimeString()),
          h("div",{style:{fontSize:10,color:"var(--text-dim)"}},now.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"}))
        ),

        /* Mic button */
        h("button",{onClick:startListening,title:listening?"Stop":"Voice command",style:{
          width:34,height:34,borderRadius:"50%",border:`1px solid ${listening?"var(--danger)":"var(--border)"}`,
          background:listening?"rgba(239,68,68,0.15)":"var(--bg-card)",
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:15,animation:listening?"pulse 1.2s infinite":"none",transition:"var(--transition)"
        }},listening?"🔴":"🎤"),

        /* Refresh */
        h("button",{onClick:fetchAll,title:"Refresh",style:{
          width:34,height:34,borderRadius:"50%",border:"1px solid var(--border)",
          background:"var(--bg-card)",display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:14,transition:"var(--transition)"
        }},"🔄"),

        /* Bell */
        h("button",{onClick:()=>setTab("alerts"),title:"Alerts",style:{
          position:"relative",width:34,height:34,borderRadius:"50%",
          border:unreadAlerts>0?"1px solid rgba(239,68,68,0.4)":"1px solid var(--border)",
          background:unreadAlerts>0?"rgba(239,68,68,0.1)":"var(--bg-card)",
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:15,transition:"var(--transition)"
        }},
          "🔔",
          unreadAlerts>0&&h("span",{
            className:"pulse",
            style:{position:"absolute",top:-3,right:-3,minWidth:16,height:16,borderRadius:8,
              background:"var(--danger)",color:"#fff",fontSize:9,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px"}
          },unreadAlerts)
        ),

        /* User avatar */
        h("div",{onClick:doLogout,title:`Logout (${user?.name||"user"})`,style:{
          width:34,height:34,borderRadius:"50%",
          background:"linear-gradient(135deg,var(--teal),var(--blue))",
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:14,fontWeight:700,color:"#0A0F1A",
          boxShadow:"var(--shadow-teal)",flexShrink:0
        }},
          (user?.name||"U").charAt(0).toUpperCase()
        )
      )
    ),
    /* VOICE FEEDBACK OVERLAY */
    (listening||feedback)&&h("div",{style:{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
      background:"var(--bg-card)",border:`1px solid ${listening?T.accent:feedback?.ok?T.accent:T.orange}`,
      borderRadius:16,padding:"14px 24px",zIndex:300,boxShadow:"0 8px 32px rgba(0,0,0,.4)",
      display:"flex",alignItems:"center",gap:12,minWidth:260,maxWidth:420,
      animation:"slideDown .3s ease"}},
      h("div",{style:{fontSize:24,animation:listening?"pulse 1s infinite":"none"}},listening?"🎤":feedback?.ok?"✅":"❌"),
      h("div",null,
        h("div",{style:{fontSize:13,fontWeight:700,color:"var(--text)"}},
          listening?(transcript||"Listening… speak now"):feedback?.msg),
        listening&&h("div",{style:{fontSize:11,color:"var(--text-muted)",marginTop:2}},
          'Try: "turn on geyser" • "show power" • "turn off lights"')
      )
    ),
    /* ═══ TAB NAV — sticky below header ═══ */
    h("nav",{
      style:{
        position:"sticky",top:60,zIndex:900,
        display:"flex",alignItems:"center",
        background:"var(--bg)",borderBottom:"1px solid var(--border)",
        overflowX:"auto",paddingLeft:8,paddingRight:8,gap:0,
      }
    },
      tabs.map(t=>h("button",{
        key:t.id,
        onClick:()=>setTab(t.id),
        "data-tooltip":t.tooltip,
        style:{
          padding:"0 20px",height:48,
          fontSize:13,fontWeight:600,
          border:"none",borderBottom:tab===t.id?"2px solid var(--teal)":"2px solid transparent",
          background:"transparent",
          color:tab===t.id?"var(--teal)":"var(--text-muted)",
          cursor:"pointer",whiteSpace:"nowrap",
          display:"flex",alignItems:"center",gap:6,
          transition:"color .15s ease, border-color .15s ease, background .15s ease",
          fontFamily:"'DM Sans',sans-serif",
          position:"relative",
        },
        onMouseEnter:e=>{
          if(tab!==t.id){
            e.currentTarget.style.color="var(--text)";
            e.currentTarget.style.background="var(--teal-glow)";
          }
        },
        onMouseLeave:e=>{
          const isActive=tab===t.id;
          e.currentTarget.style.color=isActive?"var(--teal)":"var(--text-muted)";
          e.currentTarget.style.background="transparent";
        },
      },
        h("span",{style:{fontSize:15}},t.icon),
        t.label,
        t.count>0&&h("span",{
          className:"badge badge-danger",
          style:{marginLeft:2,fontSize:"0.6rem",padding:"0.1rem 0.45rem"}
        },t.count)
      ))
    ),
    /* CONTENT — push below fixed header (60px) + sticky tab nav (48px) */
    h("main",{style:{padding:"20px 24px 40px",maxWidth:1280,margin:"0 auto",paddingTop:"128px"}},

      /* ─── SKELETON LOADING SCREEN ─── */
      isLoading&&h(React.Fragment,null,
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:14,marginBottom:20}},
          [1,2,3,4].map(i=>h("div",{key:i,className:"skeleton",style:{height:110,borderRadius:"var(--radius)"}}))
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}},
          h("div",{className:"skeleton",style:{height:220,borderRadius:"var(--radius)"}}),
          h("div",{className:"skeleton",style:{height:220,borderRadius:"var(--radius)"}})
        ),
        h("div",{className:"skeleton",style:{height:160,borderRadius:"var(--radius)"}})
      ),

      /* ═══ OVERVIEW ═══ */
      !isLoading&&tab==="overview"&&h(React.Fragment,null,
        /* Stat cards row */
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:14,marginBottom:20}},

          /* Card 1 — Live Power (pulsing dot) */
          h("div",{className:"stat-card fadeUp d1",onClick:()=>setTab("power"),style:{cursor:"pointer"},"data-tooltip":"Real-time electricity usage"},
            /* bg blob */
            h("div",{style:{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:(parseFloat(liveKw)>settings.highUsageThreshold?"var(--danger)":"var(--warn)")+"10",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              /* Top row */
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}},
                h("span",{style:{fontSize:22}},"⚡"),
                h("span",{className:"section-title"},"Live Power")
              ),
              /* Value row with live dot */
              h("div",{style:{display:"flex",alignItems:"baseline",gap:6,marginBottom:8}},
                h("span",{className:"live-dot",style:{marginBottom:2}}),
                h("span",{style:{fontSize:32,fontWeight:700,fontFamily:"'IBM Plex Mono'",color:parseFloat(liveKw)>settings.highUsageThreshold?"var(--danger)":"var(--warn)",lineHeight:1}},liveKw),
                h("span",{style:{fontSize:13,color:"var(--text-muted)",fontWeight:500}},"kW")
              ),
              /* Bottom row */
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                h("span",{style:{fontSize:12,color:"var(--text-dim)"}},liveWatts+"W · "+appliances.filter(a=>a.on).length+" appliances"),
                h("span",{className:"badge "+(parseFloat(liveKw)<=settings.highUsageThreshold?"badge-success":"badge-danger")},
                  parseFloat(liveKw)<=settings.highUsageThreshold?"Normal":"High")
              )
            )
          ),

          /* Card 2 — Today's Usage */
          h("div",{className:"stat-card fadeUp d2",onClick:()=>setTab("power"),style:{cursor:"pointer"},"data-tooltip":"Total energy consumed today"},
            h("div",{style:{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"rgba(59,130,246,0.08)",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}},
                h("span",{style:{fontSize:22}},"📊"),
                h("span",{className:"section-title"},"Today's Usage")
              ),
              h("div",{style:{display:"flex",alignItems:"baseline",gap:4,marginBottom:8}},
                h("span",{style:{fontSize:32,fontWeight:700,fontFamily:"'IBM Plex Mono'",color:"var(--blue)",lineHeight:1}},todayKwh),
                h("span",{style:{fontSize:13,color:"var(--text-muted)",fontWeight:500}},"kWh")
              ),
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                h("span",{style:{fontSize:12,color:"var(--text-dim)"}},"Est. cost"),
                h("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)"}},"₹"+todayCost)
              )
            )
          ),

          /* Card 3 — Devices Online */
          h("div",{className:"stat-card fadeUp d3",onClick:()=>setTab("network"),style:{cursor:"pointer"},"data-tooltip":"Connected network devices"},
            h("div",{style:{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"rgba(139,92,246,0.08)",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}},
                h("span",{style:{fontSize:22}},"📡"),
                h("span",{className:"section-title"},"Devices Online")
              ),
              h("div",{style:{display:"flex",alignItems:"baseline",gap:4,marginBottom:8}},
                h("span",{style:{fontSize:32,fontWeight:700,fontFamily:"'IBM Plex Mono'",color:"var(--purple)",lineHeight:1}},onlineCount),
                h("span",{style:{fontSize:13,color:"var(--text-muted)",fontWeight:500}},"/ "+devices.length)
              ),
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                h("span",{style:{fontSize:12,color:"var(--text-dim)"}},"Bandwidth today"),
                h("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)"}},totalBw+" GB")
              )
            )
          ),

          /* Card 4 — Cameras */
          h("div",{className:"stat-card fadeUp d4",onClick:()=>setTab("cameras"),style:{cursor:"pointer"},"data-tooltip":"Security cameras active"},
            h("div",{style:{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"var(--teal-glow)",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}},
                h("span",{style:{fontSize:22}},"📹"),
                h("span",{className:"section-title"},"Cameras Active")
              ),
              h("div",{style:{display:"flex",alignItems:"baseline",gap:4,marginBottom:8}},
                h("span",{style:{fontSize:32,fontWeight:700,fontFamily:"'IBM Plex Mono'",color:"var(--teal)",lineHeight:1}},activeCams),
                h("span",{style:{fontSize:13,color:"var(--text-muted)",fontWeight:500}},"/ "+cameras.length)
              ),
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                h("span",{style:{fontSize:12,color:"var(--text-dim)"}},"Motion events"),
                h("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)"}},totalMotion)
              )
            )
          )
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:14}},
          h(Card,{className:"fadeUp d3"},
            h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},h("div",{style:{fontSize:14,fontWeight:600}},"⚡ Power Consumption — 24 Hours"),h(Badge,{text:settings.autoRefresh?"LIVE":"PAUSED",color:settings.autoRefresh?T.accent:T.textMuted})),
            h(ResponsiveContainer,{width:"100%",height:200},h(AreaChart,{data:powerData},h("defs",null,h("linearGradient",{id:"pg",x1:0,y1:0,x2:0,y2:1},h("stop",{offset:"0%",stopColor:T.accent,stopOpacity:.25}),h("stop",{offset:"100%",stopColor:T.accent,stopOpacity:0}))),h(CartesianGrid,{strokeDasharray:"3 3",stroke:"var(--border)"}),h(XAxis,{dataKey:"hour",tick:{fontSize:9,fill:"var(--text-muted)"},interval:3,axisLine:false}),h(YAxis,{tick:{fontSize:9,fill:"var(--text-muted)"},axisLine:false,unit:" kW"}),h(Tooltip,{contentStyle:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,fontSize:12,color:"var(--text)"},labelStyle:{color:"var(--text)",fontWeight:600},itemStyle:{color:"var(--text-muted)"}}),h(Area,{type:"monotone",dataKey:"kw",stroke:T.accent,strokeWidth:2,fill:"url(#pg)",name:"Power (kW)"})))
          ),
          h(Card,{className:"fadeUp d4"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"🔔 Recent Alerts"),
            h("div",{style:{display:"flex",flexDirection:"column",gap:8}},alerts.slice(0,4).map(a=>h("div",{key:a.id,style:{padding:"10px 12px",borderRadius:10,background:(alertColor[a.type]||T.blue)+"0a",borderLeft:`3px solid ${alertColor[a.type]||T.blue}`,opacity:a.read?.55:1}},h("div",{style:{fontSize:12,lineHeight:1.4}},a.icon," ",a.msg),h("div",{style:{fontSize:10,color:"var(--text-muted)",marginTop:4}},a.time," • ",a.module))))
          )
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}},
          h(Card,{className:"fadeUp d5"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"👥 Connected Devices"),devices.filter(d=>d.online).map(d=>h("div",{key:d.id,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(30,41,59,0.2)"}},h("div",{style:{display:"flex",alignItems:"center",gap:10}},h("span",{style:{fontSize:18}},devIcons[d.type]),h("div",null,h("div",{style:{fontSize:12,fontWeight:500}},d.name," ",!d.wl&&h(Badge,{text:"⚠ unknown",color:T.orange})),h("div",{style:{fontSize:10,color:"var(--text-muted)",fontFamily:"'IBM Plex Mono'"}},d.ip))),h("div",{style:{fontSize:12,fontWeight:600,color:T.blue}},d.bw+" GB")))),
          h(Card,{className:"fadeUp d6"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"📹 Camera Overview"),cameras.map(c=>h("div",{key:c.id,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(30,41,59,0.2)"}},h("div",{style:{display:"flex",alignItems:"center",gap:10}},h("div",{style:{width:8,height:8,borderRadius:"50%",background:c.status==="active"?T.accent:T.red,animation:c.status==="active"?"pulse 2s infinite":"none"}}),h("div",null,h("div",{style:{fontSize:12,fontWeight:500}},c.name),h("div",{style:{fontSize:10,color:"var(--text-muted)"}},(c.motionEvents||0)+" events"))),h(Badge,{text:c.status,color:c.status==="active"?T.accent:T.red}))))
        )
      ),

      /* ═══ POWER ═══ */
      tab==="power"&&h(React.Fragment,null,

        /* ── Live Stats Bar ── */
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:16}},
          h("div",{className:"stat-card fadeUp d1","data-tooltip":"Current power consumption"},
            h("div",{style:{position:"absolute",top:-20,right:-20,width:70,height:70,borderRadius:"50%",background:(parseFloat(liveKw)>settings.highUsageThreshold?"var(--danger)":"var(--warn)")+"12",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              h("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},
                h("span",{style:{fontSize:20}},"⚡"),
                h("span",{className:"section-title"},"Live Power")
              ),
              h("div",{style:{display:"flex",alignItems:"baseline",gap:5,marginBottom:6}},
                h("span",{className:"live-dot",style:{marginBottom:1}}),
                h("span",{style:{fontSize:28,fontWeight:700,fontFamily:"'IBM Plex Mono'",color:parseFloat(liveKw)>settings.highUsageThreshold?"var(--danger)":"var(--warn)",lineHeight:1}},liveKw),
                h("span",{style:{fontSize:12,color:"var(--text-muted)"}}," kW")
              ),
              h("span",{className:"badge "+(parseFloat(liveKw)<=settings.highUsageThreshold?"badge-success":"badge-danger")},parseFloat(liveKw)<=settings.highUsageThreshold?"Normal":"High")
            )
          ),
          h("div",{className:"stat-card fadeUp d2","data-tooltip":"Today's electricity cost"},
            h("div",{style:{position:"absolute",top:-20,right:-20,width:70,height:70,borderRadius:"50%",background:"var(--teal-glow)",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              h("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},h("span",{style:{fontSize:20}},"💰"),h("span",{className:"section-title"},"Today's Cost")),
              h("div",{style:{display:"flex",alignItems:"baseline",gap:2,marginBottom:6}},
                h("span",{style:{fontSize:28,fontWeight:700,fontFamily:"'IBM Plex Mono'",color:"var(--teal)",lineHeight:1}},"₹"+todayCost)
              ),
              h("span",{style:{fontSize:11,color:"var(--text-dim)"}},"₹"+settings.rate+"/kWh")
            )
          ),
          h("div",{className:"stat-card fadeUp d3","data-tooltip":"Estimated monthly bill"},
            h("div",{style:{position:"absolute",top:-20,right:-20,width:70,height:70,borderRadius:"50%",background:(parseInt(todayCost)*30>settings.monthlyBudget?"var(--danger)":"var(--blue)")+"12",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              h("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},h("span",{style:{fontSize:20}},"📅"),h("span",{className:"section-title"},"Monthly Est.")),
              h("div",{style:{display:"flex",alignItems:"baseline",gap:2,marginBottom:6}},
                h("span",{style:{fontSize:28,fontWeight:700,fontFamily:"'IBM Plex Mono'",color:parseInt(todayCost)*30>settings.monthlyBudget?"var(--danger)":"var(--blue)",lineHeight:1}},"₹"+(parseInt(todayCost)*30).toLocaleString())
              ),
              h("span",{style:{fontSize:11,color:"var(--text-dim)"}},"₹"+settings.monthlyBudget.toLocaleString()+" budget")
            )
          ),
          h("div",{className:"stat-card fadeUp d4","data-tooltip":"Peak power spike today"},
            h("div",{style:{position:"absolute",top:-20,right:-20,width:70,height:70,borderRadius:"50%",background:"rgba(239,68,68,0.08)",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              h("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:8}},h("span",{style:{fontSize:20}},"📈"),h("span",{className:"section-title"},"Peak Today")),
              h("div",{style:{display:"flex",alignItems:"baseline",gap:5,marginBottom:6}},
                h("span",{style:{fontSize:28,fontWeight:700,fontFamily:"'IBM Plex Mono'",color:"var(--danger)",lineHeight:1}},Math.max(...powerData.map(d=>d.kw)).toFixed(2)),
                h("span",{style:{fontSize:12,color:"var(--text-muted)"}}," kW")
              ),
              h("span",{style:{fontSize:11,color:"var(--text-dim)"}},powerData.reduce((s,d)=>s+d.kw,0).toFixed(1)+" kWh total")
            )
          )
        ),

        /* ── Charts row ── */
        h("div",{style:{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:14,marginBottom:14}},
          /* Weekly bar chart */
          h(Card,{className:"fadeUp d3"},
            h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},
              h("div",{style:{fontSize:14,fontWeight:700}},"📊 Weekly Consumption & Cost"),
              h("span",{className:"badge badge-teal"},"Last 7 days")
            ),
            h(ResponsiveContainer,{width:"100%",height:220},
              h(BarChart,{data:weeklyData,barGap:4},
                h(CartesianGrid,{strokeDasharray:"3 3",stroke:"#1E293B",vertical:false}),
                h(XAxis,{dataKey:"day",tick:{fontSize:10,fill:"var(--text-dim)"},axisLine:false,tickLine:false}),
                h(YAxis,{yAxisId:"kwh",tick:{fontSize:9,fill:"var(--text-dim)"},axisLine:false,tickLine:false}),
                h(YAxis,{yAxisId:"cost",orientation:"right",tick:{fontSize:9,fill:"var(--text-dim)"},axisLine:false,tickLine:false}),
                h(Tooltip,{contentStyle:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,fontSize:12,color:"var(--text)",padding:"10px 14px"},
                  labelStyle:{color:"var(--teal)",fontWeight:700,marginBottom:4},
                  itemStyle:{color:"var(--text-muted)"},cursor:{fill:"rgba(0,229,160,0.04)"}}),
                h(Bar,{yAxisId:"kwh",dataKey:"kwh",fill:"var(--blue)",radius:[6,6,0,0],name:"Usage (kWh)"}),
                h(Bar,{yAxisId:"cost",dataKey:"cost",fill:"var(--teal)",radius:[6,6,0,0],name:"Cost (₹)",fillOpacity:0.75})
              )
            )
          ),
          /* Room donut */
          h(Card,{className:"fadeUp d4",style:{display:"flex",flexDirection:"column"}},
            h("div",{style:{fontSize:14,fontWeight:700,marginBottom:12}},"🏠 Room-wise Breakdown"),
            roomData.length>0?h(React.Fragment,null,
              /* Room pills */
              h("div",{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}},
                h("button",{onClick:()=>setSelectedRoom(null),style:{padding:"3px 10px",borderRadius:20,border:`1px solid ${!selectedRoom?T.accent+"99":T.border}`,background:!selectedRoom?T.accentDim:"transparent",color:!selectedRoom?T.accent:T.textSec,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'",transition:"all .2s"}},"All"),
                roomData.map((r,i)=>h("button",{key:i,onClick:()=>setSelectedRoom(selectedRoom===r.name?null:r.name),style:{padding:"3px 10px",borderRadius:20,border:`1px solid ${selectedRoom===r.name?r.color+"99":T.border}`,background:selectedRoom===r.name?r.color+"22":"transparent",color:selectedRoom===r.name?r.color:"var(--text)",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'",display:"flex",alignItems:"center",gap:4,transition:"all .2s"}},
                  h("span",{style:{width:7,height:7,borderRadius:"50%",background:r.color,display:"inline-block"}}),r.name
                ))
              ),
              /* Donut */
              h(ResponsiveContainer,{width:"100%",height:160},
                h(PieChart,{style:{background:"transparent"}},
                  h(Pie,{data:roomData,cx:"50%",cy:"50%",innerRadius:52,outerRadius:70,dataKey:"value",paddingAngle:3,strokeWidth:0,onClick:(d)=>setSelectedRoom(selectedRoom===d.name?null:d.name)},
                    roomData.map((r,i)=>h(Cell,{key:i,
                      fill:r.color,
                      fillOpacity:selectedRoom&&selectedRoom!==r.name?0.3:1,
                      style:{cursor:"pointer",outline:"none",
                        filter:selectedRoom===r.name?"drop-shadow(0 0 10px "+r.color+") brightness(1.15)":"none",
                        transition:"all .3s"}}))
                  ),
                  h(Tooltip,{contentStyle:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,fontSize:12,color:"var(--text)"},formatter:(v,n)=>[v+"W",n]})
                )
              ),
              /* Custom legend */
              h("div",{style:{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginTop:6}},
                roomData.map((r,i)=>h("div",{key:i,onClick:()=>setSelectedRoom(selectedRoom===r.name?null:r.name),style:{display:"flex",alignItems:"center",gap:5,padding:"3px 8px",borderRadius:6,background:r.color+"10",border:`1px solid ${r.color}28`,opacity:selectedRoom&&selectedRoom!==r.name?.4:1,transition:"opacity .2s",cursor:"pointer"}},
                  h("span",{style:{width:7,height:7,borderRadius:"50%",background:r.color,flexShrink:0}}),
                  h("span",{style:{fontSize:10,fontWeight:700,color:r.color}},r.name),
                  h("span",{style:{fontSize:10,color:"var(--text-dim)"}}," "+r.value+"W")
                ))
              ),
              selectedRoom&&h("div",{style:{borderTop:"1px solid var(--border)",paddingTop:10,marginTop:8}},
                h("div",{className:"section-title",style:{marginBottom:6}},selectedRoom+" — Appliances"),
                appliances.filter(a=>a.room===selectedRoom||(selectedRoom==="All Rooms")).map(a=>h("div",{key:a.id,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--border)"}},
                  h("div",{style:{display:"flex",alignItems:"center",gap:8}},h("span",{style:{fontSize:15}},a.icon),h("div",null,h("div",{style:{fontSize:12,fontWeight:500}},a.name),h("div",{style:{fontSize:10,color:"var(--text-dim)"}},a.watts+"W"))),
                  h("div",{style:{display:"flex",alignItems:"center",gap:8}},
                    h("span",{style:{fontSize:11,fontWeight:700,color:a.on?"var(--teal)":"var(--text-dim)"}},a.on?"ON":"OFF"),
                    a.on&&h("span",{style:{fontSize:10,color:"var(--teal)"}},"₹"+((a.watts/1000)*settings.rate).toFixed(2)+"/hr")
                  )
                ))
              )
            ):h("div",{style:{textAlign:"center",padding:30,color:"var(--text-muted)"}},"All appliances are off")
          )
        ),

        /* ── Add Appliance Modal ── */
        showAddAppliance&&h("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}},
          h("div",{style:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,padding:28,width:360,boxShadow:"0 24px 60px rgba(0,0,0,.5)"}},
            h("h3",{style:{margin:"0 0 18px 0",fontSize:16,fontWeight:700}},"➕ Add Appliance"),
            [["Name","name","text","e.g. Air Cooler"],["Icon (emoji)","icon","text","e.g. 🌬️"],["Watts","watts","number","e.g. 200"]].map(([label,key,type,ph])=>h(React.Fragment,{key:key},
              h("label",{style:{fontSize:11,fontWeight:600,color:"var(--text-muted)",display:"block",marginBottom:4}},label.toUpperCase()),
              h("input",{type,placeholder:ph,value:newAppl[key],onChange:e=>setNewAppl(p=>({...p,[key]:e.target.value})),style:{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text)",fontSize:13,fontFamily:"'DM Sans'",outline:"none",marginBottom:12}})
            )),
            h("label",{style:{fontSize:11,fontWeight:600,color:"var(--text-muted)",display:"block",marginBottom:4}},"ROOM"),
            h("select",{value:newAppl.room,onChange:e=>setNewAppl(p=>({...p,room:e.target.value})),style:{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text)",fontSize:13,fontFamily:"'DM Sans'",marginBottom:16}},
              ["Bedroom","Kitchen","Living Room","Bathroom","All Rooms"].map(r=>h("option",{key:r,value:r},r))
            ),
            h("div",{style:{display:"flex",gap:10}},
              h("button",{onClick:()=>setShowAddAppliance(false),style:{flex:1,padding:"10px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text)",cursor:"pointer",fontWeight:600,fontFamily:"'DM Sans'"}},"Cancel"),
              h("button",{onClick:addAppliance,disabled:!newAppl.name.trim(),style:{flex:1,padding:"10px",borderRadius:10,border:"none",background:newAppl.name.trim()?T.gradient1:T.border,color:newAppl.name.trim()?"#000":T.textMuted,cursor:newAppl.name.trim()?"pointer":"default",fontWeight:700,fontFamily:"'DM Sans'"}},"Add Appliance")
            )
          )
        ),

        /* ── Appliance Card Grid ── */
        h(Card,{className:"fadeUp d5"},
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
            h("div",null,
              h("div",{style:{fontSize:14,fontWeight:700,color:"var(--text)"}},"🔌 Appliance Control"),
              h("div",{style:{fontSize:11,color:"var(--text-dim)",marginTop:2}},appliances.filter(a=>a.on).length+"/"+appliances.length+" active · "+liveWatts+"W total")
            ),
            h("button",{"data-tooltip":"Add a new appliance",onClick:()=>setShowAddAppliance(true),
              className:"btn btn-ghost",style:{fontSize:12,padding:"6px 14px"}},"+ Add")
          ),
          h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}},
            appliances.map(a=>h("div",{key:a.id,
              "data-tooltip":a.on?"ON — click toggle to turn off":"OFF — click toggle to turn on",
              style:{
                background:"var(--bg-card)",
                border:`1px solid ${a.on?"var(--teal)":"var(--border)"}`,
                borderRadius:"var(--radius)",
                padding:"1rem",
                transition:"border-color .2s ease, box-shadow .2s ease, opacity .2s ease",
                boxShadow:a.on?"0 0 18px rgba(0,229,160,0.12)":"none",
                opacity:togglingIds.has(a.id)?.55:1,
                display:"flex",flexDirection:"column",gap:10,
              }},
              /* Top row: icon + name + room badge + delete */
              h("div",{style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}},
                h("div",{style:{display:"flex",alignItems:"center",gap:10}},
                  h("div",{style:{
                    width:42,height:42,borderRadius:11,flexShrink:0,
                    background:a.on?"rgba(0,229,160,0.12)":"var(--bg-input)",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,
                    transition:"background .2s"
                  }},a.icon),
                  h("div",null,
                    h("div",{style:{fontSize:15,fontWeight:700,color:"var(--text)",lineHeight:1.2}},a.name),
                    h("span",{className:"badge badge-blue",style:{marginTop:4,display:"inline-flex"}},a.room)
                  )
                ),
                h("button",{onClick:()=>deleteAppliance(a.id),title:"Remove",style:{
                  background:"none",border:"none",color:"var(--text-dim)",fontSize:18,
                  cursor:"pointer",padding:"2px 4px",lineHeight:1,opacity:.4,transition:"opacity .15s"},
                  onMouseEnter:e=>e.currentTarget.style.opacity="1",
                  onMouseLeave:e=>e.currentTarget.style.opacity=".4"
                },"×")
              ),
              /* Middle: watts in mono font */
              h("div",{style:{paddingLeft:2}},
                h("span",{style:{
                  fontSize:26,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",lineHeight:1,
                  color:a.on?"var(--teal)":"var(--text-dim)",transition:"color .2s"
                }},a.watts),
                h("span",{style:{fontSize:12,color:"var(--text-muted)",marginLeft:4,fontWeight:500}},"W")
              ),
              /* Bottom: cost/hr on left, toggle on right */
              h("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between"}},
                h("span",{style:{fontSize:12,color:"var(--text-muted)"}},
                  a.on ? "₹"+((a.watts/1000)*settings.rate).toFixed(2)+"/hr" : "Standby"
                ),
                h(Toggle,{on:a.on,onToggle:()=>toggleAppliance(a.id),disabled:togglingIds.has(a.id)})
              )
            ))
          )
        ),

        /* ── Energy Recommendations ── */
        h("div",{style:{marginTop:16,marginBottom:8}},
          h("div",{className:"section-title",style:{marginBottom:12}},"💡 Energy Saving Recommendations"),
          h("div",{style:{display:"flex",flexDirection:"column",gap:8}},
            [
              {icon:"🌡️",text:"Geyser has been ON for over 2 hours. Turn it off to save an est. ₹"+(((2000/1000)*settings.rate)*2).toFixed(0)+"."},
              {icon:"❄️",text:"AC is your biggest load ("+Math.round((1480/Math.max(liveWatts,1))*100)+"% of total). Setting thermostat to 24°C cuts usage by ~18%."},
              {icon:"💡",text:"Tube Lights (×6) are ON. Switching to LED replacements cuts lighting cost by up to 60%."},
              {icon:"📅",text:"Monthly estimate: ₹"+(parseInt(todayCost)*30).toLocaleString()+". Budget: ₹"+settings.monthlyBudget.toLocaleString()+"."+(parseInt(todayCost)*30>settings.monthlyBudget?" ⚠️ Over budget!":" ✓ On track.")},
            ].map((rec,i)=>h("div",{key:i,className:"fade-in",style:{
              display:"flex",alignItems:"flex-start",gap:12,
              padding:"12px 14px",
              background:"var(--bg-card)",
              border:"1px solid var(--border)",
              borderLeft:"3px solid var(--teal)",
              borderRadius:"var(--radius-sm)",
              animationDelay:(i*0.07)+"s",
            }},
              h("span",{style:{fontSize:20,flexShrink:0,marginTop:1}},rec.icon),
              h("span",{style:{fontSize:13,color:"var(--text-muted)",lineHeight:1.6}},rec.text)
            ))
          )
        )
      ),

      /* ═══ NETWORK ═══ */

      tab==="network"&&h(React.Fragment,null,
        /* Stat cards */
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:16}},
          h("div",{className:"fadeUp d1"},h(Stat,{label:"Bandwidth Used",value:totalBw,unit:"GB today",icon:"\uD83D\uDCCA",color:T.blue})),
          h("div",{className:"fadeUp d2"},h(Stat,{label:"Devices Online",value:onlineCount,unit:`/ ${devices.length}`,icon:"\uD83D\uDCE1",color:"var(--teal)"})),
          h("div",{className:"fadeUp d3"},h(Stat,{label:"Blocked Devices",value:devices.filter(d=>d.blocked).length,unit:"",icon:"\uD83D\uDEAB",color:T.red}))
        ),

        /* Bandwidth chart — area with teal fill */
        h(Card,{style:{marginBottom:14},className:"fadeUp d3"},
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},
            h("div",{style:{fontSize:14,fontWeight:700}},"\uD83D\uDCCA Bandwidth History (24hr)"),
            h("span",{className:"badge badge-teal"},"Real-time")
          ),
          h(ResponsiveContainer,{width:"100%",height:200},
            h(AreaChart,{data:bandwidthData},
              h("defs",null,
                h("linearGradient",{id:"bwDown",x1:0,y1:0,x2:0,y2:1},
                  h("stop",{offset:"0%",stopColor:"var(--teal)",stopOpacity:.25}),
                  h("stop",{offset:"100%",stopColor:"var(--teal)",stopOpacity:0})
                ),
                h("linearGradient",{id:"bwUp",x1:0,y1:0,x2:0,y2:1},
                  h("stop",{offset:"0%",stopColor:"var(--blue)",stopOpacity:.2}),
                  h("stop",{offset:"100%",stopColor:"var(--blue)",stopOpacity:0})
                )
              ),
              h(CartesianGrid,{strokeDasharray:"3 3",stroke:"#1E293B",vertical:false}),
              h(XAxis,{dataKey:"hour",tick:{fontSize:9,fill:"var(--text-dim)"},interval:3,axisLine:false,tickLine:false}),
              h(YAxis,{tick:{fontSize:9,fill:"var(--text-dim)"},axisLine:false,tickLine:false,unit:" GB"}),
              h(Tooltip,{contentStyle:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:10,fontSize:12,color:"var(--text)",padding:"10px 14px"},
                labelStyle:{color:"var(--teal)",fontWeight:700},itemStyle:{color:"var(--text-muted)"},cursor:{fill:"rgba(0,229,160,0.04)"}}),
              h(Area,{type:"monotone",dataKey:"down",stroke:"var(--teal)",strokeWidth:2,fill:"url(#bwDown)",name:"Download"}),
              h(Area,{type:"monotone",dataKey:"up",stroke:"var(--blue)",strokeWidth:1.5,fill:"url(#bwUp)",name:"Upload"})
            )
          )
        ),

        /* Device list */
        h(Card,{className:"fadeUp d4"},
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
            h("div",{style:{fontSize:14,fontWeight:700}},"\uD83D\uDCE1 Connected Devices"),
            h("span",{className:"badge badge-teal"},onlineCount+" online")
          ),
          /* Search bar with icon */
          h("div",{style:{position:"relative",marginBottom:14}},
            h("span",{style:{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"var(--text-dim)",pointerEvents:"none"}},"\uD83D\uDD0D"),
            h("input",{type:"text",placeholder:"Search by name, IP, or MAC\u2026",className:"inp",value:deviceSearch,
              onChange:e=>setDeviceSearch(e.target.value),
              style:{paddingLeft:36}})
          ),
          /* Device rows */
          devices.filter(d=>!deviceSearch||d.name.toLowerCase().includes(deviceSearch.toLowerCase())||d.ip.includes(deviceSearch)||d.mac.toLowerCase().includes(deviceSearch.toLowerCase())).map((d,i,arr)=>{
            /* Icon circle color */
            const iconBg={phone:"rgba(59,130,246,0.15)",laptop:"rgba(139,92,246,0.15)",tv:"rgba(0,229,160,0.12)",gaming:"rgba(245,158,11,0.15)",unknown:"rgba(239,68,68,0.15)"}[d.type]||"var(--bg-input)";
            const iconColor={phone:"var(--blue)",laptop:"var(--purple)",tv:"var(--teal)",gaming:"var(--warn)",unknown:"var(--danger)"}[d.type]||"var(--text-muted)";
            const bwColor=d.bw>settings.bandwidthThreshold?"var(--warn)":d.bw>5?"var(--blue)":"var(--success)";
            return h("div",{key:d.id,style:{
              display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"12px 10px",borderRadius:"var(--radius-sm)",
              marginBottom:i<arr.length-1?6:0,
              background:!d.wl?"rgba(239,68,68,0.04)":d.blocked?"rgba(239,68,68,0.04)":"transparent",
              border:`1px solid ${!d.wl||d.blocked?"rgba(239,68,68,0.12)":"transparent"}`,
              opacity:d.online?1:.5,
              transition:"background .15s",
            }},
              /* Left: icon circle + name/IP */
              h("div",{style:{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}},
                h("div",{style:{
                  width:40,height:40,borderRadius:"50%",flexShrink:0,
                  background:iconBg,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:18,color:iconColor
                }},devIcons[d.type]),
                h("div",{style:{minWidth:0}},
                  h("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
                    h("span",{style:{fontSize:13,fontWeight:700,color:"var(--text)"}},d.name),
                    !d.wl&&h("span",{className:"badge badge-danger"},"\u26A0 Unknown"),
                    d.blocked&&h("span",{className:"badge badge-danger"},"Blocked")
                  ),
                  h("div",{style:{fontSize:11,color:"var(--text-dim)",fontFamily:"'IBM Plex Mono',monospace",marginTop:2}},d.ip)
                )
              ),
              /* Right: bw pill + status + block btn */
              h("div",{style:{display:"flex",alignItems:"center",gap:8,flexShrink:0}},
                d.online&&h("span",{style:{
                  fontSize:11,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",
                  padding:"2px 8px",borderRadius:20,
                  background:bwColor+"15",color:bwColor,border:`1px solid ${bwColor}30`
                }},d.bw+" GB"),
                h("span",{className:`badge ${d.blocked?"badge-danger":d.online?"badge-success":"badge-warn"}`},
                  d.blocked?"Blocked":d.online?"Online":"Offline"),
                h("button",{"data-tooltip":d.blocked?"Allow internet access":"Block from internet",
                  onClick:()=>toggleDeviceBlock(d.id),
                  className:`btn ${d.blocked?"btn-ghost":"btn-danger"}`,
                  style:{fontSize:11,padding:"4px 10px"}},
                  d.blocked?"Unblock":"Block")
              )
            );
          })
        ),
        h(SpeedTest,null)
      ),

      /* ═══ CAMERAS ═══ */
      tab==="cameras"&&h(React.Fragment,null,
        /* Add Camera Modal */
        showAddCamera&&h("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",backdropFilter:"blur(4px)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center"}},
          h("div",{style:{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:24,padding:32,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,.6)",animation:"zoomIn .3s ease"}},
            h("h3",{style:{margin:"0 0 6px",fontSize:20}},"📹 Add New Camera"),
            h("p",{style:{margin:"0 0 20px",fontSize:12,color:"var(--text-muted)"}},"Camera will be added as active immediately"),
            h("form",{onSubmit:addCamera,style:{display:"flex",flexDirection:"column",gap:14}},
              h("div",null,
                h("label",{style:{fontSize:11,fontWeight:600,color:"var(--text-muted)",display:"block",marginBottom:5}},"CAMERA NAME *"),
                h("input",{placeholder:"e.g. Front Door, Backyard",required:true,value:camForm.name,
                  onChange:e=>setCamForm(f=>({...f,name:e.target.value})),
                  style:{width:"100%",padding:"11px 14px",borderRadius:10,border:"1px solid var(--border)",
                    background:"var(--bg-card)",color:"var(--text)",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}})
              ),
              h("div",null,
                h("label",{style:{fontSize:11,fontWeight:600,color:"var(--text-muted)",display:"block",marginBottom:5}},"LOCATION *"),
                h("input",{placeholder:"e.g. Ground Floor, Gate",required:true,value:camForm.location,
                  onChange:e=>setCamForm(f=>({...f,location:e.target.value})),
                  style:{width:"100%",padding:"11px 14px",borderRadius:10,border:"1px solid var(--border)",
                    background:"var(--bg-card)",color:"var(--text)",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}})
              ),
              h("div",null,
                h("label",{style:{fontSize:11,fontWeight:600,color:"var(--text-muted)",display:"block",marginBottom:5}},"STREAM URL (optional)"),
                h("input",{placeholder:"rtsp:// or http:// stream address",value:camForm.stream_url,
                  onChange:e=>setCamForm(f=>({...f,stream_url:e.target.value})),
                  style:{width:"100%",padding:"11px 14px",borderRadius:10,border:"1px solid var(--border)",
                    background:"var(--bg-card)",color:"var(--text)",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}})
              ),
              h("div",{style:{display:"flex",gap:12,marginTop:6}},
                h("button",{type:"button",onClick:()=>setShowAddCamera(false),
                  style:{flex:1,padding:"11px",borderRadius:10,border:"1px solid var(--border)",
                    background:"transparent",color:"var(--text)",cursor:"pointer",fontWeight:600,fontFamily:"inherit"}},"Cancel"),
                h("button",{type:"submit",
                  style:{flex:1,padding:"11px",borderRadius:10,border:"none",
                    background:T.accent,color:"#111",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}},"Add Camera")
              )
            )
          )
        ),
        /* Stat cards */
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:16}},
          h("div",{className:"fadeUp d1"},h(Stat,{label:"Active Cameras",value:activeCams,unit:`/ ${cameras.length}`,icon:"📹",color:"var(--teal)"})),
          h("div",{className:"fadeUp d2"},h(Stat,{label:"Motion Events",value:totalMotion,unit:"today",icon:"🔍",color:T.orange})),
          h("div",{className:"fadeUp d3"},h(Stat,{label:"Persons Detected",value:motionLog.filter(m=>m.type==="Person").length,unit:"today",icon:"👤",color:T.red}))
        ),
        /* Camera grid header */
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}},
          h("div",{style:{fontSize:14,fontWeight:600}},"📷 Camera Feeds ",h("span",{style:{fontSize:11,color:"var(--text-muted)",fontWeight:400}},`(${cameras.length} cameras)`)),
          h("button",{"data-tooltip":"Add a new camera",onClick:()=>setShowAddCamera(true),
            style:{padding:"7px 16px",borderRadius:8,border:"none",background:"var(--teal-glow)",
              color:"var(--teal)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'",
              display:"flex",alignItems:"center",gap:6}},"📹 + Add Camera")
        ),
        /* Camera cards */
        cameras.length===0
          ?h(Card,{style:{textAlign:"center",padding:40,color:"var(--text-muted)"}},
              h("div",{style:{fontSize:40,marginBottom:12}},"📷"),
              h("div",{style:{fontSize:14,fontWeight:600,marginBottom:8}},"No cameras yet"),
              h("div",{style:{fontSize:12,marginBottom:20}},"Add your first camera to start monitoring"),
              h("button",{onClick:()=>setShowAddCamera(true),
                style:{padding:"10px 24px",borderRadius:10,border:"none",background:T.accent,
                  color:"#111",fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'"}},"+ Add Camera")
            )
          :h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginBottom:14}},
              cameras.map(c=>h("div",{key:c.id,className:"fadeUp d"+(c.id%6+1)},h(CamFeed,{cam:c,onToggle:toggleCam,onDelete:deleteCamera})))
            ),
        /* Motion log */
        h(Card,{className:"fadeUp d5"},
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
            h("div",null,
              h("div",{style:{fontSize:14,fontWeight:700}},"📋 Motion Event Log"),
              h("div",{style:{fontSize:11,color:"var(--text-dim)",marginTop:2}},motionLog.length+" events • Live")
            ),
            h("button",{onClick:async()=>{
              const res=await api.post("/cameras/motions/simulate");
              if(res){
                setMotionLog(l=>[{id:++nextMotionId.current,cam:res.cam,time:res.time,type:res.type,severity:res.severity,img:res.img},...l].slice(0,20));
                setCameras(c=>c.map(x=>x.name===res.cam?{...x,motionEvents:(x.motionEvents||0)+1}:x));
                addToast("📹","Motion Simulated",`${res.type} at ${res.cam}`,T.orange);
              }
            },className:"btn btn-ghost",style:{fontSize:11,padding:"5px 12px"}},"▶ Simulate")
          ),
          h("div",{style:{position:"relative",paddingLeft:28}},
            h("div",{style:{position:"absolute",left:10,top:4,bottom:4,width:2,background:"linear-gradient(to bottom,var(--teal),var(--blue))",borderRadius:2,opacity:.35}}),
            motionLog.slice(0,12).map((m,i)=>h("div",{key:m.id,style:{
              position:"relative",display:"flex",alignItems:"flex-start",gap:12,
              padding:"8px 8px 8px 0",marginBottom:i<Math.min(motionLog.length,12)-1?4:0,
              borderRadius:"var(--radius-sm)",
              background:m.severity==="high"?"rgba(239,68,68,0.06)":"transparent",
              border:m.severity==="high"?"1px solid rgba(239,68,68,0.12)":"1px solid transparent",
            }},
              h("div",{style:{
                position:"absolute",left:-22,top:10,
                width:14,height:14,borderRadius:"50%",flexShrink:0,
                background:sevColor[m.severity]||"var(--blue)",
                border:"2px solid var(--bg-card)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,zIndex:1,
              }},m.img),
              h("div",{style:{flex:1,minWidth:0}},
                h("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}},
                  h("span",{style:{fontSize:12,fontWeight:700,color:"var(--text)"}},m.cam),
                  h("span",{className:`badge badge-${m.severity==="high"?"danger":m.severity==="medium"?"warn":"success"}`,style:{fontSize:9,padding:"1px 6px"}},m.severity),
                  h("span",{style:{fontSize:11,color:"var(--text-muted)"}},"• "+m.type)
                ),
                h("span",{style:{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",color:"var(--text-dim)"}},m.time)
              )
            ))
          )
        )

      ),

      /* ═══ ALERTS ═══ */
      tab==="alerts"&&h(React.Fragment,null,

        /* Header row */
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
          h("div",null,
            h("h2",{style:{fontSize:18,fontWeight:700,margin:0}},"\uD83D\uDD14 Alerts"),
            h("p",{style:{fontSize:12,color:"var(--text-muted)",marginTop:2}},unreadAlerts+" unread of "+alerts.length)
          ),
          h("div",{style:{display:"flex",gap:8}},
            h("button",{"data-tooltip":"Mark every alert as seen",onClick:markAllRead,className:"btn btn-ghost",style:{fontSize:12,padding:"6px 14px"}},"Mark all read"),
            h("button",{"data-tooltip":"Remove all dismissed alerts",onClick:clearRead,className:"btn btn-danger",style:{fontSize:12,padding:"6px 14px"}},"Clear read")
          )
        ),

        /* Pill filter tabs */
        h("div",{style:{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}},
          [
            {id:"all",label:"All",count:alerts.length},
            {id:"unread",label:"Unread",count:unreadAlerts},
            {id:"danger",label:"\uD83D\uDD34 Danger"},
            {id:"warning",label:"\uD83D\uDFE0 Warning"},
            {id:"info",label:"\uD83D\uDD35 Info"},
            {id:"success",label:"\uD83D\uDFE2 Success"},
          ].map(f=>
            h("button",{key:f.id,onClick:()=>setAlertFilter(f.id),style:{
              padding:"5px 14px",borderRadius:20,border:"1px solid var(--border)",
              background:alertFilter===f.id?"var(--teal)":"var(--bg-card)",
              color:alertFilter===f.id?"#0A0F1A":"var(--text-muted)",
              fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'",
              transition:"all .15s ease",
              display:"flex",alignItems:"center",gap:5,
            }},
              f.label,
              f.count!=null&&h("span",{style:{
                background:alertFilter===f.id?"rgba(0,0,0,0.15)":"var(--bg-input)",
                color:alertFilter===f.id?"#0A0F1A":"var(--text-dim)",
                borderRadius:10,padding:"0 5px",fontSize:10,fontWeight:700
              }},f.count)
            )
          )
        ),

        /* Alert list */
        (()=>{
          const typeColors={danger:"var(--danger)",warning:"var(--warn)",info:"var(--blue)",success:"var(--success)"};
          const fa=alertFilter==="all"?alerts:alertFilter==="unread"?alerts.filter(a=>!a.read):alerts.filter(a=>a.type===alertFilter);
          if(fa.length===0) return h(Card,{style:{textAlign:"center",padding:"52px 24px",position:"relative",overflow:"hidden"}},
            h("div",{style:{position:"absolute",inset:0,background:"radial-gradient(circle at 50% 60%,var(--teal-glow),transparent 65%)",pointerEvents:"none"}}),
            h("div",{style:{position:"relative"}},
              h("div",{style:{fontSize:48,marginBottom:12}},"\u2705"),
              h("div",{style:{fontSize:16,fontWeight:700,marginBottom:6,color:"var(--text)"}},"All clear!"),
              h("div",{style:{fontSize:13,color:"var(--text-muted)"}},
                alertFilter==="all"?"No alerts recorded yet.":"No "+alertFilter+" alerts right now.")
            )
          );
          return h("div",{style:{display:"flex",flexDirection:"column",gap:6}},
            fa.map(a=>{
              const col=typeColors[a.type]||"var(--blue)";
              return h("div",{key:a.id,className:"alert-row",style:{
                display:"flex",alignItems:"stretch",
                borderRadius:"var(--radius-sm)",overflow:"hidden",
                background:a.read?"var(--bg-card)":col+"08",
                border:`1px solid ${a.read?"var(--border)":col+"28"}`,
                opacity:a.read?.6:1,
                transition:"all .15s ease",
                cursor:"default",
              },
                onMouseEnter:e=>e.currentTarget.style.background=a.read?"var(--bg-card-hover)":col+"14",
                onMouseLeave:e=>e.currentTarget.style.background=a.read?"var(--bg-card)":col+"08",
              },
                /* Left vertical color bar */
                h("div",{style:{
                  width:3,flexShrink:0,
                  background:col,
                  boxShadow:a.read?"none":`0 0 8px ${col}80`,
                }}),
                /* Content */
                h("div",{style:{padding:"12px 14px",flex:1,minWidth:0}},
                  h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
                    h("div",{style:{display:"flex",alignItems:"center",gap:6}},
                      h("span",{className:`badge badge-${a.type==="danger"?"danger":a.type==="warning"?"warn":a.type==="success"?"success":"blue"}`},a.type),
                      h("span",{className:"badge",style:{background:"var(--bg-input)",color:"var(--text-dim)",border:"1px solid var(--border)"}},a.module),
                      !a.read&&h("span",{style:{width:6,height:6,borderRadius:"50%",background:"var(--teal)",flexShrink:0,display:"inline-block"}})  
                    ),
                    h("span",{style:{fontSize:10,color:"var(--text-dim)",whiteSpace:"nowrap",marginLeft:8}},a.time)
                  ),
                  h("div",{style:{fontSize:14,lineHeight:1.55,color:"var(--text)"}},a.icon," ",a.msg)
                ),
                /* Dismiss button — always visible for unread */
                !a.read&&h("button",{"data-tooltip":"Dismiss this alert",onClick:()=>dismissAlert(a.id),
                  style:{
                    alignSelf:"center",marginRight:12,padding:"5px 12px",
                    borderRadius:"var(--radius-sm)",border:"1px solid var(--border)",
                    background:"var(--bg-input)",color:"var(--text-muted)",
                    fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans'",
                    whiteSpace:"nowrap",flexShrink:0,
                    transition:"var(--transition)",
                  },
                  onMouseEnter:e=>{e.currentTarget.style.borderColor=col;e.currentTarget.style.color=col;},
                  onMouseLeave:e=>{e.currentTarget.style.borderColor="var(--border)";e.currentTarget.style.color="var(--text-muted)";}
                },"Dismiss")
              );
            })
          );
        })()
      ),

      /* ═══ AUTOMATIONS ═══ */
      tab==="automations"&&h(React.Fragment,null,
        /* New Rule Modal */
        showAutoModal&&h(AutomationModal,{appliances,onClose:()=>setShowAutoModal(false),onCreate:async rule=>{await createAutomation(rule);setShowAutoModal(false);}}),
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
          h("div",null,
            h("h2",{style:{fontSize:18,fontWeight:700,margin:0}},"🤖 Automations"),
            h("p",{style:{fontSize:12,color:"var(--text-muted)",marginTop:2}},automations.length+" rule"+(automations.length!==1?"s":""))
          ),
          h("button",{onClick:()=>setShowAutoModal(true),
            style:{padding:"10px 20px",borderRadius:10,border:"none",background:T.gradient1,
              color:"#000",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans'",
              boxShadow:`0 4px 20px ${T.accent}33`}},"+ New Rule")
        ),
        automations.length===0&&h(Card,{style:{textAlign:"center",padding:48}},
          h("div",{style:{fontSize:40,marginBottom:12}},"🤖"),
          h("div",{style:{fontSize:15,fontWeight:600,color:"var(--text)",marginBottom:6}},"No automations yet"),
          h("div",{style:{fontSize:12,color:"var(--text-muted)"}},"Create IF-THEN rules to automate your home"),
          h("button",{onClick:()=>setShowAutoModal(true),
            style:{marginTop:16,padding:"10px 24px",borderRadius:10,border:"none",
              background:T.gradient1,color:"#000",fontSize:13,fontWeight:700,
              cursor:"pointer",fontFamily:"'DM Sans'"}},"Create your first rule")
        ),
        h("div",{style:{display:"flex",flexDirection:"column",gap:10}},
          automations.map(rule=>{
            const now2=new Date();
            const firedRecently=rule.last_fired&&(now2-new Date(rule.last_fired))/1000<60;
            const triggerLabel={power_exceeds:`Power > ${rule.trigger_params.kw||5} kW`,camera_detects:`Camera detects ${rule.trigger_params.event||"Person"}`,time_is:`Time is ${rule.trigger_params.time||"23:00"}`,appliance_on:`Appliance on for ${rule.trigger_params.hours||2}h`}[rule.trigger_type]||rule.trigger_type;
            const actionLabel={turn_on:`Turn ON appliance #${rule.action_params.appliance_id||"?"}`,turn_off:`Turn OFF appliance #${rule.action_params.appliance_id||"?"}`,create_alert:rule.action_params.message||"Create alert"}[rule.action_type]||rule.action_type;
            const appliance=appliances.find(a=>a.id===(rule.action_params.appliance_id||0));
            const actionDisplay=appliance?((rule.action_type==="turn_on"?"Turn ON ":"Turn OFF ")+appliance.icon+" "+appliance.name):actionLabel;
            return h(Card,{key:rule.id,style:{opacity:rule.enabled?1:.55,borderLeft:`3px solid ${rule.enabled?T.accent:T.border}`,transition:"all .3s"}},
              h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}},
                h("div",{style:{flex:1}},
                  h("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:8}},
                    h("span",{style:{fontSize:15,fontWeight:700,color:"var(--text)"}},rule.name),
                    firedRecently&&h("span",{style:{fontSize:10,padding:"3px 8px",borderRadius:20,background:T.accent+"22",color:"var(--teal)",fontWeight:700,animation:"pulse 2s infinite"}},"⚡ TRIGGERED")
                  ),
                  h("div",{style:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}},
                    h("div",{style:{padding:"6px 12px",borderRadius:8,background:"rgba(59,130,246,0.12)",border:`1px solid ${T.blue}33`,fontSize:12}},
                      h("span",{style:{color:"var(--text-muted)",fontSize:10,marginRight:5}},"IF"),
                      h("strong",{style:{color:T.blue}},triggerLabel)
                    ),
                    h("span",{style:{fontSize:20}},"→"),
                    h("div",{style:{padding:"6px 12px",borderRadius:8,background:"var(--teal-glow)",border:`1px solid ${T.accent}33`,fontSize:12}},
                      h("span",{style:{color:"var(--text-muted)",fontSize:10,marginRight:5}},"THEN"),
                      h("strong",{style:{color:"var(--teal)"}},actionDisplay)
                    )
                  ),
                  rule.last_fired&&h("div",{style:{fontSize:10,color:"var(--text-muted)",marginTop:6}},
                    "Last fired: "+new Date(rule.last_fired).toLocaleTimeString()
                  )
                ),
                h("div",{style:{display:"flex",alignItems:"center",gap:10,marginLeft:14}},
                  h(Toggle,{on:rule.enabled,onToggle:()=>toggleAutomation(rule)}),
                  h("button",{onClick:()=>deleteAutomation(rule.id),
                    style:{padding:"6px 10px",borderRadius:8,border:"none",
                      background:"rgba(239,68,68,0.12)",color:"var(--danger)",fontSize:14,cursor:"pointer"}},"🗑")
                )
              )
            );
          })
        )
      ),

      /* ═══ ADMIN PANEL ═══ */
      tab==="admin"&&user?.role==="admin"&&h(AdminPanel,{user,addToast}),

      /* ═══ SETTINGS ═══ */
      tab==="settings"&&h(React.Fragment,null,
        h("h2",{style:{fontSize:18,fontWeight:700,marginBottom:16}},"⚙️ Settings"),
        h("div",{style:{display:"flex",gap:8,marginBottom:16}},["general","power","network","security"].map(t=>h("button",{key:t,onClick:()=>setSettingsTab(t),style:{padding:"8px 16px",borderRadius:8,border:"none",background:settingsTab===t?T.accentDim:T.surface,color:settingsTab===t?T.accent:T.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans'",textTransform:"capitalize"}},t))),

        settingsTab==="general"&&h(Card,null,h("div",{style:{fontSize:14,fontWeight:600,marginBottom:16}},"General Settings"),
          h("div",{style:{display:"flex",alignItems:"center",gap:14,padding:"14px 0",marginBottom:8,borderBottom:"1px solid rgba(30,41,59,0.2)"}},
            h("div",{style:{width:44,height:44,borderRadius:12,background:user.role==="admin"?T.accentDim:T.blueDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:user.role==="admin"?T.accent:T.blue,flexShrink:0}},user.name.charAt(0).toUpperCase()),
            h("div",{style:{flex:1}},
              h("div",{style:{fontSize:14,fontWeight:600,color:"var(--text)"}},user.name),
              h("div",{style:{fontSize:11,color:"var(--text-muted)",marginTop:1}},user.email)
            ),
            h(Badge,{text:user.role.toUpperCase(),color:user.role==="admin"?T.accent:T.blue})
          ),
          h("div",{style:{marginBottom:20,paddingBottom:16,borderBottom:"1px solid rgba(30,41,59,0.2)"}},
            h("div",{style:{fontSize:13,fontWeight:500,marginBottom:4}},"System Report"),
            h("div",{style:{fontSize:11,color:"var(--text-muted)",marginBottom:12}},"Generate a comprehensive PDF summary of your home's usage and status."),
            h("button",{onClick:generatePDF,style:{padding:"10px 18px",borderRadius:8,background:T.accent,color:"#000",border:"none",fontWeight:700,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:8}},h("span",null,"📄"),"Download PDF Report")
          ),
          [{key:"darkMode",label:"Dark Mode",desc:"Use dark theme across dashboard"},{key:"autoRefresh",label:"Auto-refresh Data",desc:"Refresh stats every 2.5 seconds"},{key:"pushNotifications",label:"Push Notifications",desc:"Toast notifications for critical alerts"},{key:"soundAlerts",label:"Sound Alerts",desc:"Play sound on high-severity alerts"},{key:"simulationMode",label:"Simulation Mode",desc:"Generate random motion events for demo"}].map((s,i)=>h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:"1px solid rgba(30,41,59,0.2)"}},h("div",null,h("div",{style:{fontSize:13,fontWeight:500}},s.label),h("div",{style:{fontSize:11,color:"var(--text-muted)"}},s.desc)),h(Toggle,{on:settings[s.key],onToggle:()=>updateSetting(s.key,!settings[s.key])})))),

        settingsTab==="power"&&h(Card,null,h("div",{style:{fontSize:14,fontWeight:600,marginBottom:16}},"Power Settings"),
          [{key:"rate",label:"Electricity Rate (₹/kWh)",step:.5,min:1,max:20},{key:"highUsageThreshold",label:"High Usage Alert (kW)",step:.5,min:1,max:10},{key:"runtimeAlert",label:"Runtime Alert (hours)",step:.5,min:.5,max:8},{key:"monthlyBudget",label:"Monthly Budget (₹)",step:100,min:500,max:10000}].map((s,i)=>h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:"1px solid rgba(30,41,59,0.2)"}},
            h("div",{style:{fontSize:13,fontWeight:500}},s.label),
            h("div",{style:{display:"flex",alignItems:"center",gap:8}},
              h("button",{onClick:()=>updateSetting(s.key,Math.max(s.min,settings[s.key]-s.step)),style:{width:28,height:28,borderRadius:6,border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text)",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}},"−"),
              h("div",{style:{minWidth:60,textAlign:"center",padding:"6px 12px",borderRadius:8,background:"var(--bg-card)",border:"1px solid var(--border)",fontSize:13,color:"var(--teal)",fontFamily:"'IBM Plex Mono'",fontWeight:600}},s.key==="rate"?"₹"+settings[s.key]:s.key==="monthlyBudget"?"₹"+settings[s.key].toLocaleString():settings[s.key]),
              h("button",{onClick:()=>updateSetting(s.key,Math.min(s.max,settings[s.key]+s.step)),style:{width:28,height:28,borderRadius:6,border:"1px solid var(--border)",background:"var(--bg-card)",color:"var(--text)",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}},"+")
            )
          ))),

        settingsTab==="network"&&h(Card,null,h("div",{style:{fontSize:14,fontWeight:600,marginBottom:16}},"Network Settings"),
          [{key:"autoBlockUnknown",label:"Auto-block Unknown Devices",desc:"Block unrecognized MAC addresses"},{key:"bandwidthAlert",label:"Bandwidth Alert",desc:`Alert when device exceeds ${settings.bandwidthThreshold} GB/day`},{key:"parentalControls",label:"Parental Controls",desc:"Time-based internet restrictions"}].map((s,i)=>h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:"1px solid rgba(30,41,59,0.2)"}},h("div",null,h("div",{style:{fontSize:13,fontWeight:500}},s.label),h("div",{style:{fontSize:11,color:"var(--text-muted)"}},s.desc)),h(Toggle,{on:settings[s.key],onToggle:()=>updateSetting(s.key,!settings[s.key])})))),

        settingsTab==="security"&&h(Card,null,h("div",{style:{fontSize:14,fontWeight:600,marginBottom:16}},"Security Settings"),
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:"1px solid rgba(30,41,59,0.2)"}},h("div",{style:{fontSize:13,fontWeight:500}},"Motion Sensitivity"),h("div",{style:{display:"flex",gap:6}},["Low","Medium","High"].map(l=>h("button",{key:l,onClick:()=>updateSetting("motionSensitivity",l),style:{padding:"6px 14px",borderRadius:8,border:`1px solid ${settings.motionSensitivity===l?T.accent+"44":T.border}`,background:settings.motionSensitivity===l?T.accentDim:T.surface,color:settings.motionSensitivity===l?T.accent:T.textSec,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans'"}},l)))),
          [{key:"snapshotOnMotion",label:"Snapshot on Motion",desc:"Save image on motion"},{key:"recordClips",label:"Record Clips",desc:"15-sec clips on events"}].map((s,i)=>h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:"1px solid rgba(30,41,59,0.2)"}},h("div",null,h("div",{style:{fontSize:13,fontWeight:500}},s.label),h("div",{style:{fontSize:11,color:"var(--text-muted)"}},s.desc)),h(Toggle,{on:settings[s.key],onToggle:()=>updateSetting(s.key,!settings[s.key])})))
        ),
        
        /* TERMINAL WIDGET */
        h(TerminalWidget, null)
      )
    ),
    /* FOOTER */
    h("footer",{style:{padding:"16px 20px",borderTop:`1px solid ${T.border}`,textAlign:"center"}},h("span",{style:{fontSize:11,color:"var(--text-muted)"}},"GrihaNet v1.0 • Built by Team GrihaNet • VIT Vellore © 2026")),
    
    /* 💬 CHAT WIDGET */
    h(ChatWidget, {user, appliances, devices, cameras, alerts})
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(GrihaNet));
