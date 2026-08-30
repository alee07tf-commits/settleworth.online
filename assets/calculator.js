/* ============================================================
   SettleWorth — settlement calculator engine (vanilla JS, no dependencies)
   Mount: <div data-calculator data-incident="Car accident" [data-select] [data-mode="injury|wc|dv|wt"]></div>

   Modes:
     injury -> economic damages + pain & suffering + 51-jurisdiction fault rule
     wc     -> workers' comp weekly benefit rate (see WC note below)
     dv     -> diminished value, 17c formula
     wt     -> wrongful termination wage loss + 42 U.S.C. 1981a statutory ceiling

   HONESTY POLICY FOR THIS FILE (YMYL — people take these numbers to an
   insurance adjuster). Every constant below is in exactly one of three states:
     (a) SOURCED  — a statute, case or published formula is cited beside it and,
                    where it drives the headline, on screen as well;
     (b) DECLARED — no verifiable source exists in our hands, so it ships only
                    as an explicitly labelled orientative band, never as a
                    precise figure, and the label is repeated on screen;
     (c) DELETED  — removed from the product rather than guessed.
   No figure is presented as precise unless it is (a) or is plain arithmetic on
   what the user typed. An empty form NEVER produces an estimate.

   Estimates only — not legal advice.
   ============================================================ */
