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
    style:{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
      background:T.surface,color:T.text,fontSize:13,fontFamily:"'DM Sans'",marginBottom:12}},
    opts.map(([v,l])=>h("option",{key:v,value:v},l))
  );
  const inp2=(val,onChange,ph="",type="text")=>h("input",{type,placeholder:ph,value:val,
    onChange:e=>onChange(e.target.value),
    style:{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,
      background:T.surface,color:T.text,fontSize:13,fontFamily:"'DM Sans'",marginBottom:12}});

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
      style:{width:480,borderRadius:16,background:T.card,border:`1px solid ${T.border}`,
        padding:28,boxShadow:"0 24px 60px rgba(0,0,0,.5)"}},
      h("div",{style:{display:"flex",gap:8,marginBottom:20}},
        stepLabel.map((l,i)=>h("div",{key:i,style:{flex:1,textAlign:"center",padding:"6px 0",
          borderRadius:8,fontSize:11,fontWeight:700,
          background:step===i+1?T.gradient1:step>i+1?T.accentDim:T.surface,
          color:step===i+1?"#000":step>i+1?T.accent:T.textMuted,border:`1px solid ${T.border}`}},l))
      ),
      h("h3",{style:{fontSize:15,fontWeight:700,marginBottom:16,color:T.text}},
        step===1?"Choose what triggers this rule":step===2?"Choose what happens":"Name your rule"
      ),
      step===1&&h(React.Fragment,null,
        h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"TRIGGER TYPE"),
        sel(trigType,setTrigType,[["power_exceeds","⚡ Power exceeds X kW"],["camera_detects","📹 Camera detects event"],["time_is","🕐 Time is (daily schedule)"],["appliance_on","🔌 Appliance on for X hours"]]),
        trigType==="power_exceeds"&&h(React.Fragment,null,h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"THRESHOLD (kW)"),inp2(trigParams.kw,v=>setTrigParams(p=>({...p,kw:v})),"e.g. 5.0","number")),
        trigType==="camera_detects"&&h(React.Fragment,null,h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"EVENT TYPE"),sel(trigParams.event,v=>setTrigParams(p=>({...p,event:v})),[["Person","👤 Person"],["Delivery","📦 Delivery"],["Vehicle","🚗 Vehicle"],["Animal","🐈 Animal"],["Motion","🔵 Motion"]])),
        trigType==="time_is"&&h(React.Fragment,null,h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"TIME (24hr)"),inp2(trigParams.time,v=>setTrigParams(p=>({...p,time:v})),"23:00")),
        trigType==="appliance_on"&&h(React.Fragment,null,
          h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"APPLIANCE"),
          sel(trigParams.appliance_id,v=>setTrigParams(p=>({...p,appliance_id:v})),appliances.map(a=>[String(a.id),a.icon+" "+a.name])),
          h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"HOURS RUNNING"),
          inp2(trigParams.hours,v=>setTrigParams(p=>({...p,hours:v})),"2","number")
        )
      ),
      step===2&&h(React.Fragment,null,
        h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"ACTION TYPE"),
        sel(actType,setActType,[["create_alert","🔔 Create an alert"],["turn_on","✅ Turn ON an appliance"],["turn_off","❌ Turn OFF an appliance"]]),
        (actType==="turn_on"||actType==="turn_off")&&h(React.Fragment,null,
          h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"APPLIANCE"),
          sel(actParams.appliance_id,v=>setActParams(p=>({...p,appliance_id:v})),appliances.map(a=>[String(a.id),a.icon+" "+a.name]))
        ),
        actType==="create_alert"&&h(React.Fragment,null,
          h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"ALERT MESSAGE"),
          inp2(actParams.message,v=>setActParams(p=>({...p,message:v})),"Alert message..."),
          h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"SEVERITY"),
          sel(actParams.type,v=>setActParams(p=>({...p,type:v})),[["danger","🔴 Danger"],["warning","🟠 Warning"],["info","🔵 Info"],["success","🟢 Success"]])
        )
      ),
      step===3&&h(React.Fragment,null,
        h("label",{style:{fontSize:11,color:T.textSec,fontWeight:600,display:"block",marginBottom:6}},"RULE NAME"),
        inp2(ruleName,setRuleName,"e.g. Night Power Saver"),
        h("div",{style:{padding:"12px 14px",borderRadius:10,background:T.surface,border:`1px solid ${T.border}`,fontSize:12,color:T.textSec}},
          h("div",{style:{marginBottom:6}},h("strong",{style:{color:T.blue}},"IF "),"Power > "+trigParams.kw+" kW" 
            .replace("Power > "+trigParams.kw+" kW",{power_exceeds:`Power > ${trigParams.kw} kW`,camera_detects:`Camera detects ${trigParams.event}`,time_is:`Time is ${trigParams.time}`,appliance_on:`Appliance on for ${trigParams.hours}h`}[trigType]||trigType)),
          h("div",null,h("strong",{style:{color:T.accent}},"THEN "),actType==="create_alert"?`Alert: "${actParams.message}"`:actType==="turn_on"?"Turn ON appliance #"+actParams.appliance_id:"Turn OFF appliance #"+actParams.appliance_id)
        )
      ),
      h("div",{style:{display:"flex",justifyContent:"space-between",marginTop:20}},
        h("button",{onClick:step===1?onClose:()=>setStep(s=>s-1),
          style:{padding:"10px 20px",borderRadius:10,border:`1px solid ${T.border}`,
            background:"transparent",color:T.textSec,fontSize:13,fontWeight:600,
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
