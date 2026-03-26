const { useState, useEffect, useRef, useCallback } = React;
const {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} = Recharts;

/* ─── THEME ─── */
const T = {
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

/* ─── API HELPER ─── */
const api = {
  token: null,
  async call(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    try {
      const res = await fetch(`/api${path}`, { ...opts, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`API ${path}:`, e.message);
      return null;
    }
  },
  get: (p) => api.call(p),
  post: (p, b) => api.call(p, { method: "POST", body: JSON.stringify(b) }),
  put: (p, b) => api.call(p, { method: "PUT", body: b ? JSON.stringify(b) : undefined }),
  del: (p) => api.call(p, { method: "DELETE" }),
};

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
function Card({children,style,glow,onClick}){
  return React.createElement("div",{onClick,style:{background:T.card,border:`1px solid ${glow?T.accent+"44":T.border}`,borderRadius:14,padding:18,transition:"all .25s",cursor:onClick?"pointer":"default",...(glow&&{boxShadow:`0 0 24px ${T.accent}12`}),...style}},children);
}
function Stat({label,value,unit,icon,color=T.accent,trend,sub}){
  return React.createElement(Card,{style:{position:"relative",overflow:"hidden"}},
    React.createElement("div",{style:{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:color+"08"}}),
    React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",position:"relative"}},
      React.createElement("div",null,
        React.createElement("div",{style:{fontSize:11,fontWeight:600,color:T.textMuted,letterSpacing:1.2,textTransform:"uppercase",marginBottom:10}},label),
        React.createElement("div",{style:{display:"flex",alignItems:"baseline",gap:5}},
          React.createElement("span",{style:{fontSize:30,fontWeight:700,color,fontFamily:"'IBM Plex Mono',monospace",lineHeight:1}},value),
          unit&&React.createElement("span",{style:{fontSize:13,color:T.textSec,fontWeight:500}},unit)
        ),
        trend&&React.createElement("div",{style:{fontSize:11,marginTop:8,color:trend.good?T.accent:T.red,fontWeight:600}},trend.text),
        sub&&React.createElement("div",{style:{fontSize:11,marginTop:4,color:T.textMuted}},sub)
      ),
      React.createElement("div",{style:{fontSize:26,width:46,height:46,borderRadius:12,background:color+"12",display:"flex",alignItems:"center",justifyContent:"center"}},icon)
    )
  );
}
function Badge({text,color}){return React.createElement("span",{style:{fontSize:10,padding:"3px 9px",borderRadius:20,background:color+"18",color,fontWeight:700,letterSpacing:.5,textTransform:"uppercase"}},text);}
function Toggle({on,onToggle,disabled}){
  return React.createElement("div",{onClick:disabled?undefined:onToggle,style:{width:42,height:24,borderRadius:12,background:on?T.accent:T.border,cursor:disabled?"not-allowed":"pointer",position:"relative",transition:"all .25s",opacity:disabled?.5:1}},
    React.createElement("div",{style:{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:on?21:3,transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.3)"}})
  );
}
function ProgressBar({value,max,color}){
  const pct=Math.min((value/max)*100,100);
  return React.createElement("div",{style:{height:5,background:T.border,borderRadius:3,overflow:"hidden",marginTop:4}},
    React.createElement("div",{style:{height:"100%",width:pct+"%",background:color,borderRadius:3,transition:"width .5s"}})
  );
}
function TabBtn({active,icon,label,count,onClick}){
  return React.createElement("button",{onClick,style:{padding:"10px 16px",borderRadius:10,border:"none",background:active?T.accentDim:"transparent",color:active?T.accent:T.textSec,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:7,whiteSpace:"nowrap",transition:"all .2s",fontFamily:"'DM Sans',sans-serif"}},
    icon," ",label,
    count!=null&&count>0&&React.createElement("span",{style:{background:T.red,color:"#fff",fontSize:9,padding:"2px 6px",borderRadius:10,fontWeight:700}},count)
  );
}
function Toast({toasts}){
  return React.createElement("div",{style:{position:"fixed",top:70,right:20,zIndex:999,display:"flex",flexDirection:"column",gap:8,maxWidth:340}},
    toasts.map(t=>React.createElement("div",{key:t.id,style:{padding:"12px 16px",borderRadius:10,background:T.surface,border:`1px solid ${t.color}44`,boxShadow:`0 8px 30px rgba(0,0,0,.4)`,animation:"slideDown .35s ease",display:"flex",alignItems:"center",gap:10}},
      React.createElement("span",{style:{fontSize:18}},t.icon),
      React.createElement("div",null,
        React.createElement("div",{style:{fontSize:12,fontWeight:600,color:t.color}},t.title),
        React.createElement("div",{style:{fontSize:11,color:T.textSec,marginTop:2}},t.msg)
      )
    ))
  );
}

/* Camera Feed */
function CamFeed({cam,onToggle}){
  const isOn=cam.status==="active";
  const [tick,setTick]=useState(0);
  useEffect(()=>{if(!isOn)return;const i=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(i);},[isOn]);
  return React.createElement(Card,{style:{padding:0,overflow:"hidden"}},
    React.createElement("div",{style:{height:155,background:isOn?`linear-gradient(${120+tick%60}deg,#080e1a,#101c30,#0a1422)`:"#0e0e0e",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}},
      isOn&&React.createElement(React.Fragment,null,
        React.createElement("div",{style:{position:"absolute",left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${T.accent}30,transparent)`,top:`${(tick*5)%100}%`,transition:"top 1s linear"}}),
        React.createElement("div",{style:{position:"absolute",top:10,left:12,display:"flex",alignItems:"center",gap:5}},
          React.createElement("div",{style:{width:7,height:7,borderRadius:"50%",background:T.red,animation:"pulse 1.5s infinite"}}),
          React.createElement("span",{style:{fontSize:9,color:T.red,fontFamily:"'IBM Plex Mono'",fontWeight:700}},"REC")
        ),
        React.createElement("div",{style:{position:"absolute",top:10,right:12,fontSize:9,color:T.textMuted,fontFamily:"'IBM Plex Mono'"}},new Date().toLocaleTimeString()),
        React.createElement("div",{style:{textAlign:"center",color:T.textSec,zIndex:2}},
          React.createElement("div",{style:{fontSize:36,marginBottom:2}},"📹"),
          React.createElement("div",{style:{fontSize:10,fontFamily:"'IBM Plex Mono'",letterSpacing:2}},"LIVE FEED")
        ),
        React.createElement("div",{style:{position:"absolute",bottom:10,left:12,fontSize:9,color:T.textMuted,fontFamily:"'IBM Plex Mono'"}},"CAM-0"+cam.id+" | "+cam.location)
      ),
      !isOn&&React.createElement("div",{style:{textAlign:"center",color:T.textMuted}},
        React.createElement("div",{style:{fontSize:32,marginBottom:4,opacity:.4}},"📷"),
        React.createElement("div",{style:{fontSize:10,letterSpacing:2}},"OFFLINE")
      )
    ),
    React.createElement("div",{style:{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
      React.createElement("div",null,
        React.createElement("div",{style:{fontSize:13,fontWeight:600,color:T.text}},cam.name),
        React.createElement("div",{style:{fontSize:11,color:T.textMuted}},cam.motionEvents+" events today")
      ),
      React.createElement(Toggle,{on:isOn,onToggle:()=>onToggle(cam.id)})
    )
  );
}

/* Speed Test */
function SpeedTest(){
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState(0);
  const [result,setResult]=useState(null);
  const runTest=async()=>{
    setRunning(true);setProgress(0);setResult(null);
    let p=0;
    const iv=setInterval(()=>{p+=Math.random()*15+5;if(p>=100){p=100;clearInterval(iv);}setProgress(Math.min(p,100));},200);
    const data=await api.post("/network/speedtest");
    clearInterval(iv);setProgress(100);
    setTimeout(()=>{setResult(data||{download:75.2,upload:38.1,ping:12});setRunning(false);},400);
  };
  return React.createElement(Card,{style:{marginTop:14}},
    React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},
      React.createElement("div",{style:{fontSize:14,fontWeight:600}},"🚀 Speed Test"),
      React.createElement("button",{onClick:runTest,disabled:running,style:{padding:"8px 18px",borderRadius:8,border:"none",background:running?T.border:T.gradient1,color:running?T.textMuted:"#000",fontSize:12,fontWeight:700,cursor:running?"default":"pointer",fontFamily:"'DM Sans'"}},running?"Testing...":result?"Re-run":"Run Test")
    ),
    running&&React.createElement("div",{style:{marginBottom:12}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:6}},
        React.createElement("span",{style:{fontSize:11,color:T.textSec}},"Testing connection..."),
        React.createElement("span",{style:{fontSize:11,color:T.accent,fontFamily:"'IBM Plex Mono'"}},progress.toFixed(0)+"%")
      ),
      React.createElement("div",{style:{height:6,background:T.border,borderRadius:3,overflow:"hidden"}},
        React.createElement("div",{style:{height:"100%",width:progress+"%",background:T.gradient1,borderRadius:3,transition:"width .2s"}})
      )
    ),
    result&&React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}},
      [{label:"Download",val:result.download,unit:"Mbps",color:T.blue,icon:"⬇️"},
       {label:"Upload",val:result.upload,unit:"Mbps",color:T.purple,icon:"⬆️"},
       {label:"Ping",val:result.ping,unit:"ms",color:T.accent,icon:"📡"}
      ].map((r,i)=>React.createElement("div",{key:i,style:{textAlign:"center",padding:"14px 0",borderRadius:10,background:r.color+"0a",border:`1px solid ${r.color}20`}},
        React.createElement("div",{style:{fontSize:14}},r.icon),
        React.createElement("div",{style:{fontSize:22,fontWeight:700,color:r.color,fontFamily:"'IBM Plex Mono'",marginTop:4}},r.val),
        React.createElement("div",{style:{fontSize:10,color:T.textMuted}},r.unit),
        React.createElement("div",{style:{fontSize:10,color:T.textSec,marginTop:2}},r.label)
      ))
    ),
    !running&&!result&&React.createElement("div",{style:{fontSize:12,color:T.textMuted,textAlign:"center",padding:"20px 0"}},"Click \"Run Test\" to check your internet speed")
  );
}

/* ─── LOGIN ─── */
function LoginScreen({onLogin}){
  const [email,setEmail]=useState("admin@grihanet.com");
  const [pass,setPass]=useState("password123");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const inp={width:"100%",padding:"12px 16px",borderRadius:10,border:`1px solid ${T.border}`,background:T.surface,color:T.text,fontSize:14,fontFamily:"'DM Sans'",outline:"none"};

  const handleLogin=async()=>{
    if(!email||!pass){setError("Please fill all fields");return;}
    setLoading(true);setError("");
    const res=await api.post("/auth/login",{email,password:pass});
    if(res&&res.token){
      api.token=res.token;
      onLogin(res.user);
    } else {
      setError(res?.error||"Login failed — server may be starting up. Try again.");
    }
    setLoading(false);
  };

  return React.createElement("div",{style:{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans'"}},
    React.createElement("div",{style:{position:"absolute",inset:0,background:`radial-gradient(circle at 30% 40%,${T.accent}08 0%,transparent 50%),radial-gradient(circle at 70% 70%,${T.blue}06 0%,transparent 50%)`}}),
    React.createElement("div",{className:"fadeUp",style:{width:380,position:"relative",zIndex:1}},
      React.createElement("div",{style:{textAlign:"center",marginBottom:36}},
        React.createElement("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:64,height:64,borderRadius:18,background:T.gradient1,fontSize:30,marginBottom:16,boxShadow:`0 8px 32px ${T.accent}33`}},"🏠"),
        React.createElement("h1",{style:{fontSize:28,fontWeight:700,color:T.text,margin:0}},"Griha",React.createElement("span",{style:{color:T.accent}},"Net")),
        React.createElement("p",{style:{color:T.textSec,fontSize:13,marginTop:6}},"Unified Smart Home Monitoring System")
      ),
      React.createElement(Card,{style:{padding:28}},
        React.createElement("div",{style:{marginBottom:16}},
          React.createElement("label",{style:{fontSize:12,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"Email"),
          React.createElement("input",{value:email,onChange:e=>{setEmail(e.target.value);setError("");},style:inp})
        ),
        React.createElement("div",{style:{marginBottom:16}},
          React.createElement("label",{style:{fontSize:12,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"Password"),
          React.createElement("input",{type:"password",value:pass,onChange:e=>{setPass(e.target.value);setError("");},onKeyDown:e=>e.key==="Enter"&&handleLogin(),style:inp})
        ),
        error&&React.createElement("div",{style:{fontSize:12,color:T.red,marginBottom:12,padding:"6px 10px",borderRadius:6,background:T.redDim}},error),
        React.createElement("button",{onClick:handleLogin,disabled:loading,style:{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:loading?T.border:T.gradient1,color:loading?T.textMuted:"#000",fontSize:14,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:"'DM Sans'",boxShadow:loading?"none":`0 4px 20px ${T.accent}33`}},loading?"Signing in...":"Sign In"),
        React.createElement("p",{style:{textAlign:"center",fontSize:11,color:T.textMuted,marginTop:14}},"Default: admin@grihanet.com / password123")
      )
    )
  );
}

/* ════════════════════════ MAIN APP ════════════════════════ */
function GrihaNet(){
  const [loggedIn,setLoggedIn]=useState(false);
  const [user,setUser]=useState(null);
  const [tab,setTab]=useState("overview");
  const [appliances,setAppliances]=useState(INIT_APPLIANCES);
  const [devices,setDevices]=useState(INIT_DEVICES);
  const [cameras,setCameras]=useState(INIT_CAMERAS);
  const [motionLog,setMotionLog]=useState([
    {id:1,cam:"Front Door",time:"14:42:18",type:"Person",severity:"high",img:"👤"},
    {id:2,cam:"Front Door",time:"14:31:05",type:"Motion",severity:"medium",img:"🔵"},
    {id:3,cam:"Backyard",time:"13:58:22",type:"Animal",severity:"low",img:"🐈"},
    {id:4,cam:"Front Door",time:"12:15:44",type:"Delivery",severity:"medium",img:"📦"},
    {id:5,cam:"Garage",time:"10:30:11",type:"Vehicle",severity:"low",img:"🚗"},
  ]);
  const [alerts,setAlerts]=useState([]);
  const [toasts,setToasts]=useState([]);
  const [powerData,setPowerData]=useState(genPowerHistory);
  const [weeklyData,setWeeklyData]=useState(genWeekly);
  const [bandwidthData,setBandwidthData]=useState(genBandwidth);
  const [now,setNow]=useState(new Date());
  const [settingsTab,setSettingsTab]=useState("general");
  const nextAlertId=useRef(100);
  const nextMotionId=useRef(100);
  const toastIdRef=useRef(0);
  const [settings,setSettings]=useState({
    darkMode:true,autoRefresh:true,pushNotifications:true,soundAlerts:false,simulationMode:true,
    rate:6.5,highUsageThreshold:4.5,runtimeAlert:2,monthlyBudget:2500,
    autoBlockUnknown:false,bandwidthAlert:true,bandwidthThreshold:10,parentalControls:false,
    motionSensitivity:"High",alertHoursStart:"23:00",alertHoursEnd:"06:00",
    snapshotOnMotion:true,recordClips:false,
  });

  const addToast=useCallback((icon,title,msg,color)=>{
    const id=++toastIdRef.current;
    setToasts(t=>[{id,icon,title,msg,color},...t].slice(0,3));
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);
  },[]);

  /* ─── Fetch data from backend on login ─── */
  const fetchAll=useCallback(async()=>{
    const [appData,devData,camData,alertData,settData,histData,wkData,bwData]=await Promise.all([
      api.get("/power/appliances"),api.get("/network/devices"),api.get("/cameras/"),
      api.get("/alerts/"),api.get("/settings/"),api.get("/power/history"),
      api.get("/power/weekly"),api.get("/network/bandwidth"),
    ]);
    if(appData)setAppliances(appData);
    if(devData)setDevices(devData);
    if(camData)setCameras(camData);
    if(alertData)setAlerts(alertData.alerts||[]);
    if(settData)setSettings(s=>({...s,...settData}));
    if(histData)setPowerData(histData);
    if(wkData)setWeeklyData(wkData);
    if(bwData)setBandwidthData(bwData);
  },[]);

  const handleLogin=useCallback((u)=>{
    setUser(u);setLoggedIn(true);
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
    const res=await api.put(`/power/appliances/${id}/toggle`);
    if(res){
      setAppliances(a=>a.map(x=>x.id===id?{...x,on:res.on}:x));
      if(res.on&&res.watts>1000)addToast("⚡","High Power",`${res.name} ON (${res.watts}W)`,T.orange);
    }
  };
  const toggleCam=async(id)=>{
    const res=await api.put(`/cameras/${id}/toggle`);
    if(res){
      setCameras(c=>c.map(x=>x.id===id?{...x,status:res.status}:x));
      addToast("📹","Camera "+(res.status==="active"?"Online":"Offline"),res.name,res.status==="active"?T.accent:T.red);
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
    addToast("⚙️","Settings Updated",key.replace(/([A-Z])/g," $1")+" changed",T.accent);
  };

  const liveWatts=appliances.filter(a=>a.on).reduce((s,a)=>s+a.watts,0);
  const liveKw=(liveWatts/1000).toFixed(2);
  const todayKwh=powerData.reduce((s,d)=>s+d.kw,0).toFixed(1);
  const todayCost=(todayKwh*settings.rate).toFixed(0);
  const onlineCount=devices.filter(d=>d.online).length;
  const totalBw=devices.reduce((s,d)=>s+d.bw,0).toFixed(1);
  const activeCams=cameras.filter(c=>c.status==="active").length;
  const unreadAlerts=alerts.filter(a=>!a.read).length;
  const totalMotion=cameras.reduce((s,c)=>s+(c.motionEvents||0),0);
  const roomData=[{name:"Bedroom",color:T.blue},{name:"Kitchen",color:T.orange},{name:"Living Room",color:T.purple},{name:"Bathroom",color:T.cyan},{name:"All Rooms",color:T.accent}].map(r=>({...r,value:appliances.filter(a=>a.room===r.name&&a.on).reduce((s,a)=>s+a.watts,0)})).filter(r=>r.value>0);
  const alertColor={danger:T.red,warning:T.orange,info:T.blue,success:T.accent};
  const devIcons={phone:"📱",laptop:"💻",tv:"📺",gaming:"🎮",unknown:"❓"};
  const sevColor={high:T.red,medium:T.orange,low:T.textSec};

  if(!loggedIn)return React.createElement(LoginScreen,{onLogin:handleLogin});

  /* ─── Layout builder helpers ─── */
  const h=React.createElement;
  const tabs=[{id:"overview",icon:"🏠",label:"Overview"},{id:"power",icon:"⚡",label:"Power"},{id:"network",icon:"🌐",label:"Network"},{id:"cameras",icon:"📹",label:"Cameras"},{id:"alerts",icon:"🔔",label:"Alerts",count:unreadAlerts},{id:"settings",icon:"⚙️",label:"Settings"}];

  return h("div",{style:{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:"'DM Sans',sans-serif"}},
    h(Toast,{toasts}),
    /* HEADER */
    h("header",{style:{background:T.surface+"ee",borderBottom:`1px solid ${T.border}`,padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:100,backdropFilter:"blur(16px)"}},
      h("div",{style:{display:"flex",alignItems:"center",gap:10}},
        h("div",{style:{width:36,height:36,borderRadius:10,background:T.gradient1,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}},"🏠"),
        h("div",null,h("div",{style:{fontSize:17,fontWeight:700}},"Griha",h("span",{style:{color:T.accent}},"Net")),h("div",{style:{fontSize:10,color:T.textMuted,letterSpacing:.5}},"SMART HOME MONITOR"))
      ),
      h("div",{style:{display:"flex",alignItems:"center",gap:14}},
        settings.simulationMode&&h(Badge,{text:"SIMULATION",color:T.orange}),
        h("div",{style:{position:"relative",cursor:"pointer"},onClick:()=>setTab("alerts")},h("span",{style:{fontSize:18}},"🔔"),unreadAlerts>0&&h("span",{style:{position:"absolute",top:-4,right:-6,width:16,height:16,borderRadius:"50%",background:T.red,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:"#fff",animation:"pulse 2s infinite"}},unreadAlerts)),
        h("div",{style:{textAlign:"right"}},h("div",{style:{fontSize:13,fontFamily:"'IBM Plex Mono'",fontWeight:500}},now.toLocaleTimeString()),h("div",{style:{fontSize:10,color:T.textMuted}},now.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"}))),
        h("div",{onClick:()=>{api.token=null;setLoggedIn(false);},style:{width:34,height:34,borderRadius:"50%",background:T.redDim,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14},title:"Logout"},"🚪")
      )
    ),
    /* TABS */
    h("nav",{style:{display:"flex",gap:4,padding:"10px 20px",overflowX:"auto"}},tabs.map(t=>h(TabBtn,{key:t.id,active:tab===t.id,icon:t.icon,label:t.label,count:t.count,onClick:()=>setTab(t.id)}))),
    /* CONTENT */
    h("main",{style:{padding:"16px 20px 32px",maxWidth:1200,margin:"0 auto"}},

      /* ═══ OVERVIEW ═══ */
      tab==="overview"&&h(React.Fragment,null,
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:16}},
          h("div",{className:"fadeUp d1"},h(Stat,{label:"Live Power Draw",value:liveKw,unit:"kW",icon:"⚡",color:parseFloat(liveKw)>settings.highUsageThreshold?T.red:T.orange,trend:{text:`${liveWatts}W from ${appliances.filter(a=>a.on).length} appliances`,good:parseFloat(liveKw)<=settings.highUsageThreshold}})),
          h("div",{className:"fadeUp d2"},h(Stat,{label:"Today's Usage",value:todayKwh,unit:"kWh",icon:"📊",color:T.blue,sub:`Est. cost: ₹${todayCost}`})),
          h("div",{className:"fadeUp d3"},h(Stat,{label:"Devices Online",value:onlineCount,unit:`/ ${devices.length}`,icon:"📡",color:T.purple,sub:`${totalBw} GB used today`})),
          h("div",{className:"fadeUp d4"},h(Stat,{label:"Cameras Active",value:activeCams,unit:`/ ${cameras.length}`,icon:"📹",color:T.accent,sub:`${totalMotion} motion events`}))
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:14}},
          h(Card,{className:"fadeUp d3"},
            h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},h("div",{style:{fontSize:14,fontWeight:600}},"⚡ Power Consumption — 24 Hours"),h(Badge,{text:settings.autoRefresh?"LIVE":"PAUSED",color:settings.autoRefresh?T.accent:T.textMuted})),
            h(ResponsiveContainer,{width:"100%",height:200},h(AreaChart,{data:powerData},h("defs",null,h("linearGradient",{id:"pg",x1:0,y1:0,x2:0,y2:1},h("stop",{offset:"0%",stopColor:T.accent,stopOpacity:.25}),h("stop",{offset:"100%",stopColor:T.accent,stopOpacity:0}))),h(CartesianGrid,{strokeDasharray:"3 3",stroke:T.border}),h(XAxis,{dataKey:"hour",tick:{fontSize:9,fill:T.textMuted},interval:3,axisLine:false}),h(YAxis,{tick:{fontSize:9,fill:T.textMuted},axisLine:false,unit:" kW"}),h(Tooltip,{contentStyle:{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:12}}),h(Area,{type:"monotone",dataKey:"kw",stroke:T.accent,strokeWidth:2,fill:"url(#pg)",name:"Power (kW)"})))
          ),
          h(Card,{className:"fadeUp d4"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"🔔 Recent Alerts"),
            h("div",{style:{display:"flex",flexDirection:"column",gap:8}},alerts.slice(0,4).map(a=>h("div",{key:a.id,style:{padding:"10px 12px",borderRadius:10,background:(alertColor[a.type]||T.blue)+"0a",borderLeft:`3px solid ${alertColor[a.type]||T.blue}`,opacity:a.read?.55:1}},h("div",{style:{fontSize:12,lineHeight:1.4}},a.icon," ",a.msg),h("div",{style:{fontSize:10,color:T.textMuted,marginTop:4}},a.time," • ",a.module))))
          )
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}},
          h(Card,{className:"fadeUp d5"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"👥 Connected Devices"),devices.filter(d=>d.online).map(d=>h("div",{key:d.id,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.border}22`}},h("div",{style:{display:"flex",alignItems:"center",gap:10}},h("span",{style:{fontSize:18}},devIcons[d.type]),h("div",null,h("div",{style:{fontSize:12,fontWeight:500}},d.name," ",!d.wl&&h(Badge,{text:"⚠ unknown",color:T.orange})),h("div",{style:{fontSize:10,color:T.textMuted,fontFamily:"'IBM Plex Mono'"}},d.ip))),h("div",{style:{fontSize:12,fontWeight:600,color:T.blue}},d.bw+" GB")))),
          h(Card,{className:"fadeUp d6"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"📹 Camera Overview"),cameras.map(c=>h("div",{key:c.id,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}22`}},h("div",{style:{display:"flex",alignItems:"center",gap:10}},h("div",{style:{width:8,height:8,borderRadius:"50%",background:c.status==="active"?T.accent:T.red,animation:c.status==="active"?"pulse 2s infinite":"none"}}),h("div",null,h("div",{style:{fontSize:12,fontWeight:500}},c.name),h("div",{style:{fontSize:10,color:T.textMuted}},(c.motionEvents||0)+" events"))),h(Badge,{text:c.status,color:c.status==="active"?T.accent:T.red}))))
        )
      ),

      /* ═══ POWER ═══ */
      tab==="power"&&h(React.Fragment,null,
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:16}},
          h("div",{className:"fadeUp d1"},h(Stat,{label:"Live Power",value:liveKw,unit:"kW",icon:"⚡",color:parseFloat(liveKw)>settings.highUsageThreshold?T.red:T.orange})),
          h("div",{className:"fadeUp d2"},h(Stat,{label:"Today's Cost",value:`₹${todayCost}`,unit:"",icon:"💰",color:T.accent,sub:`@ ₹${settings.rate}/kWh`})),
          h("div",{className:"fadeUp d3"},h(Stat,{label:"Monthly Est.",value:`₹${(todayCost*30).toLocaleString()}`,unit:"",icon:"📅",color:parseInt(todayCost)*30>settings.monthlyBudget?T.red:T.blue,sub:`Budget: ₹${settings.monthlyBudget.toLocaleString()}`})),
          h("div",{className:"fadeUp d4"},h(Stat,{label:"Peak Today",value:Math.max(...powerData.map(d=>d.kw)).toFixed(2),unit:"kW",icon:"📈",color:T.red}))
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:14,marginBottom:14}},
          h(Card,{className:"fadeUp d3"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"📊 Weekly Consumption & Cost"),h(ResponsiveContainer,{width:"100%",height:220},h(BarChart,{data:weeklyData},h(CartesianGrid,{strokeDasharray:"3 3",stroke:T.border}),h(XAxis,{dataKey:"day",tick:{fontSize:10,fill:T.textMuted},axisLine:false}),h(YAxis,{yAxisId:"kwh",tick:{fontSize:9,fill:T.textMuted},axisLine:false}),h(YAxis,{yAxisId:"cost",orientation:"right",tick:{fontSize:9,fill:T.textMuted},axisLine:false}),h(Tooltip,{contentStyle:{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:12}}),h(Bar,{yAxisId:"kwh",dataKey:"kwh",fill:T.blue,radius:[6,6,0,0],name:"Usage (kWh)"}),h(Bar,{yAxisId:"cost",dataKey:"cost",fill:T.accent+"66",radius:[6,6,0,0],name:"Cost (₹)"})))),
          h(Card,{className:"fadeUp d4"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"🏠 Room-wise Breakdown"),roomData.length>0?h(React.Fragment,null,h(ResponsiveContainer,{width:"100%",height:150},h(PieChart,null,h(Pie,{data:roomData,cx:"50%",cy:"50%",innerRadius:42,outerRadius:65,dataKey:"value",paddingAngle:3,strokeWidth:0},roomData.map((r,i)=>h(Cell,{key:i,fill:r.color}))),h(Tooltip,{contentStyle:{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:12},formatter:v=>v+"W"}))),h("div",{style:{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginTop:8}},roomData.map((r,i)=>h("div",{key:i,style:{display:"flex",alignItems:"center",gap:5,fontSize:10,color:T.textSec}},h("div",{style:{width:8,height:8,borderRadius:2,background:r.color}}),r.name+" ("+r.value+"W)")))):h("div",{style:{textAlign:"center",padding:30,color:T.textMuted}},"All appliances are off"))
        ),
        h(Card,{className:"fadeUp d5"},
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},h("div",{style:{fontSize:14,fontWeight:600}},"🔌 Appliance Control"),h("div",{style:{fontSize:11,color:T.textSec}},appliances.filter(a=>a.on).length+"/"+appliances.length+" active")),
          h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}},appliances.map(a=>h("div",{key:a.id,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:10,background:a.on?T.accent+"06":"transparent",border:`1px solid ${a.on?T.accent+"20":T.border}`,transition:"all .3s"}},h("div",{style:{display:"flex",alignItems:"center",gap:10}},h("span",{style:{fontSize:22}},a.icon),h("div",null,h("div",{style:{fontSize:13,fontWeight:500}},a.name),h("div",{style:{fontSize:10,color:T.textMuted}},a.room+" • "+a.watts+"W",a.on&&h("span",{style:{color:T.accent}}," • ₹"+((a.watts/1000)*settings.rate).toFixed(1)+"/hr")))),h(Toggle,{on:a.on,onToggle:()=>toggleAppliance(a.id)}))))
        )
      ),

      /* ═══ NETWORK ═══ */
      tab==="network"&&h(React.Fragment,null,
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:16}},
          h("div",{className:"fadeUp d1"},h(Stat,{label:"Bandwidth Used",value:totalBw,unit:"GB today",icon:"📊",color:T.blue})),
          h("div",{className:"fadeUp d2"},h(Stat,{label:"Devices Online",value:onlineCount,unit:`/ ${devices.length}`,icon:"📡",color:T.accent})),
          h("div",{className:"fadeUp d3"},h(Stat,{label:"Blocked Devices",value:devices.filter(d=>d.blocked).length,unit:"",icon:"🚫",color:T.red}))
        ),
        h(Card,{style:{marginBottom:14},className:"fadeUp d3"},h("div",{style:{fontSize:14,fontWeight:600,marginBottom:14}},"📊 Bandwidth History (24hr)"),h(ResponsiveContainer,{width:"100%",height:200},h(BarChart,{data:bandwidthData},h(CartesianGrid,{strokeDasharray:"3 3",stroke:T.border}),h(XAxis,{dataKey:"hour",tick:{fontSize:9,fill:T.textMuted},interval:2,axisLine:false}),h(YAxis,{tick:{fontSize:9,fill:T.textMuted},axisLine:false,unit:" GB"}),h(Tooltip,{contentStyle:{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,fontSize:12}}),h(Bar,{dataKey:"down",fill:T.blue,radius:[4,4,0,0],name:"Download"}),h(Bar,{dataKey:"up",fill:T.purple,radius:[4,4,0,0],name:"Upload"})))),
        h(Card,{className:"fadeUp d4"},
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},h("div",{style:{fontSize:14,fontWeight:600}},"📡 Connected Devices"),h(Badge,{text:onlineCount+" online",color:T.accent})),
          devices.map((d,i)=>h("div",{key:d.id,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<devices.length-1?`1px solid ${T.border}22`:"none",opacity:d.online?1:.45}},
            h("div",{style:{display:"flex",alignItems:"center",gap:12,flex:1}},h("span",{style:{fontSize:24}},devIcons[d.type]),h("div",{style:{flex:1}},h("div",{style:{fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:8}},d.name,!d.wl&&h(Badge,{text:"⚠ unknown",color:T.orange}),d.blocked&&h(Badge,{text:"BLOCKED",color:T.red})),h("div",{style:{fontSize:10,color:T.textMuted,fontFamily:"'IBM Plex Mono'",marginTop:2}},d.ip+" • "+d.mac),h(ProgressBar,{value:d.bw,max:20,color:d.bw>settings.bandwidthThreshold?T.orange:T.blue}))),
            h("div",{style:{display:"flex",alignItems:"center",gap:14}},h("div",{style:{textAlign:"right"}},h("div",{style:{fontSize:14,fontWeight:600,fontFamily:"'IBM Plex Mono'",color:d.online?T.blue:T.textMuted}},d.online?d.bw+" GB":"—"),h("div",{style:{fontSize:10,color:d.online?T.accent:T.red,fontWeight:600}},d.blocked?"BLOCKED":d.online?"ONLINE":"OFFLINE")),h("button",{onClick:()=>toggleDeviceBlock(d.id),style:{padding:"6px 12px",borderRadius:8,border:"none",fontSize:11,fontWeight:600,background:d.blocked?T.accentDim:T.redDim,color:d.blocked?T.accent:T.red,cursor:"pointer",fontFamily:"'DM Sans'"}},d.blocked?"Unblock":"Block"))
          ))
        ),
        h(SpeedTest,null)
      ),

      /* ═══ CAMERAS ═══ */
      tab==="cameras"&&h(React.Fragment,null,
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:16}},
          h("div",{className:"fadeUp d1"},h(Stat,{label:"Active Cameras",value:activeCams,unit:`/ ${cameras.length}`,icon:"📹",color:T.accent})),
          h("div",{className:"fadeUp d2"},h(Stat,{label:"Motion Events",value:totalMotion,unit:"today",icon:"🔍",color:T.orange})),
          h("div",{className:"fadeUp d3"},h(Stat,{label:"Persons Detected",value:motionLog.filter(m=>m.type==="Person").length,unit:"today",icon:"👤",color:T.red}))
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginBottom:14}},cameras.map(c=>h("div",{key:c.id,className:"fadeUp d"+(c.id)},h(CamFeed,{cam:c,onToggle:toggleCam})))),
        h(Card,{className:"fadeUp d5"},
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},h("div",{style:{fontSize:14,fontWeight:600}},"📋 Motion Event Log"),h("div",{style:{fontSize:11,color:T.textMuted}},motionLog.length+" events • Live")),
          motionLog.slice(0,12).map((m,i)=>h("div",{key:m.id,style:{display:"flex",alignItems:"center",gap:14,padding:"10px 0",borderBottom:i<Math.min(motionLog.length,12)-1?`1px solid ${T.border}22`:"none"}},
            h("span",{style:{fontSize:12,fontFamily:"'IBM Plex Mono'",color:T.textMuted,minWidth:70}},m.time),
            h("span",{style:{fontSize:18}},m.img),
            h(Badge,{text:m.cam,color:T.purple}),
            h("span",{style:{fontSize:13,flex:1}},m.type+" detected"),
            h(Badge,{text:m.severity,color:sevColor[m.severity]})
          ))
        )
      ),

      /* ═══ ALERTS ═══ */
      tab==="alerts"&&h(React.Fragment,null,
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}},
          h("div",null,h("h2",{style:{fontSize:18,fontWeight:700,margin:0}},"🔔 Alerts"),h("p",{style:{fontSize:12,color:T.textMuted,marginTop:2}},unreadAlerts+" unread of "+alerts.length)),
          h("div",{style:{display:"flex",gap:8}},
            h("button",{onClick:markAllRead,style:{padding:"8px 16px",borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",color:T.textSec,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans'",fontWeight:600}},"Mark all read"),
            h("button",{onClick:clearRead,style:{padding:"8px 16px",borderRadius:8,border:`1px solid ${T.red}33`,background:T.redDim,color:T.red,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans'",fontWeight:600}},"Clear read")
          )
        ),
        alerts.length===0&&h(Card,null,h("div",{style:{textAlign:"center",padding:40,color:T.textMuted}},"🎉 No alerts — all clear!")),
        alerts.map(a=>h("div",{key:a.id,style:{marginBottom:10}},h(Card,{style:{borderLeft:`4px solid ${alertColor[a.type]||T.blue}`,background:a.read?T.card:(alertColor[a.type]||T.blue)+"08",opacity:a.read?.55:1,display:"flex",justifyContent:"space-between",alignItems:"center"}},
          h("div",{style:{flex:1}},h("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:4}},h(Badge,{text:a.type,color:alertColor[a.type]||T.blue}),h(Badge,{text:a.module,color:T.textSec}),!a.read&&h("span",{style:{width:7,height:7,borderRadius:"50%",background:T.accent}})),h("div",{style:{fontSize:13,lineHeight:1.5,marginTop:4}},a.icon," ",a.msg),h("div",{style:{fontSize:10,color:T.textMuted,marginTop:6}},a.time)),
          !a.read&&h("button",{onClick:()=>dismissAlert(a.id),style:{padding:"6px 14px",borderRadius:8,border:"none",background:T.border,color:T.textSec,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans'",fontWeight:600,marginLeft:12}},"Dismiss")
        )))
      ),

      /* ═══ SETTINGS ═══ */
      tab==="settings"&&h(React.Fragment,null,
        h("h2",{style:{fontSize:18,fontWeight:700,marginBottom:16}},"⚙️ Settings"),
        h("div",{style:{display:"flex",gap:8,marginBottom:16}},["general","power","network","security"].map(t=>h("button",{key:t,onClick:()=>setSettingsTab(t),style:{padding:"8px 16px",borderRadius:8,border:"none",background:settingsTab===t?T.accentDim:T.surface,color:settingsTab===t?T.accent:T.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans'",textTransform:"capitalize"}},t))),

        settingsTab==="general"&&h(Card,null,h("div",{style:{fontSize:14,fontWeight:600,marginBottom:16}},"General Settings"),
          [{key:"darkMode",label:"Dark Mode",desc:"Use dark theme across dashboard"},{key:"autoRefresh",label:"Auto-refresh Data",desc:"Refresh stats every 2.5 seconds"},{key:"pushNotifications",label:"Push Notifications",desc:"Toast notifications for critical alerts"},{key:"soundAlerts",label:"Sound Alerts",desc:"Play sound on high-severity alerts"},{key:"simulationMode",label:"Simulation Mode",desc:"Generate random motion events for demo"}].map((s,i)=>h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${T.border}22`}},h("div",null,h("div",{style:{fontSize:13,fontWeight:500}},s.label),h("div",{style:{fontSize:11,color:T.textMuted}},s.desc)),h(Toggle,{on:settings[s.key],onToggle:()=>updateSetting(s.key,!settings[s.key])})))),

        settingsTab==="power"&&h(Card,null,h("div",{style:{fontSize:14,fontWeight:600,marginBottom:16}},"Power Settings"),
          [{key:"rate",label:"Electricity Rate (₹/kWh)",step:.5,min:1,max:20},{key:"highUsageThreshold",label:"High Usage Alert (kW)",step:.5,min:1,max:10},{key:"runtimeAlert",label:"Runtime Alert (hours)",step:.5,min:.5,max:8},{key:"monthlyBudget",label:"Monthly Budget (₹)",step:100,min:500,max:10000}].map((s,i)=>h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${T.border}22`}},
            h("div",{style:{fontSize:13,fontWeight:500}},s.label),
            h("div",{style:{display:"flex",alignItems:"center",gap:8}},
              h("button",{onClick:()=>updateSetting(s.key,Math.max(s.min,settings[s.key]-s.step)),style:{width:28,height:28,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:T.text,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}},"−"),
              h("div",{style:{minWidth:60,textAlign:"center",padding:"6px 12px",borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,fontSize:13,color:T.accent,fontFamily:"'IBM Plex Mono'",fontWeight:600}},s.key==="rate"?"₹"+settings[s.key]:s.key==="monthlyBudget"?"₹"+settings[s.key].toLocaleString():settings[s.key]),
              h("button",{onClick:()=>updateSetting(s.key,Math.min(s.max,settings[s.key]+s.step)),style:{width:28,height:28,borderRadius:6,border:`1px solid ${T.border}`,background:T.surface,color:T.text,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}},"+")
            )
          ))),

        settingsTab==="network"&&h(Card,null,h("div",{style:{fontSize:14,fontWeight:600,marginBottom:16}},"Network Settings"),
          [{key:"autoBlockUnknown",label:"Auto-block Unknown Devices",desc:"Block unrecognized MAC addresses"},{key:"bandwidthAlert",label:"Bandwidth Alert",desc:`Alert when device exceeds ${settings.bandwidthThreshold} GB/day`},{key:"parentalControls",label:"Parental Controls",desc:"Time-based internet restrictions"}].map((s,i)=>h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${T.border}22`}},h("div",null,h("div",{style:{fontSize:13,fontWeight:500}},s.label),h("div",{style:{fontSize:11,color:T.textMuted}},s.desc)),h(Toggle,{on:settings[s.key],onToggle:()=>updateSetting(s.key,!settings[s.key])})))),

        settingsTab==="security"&&h(Card,null,h("div",{style:{fontSize:14,fontWeight:600,marginBottom:16}},"Security Settings"),
          h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${T.border}22`}},h("div",{style:{fontSize:13,fontWeight:500}},"Motion Sensitivity"),h("div",{style:{display:"flex",gap:6}},["Low","Medium","High"].map(l=>h("button",{key:l,onClick:()=>updateSetting("motionSensitivity",l),style:{padding:"6px 14px",borderRadius:8,border:`1px solid ${settings.motionSensitivity===l?T.accent+"44":T.border}`,background:settings.motionSensitivity===l?T.accentDim:T.surface,color:settings.motionSensitivity===l?T.accent:T.textSec,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans'"}},l)))),
          [{key:"snapshotOnMotion",label:"Snapshot on Motion",desc:"Save image on motion"},{key:"recordClips",label:"Record Clips",desc:"15-sec clips on events"}].map((s,i)=>h("div",{key:i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${T.border}22`}},h("div",null,h("div",{style:{fontSize:13,fontWeight:500}},s.label),h("div",{style:{fontSize:11,color:T.textMuted}},s.desc)),h(Toggle,{on:settings[s.key],onToggle:()=>updateSetting(s.key,!settings[s.key])})))
        )
      )
    ),
    /* FOOTER */
    h("footer",{style:{padding:"16px 20px",borderTop:`1px solid ${T.border}`,textAlign:"center"}},h("span",{style:{fontSize:11,color:T.textMuted}},"GrihaNet v1.0 • Built by Team GrihaNet • VIT Vellore © 2026"))
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(GrihaNet));
