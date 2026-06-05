/* ============================================================
   SettleWorth — settlement calculator engine (vanilla JS)
   Mount: <div data-calculator data-incident="Car accident"></div>
   Modes (auto-detected from data-incident):
     injury  -> multiplier/per-diem + 50-state comparative negligence + fault
     wc      -> workers' comp (AWW + impairment rating + future medical)
     dv      -> diminished value (17c formula: 10% x damage x mileage)
     wt      -> wrongful termination (back pay + benefits + distress + punitive)
   Estimates only — NOT legal advice.
   ============================================================ */
(function () {
  "use strict";
  var STATES = [
    ["Alabama","contrib"],["Alaska","pure"],["Arizona","pure"],["Arkansas","mod50"],
    ["California","pure"],["Colorado","mod50"],["Connecticut","mod51"],["Delaware","mod51"],
    ["District of Columbia","contrib"],["Florida","mod51"],["Georgia","mod50"],["Hawaii","mod51"],
    ["Idaho","mod50"],["Illinois","mod51"],["Indiana","mod51"],["Iowa","mod51"],
    ["Kansas","mod50"],["Kentucky","pure"],["Louisiana","pure"],["Maine","mod50"],
    ["Maryland","contrib"],["Massachusetts","mod51"],["Michigan","mod51"],["Minnesota","mod51"],
    ["Mississippi","pure"],["Missouri","pure"],["Montana","mod51"],["Nebraska","mod50"],
    ["Nevada","mod51"],["New Hampshire","mod51"],["New Jersey","mod51"],["New Mexico","pure"],
    ["New York","pure"],["North Carolina","contrib"],["North Dakota","mod50"],["Ohio","mod51"],
    ["Oklahoma","mod51"],["Oregon","mod51"],["Pennsylvania","mod51"],["Rhode Island","pure"],
    ["South Carolina","mod51"],["South Dakota","pure"],["Tennessee","mod50"],["Texas","mod51"],
    ["Utah","mod50"],["Vermont","mod51"],["Virginia","contrib"],["Washington","pure"],
    ["West Virginia","mod50"],["Wisconsin","mod51"],["Wyoming","mod51"]
  ];
  var RULE_TEXT = {
    pure:   "pure comparative negligence — your award is reduced by your share of fault, even at 90%.",
    mod50:  "modified comparative (50% bar) — you recover only if you are less than 50% at fault.",
    mod51:  "modified comparative (51% bar) — you recover only if you are 50% or less at fault.",
    contrib:"pure contributory negligence — any fault on your part can bar recovery entirely (about $0)."
  };
  var INJURIES = ["Whiplash / soft tissue","Broken bone(s)","Herniated disc","Nerve damage",
    "Traumatic brain injury","Spinal cord injury","Scarring / disfigurement","Internal injuries","Other"];
  var CASE_TYPES = ["Car accident","Truck accident","Motorcycle accident","Slip and fall","Dog bite",
    "Pedestrian accident","Personal injury","Nerve damage","Pain and suffering"];

  function fmt(n){ return "$" + Math.round(n).toLocaleString("en-US"); }
  function fmtK(n){
    if(n>=999500) return "$"+(n/1000000).toFixed(n%1000000?1:0)+"M";
    if(n>=1000) return "$"+Math.round(n/1000)+"K";
    return "$"+Math.round(n);
  }
  function round1k(n){ return Math.max(0,Math.round(n/1000)*1000); }
  function round100(n){ return Math.max(0,Math.round(n/100)*100); }
  function num(v){ var n=parseFloat(String(v).replace(/[^0-9.]/g,"")); return isNaN(n)?0:n; }
  function arrow(){return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';}
  function warnIcon(){return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';}
  function money(id,label,hint,val){
    return '<div class="field"><label for="'+id+'">'+label+(hint?' <span class="hint">'+hint+'</span>':'')+'</label>'+
      '<div class="input-money"><input class="input" inputmode="numeric" id="'+id+'" value="'+(val?val.toLocaleString("en-US"):"")+'" placeholder="0"></div></div>';
  }
  function plain(id,label,hint,val){
    return '<div class="field"><label for="'+id+'">'+label+(hint?' <span class="hint">'+hint+'</span>':'')+'</label>'+
      '<input class="input" inputmode="numeric" id="'+id+'" value="'+(val||val===0?val:"")+'"></div>';
  }
  function stateOptions(sel){
    return STATES.map(function(st){return '<option value="'+st[0]+'" data-rule="'+st[1]+'"'+(st[0]===sel?" selected":"")+'>'+st[0]+'</option>';}).join("");
  }
  function modeFor(inc){
    var i=(inc||"").toLowerCase();
    if(i.indexOf("workers")>=0||i.indexOf("workman")>=0||i.indexOf(" comp")>=0) return "wc";
    if(i.indexOf("diminished")>=0) return "dv";
    if(i.indexOf("termination")>=0) return "wt";
    return "injury";
  }

  function init(mount){
    var incident = mount.getAttribute("data-incident") || "Personal injury";
    var selectable = mount.hasAttribute("data-select") || /personal injury/i.test(incident);
    var mode = modeFor(incident);
    var s = { step:1, incident:incident, stateName:"California", rule:"pure",
      med:0,futMed:0,wages:0,futWages:0,property:0,method:"multiplier",multiplier:3,perDiemRate:200,perDiemDays:120,injury:INJURIES[0],fault:0,
      aww:0,wcFutMed:0,impair:10,
      carValue:0,miles:"20-40",damage:60,
      salary:0,weeksOut:12,benefits:0,distress:"moderate",illegal:true };
    var STEPS = { injury:["Your case","Damages","Severity","Result"],
      wc:["Your wage","Impairment","Result"], dv:["Your vehicle","Result"],
      wt:["Lost pay","Damages","Result"] }[mode];
    var title = (mode==="dv")?"Diminished Value Calculator":(mode==="wc")?"Workers' Comp Calculator":(mode==="wt")?"Wrongful Termination Calculator":"Settlement Calculator";

    mount.innerHTML =
      '<div class="calc-card"><div class="calc">'+
        '<div class="calc-head"><span class="calc-title">'+title+'</span>'+
        '<span class="calc-step-of" id="c-stepof"></span></div>'+
        '<div class="progress" id="c-prog">'+STEPS.map(function(){return '<span class="seg"></span>';}).join("")+'</div>'+
        '<div class="steps-labels" id="c-labels"></div>'+
        '<div id="c-body"></div>'+
      '</div></div>';
    var elStepOf=mount.querySelector("#c-stepof"), elProg=mount.querySelector("#c-prog").children,
        elLabels=mount.querySelector("#c-labels"), body=mount.querySelector("#c-body");

    function chrome(){
      for(var i=0;i<STEPS.length;i++) elProg[i].className="seg"+(i<s.step?" on":"");
      elStepOf.textContent="Step "+s.step+" / "+STEPS.length;
      elLabels.innerHTML=STEPS.map(function(n,i){var c=(i+1===s.step)?"on":((i+1<s.step)?"done":"");return '<span class="'+c+'">'+n+'</span>';}).join("");
    }
    function nav(nextLabel,nextOnly){
      if(nextOnly) return '<button class="btn" data-next>'+nextLabel+arrow()+'</button>';
      return '<div class="btn-row"><button class="btn secondary" data-back>Back</button><button class="btn" data-next>'+nextLabel+arrow()+'</button></div>';
    }
    function paint(el){var mn=parseFloat(el.min),mx=parseFloat(el.max),v=parseFloat(el.value),p=((v-mn)/(mx-mn))*100;
      el.style.background="linear-gradient(90deg,var(--green-500) "+p+"%,var(--line) "+p+"%)";}
    function bindMoney(id,key){var el=body.querySelector("#"+id);if(!el)return;
      el.addEventListener("input",function(){var n=num(el.value);s[key]=n;el.value=n?n.toLocaleString("en-US"):"";});}
    function bindNum(id,key){var el=body.querySelector("#"+id);if(!el)return;el.addEventListener("input",function(){s[key]=num(el.value);});}
    function wire(){
      var nx=body.querySelector("[data-next]"),bk=body.querySelector("[data-back]"),rs=body.querySelector("[data-restart]");
      if(nx)nx.addEventListener("click",function(){if(s.step<STEPS.length){s.step++;render();}});
      if(bk)bk.addEventListener("click",function(){if(s.step>1){s.step--;render();}});
      if(rs)rs.addEventListener("click",function(){s.step=1;render();});
    }
    function stateField(hint){
      return '<div class="field"><label>Your state'+(hint?' <span class="hint">'+hint+'</span>':'')+'</label><select class="select" id="c-state">'+stateOptions(s.stateName)+'</select></div>';
    }
    function wireState(){
      var el=body.querySelector("#c-state"); if(!el) return;
      el.addEventListener("change",function(e){var o=e.target.options[e.target.selectedIndex];s.stateName=o.value;s.rule=o.getAttribute("data-rule");});
    }
    function cell(k,v){return '<div class="cell"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>';}
    function resultShell(rangeHTML,sub,cells,noteText){
      return '<div class="result-wrap"><div class="result" role="status" aria-live="polite">'+
        '<div class="lab">Estimated '+(mode==="dv"?"diminished value":"settlement range")+'</div>'+rangeHTML+
        '<div class="sub">'+sub+'</div><div class="bd">'+cells+'</div>'+
        '<div class="state-note">'+warnIcon()+'<div>'+noteText+'</div></div></div>'+
        '<p class="disclaim" style="text-align:left;margin:12px 2px 14px">Estimate only — not legal advice. Results vary by state and the facts of your case.</p>'+
        '<div class="btn-row"><button class="btn secondary" data-back>Adjust answers</button><button class="btn" data-restart>Start over</button></div></div>';
    }

    function injuryCompute(){
      var econ=s.med+s.futMed+s.wages+s.futWages+s.property;
      var nonE=(s.method==="multiplier")?(s.med+s.futMed)*s.multiplier:s.perDiemRate*s.perDiemDays;
      var gross=econ+nonE, f=s.fault, barred=false, factor=1;
      if(s.rule==="contrib"){ if(f>0){barred=true;factor=0;} }
      else if(s.rule==="mod50"){ if(f>=50){barred=true;factor=0;} else factor=1-f/100; }
      else if(s.rule==="mod51"){ if(f>50){barred=true;factor=0;} else factor=1-f/100; }
      else { factor=1-f/100; }
      return {econ:econ,nonE:nonE,gross:gross,factor:factor,barred:barred,
        adjEcon:econ*factor,adjNon:nonE*factor,total:gross*factor,
        low:round1k(gross*factor*0.85),high:round1k(gross*factor*1.15)};
    }
    function methodBody(){
      var mb=body.querySelector("#c-method-body");
      if(s.method==="multiplier"){
        mb.innerHTML='<div class="field"><label>Severity multiplier <span class="hint">— 1.5 minor / 3 moderate / 4.5 severe</span></label>'+
          '<div class="slider-row"><input type="range" min="1.5" max="5" step="0.1" value="'+s.multiplier+'" class="slider" id="c-mult"><span class="slider-val" id="c-multv">'+s.multiplier.toFixed(1)+'</span></div>'+
          '<div class="guide"><span>Minor</span><span>Moderate</span><span>Severe</span></div></div>';
        var ms=mb.querySelector("#c-mult"),mv=mb.querySelector("#c-multv");
        ms.addEventListener("input",function(){s.multiplier=num(ms.value);mv.textContent=s.multiplier.toFixed(1);paint(ms);});paint(ms);
      } else {
        mb.innerHTML='<div class="cols2"><div class="field"><label>Daily rate <span class="hint">— often a day\'s wage</span></label><div class="input-money"><input class="input" inputmode="numeric" id="c-pdr" value="'+s.perDiemRate.toLocaleString("en-US")+'"></div></div>'+
          '<div class="field"><label>Recovery days</label><input class="input" inputmode="numeric" id="c-pdd" value="'+s.perDiemDays+'"></div></div>';
        bindNum("c-pdr","perDiemRate"); bindNum("c-pdd","perDiemDays");
      }
    }
    function injuryRender(){
      if(s.step===1){
        var caseF = selectable
          ? '<div class="field"><label>Type of case</label><select class="select" id="c-case">'+CASE_TYPES.map(function(c){return '<option'+(c===s.incident?' selected':'')+'>'+c+'</option>';}).join('')+'</select></div>'
          : '<div class="field"><label>Type of incident</label><span class="preset">'+s.incident+'</span></div>';
        body.innerHTML='<div class="cols2">'+caseF+stateField("— sets the negligence rule")+'</div>'+
          '<p class="disclaim" style="text-align:left;margin:2px 0 16px">Your state determines how shared fault changes your payout. We apply its rule automatically.</p>'+nav("Continue to damages",true);
        wire(); wireState(); var cs=body.querySelector("#c-case"); if(cs)cs.addEventListener("change",function(e){s.incident=e.target.value;});
      } else if(s.step===2){
        body.innerHTML='<div class="cols2">'+money("c-med","Medical bills","— to date",s.med)+money("c-futmed","Future medical","— estimated",s.futMed)+'</div>'+
          '<div class="cols2">'+money("c-wages","Lost wages",null,s.wages)+money("c-futwages","Future lost income",null,s.futWages)+'</div>'+
          money("c-prop","Property / vehicle damage",null,s.property)+
          '<p class="disclaim" style="text-align:left;margin:2px 0 14px">These are your <b>economic damages</b> — the hard costs. Leave blank what does not apply.</p>'+nav("Continue to severity");
        wire(); bindMoney("c-med","med");bindMoney("c-futmed","futMed");bindMoney("c-wages","wages");bindMoney("c-futwages","futWages");bindMoney("c-prop","property");
      } else if(s.step===3){
        var isM=s.method==="multiplier";
        body.innerHTML='<div class="field"><label>Pain &amp; suffering method</label><div class="seg-toggle" id="c-method">'+
            '<button data-m="multiplier" class="'+(isM?"on":"")+'">Multiplier</button><button data-m="perdiem" class="'+(!isM?"on":"")+'">Per diem</button></div></div>'+
          '<div id="c-method-body"></div>'+
          '<div class="field"><label>Primary injury</label><select class="select" id="c-injury">'+INJURIES.map(function(i){return '<option'+(i===s.injury?" selected":"")+'>'+i+'</option>';}).join("")+'</select></div>'+
          '<div class="field"><label>Your share of fault <span class="hint">— % you may be responsible</span></label>'+
          '<div class="slider-row"><input type="range" min="0" max="100" step="5" value="'+s.fault+'" class="slider" id="c-fault"><span class="slider-val" id="c-faultv">'+s.fault+'%</span></div></div>'+nav("See my estimate");
        methodBody(); wire();
        body.querySelectorAll("#c-method button").forEach(function(b){b.addEventListener("click",function(){s.method=b.getAttribute("data-m");body.querySelectorAll("#c-method button").forEach(function(x){x.classList.remove("on");});b.classList.add("on");methodBody();});});
        body.querySelector("#c-injury").addEventListener("change",function(e){s.injury=e.target.value;});
        var fs=body.querySelector("#c-fault"),fv=body.querySelector("#c-faultv");
        fs.addEventListener("input",function(){s.fault=num(fs.value);fv.textContent=s.fault+"%";paint(fs);});paint(fs);
      } else {
        var r=injuryCompute();
        var ml=s.method==="multiplier"?("Multiplier ("+s.multiplier.toFixed(1)+"x)"):("Per-diem ("+fmt(s.perDiemRate)+"/day x "+s.perDiemDays+")");
        var note;
        if(r.barred){ note="<b>"+s.stateName+"</b> follows "+(s.rule==="contrib"?"pure contributory negligence. Because you indicated some fault, recovery may be barred entirely — near $0.":"a modified comparative bar. At "+s.fault+"% fault you may be over the threshold to recover."); }
        else if(s.fault>0){ note="<b>"+s.stateName+"</b> uses "+RULE_TEXT[s.rule].split("—")[0].trim()+". Your "+s.fault+"% fault reduced the estimate by "+s.fault+"%."; }
        else { note="<b>"+s.stateName+"</b> rule applied: "+RULE_TEXT[s.rule]; }
        var range=r.barred?'<div class="range">$0 <span style="font-size:16px;color:var(--muted);font-weight:600">(likely barred)</span></div>':'<div class="range">'+fmt(r.low)+'<span class="dash"> – </span>'+fmt(r.high)+'</div>';
        var cells=cell("Economic damages",fmt(r.adjEcon))+cell("Pain &amp; suffering",r.barred?"$0":fmtK(r.adjNon*0.85)+" – "+fmtK(r.adjNon*1.15));
        body.innerHTML=resultShell(range,s.incident+" · "+s.stateName+" · "+ml,cells,note); wire();
      }
    }

    function wcCompute(){
      var rate=Math.min(s.aww*2/3, 1200);
      var weeks=(s.impair/100)*500;
      var ppd=weeks*rate; var total=ppd+s.wcFutMed;
      return {rate:rate,weeks:weeks,ppd:ppd,total:total,low:round1k(total*0.8),high:round1k(total*1.2)};
    }
    function wcRender(){
      if(s.step===1){
        body.innerHTML='<div class="cols2">'+stateField("— caps &amp; schedule vary")+money("c-aww","Average weekly wage","— before injury",s.aww)+'</div>'+
          '<p class="disclaim" style="text-align:left;margin:2px 0 16px">Workers\' comp is <b>no-fault</b> and pays no pain &amp; suffering. Your benefit rate is about two-thirds of your average weekly wage, capped by your state.</p>'+nav("Continue",true);
        wire(); wireState(); bindMoney("c-aww","aww");
      } else if(s.step===2){
        body.innerHTML='<div class="field"><label>Permanent impairment rating <span class="hint">— % at maximum medical improvement</span></label>'+
            '<div class="slider-row"><input type="range" min="0" max="100" step="1" value="'+s.impair+'" class="slider" id="c-impair"><span class="slider-val" id="c-impairv">'+s.impair+'%</span></div>'+
            '<div class="guide"><span>Minor</span><span>Moderate</span><span>Total</span></div></div>'+
          money("c-wcmed","Estimated future medical","— ongoing care",s.wcFutMed)+
          '<p class="disclaim" style="text-align:left;margin:2px 0 14px">Your impairment rating, set by your doctor, scales the permanent-disability part of the settlement.</p>'+nav("See my estimate");
        wire(); bindMoney("c-wcmed","wcFutMed");
        var is=body.querySelector("#c-impair"),iv=body.querySelector("#c-impairv");
        is.addEventListener("input",function(){s.impair=num(is.value);iv.textContent=s.impair+"%";paint(is);});paint(is);
      } else {
        var r=wcCompute();
        var range='<div class="range">'+fmt(r.low)+'<span class="dash"> – </span>'+fmt(r.high)+'</div>';
        var cells=cell("Weekly rate",fmt(r.rate))+cell("PPD basis",Math.round(r.weeks)+" wks");
        var note="<b>"+s.stateName+"</b>: a simplified whole-person estimate. State schedules, caps and how future medical is settled vary widely — your actual lump sum may differ.";
        body.innerHTML=resultShell(range,"Workers' comp · "+s.stateName+" · "+s.impair+"% impairment",cells,note); wire();
      }
    }

    function mileMult(b){return {"<20":1.0,"20-40":0.8,"40-60":0.6,"60-80":0.4,"80-100":0.2,">100":0.0}[b];}
    function dvCompute(){
      var base=s.carValue*0.10; var dmg=s.damage/100;
      var dv=base*dmg*mileMult(s.miles);
      return {base:base,dv:dv,low:round100(dv*0.85),high:round100(dv*1.15)};
    }
    function dvRender(){
      if(s.step===1){
        body.innerHTML=
          money("c-cv","Car's value before the accident","— KBB / NADA",s.carValue)+
          '<div class="field"><label>Mileage</label><select class="select" id="c-miles">'+[["<20","Under 20,000 mi"],["20-40","20,000–40,000 mi"],["40-60","40,000–60,000 mi"],["60-80","60,000–80,000 mi"],["80-100","80,000–100,000 mi"],[">100","Over 100,000 mi"]].map(function(m){return '<option value="'+m[0]+'"'+(m[0]===s.miles?" selected":"")+'>'+m[1]+'</option>';}).join("")+'</select></div>'+
          '<div class="field"><label>Damage severity <span class="hint">— cosmetic to structural/frame</span></label>'+
            '<div class="slider-row"><input type="range" min="0" max="100" step="5" value="'+s.damage+'" class="slider" id="c-dmg"><span class="slider-val" id="c-dmgv">'+s.damage+'%</span></div>'+
            '<div class="guide"><span>Cosmetic</span><span>Moderate</span><span>Frame</span></div></div>'+
          '<p class="disclaim" style="text-align:left;margin:2px 0 14px">The <b>17c formula</b>: 10% of your car\'s value x a damage multiplier x a mileage multiplier. Higher mileage means less diminished value.</p>'+nav("See my estimate",true);
        wire(); bindMoney("c-cv","carValue");
        body.querySelector("#c-miles").addEventListener("change",function(e){s.miles=e.target.value;});
        var ds=body.querySelector("#c-dmg"),dvv=body.querySelector("#c-dmgv");
        ds.addEventListener("input",function(){s.damage=num(ds.value);dvv.textContent=s.damage+"%";paint(ds);});paint(ds);
      } else {
        var r=dvCompute();
        var range='<div class="range">'+fmt(r.low)+'<span class="dash"> – </span>'+fmt(r.high)+'</div>';
        var cells=cell("17c base (10%)",fmt(r.base))+cell("Mileage factor","x"+mileMult(s.miles).toFixed(2));
        var note="A third-party claim against the <b>at-fault driver's</b> insurer. They recognise 17c but are not bound by it — an independent appraisal supports a higher figure.";
        body.innerHTML=resultShell(range,"Diminished value · 17c formula",cells,note); wire();
      }
    }

    function wtCompute(){
      var weekly=s.salary/52; var back=weekly*s.weeksOut;
      var distress={none:0,mild:5000,moderate:20000,severe:50000}[s.distress];
      var punitive=s.illegal?back*0.5:0;
      var total=back+s.benefits+distress+punitive;
      return {weekly:weekly,back:back,distress:distress,punitive:punitive,total:total,low:round1k(total*0.75),high:round1k(total*1.25)};
    }
    function wtRender(){
      if(s.step===1){
        body.innerHTML='<div class="cols2">'+money("c-sal","Annual compensation","— salary + bonus",s.salary)+plain("c-wks","Weeks out of work","— since the firing",s.weeksOut)+'</div>'+
          '<p class="disclaim" style="text-align:left;margin:2px 0 16px">The core of a wrongful-termination claim is <b>lost pay</b>: weekly pay x weeks unemployed (back pay), plus front pay if you are still out of work.</p>'+nav("Continue",true);
        wire(); bindMoney("c-sal","salary"); bindNum("c-wks","weeksOut");
      } else if(s.step===2){
        body.innerHTML=money("c-ben","Lost benefits value","— health, bonus, equity",s.benefits)+
          '<div class="field"><label>Emotional distress</label><select class="select" id="c-distress">'+[["none","None"],["mild","Mild"],["moderate","Moderate"],["severe","Severe"]].map(function(o){return '<option value="'+o[0]+'"'+(o[0]===s.distress?" selected":"")+'>'+o[1]+'</option>';}).join("")+'</select></div>'+
          '<div class="field"><label>Clear illegal reason? <span class="hint">— discrimination, retaliation, breach</span></label>'+
            '<div class="seg-toggle" id="c-illegal"><button data-v="1" class="'+(s.illegal?"on":"")+'">Yes</button><button data-v="0" class="'+(!s.illegal?"on":"")+'">No / unsure</button></div></div>'+
          '<p class="disclaim" style="text-align:left;margin:2px 0 14px">A clear illegal motive opens the door to <b>punitive damages</b>, which can add substantially.</p>'+nav("See my estimate");
        wire(); bindMoney("c-ben","benefits");
        body.querySelector("#c-distress").addEventListener("change",function(e){s.distress=e.target.value;});
        body.querySelectorAll("#c-illegal button").forEach(function(b){b.addEventListener("click",function(){s.illegal=b.getAttribute("data-v")==="1";body.querySelectorAll("#c-illegal button").forEach(function(x){x.classList.remove("on");});b.classList.add("on");});});
      } else {
        var r=wtCompute();
        var range='<div class="range">'+fmt(r.low)+'<span class="dash"> – </span>'+fmt(r.high)+'</div>';
        var cells=cell("Back pay",fmt(r.back))+cell("Punitive (est.)",r.punitive?fmt(r.punitive):"$0");
        var note="Mostly lost wages, plus benefits, emotional distress and possible punitive damages. You are generally expected to <b>mitigate</b> by seeking new work — earnings reduce back pay.";
        body.innerHTML=resultShell(range,"Wrongful termination",cells,note); wire();
      }
    }

    function render(){
      chrome();
      if(mode==="wc") wcRender();
      else if(mode==="dv") dvRender();
      else if(mode==="wt") wtRender();
      else injuryRender();
    }
    render();
  }

  function boot(){ document.querySelectorAll("#calculator-app,[data-calculator]").forEach(init); }
  if(document.readyState!=="loading") boot(); else document.addEventListener("DOMContentLoaded",boot);
})();