(function () {
  "use strict";

  /* =========================================================
     LAYER 0 — DATA
     ========================================================= */

  /* Comparative fault by jurisdiction. [name, rule, citation]
     rule: pure | mod50 (barred at 50% or more) | mod51 (barred above 50%)
           contrib (any fault bars) | slight (South Dakota only, see below)
     Citations verified state by state in audits/06-minitool.md sec. 3. */
  var STATES = [
    ["Alabama", "contrib", "Golden v. McCurry (Ala. 1980)"],
    ["Alaska", "pure", "AS 09.17.060"],
    ["Arizona", "pure", "A.R.S. § 12-2505"],
    ["Arkansas", "mod50", "Ark. Code § 16-64-122"],
    ["California", "pure", "Li v. Yellow Cab (1975)"],
    ["Colorado", "mod50", "C.R.S. § 13-21-111"],
    ["Connecticut", "mod51", "C.G.S. § 52-572h"],
    ["Delaware", "mod51", "10 Del. C. § 8132"],
    ["District of Columbia", "contrib", "common law; D.C. Code § 50-2204.52 for pedestrians and cyclists"],
    ["Florida", "mod51", "Fla. Stat. § 768.81 (HB 837, 2023)"],
    ["Georgia", "mod50", "O.C.G.A. § 51-12-33"],
    ["Hawaii", "mod51", "HRS § 663-31"],
    ["Idaho", "mod50", "I.C. § 6-801"],
    ["Illinois", "mod51", "735 ILCS 5/2-1116"],
    ["Indiana", "mod51", "I.C. § 34-51-2-6"],
    ["Iowa", "mod51", "Iowa Code § 668.3(1)"],
    ["Kansas", "mod50", "K.S.A. § 60-258a"],
    ["Kentucky", "pure", "KRS § 411.182; Hilen v. Hays"],
    ["Louisiana", "pure", "La. Civ. Code art. 2323"],
    ["Maine", "mod50", "14 M.R.S. § 156"],
    ["Maryland", "contrib", "Coleman v. Soccer Ass'n of Columbia (2013)"],
    ["Massachusetts", "mod51", "M.G.L. c. 231 § 85"],
    ["Michigan", "mod51", "MCL 600.2959 and 600.6304"],
    ["Minnesota", "mod51", "Minn. Stat. § 604.01"],
    ["Mississippi", "pure", "Miss. Code § 11-7-15"],
    ["Missouri", "pure", "Gustafson v. Benda (1983)"],
    ["Montana", "mod51", "MCA § 27-1-702"],
    ["Nebraska", "mod50", "Neb. Rev. Stat. § 25-21,185.09"],
    ["Nevada", "mod51", "NRS § 41.141"],
    ["New Hampshire", "mod51", "RSA § 507:7-d"],
    ["New Jersey", "mod51", "N.J.S.A. § 2A:15-5.1"],
    ["New Mexico", "pure", "Scott v. Rizzo (1981)"],
    ["New York", "pure", "CPLR § 1411"],
    ["North Carolina", "contrib", "common law contributory negligence"],
    ["North Dakota", "mod50", "N.D.C.C. § 32-03.2-02"],
    ["Ohio", "mod51", "O.R.C. § 2315.33"],
    ["Oklahoma", "mod51", "23 O.S. § 13"],
    ["Oregon", "mod51", "ORS § 31.600"],
    ["Pennsylvania", "mod51", "42 Pa.C.S. § 7102"],
    ["Rhode Island", "pure", "R.I. Gen. Laws § 9-20-4"],
    ["South Carolina", "mod51", "Nelson v. Concrete Supply Co. (1991)"],
    ["South Dakota", "slight", "SDCL § 20-9-2"],
    ["Tennessee", "mod50", "McIntyre v. Balentine (1992)"],
    ["Texas", "mod51", "Tex. CPRC § 33.001"],
    ["Utah", "mod50", "Utah Code § 78B-5-818(2)"],
    ["Vermont", "mod51", "12 V.S.A. § 1036"],
    ["Virginia", "contrib", "common law contributory negligence"],
    ["Washington", "pure", "RCW 4.22.005"],
    ["West Virginia", "mod51", "W. Va. Code § 55-7-13c(c)"],
    ["Wisconsin", "mod51", "Wis. Stat. § 895.045"],
    ["Wyoming", "mod51", "Wyo. Stat. § 1-1-109"]
  ];

  var RULE_TEXT = {
    pure:    "pure comparative negligence — your award is reduced by your share of fault, even at 90%.",
    mod50:   "modified comparative negligence with a 50% bar — you recover only if you are less than 50% at fault.",
    mod51:   "modified comparative negligence with a 51% bar — you recover only if you are 50% or less at fault.",
    contrib: "pure contributory negligence — any fault on your part can bar recovery entirely.",
    slight:  "the slight/gross rule — South Dakota is the only state that uses it. You recover only if your own negligence was “slight” compared with the other party's, and the statute sets no percentage."
  };

  /* Jurisdiction notes that change the answer and cannot be inferred from the
     numbers the user typed. Shown on screen with the result. */
  var STATE_NOTE = {
    "District of Columbia":
      "D.C. is a contributory-negligence jurisdiction, but D.C. Code § 50-2204.52 carves out pedestrians, cyclists and other non-motorised road users: their own negligence does not bar recovery unless it is greater than 50% of the total fault.",
    "Indiana":
      "Indiana's Comparative Fault Act (I.C. § 34-51-2-6) does <b>not</b> cover medical malpractice claims or claims against governmental entities. In those two categories Indiana still applies pure contributory negligence, where any fault of yours can bar recovery. This calculator applies the 51% bar, so if your claim is medical malpractice or against a public body, treat the figure below as not applicable.",
    "Michigan":
      "Michigan splits the two kinds of damages: above 50% fault, MCL 600.2959 bars your <b>non-economic</b> damages, but your <b>economic</b> damages (medical bills, lost income, property) are still recovered, reduced by your share of fault.",
    "South Dakota":
      "South Dakota is the only state using the slight/gross rule (SDCL § 20-9-2). Recovery depends on whether a jury calls your negligence “slight” compared with the other party's — the statute fixes no percentage, and neither will we.",
    "Florida":
      "Florida moved to a 51% bar with HB 837 in March 2023 (Fla. Stat. § 768.81). Medical negligence claims are excluded from that bar by § 768.81(6).",
    "Maine":
      "Maine's statute (14 M.R.S. § 156) tells the fact-finder to reduce the award to what is “just and equitable”, which is not necessarily the strict percentage we apply here.",
    "Utah":
      "Utah compares your fault with each defendant individually (Utah Code § 78B-5-818(2)), not with all of them combined, so with several defendants the real threshold can differ."
  };

  var INJURIES = ["Whiplash / soft tissue", "Broken bone(s)", "Herniated disc", "Nerve damage",
    "Traumatic brain injury", "Spinal cord injury", "Scarring / disfigurement", "Internal injuries", "Other"];

  /* (b) DECLARED, not sourced. There is no published table of multipliers by
     injury type; 1.5-5 is the band conventionally argued in negotiation. These
     values only move the slider's STARTING POINT inside that same band - they
     never widen it - and the screen says so in words. Catastrophic cases are
     argued above 5; this tool does not go there. */
  var MULT_MIN = 1.5, MULT_MAX = 5;
  var INJURY_DEFAULT_MULT = {
    "Whiplash / soft tissue": 2,
    "Broken bone(s)": 3,
    "Herniated disc": 3.5,
    "Nerve damage": 4,
    "Traumatic brain injury": 5,
    "Spinal cord injury": 5,
    "Scarring / disfigurement": 3.5,
    "Internal injuries": 4,
    "Other": 3
  };

  var CASE_TYPES = ["Car accident", "Truck accident", "Motorcycle accident", "Slip and fall", "Dog bite",
    "Pedestrian accident", "Personal injury", "Nerve damage", "Pain and suffering"];

  /* What actually changes with the case type. No numeric factor is applied:
     we have no sourced multiplier by case type, so we say what changes in law
     instead of inventing a number. */
  var CASE_NOTE = {
    "Truck accident": "Truck cases run under federal motor-carrier rules (49 C.F.R. Parts 380-399) and commercial policies with far higher limits than a private car policy, so the ceiling on what can be recovered is usually much higher than this arithmetic suggests.",
    "Dog bite": "Many states impose strict liability on dog owners by statute, which means you may not have to prove negligence at all — but a few still apply a one-bite rule. That changes whether you recover, not the size of the arithmetic below.",
    "Slip and fall": "Premises cases turn on notice: whether the occupier knew or should have known about the hazard, and on your status on the property. A weak notice case can be worth far less than the arithmetic below.",
    "Pedestrian accident": "Pedestrian claims often involve uninsured or underinsured drivers, so the available policy limits can cap the real recovery well below the value of the claim.",
    "Motorcycle accident": "Motorcycle claims frequently meet a bias about rider fault, and in most states helmet use can be argued into the fault split.",
    "Car accident": "In a no-fault state, your own PIP coverage pays first and you can only step outside it if your injury meets the state's verbal or monetary threshold."
  };

  /* 17c diminished value. SOURCED: the formula comes from the consent order in
     Mabry v. State Farm Mut. Auto. Ins. Co. (Ga. 2001) - 10% of pre-loss value
     as the base cap, a damage modifier and a mileage modifier. It is the
     insurer's formula, not a legal ceiling on what a claim is worth. */
  var DV_BASE_PCT = 0.10;
  var DV_MILEAGE = [
    ["<20", "Under 20,000 mi", 1.0],
    ["20-40", "20,000 – 39,999 mi", 0.8],
    ["40-60", "40,000 – 59,999 mi", 0.6],
    ["60-80", "60,000 – 79,999 mi", 0.4],
    ["80-100", "80,000 – 99,999 mi", 0.2],
    [">100", "100,000 mi or more", 0.0]
  ];
  var DV_DAMAGE = [
    ["1.00", "Severe structural / frame damage", 1.0],
    ["0.75", "Major damage to structure and panels", 0.75],
    ["0.50", "Moderate damage to panels", 0.5],
    ["0.25", "Minor damage to panels", 0.25],
    ["0.00", "No structural damage", 0.0]
  ];

  /* Workers' comp.
     SOURCED: two-thirds of the average weekly wage is the near-universal
     statutory temporary-disability rate.
     DELETED: the old national $1,200 weekly cap and the 500-week whole-person
     schedule. Both were invented, identical for all 51 jurisdictions, and drove
     the headline figure.
     Real maximum weekly rates are published every year by each state agency
     and we do not hold verified current values, so we do not apply
     one and we say so.
     DECLARED: the 300-520 week band used for the illustrative permanent-partial
     figure. Documented points inside it: Texas 300 weeks (3 weeks per point of
     impairment rating), Kentucky 425/520. It is shown as a band, never as the
     headline, and labelled on screen as an illustration. */
  var WC_RATE_FRACTION = 2 / 3;
  var WC_WEEKS_LOW = 300, WC_WEEKS_HIGH = 520;

  /* Wrongful termination.
     SOURCED: 42 U.S.C. 1981a(b)(3) caps COMPENSATORY plus PUNITIVE damages
     together, by employer size, in Title VII and ADA claims. Back pay is
     expressly outside the cap, 1981a(b)(2).
     DELETED: the emotional-distress table (0 / 5,000 / 20,000 / 50,000) and
     punitive = back pay x 0.5. Both were invented and both produced a headline
     figure from an empty form. */
  var EMPLOYER_SIZES = [
    ["lt15", "Fewer than 15 employees", null],
    ["15-100", "15 to 100 employees", 50000],
    ["101-200", "101 to 200 employees", 100000],
    ["201-500", "201 to 500 employees", 200000],
    ["501+", "More than 500 employees", 300000]
  ];

  var MAX_MONEY = 50000000;   /* plausibility ceiling, declared on screen when hit */

  /* =========================================================
     LAYER 1 — PURE CORES (no DOM, no formatting, no rounding)
     ========================================================= */

  function ruleFor(stateName) {
    for (var i = 0; i < STATES.length; i++) if (STATES[i][0] === stateName) return STATES[i][1];
    return "pure";
  }
  function citeFor(stateName) {
    for (var i = 0; i < STATES.length; i++) if (STATES[i][0] === stateName) return STATES[i][2];
    return "";
  }

  function n0(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }

  /* injuryCompute(v) -> object. v = {med, futMed, wages, futWages, property,
     method, multiplier, perDiemRate, perDiemDays, fault, stateName, incident} */
  function injuryCompute(v) {
    var med = n0(v.med), futMed = n0(v.futMed);
    var econ = med + futMed + n0(v.wages) + n0(v.futWages) + n0(v.property);

    /* The multiplier is applied to PAST medical bills only. Multiplying future
       medical as well generates pain and suffering on top of a cost that has
       not been incurred yet; we show what that alternative base would give
       instead of silently picking it. */
    var nonE, nonEAlt = null;
    if (v.method === "perdiem") {
      nonE = n0(v.perDiemRate) * n0(v.perDiemDays);
    } else {
      nonE = med * n0(v.multiplier);
      if (futMed > 0) nonEAlt = (med + futMed) * n0(v.multiplier);
    }

    var rule = ruleFor(v.stateName);
    var f = n0(v.fault);
    var barred = false, unquantified = false, fEcon = 1, fNon = 1;
    var appliedRule = rule, exception = null;

    /* D.C. Code 50-2204.52: for pedestrians, cyclists and other non-motorised
       users the contributory-negligence bar does not apply unless their own
       negligence is greater than 50% of the total fault. */
    if (v.stateName === "District of Columbia" && /pedestrian|bicycl|cyclist/i.test(v.incident || "")) {
      appliedRule = "mod51";
      exception = "D.C. Code § 50-2204.52 — the pedestrian and cyclist exception applies, so contributory negligence does not bar this claim below 51% fault.";
    }

    if (appliedRule === "contrib") {
      if (f > 0) { barred = true; fEcon = fNon = 0; }
    } else if (appliedRule === "mod50") {
      if (f >= 50) { barred = true; fEcon = fNon = 0; } else { fEcon = fNon = 1 - f / 100; }
    } else if (appliedRule === "mod51") {
      if (f > 50) { barred = true; fEcon = fNon = 0; } else { fEcon = fNon = 1 - f / 100; }
    } else if (appliedRule === "slight") {
      /* SDCL 20-9-2 fixes no percentage: recovery depends on a jury calling the
         plaintiff's negligence "slight" against the defendant's "gross". Any
         cut-off we picked would be invented, so above 0% fault we return no
         figure at all and say why. */
      if (f > 0) { unquantified = true; fEcon = fNon = 0; } else { fEcon = fNon = 1; }
    } else {
      fEcon = fNon = 1 - f / 100;
    }

    /* MCL 600.2959 / 600.6304: above 50% fault Michigan bars NON-ECONOMIC
       damages only. Economic damages are still recovered, reduced. */
    if (v.stateName === "Michigan" && f > 50) {
      barred = false;
      fEcon = 1 - f / 100;
      fNon = 0;
      exception = "MCL 600.2959 — above 50% fault your non-economic damages are barred, but your economic damages are not.";
    }

    var adjEcon = econ * fEcon, adjNon = nonE * fNon;
    return {
      econ: econ, nonE: nonE, nonEAlt: nonEAlt, gross: econ + nonE,
      rule: rule, appliedRule: appliedRule, exception: exception, cite: citeFor(v.stateName),
      fault: f, fEcon: fEcon, fNon: fNon, barred: barred, unquantified: unquantified,
      adjEcon: adjEcon, adjNon: adjNon, total: adjEcon + adjNon
    };
  }

  /* wcCompute(v) -> weekly benefit rate plus an explicitly illustrative
     permanent-partial band. No state cap is applied because we hold no verified
     current figure; the caller must print that warning. */
  function wcCompute(v) {
    var aww = n0(v.aww);
    var rate = aww * WC_RATE_FRACTION;
    var impair = n0(v.impair) / 100;
    var futMed = n0(v.wcFutMed);
    return {
      aww: aww, rate: rate, impair: impair, futMed: futMed,
      weeksLow: impair * WC_WEEKS_LOW, weeksHigh: impair * WC_WEEKS_HIGH,
      ppdLow: impair * WC_WEEKS_LOW * rate, ppdHigh: impair * WC_WEEKS_HIGH * rate,
      totalLow: impair * WC_WEEKS_LOW * rate + futMed,
      totalHigh: impair * WC_WEEKS_HIGH * rate + futMed,
      capApplied: false
    };
  }

  function dvMileMult(code) {
    for (var i = 0; i < DV_MILEAGE.length; i++) if (DV_MILEAGE[i][0] === code) return DV_MILEAGE[i][2];
    return null;
  }
  function dvDamageMult(code) {
    for (var i = 0; i < DV_DAMAGE.length; i++) if (DV_DAMAGE[i][0] === code) return DV_DAMAGE[i][2];
    return null;
  }
  function dvCompute(v) {
    var base = n0(v.carValue) * DV_BASE_PCT;
    var dmg = dvDamageMult(v.damage);
    var mile = dvMileMult(v.miles);
    if (dmg === null || mile === null) return { incomplete: true };
    return { base: base, damageMult: dmg, mileMult: mile, dv: base * dmg * mile, zeroByMileage: mile === 0 };
  }

  function capFor(sizeCode) {
    for (var i = 0; i < EMPLOYER_SIZES.length; i++) if (EMPLOYER_SIZES[i][0] === sizeCode) return EMPLOYER_SIZES[i][2];
    return null;
  }
  /* wtCompute(v). Headline is wage loss, which is arithmetic on what the user
     typed. The upper bound adds the statutory ceiling on compensatory plus
     punitive damages, which is a real number from 42 U.S.C. 1981a(b)(3) - not
     a prediction that the case is worth it. */
  function wtCompute(v) {
    var weekly = n0(v.salary) / 52;
    var back = weekly * n0(v.weeksOut);
    var mitigated = Math.max(0, back - n0(v.interimEarnings));
    var front = weekly * n0(v.frontPayWeeks);
    var wageLoss = mitigated + front + n0(v.benefits);
    var cap = v.illegal === true ? capFor(v.employerSize) : 0;
    return {
      weekly: weekly, back: back, mitigated: mitigated, front: front,
      benefits: n0(v.benefits), wageLoss: wageLoss,
      cap: cap, capUnknown: v.illegal === true && cap === null,
      low: wageLoss, high: wageLoss + (cap || 0)
    };
  }

  /* =========================================================
     LAYER 2 — FORMAT AND PARSING
     ========================================================= */

  function fmt(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function fmtK(v) {
    if (v >= 999500) return "$" + (v / 1000000).toFixed(v % 1000000 ? 1 : 0) + "M";
    if (v >= 1000) return "$" + Math.round(v / 1000) + "K";
    return "$" + Math.round(v);
  }
  function esc(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Returns NaN for "not a usable number" so the caller can raise an error.
     Never turns a blank, a word, a negative or 1e9 into a plausible figure. */
  function parseNum(v) {
    if (typeof v === "number") return isFinite(v) ? v : NaN;
    if (v === null || v === undefined) return NaN;
    var s = String(v).trim().replace(/[\s $%]/g, "");
    if (s === "") return NaN;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");  /* 1,250.75 */
    else s = s.replace(/,/g, "");
    if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(s)) return NaN;                   /* rejects abc, 1e9, 1.2.3 */
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function bucket(v) {
    if (!isFinite(v) || v <= 0) return "0";
    if (v < 10000) return "1-10k";
    if (v < 50000) return "10-50k";
    if (v < 250000) return "50-250k";
    return "250k+";
  }

  /* =========================================================
     LAYER 5 — MEASUREMENT (GA4 via dataLayer, spec: audits/07-cro-sxo.md sec. 8)
     No raw personal figure is pushed: only outputs and buckets.
     ========================================================= */

  window.dataLayer = window.dataLayer || [];
  function track(name, params, mode) {
    try {
      var p = {}, k;
      if (params) for (k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
      p.event = "sw_" + name;
      if (mode) p.calculator_mode = mode;
      p.page_type = (document.body && document.body.getAttribute("data-page-type")) || "unknown";
      window.dataLayer.push(p);
    } catch (e) { /* measurement must never break the tool */ }
  }
  function sessionOnce(key) {
    try {
      if (window.sessionStorage.getItem(key)) return false;
      window.sessionStorage.setItem(key, "1");
      return true;
    } catch (e) { return true; }
  }

  /* =========================================================
     LAYER 6 — THE WIDGET
     ========================================================= */

  var instances = 0;

  function modeFor(mount, incident) {
    var explicit = mount.getAttribute("data-mode");
    if (explicit && /^(injury|wc|dv|wt)$/.test(explicit)) return explicit;
    var i = (incident || "").toLowerCase();
    if (/workers'? comp|workmans? comp|workers compensation/.test(i)) return "wc";
    if (/diminished value/.test(i)) return "dv";
    if (/wrongful termination/.test(i)) return "wt";
    return "injury";
  }

  function init(mount) {
    var incident = mount.getAttribute("data-incident") || "Personal injury";
    var selectable = mount.hasAttribute("data-select") || /personal injury/i.test(incident);
    var mode = modeFor(mount, incident);
    var P = "c" + (++instances) + "-";                 /* id prefix, one per instance */
    var startedAt = null, stepEnteredAt = Date.now(), completedAt = null, viewedAt = Date.now();
    var completed = false;

    var s = {
      step: 1, incident: incident,
      stateName: "California", rule: "pure",
      med: null, futMed: null, wages: null, futWages: null, property: null,
      method: "multiplier", multiplier: INJURY_DEFAULT_MULT[INJURIES[0]],
      perDiemRate: null, perDiemDays: null,
      injury: INJURIES[0], fault: 0,
      aww: null, wcFutMed: null, impair: 0,
      carValue: null, miles: "", damage: "",
      salary: null, weeksOut: null, frontPayWeeks: null, interimEarnings: null,
      benefits: null, employerSize: "", illegal: null
    };

    var STEPS = {
      injury: ["Your case", "Damages", "Severity", "Result"],
      wc: ["Your wage", "Impairment", "Result"],
      dv: ["Your vehicle", "Result"],
      wt: ["Lost pay", "Your claim", "Result"]
    }[mode];

    var title = mode === "dv" ? "Diminished Value Calculator"
      : mode === "wc" ? "Workers' Comp Benefit Calculator"
      : mode === "wt" ? "Wrongful Termination Calculator"
      : "Settlement Calculator";

    mount.innerHTML =
      '<div class="calc-card"><div class="calc">' +
        '<div class="calc-head"><span class="calc-title">' + esc(title) + '</span>' +
        '<span class="calc-step-of" id="' + P + 'stepof"></span></div>' +
        '<div class="progress" id="' + P + 'prog">' + STEPS.map(function () { return '<span class="seg"></span>'; }).join("") + '</div>' +
        '<div class="steps-labels" id="' + P + 'labels"></div>' +
        '<div id="' + P + 'body"></div>' +
      '</div></div>';

    var elStepOf = mount.querySelector("#" + P + "stepof"),
        elProg = mount.querySelector("#" + P + "prog").children,
        elLabels = mount.querySelector("#" + P + "labels"),
        body = mount.querySelector("#" + P + "body");

    function q(name) { return body.querySelector("#" + P + name); }

    /* ---- measurement wiring: tool_start (E2) ---- */
    function markStart(ev) {
      if (startedAt) return;
      startedAt = Date.now();
      var t = ev && ev.target ? ev.target : null;
      var fid = t && t.id ? t.id.replace(P, "") : "";
      if (sessionOnce("sw_start_" + mode)) {
        track("tool_start", { first_field_id: fid, ms_from_tool_view: startedAt - viewedAt }, mode);
      }
    }
    mount.addEventListener("input", markStart, true);
    mount.addEventListener("change", markStart, true);
    mount.addEventListener("click", markStart, true);

    /* ---- measurement: calc_abandon (E7) ---- */
    function abandon() {
      if (!startedAt || completed) return;
      completed = true;   /* fire at most once */
      track("calc_abandon", {
        last_step_index: s.step, last_step_name: STEPS[s.step - 1],
        fields_filled_total: filledTotal(), ms_in_tool: Date.now() - startedAt,
        partial_estimate_shown: false
      }, mode);
    }
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") abandon(); });
    window.addEventListener("pagehide", abandon);

    /* ---- chrome ---- */
    function chrome() {
      for (var i = 0; i < STEPS.length; i++) elProg[i].className = "seg" + (i < s.step ? " on" : "");
      elStepOf.textContent = "Step " + s.step + " / " + STEPS.length;
      elLabels.innerHTML = STEPS.map(function (name, i) {
        var c = (i + 1 === s.step) ? "on" : ((i + 1 < s.step) ? "done" : "");
        return '<span class="' + c + '">' + esc(name) + "</span>";
      }).join("");
    }

    /* ---- field builders (every control gets a real <label for>) ---- */
    function errBox(id) {
      return '<p class="disclaim" id="error-' + id + '" role="alert" ' +
        'style="text-align:left;margin:6px 0 0;color:#b42318;font-weight:600;min-height:0"></p>';
    }
    function money(name, label, hint, val) {
      var id = P + name;
      return '<div class="field"><label for="' + id + '">' + label + (hint ? ' <span class="hint">' + hint + "</span>" : "") + "</label>" +
        '<div class="input-money"><input class="input" inputmode="decimal" autocomplete="off" id="' + id + '" ' +
        'aria-describedby="error-' + id + '" value="' + (val === null || val === undefined ? "" : val.toLocaleString("en-US")) + '" placeholder="0"></div>' +
        errBox(id) + "</div>";
    }
    function plain(name, label, hint, val) {
      var id = P + name;
      return '<div class="field"><label for="' + id + '">' + label + (hint ? ' <span class="hint">' + hint + "</span>" : "") + "</label>" +
        '<input class="input" inputmode="numeric" autocomplete="off" id="' + id + '" aria-describedby="error-' + id + '" ' +
        'value="' + (val === null || val === undefined ? "" : val) + '" placeholder="0">' + errBox(id) + "</div>";
    }
    function selectField(name, label, hint, options, selected, placeholder) {
      var id = P + name;
      var opts = (placeholder ? '<option value="">' + esc(placeholder) + "</option>" : "") +
        options.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (o[0] === selected ? " selected" : "") + ">" + esc(o[1]) + "</option>";
        }).join("");
      return '<div class="field"><label for="' + id + '">' + label + (hint ? ' <span class="hint">' + hint + "</span>" : "") + "</label>" +
        '<select class="select" id="' + id + '" aria-describedby="error-' + id + '">' + opts + "</select>" + errBox(id) + "</div>";
    }
    function stateField(hint) {
      var opts = STATES.map(function (st) { return [st[0], st[0]]; });
      return selectField("state", "Your state", hint, opts, s.stateName, null);
    }

    function fieldError(id, msg) {
      var boxEl = document.getElementById("error-" + id);
      if (boxEl) boxEl.textContent = msg || "";
      var el = document.getElementById(id);
      if (el) el.setAttribute("aria-invalid", msg ? "true" : "false");
    }

    /* Money: validate on every keystroke, group with commas only on blur so the
       decimal point survives while the user is still typing. */
    function bindMoney(name, key) {
      var id = P + name, el = q(name);
      if (!el) return;
      el.addEventListener("input", function () {
        var raw = el.value.trim();
        if (raw === "") { s[key] = null; fieldError(id, ""); return; }
        var v = parseNum(raw);
        if (isNaN(v)) { s[key] = null; fieldError(id, "Enter a number, for example 1,250.75"); return; }
        if (v < 0) { s[key] = null; fieldError(id, "This cannot be a negative amount."); return; }
        if (v > MAX_MONEY) { s[key] = null; fieldError(id, "That is above $50,000,000 — please check the figure."); return; }
        s[key] = v; fieldError(id, "");
      });
      el.addEventListener("blur", function () {
        var v = parseNum(el.value);
        if (!isNaN(v) && v >= 0 && v <= MAX_MONEY) el.value = v.toLocaleString("en-US", { maximumFractionDigits: 2 });
      });
    }
    function bindInt(name, key, max, label) {
      var id = P + name, el = q(name);
      if (!el) return;
      el.addEventListener("input", function () {
        var raw = el.value.trim();
        if (raw === "") { s[key] = null; fieldError(id, ""); return; }
        var v = parseNum(raw);
        if (isNaN(v)) { s[key] = null; fieldError(id, "Enter a whole number, for example 12"); return; }
        if (v < 0) { s[key] = null; fieldError(id, label + " cannot be negative."); return; }
        if (v % 1 !== 0) { s[key] = null; fieldError(id, label + " must be a whole number, with no decimals."); return; }
        if (v > max) { s[key] = null; fieldError(id, label + " cannot be more than " + max.toLocaleString("en-US") + "."); return; }
        s[key] = v; fieldError(id, "");
      });
    }
    function paint(el) {
      var mn = parseFloat(el.min), mx = parseFloat(el.max), v = parseFloat(el.value);
      var p = ((v - mn) / (mx - mn)) * 100;
      if (!isFinite(p)) p = 0;
      p = Math.max(0, Math.min(100, p));
      el.style.backgroundImage = "linear-gradient(90deg,var(--green-500) " + p + "%,var(--line) " + p + "%)";
    }

    /* ---- what is still missing before we may show a figure ---- */
    function filledTotal() {
      var keys = {
        injury: ["med", "futMed", "wages", "futWages", "property", "perDiemRate", "perDiemDays"],
        wc: ["aww", "wcFutMed"],
        dv: ["carValue", "miles", "damage"],
        wt: ["salary", "weeksOut", "frontPayWeeks", "interimEarnings", "benefits", "employerSize"]
      }[mode];
      var c = 0;
      keys.forEach(function (k) { if (s[k] !== null && s[k] !== undefined && s[k] !== "") c++; });
      return c;
    }
    function requiredMissing() {
      var miss = [];
      if (mode === "injury") {
        var anyEcon = ["med", "futMed", "wages", "futWages", "property"].some(function (k) { return n0(s[k]) > 0; });
        if (!anyEcon) miss.push("your medical bills, lost wages or another economic loss");
        if (s.method === "perdiem") {
          if (!(n0(s.perDiemRate) > 0)) miss.push("a daily rate");
          if (!(n0(s.perDiemDays) > 0)) miss.push("the number of recovery days");
        } else if (!(n0(s.med) > 0)) {
          miss.push("your medical bills to date (the multiplier method needs them)");
        }
      } else if (mode === "wc") {
        if (!(n0(s.aww) > 0)) miss.push("your average weekly wage");
      } else if (mode === "dv") {
        if (!(n0(s.carValue) > 0)) miss.push("your car's value before the accident");
        if (s.miles === "") miss.push("its mileage");
        if (s.damage === "") miss.push("how badly it was damaged");
      } else if (mode === "wt") {
        if (!(n0(s.salary) > 0)) miss.push("your annual compensation");
        if (s.weeksOut === null) miss.push("how many weeks you have been out of work");
        if (s.illegal === null) miss.push("whether there was a clear illegal reason");
        if (s.illegal === true && s.employerSize === "") miss.push("your employer's size (it sets the statutory ceiling)");
      }
      return miss;
    }

    /* ---- navigation ---- */
    function nav(nextLabel, nextOnly) {
      var next = '<button class="btn" type="submit" data-next>' + esc(nextLabel) + arrow() + "</button>";
      if (nextOnly) return next;
      return '<div class="btn-row"><button class="btn secondary" type="button" data-back>Back</button>' + next + "</div>";
    }
    function arrow() {
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    }
    function warnIcon() {
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
    }
    function form(inner) { return '<form id="' + P + 'form" novalidate>' + inner + "</form>"; }

    function countStepFields() {
      var ctrls = body.querySelectorAll("input:not([type=range]), select");
      var filled = 0, total = ctrls.length;
      Array.prototype.forEach.call(ctrls, function (c) { if (String(c.value).trim() !== "") filled++; });
      return { filled: filled, empty: total - filled };
    }

    function goNext() {
      if (s.step >= STEPS.length) return;
      var c = countStepFields();
      track("calc_step_complete", {
        step_index: s.step, step_name: STEPS[s.step - 1],
        fields_filled: c.filled, fields_empty: c.empty, ms_on_step: Date.now() - stepEnteredAt
      }, mode);
      s.step++; render(true);
    }
    function goBack() {
      if (s.step <= 1) return;
      if (s.step === STEPS.length) track("calc_adjust", { result_bucket: lastBucket }, mode);
      else track("calc_step_back", { from_step_index: s.step, to_step_index: s.step - 1 }, mode);
      s.step--; render(true);
    }
    function wire() {
      var f = body.querySelector("#" + P + "form");
      if (f) f.addEventListener("submit", function (e) { e.preventDefault(); goNext(); });
      var nx = body.querySelector("[data-next]"), bk = body.querySelector("[data-back]"), rs = body.querySelector("[data-restart]");
      if (nx && !f) nx.addEventListener("click", goNext);
      if (bk) bk.addEventListener("click", goBack);
      if (rs) rs.addEventListener("click", function () {
        track("calc_restart", { result_bucket: lastBucket, ms_since_complete: completedAt ? Date.now() - completedAt : 0 }, mode);
        s.step = 1; render(true);
      });
    }
    function wireState() {
      var el = q("state");
      if (!el) return;
      el.addEventListener("change", function (e) { s.stateName = e.target.value; s.rule = ruleFor(s.stateName); });
    }

    /* ---- result chrome ---- */
    function cell(k, v) { return '<div class="cell"><div class="k">' + k + '</div><div class="v">' + v + "</div></div>"; }
    /* Highlights the static "next steps" block once a figure is on screen.
       The block lives in the HTML (owner: seo-interlinking); we only flip the state. */
    function markNextStepsLive() {
      try {
        var ns = document.querySelector(".next-steps");
        if (ns) ns.classList.add("is-live");
      } catch (e) {}
    }
    function resultShell(headline, sub, cells, noteText, extra) {
      markNextStepsLive();
      return '<div class="result-wrap"><div class="result" role="status" aria-live="polite" tabindex="-1" id="' + P + 'result">' +
        headline + '<div class="sub">' + sub + '</div><div class="bd">' + cells + "</div>" +
        '<div class="state-note">' + warnIcon() + "<div>" + noteText + "</div></div></div>" +
        (extra || "") +
        '<p class="disclaim" style="text-align:left;margin:12px 2px 14px">Estimate only — not legal advice. It is arithmetic on the figures you entered, not a prediction of what an insurer will pay.</p>' +
        '<div class="btn-row"><button class="btn secondary" type="button" data-back>Adjust answers</button>' +
        '<button class="btn" type="button" data-restart>Start over</button></div></div>';
    }
    function bigFigure(label, text) {
      return '<div class="lab">' + label + '</div><div class="range">' + text + "</div>";
    }
    function bigRange(label, lo, hi) {
      return '<div class="lab">' + label + '</div><div class="range">' + fmt(lo) + '<span class="dash"> – </span>' + fmt(hi) + "</div>";
    }
    function needMore(missing) {
      body.innerHTML = '<div class="result-wrap"><div class="result" role="status" aria-live="polite" tabindex="-1" id="' + P + 'result">' +
        '<div class="lab">We need one more thing</div>' +
        '<div class="range" style="font-size:24px">No estimate yet</div>' +
        '<div class="sub">Enter ' + missing.map(esc).join(", and ") + '. We will not show you a number we cannot stand behind, ' +
        'and an empty form is not an estimate of $0.</div></div>' +
        '<div class="btn-row"><button class="btn" type="button" data-back>Go back and add it</button></div></div>';
      wire();
      focusResult();
      track("calc_blocked", { last_step_index: s.step, missing_count: missing.length }, mode);
    }
    function focusResult() {
      var el = body.querySelector("#" + P + "result");
      if (el && el.focus) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
    }

    var lastBucket = "0";
    function complete(params, low, high) {
      completed = true; completedAt = Date.now();
      lastBucket = bucket(high);
      var base = {
        incident_type: s.incident, result_low: Math.round(low), result_high: Math.round(high),
        result_bucket: lastBucket, is_zero_result: !(high > 0),
        fields_filled_total: filledTotal(), steps_total: STEPS.length,
        ms_to_result: startedAt ? Date.now() - startedAt : 0
      };
      for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) base[k] = params[k];
      track("calc_complete", base, mode);
    }

    /* =======================================================
       LAYER 4 — SHAREABLE STATE IN THE URL
       The canonical of every page stays parameter-free; these
       parameters only make one result linkable.
       ======================================================= */
    var URL_KEYS = {
      injury: ["stateName", "incident", "injury", "med", "futMed", "wages", "futWages", "property", "method", "multiplier", "perDiemRate", "perDiemDays", "fault"],
      wc: ["aww", "impair", "wcFutMed"],
      dv: ["carValue", "miles", "damage"],
      wt: ["salary", "weeksOut", "frontPayWeeks", "interimEarnings", "benefits", "employerSize", "illegal"]
    }[mode];

    function writeUrl() {
      try {
        if (!window.history || !window.history.replaceState || !window.URLSearchParams) return;
        var p = new URLSearchParams();
        p.set("m", mode);
        URL_KEYS.forEach(function (k) {
          var v = s[k];
          if (v === null || v === undefined || v === "") return;
          p.set(k, String(v));
        });
        window.history.replaceState(null, "", location.pathname + "?" + p.toString());
      } catch (e) { /* never break the tool for a URL */ }
    }
    function readUrl() {
      try {
        if (!window.URLSearchParams) return false;
        var p = new URLSearchParams(location.search);
        if (p.get("m") !== mode) return false;
        var any = false;
        URL_KEYS.forEach(function (k) {
          if (!p.has(k)) return;
          var raw = p.get(k);
          if (k === "illegal") { s[k] = raw === "true"; any = true; return; }
          if (k === "stateName" || k === "incident" || k === "injury" || k === "method" ||
              k === "miles" || k === "damage" || k === "employerSize") { s[k] = raw; any = true; return; }
          var v = parseNum(raw);
          if (!isNaN(v) && v >= 0 && v <= MAX_MONEY) { s[k] = v; any = true; }
        });
        if (any) { s.rule = ruleFor(s.stateName); }
        return any;
      } catch (e) { return false; }
    }

    /* =======================================================
       MODE: INJURY
       ======================================================= */
    function methodBody() {
      var mb = q("method-body");
      if (!mb) return;
      if (s.method === "multiplier") {
        var id = P + "mult";
        mb.innerHTML = '<div class="field"><label for="' + id + '">Severity multiplier ' +
          '<span class="hint">— a negotiating convention, not a published figure</span></label>' +
          '<div class="slider-row"><input type="range" min="' + MULT_MIN + '" max="' + MULT_MAX + '" step="0.1" value="' + s.multiplier +
          '" class="slider" id="' + id + '" aria-valuetext="' + s.multiplier.toFixed(1) + ' times your medical bills"><span class="slider-val" id="' + P + 'multv">' + s.multiplier.toFixed(1) + "</span></div>" +
          '<div class="guide"><span>Minor</span><span>Moderate</span><span>Severe</span></div>' +
          '<p class="disclaim" style="text-align:left;margin:8px 0 0">Applied to your <b>medical bills to date</b>. No published table sets this number; ' +
          'it is the band (1.5–5) argued in negotiation, and your injury type only moves the starting point inside it.</p></div>';
        var ms = mb.querySelector("#" + id), mv = mb.querySelector("#" + P + "multv");
        ms.addEventListener("input", function () {
          var v = parseNum(ms.value);
          s.multiplier = isNaN(v) ? MULT_MIN : v;
          mv.textContent = s.multiplier.toFixed(1);
          ms.setAttribute("aria-valuetext", s.multiplier.toFixed(1) + " times your medical bills");
          paint(ms);
        });
        paint(ms);
      } else {
        mb.innerHTML = '<div class="cols2">' +
          money("pdr", "Daily rate", "— usually a day's wage: annual pay ÷ 260 working days", s.perDiemRate) +
          plain("pdd", "Recovery days", "— whole days, until you recovered", s.perDiemDays) + "</div>" +
          '<p class="disclaim" style="text-align:left;margin:0 0 10px">Per diem justifies <b>temporary</b> pain up to recovery, not permanent impairment, and several states forbid the argument in front of a jury. Ask a lawyer in your state before relying on it.</p>';
        bindMoney("pdr", "perDiemRate");
        bindInt("pdd", "perDiemDays", 3650, "Recovery days");
      }
    }

    function injuryRender() {
      if (s.step === 1) {
        var caseF = selectable
          ? selectField("case", "Type of case", null, CASE_TYPES.map(function (c) { return [c, c]; }), s.incident, null)
          : '<div class="field"><label for="' + P + 'preset">Type of incident</label><span class="preset" id="' + P + 'preset">' + esc(s.incident) + "</span></div>";
        body.innerHTML = form('<div class="cols2">' + caseF + stateField("— sets the negligence rule") + "</div>" +
          '<p class="disclaim" style="text-align:left;margin:2px 0 16px">Your state decides how shared fault changes your payout. We apply its rule and show you the statute.</p>' +
          nav("Continue to damages", true));
        wire(); wireState();
        var cs = q("case");
        if (cs) cs.addEventListener("change", function (e) { s.incident = e.target.value; });
      } else if (s.step === 2) {
        body.innerHTML = form('<div class="cols2">' + money("med", "Medical bills", "— to date", s.med) + money("futmed", "Future medical", "— estimated", s.futMed) + "</div>" +
          '<div class="cols2">' + money("wages", "Lost wages", null, s.wages) + money("futwages", "Future lost income", null, s.futWages) + "</div>" +
          money("prop", "Property / vehicle damage", null, s.property) +
          '<p class="disclaim" style="text-align:left;margin:2px 0 14px">These are your <b>economic damages</b> — the hard costs. Leave blank what does not apply.</p>' +
          nav("Continue to severity"));
        wire();
        bindMoney("med", "med"); bindMoney("futmed", "futMed"); bindMoney("wages", "wages");
        bindMoney("futwages", "futWages"); bindMoney("prop", "property");
      } else if (s.step === 3) {
        var isM = s.method === "multiplier";
        body.innerHTML = form('<div class="field"><label for="' + P + 'method">Pain &amp; suffering method</label>' +
            '<div class="seg-toggle" id="' + P + 'method" role="group" aria-label="Pain and suffering method">' +
            '<button type="button" data-m="multiplier" aria-pressed="' + isM + '" class="' + (isM ? "on" : "") + '">Multiplier</button>' +
            '<button type="button" data-m="perdiem" aria-pressed="' + !isM + '" class="' + (!isM ? "on" : "") + '">Per diem</button></div></div>' +
          '<div id="' + P + 'method-body"></div>' +
          selectField("injury", "Primary injury", "— sets where the multiplier starts", INJURIES.map(function (i) { return [i, i]; }), s.injury, null) +
          '<div class="field"><label for="' + P + 'fault">Your share of fault <span class="hint">— % you may be responsible</span></label>' +
          '<div class="slider-row"><input type="range" min="0" max="100" step="5" value="' + s.fault + '" class="slider" id="' + P + 'fault" ' +
          'aria-valuetext="' + s.fault + ' percent"><span class="slider-val" id="' + P + 'faultv">' + s.fault + "%</span></div></div>" +
          nav("See my estimate"));
        methodBody(); wire();
        Array.prototype.forEach.call(body.querySelectorAll("#" + P + "method button"), function (b) {
          b.addEventListener("click", function () {
            s.method = b.getAttribute("data-m");
            Array.prototype.forEach.call(body.querySelectorAll("#" + P + "method button"), function (x) {
              x.classList.remove("on"); x.setAttribute("aria-pressed", "false");
            });
            b.classList.add("on"); b.setAttribute("aria-pressed", "true");
            methodBody();
          });
        });
        var inj = q("injury");
        if (inj) inj.addEventListener("change", function (e) {
          s.injury = e.target.value;
          var d = INJURY_DEFAULT_MULT[s.injury];
          if (d) { s.multiplier = d; if (s.method === "multiplier") methodBody(); }
        });
        var fs = q("fault"), fv = q("faultv");
        fs.addEventListener("input", function () {
          var v = parseNum(fs.value);
          s.fault = isNaN(v) ? 0 : v;
          fv.textContent = s.fault + "%";
          fs.setAttribute("aria-valuetext", s.fault + " percent");
          paint(fs);
        });
        paint(fs);
      } else {
        var missing = requiredMissing();
        if (missing.length) { needMore(missing); return; }

        var r = injuryCompute(s);
        var ml = s.method === "multiplier"
          ? "Multiplier " + s.multiplier.toFixed(1) + "x on medical bills"
          : "Per diem " + fmt(s.perDiemRate) + "/day × " + s.perDiemDays + " days";

        var headline, cells, note, extra = "";
        /* The D.C. pedestrian/cyclist carve-out is only actionable where the
           user can actually pick the case type, so only offer that instruction
           on a mount that shows the case selector. */
        var stateNoteText = STATE_NOTE[s.stateName] || "";
        if (stateNoteText && s.stateName === "District of Columbia" && selectable) {
          stateNoteText += " Pick “Pedestrian accident” as the case type and we apply that exception.";
        }
        var stateNote = stateNoteText ? '<div class="state-note">' + warnIcon() + "<div>" + stateNoteText + "</div></div>" : "";
        var caseNote = CASE_NOTE[s.incident] ? '<p class="disclaim" style="text-align:left;margin:10px 2px 0"><b>' + esc(s.incident) + ":</b> " + CASE_NOTE[s.incident] + "</p>" : "";

        if (r.unquantified) {
          headline = bigFigure("South Dakota — slight/gross rule", '<span style="font-size:26px">No figure — see below</span>');
          cells = cell("Claim before fault", fmt(r.gross)) + cell("Your stated fault", r.fault + "%");
          note = "<b>South Dakota (SDCL § 20-9-2)</b> is the only state using the slight/gross rule: you recover only if your own negligence was <b>slight</b> compared with the other party's, and the statute sets no percentage. " +
            "Any cut-off we picked would be invented, so at " + r.fault + "% fault we will not give you a number. Your claim before any reduction is " + fmt(r.gross) + ". Ask a South Dakota lawyer how a jury is likely to view your share.";
          complete({ state: s.stateName, state_rule: r.appliedRule, method: s.method, fault_pct: r.fault, is_barred: false, is_unquantified: true }, 0, 0);
        } else if (r.barred) {
          headline = bigFigure("Estimated settlement", '$0 <span style="font-size:16px;color:var(--muted);font-weight:600">(likely barred)</span>');
          cells = cell("Claim before fault", fmt(r.gross)) + cell("Your stated fault", r.fault + "%");
          note = "<b>" + esc(s.stateName) + "</b> — " + esc(r.cite) + ": " + RULE_TEXT[r.appliedRule] +
            " At " + r.fault + "% fault you are at or over the threshold, so recovery may be barred entirely. Fault percentages are argued, not fixed — a lawyer may see your share differently.";
          complete({ state: s.stateName, state_rule: r.appliedRule, method: s.method, fault_pct: r.fault, is_barred: true }, 0, 0);
        } else {
          headline = bigFigure("Estimated settlement value", fmt(r.total));
          cells = cell("Economic damages", fmt(r.adjEcon)) +
            cell("Pain &amp; suffering", fmt(r.adjNon)) +
            cell("Total", fmt(r.total));
          note = "<b>" + esc(s.stateName) + "</b> — " + esc(r.cite) + ": " + RULE_TEXT[r.appliedRule] +
            (r.exception ? " " + r.exception : "") +
            (r.fault > 0 ? " Your " + r.fault + "% share reduced " + (r.fNon === 0 ? "the non-economic part to $0 and the economic part" : "the figure") + " by " + r.fault + "%." : "");
          if (r.nonEAlt !== null) {
            extra += '<p class="disclaim" style="text-align:left;margin:10px 2px 0">We applied the multiplier to your <b>medical bills to date only</b>. ' +
              "Including your future medical in the multiplier base is also argued; that would put pain and suffering at " + fmt(r.nonEAlt * r.fNon) + " instead of " + fmt(r.adjNon) + ".</p>";
          }
          if (s.method === "perdiem") {
            extra += '<p class="disclaim" style="text-align:left;margin:10px 2px 0"><b>About the per-diem figure:</b> it justifies <b>temporary</b> pain up to your recovery, not permanent impairment, ' +
              "and several states forbid the argument in front of a jury. Check your state before you put this number in a demand letter.</p>";
          }
          extra += caseNote;
          complete({ state: s.stateName, state_rule: r.appliedRule, method: s.method, fault_pct: r.fault, is_barred: false }, r.total, r.total);
        }

        body.innerHTML = resultShell(headline, esc(s.incident) + " · " + esc(s.stateName) + " · " + esc(ml), cells, note, stateNote + extra);
        wire(); writeUrl(); focusResult();
      }
    }

    /* =======================================================
       MODE: WORKERS' COMP
       The state selector has been REMOVED: we hold no verified
       per-state maximum weekly rate or week schedule, so a state
       field here would be decorative and the old $1,200 national
       cap was invented. See the honesty policy at the top.
       ======================================================= */
    function wcRender() {
      if (s.step === 1) {
        body.innerHTML = form(money("aww", "Average weekly wage", "— gross, before the injury", s.aww) +
          '<p class="disclaim" style="text-align:left;margin:2px 0 16px">Workers\' comp is <b>no-fault</b> and pays no pain &amp; suffering. Your benefit rate is about two-thirds of your average weekly wage. ' +
          '<b>Every state also caps that weekly rate</b>, and the cap is republished each year by your state agency — we do not hold a verified current figure for your state, so we do not apply one. Check yours before relying on the number.</p>' +
          nav("Continue", true));
        wire(); bindMoney("aww", "aww");
      } else if (s.step === 2) {
        body.innerHTML = form('<div class="field"><label for="' + P + 'impair">Permanent impairment rating <span class="hint">— % at maximum medical improvement</span></label>' +
            '<div class="slider-row"><input type="range" min="0" max="100" step="1" value="' + s.impair + '" class="slider" id="' + P + 'impair" ' +
            'aria-valuetext="' + s.impair + ' percent impairment"><span class="slider-val" id="' + P + 'impairv">' + s.impair + "%</span></div>" +
            '<div class="guide"><span>None</span><span>Moderate</span><span>Total</span></div></div>' +
          money("wcmed", "Estimated future medical", "— ongoing care", s.wcFutMed) +
          '<p class="disclaim" style="text-align:left;margin:2px 0 14px">Your impairment rating, set by your doctor, scales the permanent-disability part of a settlement — but the number of weeks it buys is set by <b>your state\'s schedule</b>, and schedules differ widely.</p>' +
          nav("See my estimate"));
        wire(); bindMoney("wcmed", "wcFutMed");
        var is = q("impair"), iv = q("impairv");
        is.addEventListener("input", function () {
          var v = parseNum(is.value);
          s.impair = isNaN(v) ? 0 : v;
          iv.textContent = s.impair + "%";
          is.setAttribute("aria-valuetext", s.impair + " percent impairment");
          paint(is);
        });
        paint(is);
      } else {
        var missing = requiredMissing();
        if (missing.length) { needMore(missing); return; }

        var r = wcCompute(s);
        var headline = bigFigure("Your weekly benefit rate", fmt(r.rate) + '<span style="font-size:16px;color:var(--muted);font-weight:600"> / week</span>');
        var cells = cell("Two-thirds of your wage", fmt(r.rate)) +
          cell("Impairment rating", s.impair + "%") +
          cell("Future medical entered", fmt(r.futMed));
        var note = "This is the one figure here we can stand behind: about <b>two-thirds of your average weekly wage</b> is the statutory temporary-disability rate in nearly every state. " +
          "<b>We do not apply your state's maximum weekly rate</b>, because we do not hold a verified current figure for it — if you earn well, your real rate is lower than this. " +
          "Your state agency publishes the maximum every benefit year; ask for it.";
        var extra = "";
        if (s.impair > 0) {
          extra = '<p class="disclaim" style="text-align:left;margin:12px 2px 0"><b>Permanent partial disability — illustration only, not an estimate.</b> ' +
            "A lump sum is normally impairment rating × the number of weeks your state's schedule allows × your weekly rate. " +
            "The schedules we can document run from about 300 weeks (Texas, which pays 3 weeks per point of impairment rating) to 520 (Kentucky); California does not use weeks at all but a rating schedule adjusted for age and occupation. " +
            "On that 300–520 week band, " + s.impair + "% impairment would be <b>" + Math.round(r.weeksLow) + "–" + Math.round(r.weeksHigh) + " weeks</b>, i.e. <b>" +
            fmt(r.ppdLow) + " – " + fmt(r.ppdHigh) + "</b> before any cap on your weekly rate and before the discount to present value that a lump-sum settlement usually applies. " +
            "We have not verified the schedule for your state, so we are not presenting that as your figure.</p>";
        }
        body.innerHTML = resultShell(headline, "Workers' comp · " + s.impair + "% impairment", cells, note, extra);
        wire(); writeUrl(); focusResult();
        complete({ weekly_rate: Math.round(r.rate), impairment_pct: s.impair, is_barred: false }, r.rate, r.rate);
      }
    }

    /* =======================================================
       MODE: DIMINISHED VALUE (17c)
       ======================================================= */
    function dvRender() {
      if (s.step === 1) {
        body.innerHTML = form(money("cv", "Car's value before the accident", "— KBB / NADA", s.carValue) +
          selectField("miles", "Mileage", null, DV_MILEAGE.map(function (m) { return [m[0], m[1]]; }), s.miles, "Select mileage…") +
          selectField("dmg", "Damage severity", "— the 17c steps, not a sliding scale", DV_DAMAGE.map(function (d) { return [d[0], d[1]]; }), s.damage, "Select damage…") +
          '<p class="disclaim" style="text-align:left;margin:2px 0 14px">The <b>17c formula</b>, from the consent order in <i>Mabry v. State Farm</i> (Ga. 2001): 10% of your car\'s pre-loss value, times a damage step, times a mileage step. It is the <b>insurer\'s</b> formula and it has exactly five damage steps — not a slider.</p>' +
          nav("See my estimate", true));
        wire(); bindMoney("cv", "carValue");
        var mi = q("miles"); if (mi) mi.addEventListener("change", function (e) { s.miles = e.target.value; });
        var dm = q("dmg"); if (dm) dm.addEventListener("change", function (e) { s.damage = e.target.value; });
      } else {
        var missing = requiredMissing();
        if (missing.length) { needMore(missing); return; }

        var r = dvCompute(s);
        var headline, note, extra = "";
        var cells = cell("17c base (10%)", fmt(r.base)) +
          cell("Damage step", "×" + r.damageMult.toFixed(2)) +
          cell("Mileage step", "×" + r.mileMult.toFixed(2));

        if (r.zeroByMileage) {
          headline = bigFigure("17c result", '$0 <span style="font-size:16px;color:var(--muted);font-weight:600">under the insurer\'s formula</span>');
          note = "The 17c formula zeroes out at 100,000 miles. <b>That is the insurer's formula, not the law and not a valuation of your car.</b> " +
            "No court has held that a vehicle over 100,000 miles loses no value after a structural repair — a repaired accident history still shows on the vehicle report and still costs you at resale.";
          extra = '<p class="disclaim" style="text-align:left;margin:12px 2px 0"><b>What to do instead:</b> get an independent diminished-value appraisal (typically $200–$400, and the appraiser states the figure and the method), ' +
            "and present that appraisal to the at-fault driver's insurer rather than accepting a 17c output of $0. In a first-party claim, check your own policy: many exclude diminished value entirely.</p>";
        } else {
          headline = bigFigure("Estimated diminished value", fmt(r.dv));
          note = "A third-party claim against the <b>at-fault driver's</b> insurer. Insurers use 17c but are not bound by it: it comes from a Georgia consent order (<i>Mabry v. State Farm</i>, 2001), not from a statute. An independent appraisal routinely supports a higher figure.";
        }
        body.innerHTML = resultShell(headline, "Diminished value · 17c formula", cells, note, extra);
        wire(); writeUrl(); focusResult();
        complete({ mileage_band: s.miles, damage_step: s.damage, is_barred: false }, r.dv, r.dv);
      }
    }

    /* =======================================================
       MODE: WRONGFUL TERMINATION
       ======================================================= */
    function wtRender() {
      if (s.step === 1) {
        body.innerHTML = form('<div class="cols2">' + money("sal", "Annual compensation", "— salary + bonus", s.salary) +
            plain("wks", "Weeks out of work", "— since the firing", s.weeksOut) + "</div>" +
          '<div class="cols2">' + plain("fpw", "Weeks of front pay claimed", "— leave blank if none", s.frontPayWeeks) +
            money("interim", "Earnings from new work", "— since the firing", s.interimEarnings) + "</div>" +
          '<p class="disclaim" style="text-align:left;margin:2px 0 16px">The core of the claim is <b>lost pay</b>: weekly pay × weeks unemployed (back pay), plus front pay if you are still out. ' +
          "You are expected to <b>mitigate</b> by looking for work, and what you earned in the meantime is subtracted — that is what the last box is for.</p>" +
          nav("Continue", true));
        wire();
        bindMoney("sal", "salary"); bindInt("wks", "weeksOut", 520, "Weeks out of work");
        bindInt("fpw", "frontPayWeeks", 520, "Weeks of front pay"); bindMoney("interim", "interimEarnings");
      } else if (s.step === 2) {
        var yes = s.illegal === true, no = s.illegal === false;
        body.innerHTML = form(money("ben", "Lost benefits value", "— health, bonus, equity", s.benefits) +
          '<div class="field"><label for="' + P + 'illegal">Clear illegal reason? <span class="hint">— discrimination, retaliation, breach</span></label>' +
            '<div class="seg-toggle" id="' + P + 'illegal" role="group" aria-label="Was there a clear illegal reason">' +
            '<button type="button" data-v="1" aria-pressed="' + yes + '" class="' + (yes ? "on" : "") + '">Yes</button>' +
            '<button type="button" data-v="0" aria-pressed="' + no + '" class="' + (no ? "on" : "") + '">No / unsure</button></div></div>' +
          selectField("empsize", "How many people does the employer have?", "— it sets the statutory ceiling",
            EMPLOYER_SIZES.map(function (e) { return [e[0], e[1]]; }), s.employerSize, "Select size…") +
          '<p class="disclaim" style="text-align:left;margin:2px 0 14px">In a federal discrimination claim, <b>compensatory and punitive damages together are capped by employer size</b> — $50,000 to $300,000 (42 U.S.C. § 1981a(b)(3)). Lost pay is <b>outside</b> that cap (§ 1981a(b)(2)). We show the ceiling; we do not pretend to know where in it your case lands.</p>' +
          nav("See my estimate"));
        wire(); bindMoney("ben", "benefits");
        Array.prototype.forEach.call(body.querySelectorAll("#" + P + "illegal button"), function (b) {
          b.addEventListener("click", function () {
            s.illegal = b.getAttribute("data-v") === "1";
            Array.prototype.forEach.call(body.querySelectorAll("#" + P + "illegal button"), function (x) {
              x.classList.remove("on"); x.setAttribute("aria-pressed", "false");
            });
            b.classList.add("on"); b.setAttribute("aria-pressed", "true");
          });
        });
        var es = q("empsize");
        if (es) es.addEventListener("change", function (e) { s.employerSize = e.target.value; });
      } else {
        var missing = requiredMissing();
        if (missing.length) { needMore(missing); return; }

        var r = wtCompute(s);
        var headline, note, extra = "";
        var cells = cell("Back pay (after mitigation)", fmt(r.mitigated)) +
          cell("Front pay claimed", fmt(r.front)) +
          cell("Benefits", fmt(r.benefits));

        if (s.illegal === true && r.cap === null) {
          headline = bigFigure("Your lost pay", fmt(r.wageLoss));
          note = "With <b>fewer than 15 employees</b>, Title VII and the ADA generally do not apply to your employer, so the federal caps in 42 U.S.C. § 1981a do not either. " +
            "Your state's own discrimination statute may still cover you, and several have no cap at all. This figure is your lost pay only.";
          complete({ is_barred: false, cap_applies: false }, r.wageLoss, r.wageLoss);
        } else if (s.illegal === true) {
          headline = bigRange("Lost pay, plus the statutory ceiling", r.low, r.high);
          note = "The lower figure is your <b>lost pay</b>, which is arithmetic on what you entered. The upper figure adds <b>" + fmt(r.cap) + "</b>, the ceiling that 42 U.S.C. § 1981a(b)(3) puts on compensatory <i>and</i> punitive damages combined for an employer of your size. " +
            "That is a ceiling, not an estimate: most cases settle well below it, and the ceiling only applies if the illegal reason is actually proved.";
          extra = '<p class="disclaim" style="text-align:left;margin:12px 2px 0">We do not put a number on emotional distress or on punitive damages. There is no published table for either, ' +
            "and the previous version of this calculator used invented figures. What we can tell you is the legal ceiling, above, and that lost pay sits outside it.</p>";
          complete({ is_barred: false, cap_applies: true, statutory_cap: r.cap }, r.low, r.high);
        } else {
          headline = bigFigure("Your lost pay", fmt(r.wageLoss));
          note = "Without a clear illegal reason — discrimination, retaliation, a breach of contract — most U.S. employment is <b>at will</b> and there may be no claim at all, whatever the lost pay comes to. " +
            "This figure is what you lost, not what you can recover.";
          complete({ is_barred: false, cap_applies: false }, r.wageLoss, r.wageLoss);
        }
        body.innerHTML = resultShell(headline, "Wrongful termination · " + fmt(r.weekly) + "/week", cells, note, extra);
        wire(); writeUrl(); focusResult();
      }
    }

    /* ---- render ---- */
    function render(userDriven) {
      chrome();
      stepEnteredAt = Date.now();
      if (s.step < STEPS.length) {
        track("calc_step_view", { step_index: s.step, step_name: STEPS[s.step - 1], steps_total: STEPS.length }, mode);
      }
      if (mode === "wc") wcRender();
      else if (mode === "dv") dvRender();
      else if (mode === "wt") wtRender();
      else injuryRender();
      if (userDriven && s.step < STEPS.length) {
        var first = body.querySelector("input, select, button");
        if (first && first.focus) { try { first.focus({ preventScroll: true }); } catch (e) { } }
      }
    }

    /* ---- boot this instance: a shared link reproduces its result ---- */
    if (readUrl()) { s.step = STEPS.length; render(false); }
    else render(false);

    return { state: s, render: render, compute: function () {
      return mode === "wc" ? wcCompute(s) : mode === "dv" ? dvCompute(s) : mode === "wt" ? wtCompute(s) : injuryCompute(s);
    } };
  }

  /* ---- boot: E1 tool_view when the widget is half visible for a second ---- */
  function observe(node) {
    if (!window.IntersectionObserver) return;
    var fired = false;
    var timer = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (fired) return;
        if (en.isIntersecting) {
          timer = setTimeout(function () {
            if (fired) return;
            fired = true;
            var rect = node.getBoundingClientRect();
            track("tool_view", {
              incident_type: node.getAttribute("data-incident") || "",
              viewport_w: window.innerWidth,
              is_above_fold: rect.top < window.innerHeight
            }, modeFor(node, node.getAttribute("data-incident")));
            io.disconnect();
          }, 1000);
        } else if (timer) { clearTimeout(timer); timer = null; }
      });
    }, { threshold: 0.5 });
    io.observe(node);
  }

  function boot() {
    var nodes = document.querySelectorAll("#calculator-app,[data-calculator]");
    Array.prototype.forEach.call(nodes, function (node) { observe(node); init(node); });
  }
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);

  /* Pure cores exposed so the arithmetic can be tested without a browser. */
  window.SettleWorthEngine = {
    STATES: STATES, RULE_TEXT: RULE_TEXT, STATE_NOTE: STATE_NOTE,
    ruleFor: ruleFor, citeFor: citeFor, parseNum: parseNum, bucket: bucket,
    injuryCompute: injuryCompute, wcCompute: wcCompute, dvCompute: dvCompute, wtCompute: wtCompute,
    capFor: capFor, dvMileMult: dvMileMult, dvDamageMult: dvDamageMult
  };
})();
