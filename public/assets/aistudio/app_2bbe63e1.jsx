import React, { useMemo, useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

/* =========================================================
   CSS INJECTION
   ========================================================= */
const GLOBAL_CSS = `
:root{
  --stripe-runner: #FFF6A2;
  --stripe-sm: #C5F7C8;
  --stripe-po: #CBE5FF;
  --stripe-pi: #BFF7F2;
  --stripe-pg: #B6EFE6;
  --stripe-games:#DCCCFF;
  --stripe-beer:#FFD6E7;
  --stripe-bucket:#FFE1C6;
  --stripe-floater:#EEEEEE;
  --pink: #ff4fa3;
  --border: #bbbbbb;
  --bg: #fafafa;
  --ink: #222;
  --conf-red: #ff5151;
  --conf-orange: #ff9b3c;
  --conf-purple: #b78cff;
  --conf-blue: #6fb8ff;
  --conf-deepred: #990000;
}
*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;background:var(--bg);font-family:"Roboto Condensed", "Arial Narrow", "Liberation Sans Narrow", sans-serif;color:var(--ink); letter-spacing:.2px;font-size:15px}

.app-wrap{max-width:1140px;margin:18px auto;padding:0 12px; padding-bottom: 100px;}
h1{font-size:24px;margin:0 0 12px;line-height:1.2}
h2{font-size:18px;margin:14px 0;line-height:1.2}

/* Controls */
.controls{background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px}
.controls .row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.tablike{display:inline-flex;gap:8px;align-items:center;padding:8px 10px;border-radius:999px;border:1px solid var(--border);background:#fff;font-size:14px}
.staff-input{flex:0 0 150px;display:flex;flex-direction:column;gap:6px}
.staff-input textarea{width:150px;max-width:180px;min-height:200px;border:1px solid var(--border);border-radius:6px;padding:8px;font-family:"Roboto Condensed", monospace;font-size:14px}

/* Buttons & tabs */
.btn{appearance:none;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;background:var(--pink);color:#fff;font-weight:700;border:1px solid #e64d95}
.btn:hover{background:#e64d95}
.btn.secondary{background:#fff;color:#111;border:1px solid var(--border);font-weight:600}
.btn.inline{padding:4px 8px;border-radius:6px;font-size:12px}
.btn.small{padding:6px 8px;border-radius:6px;font-size:12px}
.btn.ghost{background:transparent;border:1px dashed var(--border);color:#444}
.actions{display:flex;flex-direction:column;gap:8px}

/* Tabs styling */
.tabs{display:flex;gap:8px;margin:8px 0 14px;align-items:center}
.tab{padding:8px 12px;border-radius:8px;background:#fff;border:1px solid var(--border);cursor:pointer;font-weight:700}
.tab.active{background:var(--pink);color:#fff;border-color:#e64d95;box-shadow:0 2px 6px rgba(0,0,0,0.07)}
.tabbar-wrap{display:flex;align-items:center;gap:12px;padding:0 4px}

/* Undo/Redo */
.undo-redo{margin-left:auto;display:flex;gap:6px;align-items:center}

/* Schedule table styles */
.schedule-stack{display:grid;gap:12px}
.day-block{background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
.day-title{padding:8px 10px;font-weight:700;border-bottom:1px solid var(--border);background:#fff}

.schedule-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px}
.schedule-table th, .schedule-table td{border:1px solid var(--border);padding:4px;text-align:center;vertical-align:middle;line-height:1.1}
.stripe-col{width:8px}
.task-col{width:150px;text-align:left;padding-left:8px;font-size:14px}
.hour-col{width:calc((100% - 160px) / 11);}

/* stripe column visual */
.stripe{width:8px}
.task-name{font-weight:700;text-align:left;padding-left:8px;font-size:14px}

/* staff name in cell */
.cell-wrap{position:relative;display:flex;flex-direction:column;gap:2px;align-items:center;min-height:22px;padding:6px}
.staff-name{cursor:pointer;padding:2px 4px;border-radius:4px;font-size:12px;line-height:1.1}
.staff-name:hover{color:var(--pink);font-weight:700;background:rgba(255,255,255,0.6)}
.staff-name.selected{outline:2px solid rgba(0,0,0,0.06);}

/* small popover menu */
.person-menu{position:fixed;z-index:10001;background:#fff;border:1px solid var(--border);padding:4px;border-radius:6px;display:flex;flex-direction:column;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,0.08); width: 70px;}
.person-menu button{padding:4px 6px;font-size:11px}

/* conflict outlines */
.conflict-outline{position:relative}
.conflict-outline::after{content:"";position:absolute;inset:2px;pointer-events:none;border-radius:4px;box-sizing:border-box;}
.outline-red::after{ border:3px solid var(--conf-red); }
.outline-orange::after{ border:3px solid var(--conf-orange); }
.outline-purple::after{ border:3px solid var(--conf-purple); }
.outline-blue::after{ border:3px solid var(--conf-blue); }
.outline-deepred::after{ border:3px solid var(--conf-deepred); }

/* Individual schedules */
.people-wrap{display:flex;flex-wrap:wrap;gap:12px}
.person-card{background:#fff;border:2px solid #000;border-radius:6px;overflow:hidden;width:320px;min-width:320px;max-width:320px;box-sizing:border-box}
.person-head{padding:8px 10px;font-weight:700;border-bottom:1px solid var(--border);background:#fff}
.person-table{width:100%;border-collapse:collapse;font-size:12px}
.person-table th, .person-table td{border:1px solid var(--border);padding:6px;text-align:center}

/* Individual LIST tab compact */
.list-wrap{display:flex;flex-wrap:wrap;gap:8px}
.person-list{background:#fff;border:2px solid #000;border-radius:6px;overflow:hidden;padding:6px;width:215px;min-width:220px;box-shadow:0 2px 6px rgba(0,0,0,0.05);}
.person-list .head{padding:6px 8px;font-weight:700;border-bottom:1px solid var(--border)}
.person-list table{width:100%; border-collapse:collapse; font-size:13px;}
.person-list th, .person-list td{border:1px solid var(--border); padding:6px;}

/* Edit modal */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.22);display:flex;align-items:flex-start;justify-content:center;padding-top:48px;z-index:9999}
.modal{background:rgba(255,255,255,0.95);max-width:220px;width:92vw;border-radius:12px;border:1px solid var(--border);overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.12);position:absolute;cursor:default;}
.modal .modal-head{padding:8px 12px;font-weight:700;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;cursor:grab}
.modal .modal-body{padding:10px 12px;display:grid;gap:8px}
.hint{color:#666;padding:10px 0}

/* Summary tweaks */
.summary-median { border-top:4px solid #000; font-weight:700; }
.staff-day-totals-row td, .staff-day-totals-row th { border-top:2px solid black !important; font-weight:700; }
.compact-date { white-space:nowrap; font-weight:700; font-size:13px; text-align:center; }
.compact-date small { display:block; font-weight:600; font-size:12px; color:#444 }

/* Responsive */
@media (max-width:900px){ .person-list{width:100%} }

/* Print Styles */
@media print {
  .app-wrap, .controls, .tabbar-wrap, .undo-redo, .print-actions, .conflict-wrap { display:none !important; }
  body > *:not(#app-content-to-print) { display:none; }
  #app-content-to-print { display:block !important; width:100% !important; max-width:100% !important; margin:0 !important; padding:0 !important; }
  .day-block { break-inside:avoid; page-break-inside:avoid; }
  h1, h2 { page-break-after:avoid; }
}
`;

if (typeof document !== "undefined") {
  if (!document.getElementById("roboto-condensed-link")) {
    const link = document.createElement("link");
    link.id = "roboto-condensed-link";
    link.rel = "preconnect";
    link.href = "https://fonts.googleapis.com";
    document.head.appendChild(link);
    
    const link2 = document.createElement("link");
    link2.rel = "preconnect";
    link2.href = "https://fonts.gstatic.com";
    link2.crossOrigin = "anonymous";
    document.head.appendChild(link2);
    
    const link3 = document.createElement("link");
    link3.id = "roboto-condensed-font";
    link3.rel = "stylesheet";
    link3.href = "https://fonts.googleapis.com/css2?family=Roboto+Condensed:ital,wght@0,100..900;1,100..900&display=swap";
    document.head.appendChild(link3);
  }
  if (!document.getElementById("app-inline-styles")) {
    const style = document.createElement("style");
    style.id = "app-inline-styles";
    style.innerHTML = GLOBAL_CSS;
    document.head.appendChild(style);
  }
}

/* =========================================================
   FIREBASE CONFIG
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyCuriSOHjlUTwOuB8HwsIfF6l9euwNem8A",
  authDomain: "scheduler-wet.firebaseapp.com",
  projectId: "scheduler-wet",
  storageBucket: "scheduler-wet.firebasestorage.app",
  messagingSenderId: "498061470007",
  appId: "1:498061470007:web:a6e6d230dfef812b04d2b2",
  measurementId: "G-D5Q19FX3LC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

signInAnonymously(auth).catch((error) => console.error("Auth Error:", error));

/* =========================================================
   CORE SCHEDULING ALGORITHMS & LOGIC
   ========================================================= */

const HOURS = [
  "1p", "2p", "3p", "4p", "5p", "6p",
  "7p", "8p", "9p", "10p", "11p",
];
const HOUR_INDEX = Object.fromEntries(HOURS.map((h, i) => [h, i]));

function fmtDateISO(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDate();
  const mon = d.toLocaleString(undefined, { month: "short", timeZone: "UTC" });
  return `${day} ${mon}`;
}

function addDaysISO(iso, delta) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function labelToIndex(lbl) {
  if (lbl === "12a") return HOURS.length;
  const i = HOUR_INDEX[lbl];
  if (i === undefined) throw new Error("Unknown hour label: " + lbl);
  return i;
}

function spanCols(startLabel, endLabel) {
  const s = labelToIndex(startLabel);
  const e = labelToIndex(endLabel);
  return { startIdx: s, span: Math.max(0, e - s) };
}

function isAfter7(startIdx) {
  return startIdx >= HOUR_INDEX["7p"];
}

const TASK_COLORS = {
  Runner: { stripe: "#FFF6A2" },
  "Social Media": { stripe: "#C5F7C8" },
  "Promo Out": { stripe: "#CBE5FF" },
  "Promo In": { stripe: "#BFF7F2" },
  "Promo Gate": { stripe: "#B6EFE6" },
  Games: { stripe: "#DCCCFF" },
  "Beer Bar": { stripe: "#FFD6E7" },
  "Bucket Bar": { stripe: "#FFE1C6" },
  Floater: { stripe: "#EEEEEE" },
};
const cellBg = (task) => TASK_COLORS[task]?.stripe || "#EEE";

const LIMITS = {
  Runner: { min: 2, max: 2 },
  "Social Media": { min: 1, max: 3 },
  "Promo Out": { min: 2, max: 6 },
  "Promo In": { min: 1, max: 2 },
  "Promo Gate": { min: 2, max: 4 },
  Games: { min: 2, max: 3 },
  "Beer Bar": { min: 2, max: 3 },
  "Bucket Bar": { min: 1, max: 2 },
  Floater: { min: 0, max: 99 },
};

const PRIORITY = [
  "Promo Gate", "Promo Out", "Social Media", "Promo In",
  "Games", "Runner", "Beer Bar", "Bucket Bar",
];

const ORDERED_LABELS = [
  "FMP-3", "FMP-2", "FMP-1", "FMP", "FMP+1",
  "FMP+2", "FMP+3", "FMP2", "FMP2+1", "FMP2+2",
];

const PLAN = {
  "FMP-3": { Runner: [["2p", "5p"], ["5p", "8p"]], "Social Media": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Promo Out": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Promo In": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], Games: [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Beer Bar": [], "Bucket Bar": [] },
  "FMP-2": { Runner: [["1p", "4p"], ["4p", "7p"]], "Social Media": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], "Promo Out": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], "Promo In": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], Games: [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], "Beer Bar": [["7p", "10p"], ["10p", "12a"]], "Bucket Bar": [["7p", "10p"], ["10p", "12a"]] },
  "FMP-1": { Runner: [["1p", "4p"], ["4p", "7p"], ["7p", "10p"]], "Social Media": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], "Promo Out": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], "Promo In": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], Games: [["1p", "4p"], ["4p", "7p"], ["7p", "10p"]], "Beer Bar": [["7p", "10p"], ["10p", "12a"]], "Bucket Bar": [["7p", "10p"], ["10p", "12a"]] },
  FMP: { Runner: [["1p", "4p"], ["4p", "7p"], ["7p", "10p"]], "Social Media": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], "Promo Out": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], "Promo In": [["1p", "4p"], ["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], "Promo Gate": [["4p", "7p"], ["7p", "10p"], ["10p", "12a"]], Games: [["1p", "4p"], ["4p", "7p"], ["7p", "10p"]], "Beer Bar": [["7p", "10p"], ["10p", "12a"]], "Bucket Bar": [["7p", "10p"], ["10p", "12a"]] },
  "FMP+1": { Runner: [["2p", "5p"]], "Social Media": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Promo Out": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Promo In": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], Games: [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Beer Bar": [["8p", "11p"]], "Bucket Bar": [["8p", "11p"]] },
  "FMP+2": { Runner: [["2p", "5p"]], "Social Media": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Promo Out": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Promo In": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], Games: [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Beer Bar": [["8p", "11p"]], "Bucket Bar": [["8p", "11p"]] },
  "FMP+3": { Runner: [], "Social Media": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Promo Out": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Promo In": [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], Games: [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]], "Beer Bar": [], "Bucket Bar": [] },
};

function parseStaffName(staffName) {
  const colonIndex = staffName.indexOf(':');
  if (colonIndex === -1) {
    return { displayName: staffName, isSpecialist: false };
  }
  const displayName = staffName.substring(0, colonIndex).trim();
  const specialistInfo = staffName.substring(colonIndex + 1).trim();
  const percentMatch = specialistInfo.match(/(\d+)%?\s*$/);
  const percentage = percentMatch ? parseInt(percentMatch[1]) : 100;
  const taskPart = specialistInfo.replace(/\d+%?\s*$/, '').trim();
  return { displayName, isSpecialist: true, specialistTask: taskPart, percentage, originalName: staffName };
}

function getDisplayName(staffName) {
  return parseStaffName(staffName).displayName;
}

function fuzzyMatchTask(inputTask, availableTasks) {
  const input = inputTask.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const task of availableTasks) {
    const normalized = task.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized === input) return task;
  }
  for (const task of availableTasks) {
    const normalized = task.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.includes(input) || input.includes(normalized)) return task;
  }
  return null;
}

function buildShiftList(activeDays, staff = [], enabledTasks = {}) {
  const list = [];
  const specialists = {};
  for (const staffName of staff) {
    const parsed = parseStaffName(staffName);
    if (parsed.isSpecialist) {
      if (!specialists[parsed.specialistTask]) specialists[parsed.specialistTask] = [];
      specialists[parsed.specialistTask].push({ name: staffName, percentage: parsed.percentage });
    }
  }
  
  for (const day of activeDays) {
    let planDay = day;
    if (day === "FMP2") planDay = "FMP";
    else if (day === "FMP2+1") planDay = "FMP+1";
    else if (day === "FMP2+2") planDay = "FMP+2";
    
    const dayPlan = PLAN[planDay] || {};
    for (const [task, ranges] of Object.entries(dayPlan)) {
      const hasSpecialist = specialists[task] && specialists[task].length > 0;
      if (!enabledTasks[task] && !hasSpecialist) continue;
      if (task === "Promo Gate" && day !== "FMP" && day !== "FMP2") continue;
      
      for (const [start, end] of ranges) {
        const { startIdx, span } = spanCols(start, end);
        if (span <= 0) continue;
        const { min, max } = LIMITS[task] || { min: 0, max: 1 };
        list.push({ id: `${day}|${task}|${start}-${end}`, day, task, startIdx, span, min, max, assigned: [] });
      }
    }
    
    for (const [specialistTask, specialistList] of Object.entries(specialists)) {
      const allTasksInPlan = new Set();
      for (const dayPlan of Object.values(PLAN)) {
        for (const task of Object.keys(dayPlan)) allTasksInPlan.add(task);
      }
      const matchedTask = fuzzyMatchTask(specialistTask, Array.from(allTasksInPlan));
      
      if (matchedTask) {
        let specialistShifts = [];
        if (day === "FMP-3" || day === "FMP-2" || day === "FMP-1" || day === "FMP" || day === "FMP2") {
          specialistShifts = [["1p", "4p"], ["4p", "7p"]];
        } else if (day === "FMP+1" || day === "FMP+2" || day === "FMP+3" || day === "FMP2+1" || day === "FMP2+2") {
          specialistShifts = [["2p", "5p"], ["5p", "8p"], ["8p", "11p"]];
        }
        
        for (const [start, end] of specialistShifts) {
          const { startIdx, span } = spanCols(start, end);
          if (span <= 0) continue;
          const existingShift = list.find(s => s.day === day && s.task === matchedTask && s.startIdx === startIdx && s.span === span);
          if (!existingShift) {
            list.push({ id: `${day}|${matchedTask}|${start}-${end}-specialist`, day, task: matchedTask, startIdx, span, min: 1, max: 1, assigned: [], isSpecialistShift: true });
          }
        }
      }
    }
  }
  
  list.sort((a, b) => {
    if (a.day !== b.day) return ORDERED_LABELS.indexOf(a.day) - ORDERED_LABELS.indexOf(b.day);
    if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
    const ai = PRIORITY.indexOf(a.task);
    const bi = PRIORITY.indexOf(b.task);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return list;
}

function generateAssignments(staff, includeMinus3 = false, includePlus3 = false, dualFullMoonMode = false, enabledTasks = {}) {
  let activeDays = [];
  if (dualFullMoonMode) {
    activeDays = ["FMP-2", "FMP-1", "FMP", "FMP+1", "FMP+2", "FMP2", "FMP2+1", "FMP2+2"];
  } else {
    activeDays = [...(includeMinus3 ? ["FMP-3"] : []), "FMP-2", "FMP-1", "FMP", "FMP+1", "FMP+2", ...(includePlus3 ? ["FMP+3"] : [])];
  }
  
  const shifts = buildShiftList(activeDays, staff, enabledTasks);
  const weeklyHours = Object.fromEntries(staff.map((s) => [s, 0]));
  const dayHours = {};
  const dayBusy = {};
  const perTaskHours = {};
  
  for (const p of staff) perTaskHours[p] = {};
  for (const d of activeDays) {
    dayHours[d] = Object.fromEntries(staff.map((s) => [s, 0]));
    dayBusy[d] = Object.fromEntries(staff.map((s) => [s, Array(HOURS.length).fill(false)]));
  }

  function assignPerson(person, sh) {
    if (!person) return false;
    sh.assigned.push(person);
    weeklyHours[person] += sh.span;
    dayHours[sh.day][person] += sh.span;
    perTaskHours[person][sh.task] = (perTaskHours[person][sh.task] || 0) + sh.span;
    for (let h = sh.startIdx; h < sh.startIdx + sh.span; h++) dayBusy[sh.day][person][h] = true;
    return true;
  }

  function canTake(person, sh) {
    for (let h = sh.startIdx; h < sh.startIdx + sh.span; h++)
      if (dayBusy[sh.day][person][h]) return false;
    if (dayHours[sh.day][person] + sh.span > 9) return false;

    const parsed = parseStaffName(person);
    const allTasksInPlan = new Set();
    for (const dayPlan of Object.values(PLAN)) {
      for (const task of Object.keys(dayPlan)) allTasksInPlan.add(task);
    }
    const matchedTask = parsed.isSpecialist ? fuzzyMatchTask(parsed.specialistTask, Array.from(allTasksInPlan)) : null;
    const isSpecialistForTask = parsed.isSpecialist && matchedTask === sh.task;

    if (enabledTasks[sh.task] === false && !isSpecialistForTask) return false;
    if (sh.isSpecialistShift && !isSpecialistForTask) return false;
    if (parsed.isSpecialist && parsed.percentage >= 100 && matchedTask && matchedTask !== sh.task) return false;

    if (!isSpecialistForTask) {
      const prevShift = shifts.find((s) => s.day === sh.day && s.assigned.includes(person) && s.startIdx + s.span === sh.startIdx);
      if (prevShift && prevShift.task === sh.task) return false;
      const nextShift = shifts.find((s) => s.day === sh.day && s.assigned.includes(person) && sh.startIdx + sh.span === s.startIdx);
      if (nextShift && nextShift.task === sh.task) return false;
    }
    return true;
  }

  function pickStaffForShift(sh, diversify = true) {
    const candidates = staff.filter((s) => canTake(s, sh));
    if (!candidates.length) return null;

    const specialists = [];
    const partialSpecialists = [];
    const regulars = [];
    
    const allTasksInPlan = new Set();
    for (const dayPlan of Object.values(PLAN)) {
      for (const task of Object.keys(dayPlan)) allTasksInPlan.add(task);
    }
    
    for (const candidate of candidates) {
      const parsed = parseStaffName(candidate);
      if (parsed.isSpecialist) {
        const matchedTask = fuzzyMatchTask(parsed.specialistTask, Array.from(allTasksInPlan));
        if (matchedTask === sh.task) {
          const totalHours = weeklyHours[candidate] || 1;
          const taskHours = perTaskHours[candidate][sh.task] || 0;
          const currentPercentage = (taskHours / totalHours) * 100;
          const targetPercentage = parsed.percentage;
          if (currentPercentage < targetPercentage - 10) {
            specialists.push({ name: candidate, percentage: parsed.percentage, currentPercentage, gap: targetPercentage - currentPercentage });
          } else {
            regulars.push(candidate);
          }
        } else if (parsed.percentage < 100) {
          regulars.push(candidate);
        }
      } else {
        regulars.push(candidate);
      }
    }
    
    if (specialists.length > 0) {
      specialists.sort((a, b) => {
        if (Math.abs(a.gap - b.gap) > 5) return b.gap - a.gap;
        const taskHoursA = perTaskHours[a.name][sh.task] || 0;
        const taskHoursB = perTaskHours[b.name][sh.task] || 0;
        if (taskHoursA !== taskHoursB) return taskHoursA - taskHoursB;
        if (weeklyHours[a.name] !== weeklyHours[b.name]) return weeklyHours[a.name] - weeklyHours[b.name];
        return 0;
      });
      return specialists[0].name;
    }

    let taskMin = Infinity;
    if (diversify) {
      for (const s of regulars) {
        const t = perTaskHours[s][sh.task] || 0;
        if (t < taskMin) taskMin = t;
      }
    }
    
    let preferred = regulars;
    if (diversify) {
      preferred = regulars.filter((s) => (perTaskHours[s][sh.task] || 0) + sh.span <= taskMin + 6);
      if (!preferred.length) preferred = regulars;
    }
    
    const after = isAfter7(sh.startIdx) ? 1 : 0;
    preferred.sort((a, b) => {
      if (weeklyHours[a] !== weeklyHours[b]) return weeklyHours[a] - weeklyHours[b];
      if (dayHours[sh.day][a] !== dayHours[sh.day][b]) return dayHours[sh.day][a] - dayHours[sh.day][b];
      const ta = perTaskHours[a][sh.task] || 0;
      const tb = perTaskHours[b][sh.task] || 0;
      if (ta !== tb) return ta - tb;
      return -after;
    });
    
    if (preferred.length === 0 && partialSpecialists.length > 0) return partialSpecialists[0];
    return preferred[0] || null;
  }

  const specialistShifts = shifts.filter(sh => sh.isSpecialistShift);
  const regularShifts = shifts.filter(sh => !sh.isSpecialistShift);
  const sortedShifts = [...specialistShifts, ...regularShifts];

  for (const sh of sortedShifts) {
    for (let need = 0; need < sh.min; need++) {
      const pick = pickStaffForShift(sh, true);
      if (!pick) break;
      assignPerson(pick, sh);
    }
  }

  const buckets = {};
  for (const sh of shifts) {
    const key = `${sh.day}::${sh.task}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(sh);
  }
  
  for (const key of Object.keys(buckets)) {
    const list = buckets[key];
    let progressed = true;
    while (progressed) {
      progressed = false;
      list.sort((a, b) => {
        const ad = a.assigned.length - a.min;
        const bd = b.assigned.length - b.min;
        if (ad !== bd) return ad - bd;
        const aAfter = isAfter7(a.startIdx) ? 1 : 0;
        const bAfter = isAfter7(b.startIdx) ? 1 : 0;
        if (bAfter !== aAfter) return bAfter - aAfter;
        return a.startIdx - b.startIdx;
      });
      const target = list.find((s) => s.assigned.length < s.max);
      if (!target) break;
      const pick = pickStaffForShift(target, true);
      if (!pick) break;
      assignPerson(pick, target);
      progressed = true;
    }
  }

  const floaterPrefs = ["2p", "6p", "9p", "10p"];
  const floaterOccupied = new Set();
  const floaterPerDay = Object.fromEntries(activeDays.map((d) => [d, 0]));

  for (const day of activeDays) {
    for (const prefIdxLbl of floaterPrefs) {
      if (floaterPerDay[day] >= 3) break;
      const idx = HOUR_INDEX[prefIdxLbl];
      if (idx === undefined) continue;
      const key = `${day}|${idx}`;
      if (floaterOccupied.has(key)) continue;
      
      let flo = shifts.find((s) => s.day === day && s.task === "Floater" && s.startIdx === idx && s.span === 1);
      if (!flo) {
        flo = { id: `${day}|Floater|${prefIdxLbl}`, day, task: "Floater", startIdx: idx, span: 1, min: 0, max: 1, assigned: [] };
        shifts.push(flo);
      }
      if (flo.assigned.length >= 1) {
        floaterOccupied.add(key); continue;
      }

      const minHours = Math.min(...staff.map((s) => weeklyHours[s] || 0));
      const lowest = staff.filter((p) => (weeklyHours[p] || 0) === minHours);

      const candidate = lowest.find((p) => {
        const parsed = parseStaffName(p);
        if (parsed.isSpecialist && parsed.percentage >= 100) return false;
        if (!dayHours[day]) return false;
        if ((dayHours[day][p] || 0) + 1 > 9) return false;
        if (dayBusy[day][p][idx]) return false;
        
        const prevShift = shifts.find((s) => s.day === day && s.assigned.includes(p) && s.startIdx + s.span === idx);
        if (prevShift && prevShift.task === "Floater") return false;
        const nextShift = shifts.find((s) => s.day === day && s.assigned.includes(p) && idx + 1 === s.startIdx);
        if (nextShift && nextShift.task === "Floater") return false;
        return true;
      });
      
      if (!candidate) continue;
      assignPerson(candidate, flo);
      floaterOccupied.add(key);
      floaterPerDay[day] += 1;
    }
  }

  const byDay = {};
  for (const d of activeDays) {
    byDay[d] = {};
    let planDay = d;
    if (d === "FMP2") planDay = "FMP";
    else if (d === "FMP2+1") planDay = "FMP+1";
    else if (d === "FMP2+2") planDay = "FMP+2";
    
    const tasksForDay = Object.keys(PLAN[planDay] || {}).filter((t) => {
      if (t === "Promo Gate" && d !== "FMP" && d !== "FMP2") return false;
      return true;
    });
    const floaterPresent = shifts.some((s) => s.day === d && s.task === "Floater" && s.assigned.length > 0);
    if (floaterPresent && !tasksForDay.includes("Floater")) tasksForDay.push("Floater");
    for (const t of tasksForDay) byDay[d][t] = [];
  }
  
  for (const sh of shifts) {
    if (!byDay[sh.day] || !(sh.task in byDay[sh.day])) continue;
    byDay[sh.day][sh.task].push({ startIdx: sh.startIdx, span: sh.span, people: [...sh.assigned] });
  }
  
  for (const d of Object.keys(byDay))
    for (const t of Object.keys(byDay[d]))
      byDay[d][t].sort((a, b) => a.startIdx - b.startIdx);

  for (const d of activeDays) {
    if (!byDay[d]['Floater']) byDay[d]['Floater'] = [];
  }

  const weeklyTotals = Object.fromEntries(staff.map((s) => [s, 0]));
  const byTaskTotals = Object.fromEntries(staff.map((s) => [s, {}]));
  const byDayTotals = Object.fromEntries(staff.map((s) => [s, Object.fromEntries(activeDays.map((d) => [d, 0]))]));
  
  for (const sh of shifts) {
    for (const p of sh.assigned) {
      weeklyTotals[p] += sh.span;
      byTaskTotals[p][sh.task] = (byTaskTotals[p][sh.task] || 0) + sh.span;
      byDayTotals[p][sh.day] += sh.span;
    }
  }

  shifts.sort((a, b) => {
    if (a.day !== b.day) return ORDERED_LABELS.indexOf(a.day) - ORDERED_LABELS.indexOf(b.day);
    if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
    const ai = PRIORITY.indexOf(a.task);
    const bi = PRIORITY.indexOf(b.task);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  
  return { byDay, weeklyTotals, byTaskTotals, byDayTotals, activeDays, shifts };
}

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

function recomputeSummaries(out) {
  const staffSet = new Set();
  for (const sh of out.shifts) for (const p of sh.assigned) staffSet.add(p);
  const staff = Array.from(staffSet);
  
  out.weeklyTotals = Object.fromEntries(staff.map((s) => [s, 0]));
  out.byTaskTotals = Object.fromEntries(staff.map((s) => [s, {}]));
  out.byDayTotals = Object.fromEntries(staff.map((s) => [s, Object.fromEntries(out.activeDays.map((d) => [d, 0]))]));
  
  for (const sh of out.shifts) {
    for (const p of sh.assigned) {
      out.weeklyTotals[p] += sh.span;
      out.byTaskTotals[p][sh.task] = (out.byTaskTotals[p][sh.task] || 0) + sh.span;
      out.byDayTotals[p][sh.day] += sh.span;
    }
  }

  out.byDay = {};
  for (const d of out.activeDays) {
    out.byDay[d] = {};
    let planDay = d;
    if (d === "FMP2") planDay = "FMP";
    else if (d === "FMP2+1") planDay = "FMP+1";
    else if (d === "FMP2+2") planDay = "FMP+2";
    
    const tasksForDay = Object.keys(PLAN[planDay] || {}).filter((t) => {
      if (t === "Promo Gate" && d !== "FMP" && d !== "FMP2") return false;
      return true;
    });
    const floaterPresent = out.shifts.some((s) => s.day === d && s.task === "Floater" && s.assigned.length > 0);
    if (floaterPresent && !tasksForDay.includes("Floater")) tasksForDay.push("Floater");
    for (const t of tasksForDay) out.byDay[d][t] = [];
  }
  
  for (const sh of out.shifts) {
    if (!out.byDay[sh.day]) out.byDay[sh.day] = {};
    if (!out.byDay[sh.day][sh.task]) out.byDay[sh.day][sh.task] = [];
    const blk = out.byDay[sh.day][sh.task].find((b) => b.startIdx === sh.startIdx && b.span === sh.span);
    if (blk) blk.people = [...sh.assigned];
    else out.byDay[sh.day][sh.task].push({ startIdx: sh.startIdx, span: sh.span, people: [...sh.assigned] });
  }
  
  for (const d of Object.keys(out.byDay)) {
    for (const t of Object.keys(out.byDay[d])) {
      out.byDay[d][t].sort((a, b) => a.startIdx - b.startIdx);
    }
  }

  for (const d of out.activeDays) {
    if (!out.byDay[d]['Floater']) out.byDay[d]['Floater'] = [];
  }
  return out;
}

function renameEverywhere(result, oldName, newName) {
  const out = deepClone(result);
  for (const sh of out.shifts) sh.assigned = sh.assigned.map((n) => (n === oldName ? newName : n));
  for (const d of Object.keys(out.byDay)) {
    for (const t of Object.keys(out.byDay[d])) {
      out.byDay[d][t] = out.byDay[d][t].map((b) => ({ ...b, people: b.people.map((n) => (n === oldName ? newName : n)) }));
    }
  }
  const newWeeklyTotals = {}, newByTaskTotals = {}, newByDayTotals = {};
  for(const p of Object.keys(out.weeklyTotals)) {
    const newP = p === oldName ? newName : p;
    newWeeklyTotals[newP] = out.weeklyTotals[p];
    newByTaskTotals[newP] = out.byTaskTotals[p];
    newByDayTotals[newP] = out.byDayTotals[p];
  }
  out.weeklyTotals = newWeeklyTotals;
  out.byTaskTotals = newByTaskTotals;
  out.byDayTotals = newByDayTotals;
  return out;
}

function detectConflicts(result) {
  if (!result) return { list: [], perShift: {}, perCell: {} };
  const conflicts = [];
  const { shifts, activeDays } = result;
  const per = {}, daySum = {}, perShift = {}, perCell = {};

  for (const sh of shifts) perShift[sh.id] = [];

  for (const sh of shifts) {
    for (const p of sh.assigned) {
      if (!per[p]) per[p] = {};
      if (!per[p][sh.day]) per[p][sh.day] = Array(HOURS.length).fill("");
      if (!daySum[sh.day]) daySum[sh.day] = {};
      daySum[sh.day][p] = (daySum[sh.day][p] || 0) + sh.span;

      for (let h = sh.startIdx; h < sh.startIdx + sh.span; h++) {
        if (per[p][sh.day][h] && per[p][sh.day][h] !== sh.task) {
          const msg = `Double-booked: ${p} on ${sh.day} at ${HOURS[h]} (${per[p][sh.day][h]} & ${sh.task})`;
          conflicts.push({ code: "double", msg, person: p, day: sh.day });
          if (!perShift[sh.id].some((c) => c.code === "double")) perShift[sh.id].push({ code: "double", msg });
        }
        per[p][sh.day][h] = sh.task;
      }
    }
  }

  for (const sh of shifts) {
    for (const p of sh.assigned) {
      const endHourIdx = sh.startIdx + sh.span;
      if (endHourIdx < HOURS.length) {
        const nextShift = shifts.find((s) => s.day === sh.day && s.assigned.includes(p) && s.startIdx === endHourIdx);
        if (nextShift && nextShift.task === sh.task) {
          const parsed = parseStaffName(p);
          const allTasksInPlan = new Set();
          for (const dayPlan of Object.values(PLAN)) {
            for (const task of Object.keys(dayPlan)) allTasksInPlan.add(task);
          }
          const matchedTask = parsed.isSpecialist ? fuzzyMatchTask(parsed.specialistTask, Array.from(allTasksInPlan)) : null;
          const isSpecialistForTask = parsed.isSpecialist && matchedTask === sh.task;
          
          if (!isSpecialistForTask) {
            const msg = `Back-to-back same task: ${p} on ${sh.day} (${sh.task})`;
            conflicts.push({ code: "b2b", msg, person: p, day: sh.day });
            if (!perShift[sh.id].some((c) => c.code === "b2b")) perShift[sh.id].push({ code: "b2b", msg });
            if (!perShift[nextShift.id].some((c) => c.code === "b2b")) perShift[nextShift.id].push({ code: "b2b", msg });
          }
        }
      }
    }
  }

  for (const d of activeDays) {
    for (const p of Object.keys(daySum[d] || {})) {
      if (daySum[d][p] > 9) {
        const msg = `Daily cap: ${p} has ${daySum[d][p]}h on ${d} (max 9)`;
        conflicts.push({ code: "over9", msg, person: p, day: d });
        for (const sh of shifts) {
          if (sh.day === d && sh.assigned.includes(p)) {
            if (!perShift[sh.id].some((c) => c.code === "over9")) perShift[sh.id].push({ code: "over9", msg });
          }
        }
      }
    }
  }

  const totalsByTaskByPerson = {};
  for (const sh of shifts) {
    for (const p of sh.assigned) {
      let taskForBalancing = sh.task;
      if (sh.task === "Promo Gate" || sh.task === "Promo Out") taskForBalancing = "Promo";
      if (!totalsByTaskByPerson[taskForBalancing]) totalsByTaskByPerson[taskForBalancing] = {};
      totalsByTaskByPerson[taskForBalancing][p] = (totalsByTaskByPerson[taskForBalancing][p] || 0) + sh.span;
    }
  }
    
  for (const t of Object.keys(totalsByTaskByPerson)) {
    const regularStaff = {};
    for (const p of Object.keys(totalsByTaskByPerson[t])) {
      const parsed = parseStaffName(p);
      if (!parsed.isSpecialist) regularStaff[p] = totalsByTaskByPerson[t][p];
    }
    const regularVals = Object.values(regularStaff);
    if (regularVals.length >= 2) {
      const min = Math.min(...regularVals), max = Math.max(...regularVals);
      if (max - min > 6) {
        const msg = `Task imbalance: ${t} ranges ${min}–${max}h (>6) among regular staff`;
        conflicts.push({ code: "uneven", msg });
        for (const p of Object.keys(regularStaff)) {
          if (regularStaff[p] === max) {
            for (const sh of shifts) {
              if (sh.task === t && sh.assigned.includes(p)) {
                if (!perShift[sh.id].some((c) => c.code === "uneven")) perShift[sh.id].push({ code: "uneven", msg });
              }
            }
          }
        }
      }
    }
  }

  const totals = {};
  for (const sh of shifts)
    for (const p of sh.assigned) totals[p] = (totals[p] || 0) + sh.span;
  const people = Object.keys(totals);
  if (people.length) {
    const avg = people.reduce((a, k) => a + totals[k], 0) / people.length;
    for (const p of people) {
      if (totals[p] > avg + 3) {
        const msg = `Weekly spread: ${p} is ${totals[p]}h (> avg+3 ≈ ${Math.round(avg + 3)})`;
        conflicts.push({ code: "overavg", msg });
        for (const sh of shifts) {
          if (sh.assigned.includes(p)) {
            if (!perShift[sh.id].some((c) => c.code === "overavg")) perShift[sh.id].push({ code: "overavg", msg });
          }
        }
      }
    }
  }

  const uniqueConflictMessages = Array.from(new Set(conflicts.map((c) => c.msg)));
  const uniqueConflicts = uniqueConflictMessages.map((msg) => conflicts.find((c) => c.msg === msg));
  return { list: uniqueConflicts.map((c) => c.msg), perShift, perCell };
}

function computeCandidateListForShift(result, staff, day, startIdx, span, task, isSwapContext = false) {
  const list = staff.map((s) => {
    const reasons = [];
    const w = result.weeklyTotals?.[s] || 0;
    const d = (result.byDayTotals?.[s] && result.byDayTotals?.[s][day]) || 0;
    
    let overlap = false;
    for (const sh of result.shifts) {
      if (!sh.assigned.includes(s)) continue;
      if (sh.day !== day) continue;
      if (sh.startIdx < startIdx + span && sh.startIdx + sh.span > startIdx) {
        if (isSwapContext && sh.startIdx === startIdx && sh.span === span) continue;
        overlap = true; break;
      }
    }
    if (overlap) reasons.push("overlap");
    if (!isSwapContext && d + span > 9) reasons.push("daily>9");
    
    const prevShift = result.shifts.find((sft) => sft.day === day && sft.assigned.includes(s) && sft.startIdx + sft.span === startIdx);
    if (prevShift && prevShift.task === task) reasons.push("b2b");
    const nextShift = result.shifts.find((sft) => sft.day === day && sft.assigned.includes(s) && startIdx + span === sft.startIdx);
    if (nextShift && nextShift.task === task) reasons.push("b2b");
    
    return { name: s, weekly: w, reasons, score: w };
  });
  
  list.sort((a, b) => {
    if (a.reasons.length !== b.reasons.length) return a.reasons.length - b.reasons.length;
    return a.weekly - b.weekly;
  });
  return list;
}

function checkMoveConflicts(result, person, day, startIdx, span, newTask) {
  const reasons = [];
  const oldTask = result.shifts.find(s => s.day === day && s.startIdx === startIdx && s.span === span)?.task;

  const parsed = parseStaffName(person);
  const isSpecialistForTask = parsed.isSpecialist && parsed.percentage >= 70 && fuzzyMatchTask(parsed.specialistTask, [newTask]) === newTask;

  if (!isSpecialistForTask) {
    const allShiftsForPerson = result.shifts.filter(s => s.assigned.includes(person) && s.day === day && s.task !== oldTask);
    const prevShift = allShiftsForPerson.find(s => s.startIdx + s.span === startIdx);
    if (prevShift && prevShift.task === newTask) reasons.push("b2b");
    const nextShift = allShiftsForPerson.find(s => s.startIdx === startIdx + span);
    if (nextShift && nextShift.task === newTask) reasons.push("b2b");
  }
  return reasons;
}

/* =========================================================
   UI COMPONENTS
   ========================================================= */

function Modal({ title, children, onClose, initialPos }) {
  const modalRef = useRef(null);
  const [position, setPosition] = useState(
    initialPos || { x: window.innerWidth / 2 - 260, y: 120 }
  );
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      setPosition({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => { dragging.current = false; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div ref={modalRef} className="modal" style={{ left: position.x, top: position.y }}
        onMouseDown={(e) => {
          const tgt = e.target;
          if (tgt.classList && tgt.classList.contains("modal-head")) {
            dragging.current = true;
            offset.current = {
              x: e.clientX - (modalRef.current?.offsetLeft || 0),
              y: e.clientY - (modalRef.current?.offsetTop || 0),
            };
          }
        }}
      >
        <div className="modal-head" style={{ cursor: "grab" }}>
          <div>
            {title.includes('•') ? (
              <React.Fragment>
                <div>{title.split(' • ')[0]}</div>
                <div>{title.split(' • ')[1]} • {title.split(' • ')[2]}</div>
              </React.Fragment>
            ) : ( title )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost" style={{ padding: "0 8px", fontSize: 14 }} onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function PersonMenu({ anchorRect, onClose, onDelete, onAdd, onMove, onSwap, onRename, personName }) {
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    if (anchorRect) {
      const menuHeight = 200; 
      const viewportHeight = window.innerHeight;
      let top = anchorRect.top + anchorRect.height;
      let left = anchorRect.left;
      if (anchorRect.bottom + menuHeight > viewportHeight) {
        top = anchorRect.top - menuHeight - 10;
      }
      setMenuStyle({ position: 'fixed', top: `${top}px`, left: `${left}px`, zIndex: 10001 });
    }
  }, [anchorRect]);

  return (
    <div className="person-menu" style={menuStyle}>
      <button className="btn ghost" style={{ padding: "0 4px", fontSize: 10, position: "absolute", top: 4, right: 4 }} onClick={onClose}>✕</button>
      <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{personName}</div>
      <button className="btn inline" onClick={() => { onDelete && onDelete(); onClose && onClose(); }}>Delete</button>
      <button className="btn inline" onClick={() => { onAdd && onAdd(); onClose && onClose(); }}>Add</button>
      <button className="btn inline" onClick={() => { onMove && onMove(); onClose && onClose(); }}>Move</button>
      <button className="btn inline" onClick={() => { onSwap && onSwap(); onClose && onClose(); }}>Swap</button>
      <button className="btn inline" onClick={() => { onRename && onRename(); onClose && onClose(); }}>Rename</button>
    </div>
  );
}

function EditableCell({ day, task, startIdx, span, people, staff, result, setResult, onPushUndo, conflictsInfo, dismissedConflicts, onRenameAndRefreshStaff, highlightedNames, highlightColors, onToggleHighlight, onShowStaffInfo }) {
  const [openPerson, setOpenPerson] = useState(null);
  const [modalState, setModalState] = useState(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [personToRename, setPersonToRename] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const nameRef = useRef(null);
  const [anchorRect, setAnchorRect] = useState(null);
  
  const startLabel = HOURS[startIdx];
  const endLabel = HOURS[startIdx + span - 1] === "11p" ? "12a" : HOURS[startIdx + span];

  function pushUndo(prev) { if (onPushUndo) onPushUndo(prev); }

  function removePersonFromShift(name) {
    setResult((prev) => {
      pushUndo(prev);
      const out = deepClone(prev);
      const sh = out.shifts.find((s) => s.day === day && s.task === task && s.startIdx === startIdx && s.span === span);
      if (!sh) return prev;
      sh.assigned = sh.assigned.filter((n) => n !== name);
      if (sh.assigned.length === 0) out.shifts = out.shifts.filter(s => s.id !== sh.id);
      return recomputeSummaries(out);
    });
  }

  function addPersonToShift(name) {
    setResult((prev) => {
      pushUndo(prev);
      const out = deepClone(prev);
      let sh = out.shifts.find((s) => s.day === day && s.task === task && s.startIdx === startIdx && s.span === span);
      if (!sh) {
        sh = { id: `${day}|${task}|${startIdx}-${startIdx + span}`, day, task, startIdx, span, min: 0, max: 99, assigned: [] };
        out.shifts.push(sh);
      }
      if (!sh.assigned.includes(name)) sh.assigned.push(name);
      if (!out.byDay[day]) out.byDay[day] = {};
      if (!out.byDay[day][task]) out.byDay[day][task] = [];
      const blk = out.byDay[day][task].find((b) => b.startIdx === startIdx && b.span === span);
      if (blk) {
        if (!blk.people.includes(name)) blk.people.push(name);
      } else {
        out.byDay[day][task].push({ startIdx, span, people: [name] });
      }
      return recomputeSummaries(out);
    });
  }

  function swapThisWith(personA, personB) {
    setResult((prev) => {
      pushUndo(prev);
      const out = deepClone(prev);
      for (const s of out.shifts) {
        if (s.day === day && s.startIdx === startIdx && s.span === span) {
          const hasA = s.assigned.includes(personA);
          const hasB = s.assigned.includes(personB);
          if (hasA && !hasB) s.assigned = s.assigned.map((n) => (n === personA ? personB : n));
          else if (hasB && !hasA) s.assigned = s.assigned.map((n) => (n === personB ? personA : n));
        }
      }
      if (out.byDay[day]) {
        for (const t of Object.keys(out.byDay[day])) {
          const blk = out.byDay[day][t].find((b) => b.startIdx === startIdx && b.span === span);
          if (!blk) continue;
          const hasA = blk.people.includes(personA);
          const hasB = blk.people.includes(personB);
          if (hasA && !hasB) blk.people = blk.people.map((n) => (n === personA ? personB : n));
          else if (hasB && !hasA) blk.people = blk.people.map((n) => (n === personB ? personA : n));
        }
      }
      return recomputeSummaries(out);
    });
  }

  function movePersonToTask(person, newTask) {
    setResult((prev) => {
      pushUndo(prev);
      const out = deepClone(prev);
      for (const s of out.shifts) {
        if (s.day === day && s.task === task && s.startIdx === startIdx && s.span === span) {
          s.assigned = s.assigned.filter((n) => n !== person);
        }
      }
      if (out.byDay[day] && out.byDay[day][task]) {
        const blk = out.byDay[day][task].find((b) => b.startIdx === startIdx && b.span === span);
        if (blk) blk.people = blk.people.filter((n) => n !== person);
      }
      let target = out.shifts.find((s) => s.day === day && s.task === newTask && s.startIdx === startIdx && s.span === span);
      if (!target) {
        target = { id: `${day}|${newTask}|${startIdx}-${startIdx + span}`, day, task: newTask, startIdx, span, min: 0, max: 99, assigned: [] };
        out.shifts.push(target);
      }
      if (!target.assigned.includes(person)) target.assigned.push(person);
      if (!out.byDay[day]) out.byDay[day] = {};
      if (!out.byDay[day][newTask]) out.byDay[day][newTask] = [];
      const blk2 = out.byDay[day][newTask].find((b) => b.startIdx === startIdx && b.span === span);
      if (blk2) {
        if (!blk2.people.includes(person)) blk2.people.push(person);
      } else {
        out.byDay[day][newTask].push({ startIdx, span, people: [person] });
      }
      return recomputeSummaries(out);
    });
  }

  const renamePerson = (oldName, newName) => {
    onPushUndo(result);
    const newStaffInput = staff.map(s => s === oldName ? newName : s).join('\n');
    onRenameAndRefreshStaff(newStaffInput);
    setResult(prev => renameEverywhere(deepClone(prev), oldName, newName));
  };

  const suggestions = useMemo(() => {
    if (!result) return [];
    return computeCandidateListForShift(result, staff, day, startIdx, span, task, modalState?.type === "swap");
  }, [result, staff, day, startIdx, span, task, modalState?.type]);

  const thisShift = result?.shifts.find((s) => s.day === day && s.task === task && s.startIdx === startIdx && s.span === span);
  const allConflicts = thisShift ? conflictsInfo.perShift[thisShift.id] || [] : [];
  const conflicts = allConflicts.filter(c => !(dismissedConflicts || []).includes(c.msg));

  const conflictClasses = () => {
    if (!conflicts || conflicts.length === 0) return "";
    const codes = conflicts.map((c) => c.code);
    let classes = "";
    if (codes.includes("double")) classes += " outline-red";
    if (codes.includes("b2b")) classes += " outline-orange";
    if (codes.includes("over9")) classes += " outline-purple";
    if (codes.includes("uneven")) classes += " outline-blue";
    if (codes.includes("overavg")) classes += " outline-deepred";
    return classes;
  };

  const conflictTooltip = conflicts.map(c => c.msg).join("\n");
  const isBottomRow = ["Beer Bar", "Bucket Bar", "Floater"].includes(task);

  return (
    <td
      colSpan={span}
      className={`conflict-outline ${conflictClasses()}`}
      style={{ backgroundColor: people && people.length > 0 ? cellBg(task) : '#fff', textAlign: "center", fontWeight: 600, padding: "8px", position: "relative", minWidth: 60 }}
      title={conflictTooltip}
    >
      <div className="cell-wrap" style={{ alignItems: "stretch" }}>
        {(!people || people.length === 0) && (
           <div style={{ color: "#666", textAlign: "center", position: 'relative' }} onMouseOver={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
             —
             <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: isHovered ? 'auto' : 'none' }}>
               <button className="btn inline" onClick={(e) => { e.stopPropagation(); setModalState({ type: "add", person: null }); }}>add</button>
             </div>
           </div>
        )}
        {people && people.map((n) => {
          const isHighlighted = highlightedNames && highlightedNames[n] !== undefined;
          const colorObj = isHighlighted ? highlightColors[highlightedNames[n]] : null;
          return (
            <div key={n} style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <div
                ref={nameRef}
                className={`staff-name ${openPerson === n ? "selected" : ""}`}
                onClick={(e) => {
                  if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); if (onToggleHighlight) onToggleHighlight(n); }
                  else if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); if (onShowStaffInfo) onShowStaffInfo(n); }
                  else {
                    e.stopPropagation();
                    setOpenPerson((prev) => (prev === n ? null : n));
                    if (nameRef.current) setAnchorRect(nameRef.current.getBoundingClientRect());
                  }
                }}
                role="button" tabIndex={0} title="Click=Options | Shift+Click=Highlight | Ctrl+Click=Info"
                style={{ display: "inline-block", minWidth: 30, backgroundColor: colorObj ? colorObj.bg : 'transparent', color: colorObj ? colorObj.text : 'inherit', padding: '2px 4px', borderRadius: 3, cursor: 'pointer', userSelect: 'none' }}
              >
                {n}
              </div>
              {openPerson === n && (
                <div ref={nameRef} style={{ position: 'fixed', top: isBottomRow ? (anchorRect?.top - 200) + 'px' : (anchorRect?.top + anchorRect?.height) + 'px', left: (anchorRect?.left) + 'px', zIndex: 10002 }}>
                  <PersonMenu
                    anchorRect={anchorRect} personName={n} onClose={() => setOpenPerson(null)} onDelete={() => removePersonFromShift(n)}
                    onAdd={() => { setModalState({ type: "add", person: n }); setOpenPerson(null); }}
                    onMove={() => { setModalState({ type: "move", person: n }); setOpenPerson(null); }}
                    onSwap={() => { setModalState({ type: "swap", person: n }); setOpenPerson(null); }}
                    onRename={() => { setRenameModalOpen(true); setPersonToRename(n); setOpenPerson(null); }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {modalState && modalState.type === "add" && (
          <Modal title={`Add to ${task} • ${startLabel}–${endLabel} • ${day}`} onClose={() => { setModalState(null); setOpenPerson(null); }}>
            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              <div style={{ fontWeight: 700 }}>Pick person to add</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {suggestions.map((s) => {
                  const disabled = s.reasons.length > 0;
                  return (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button className="btn inline" style={{ opacity: disabled ? 0.45 : 1 }} onClick={() => { addPersonToShift(s.name); setModalState(null); setOpenPerson(null); }}>Add {s.name}</button>
                      {disabled && (<div style={{ fontSize: 12, color: "#666" }}>{s.reasons.join(",")}</div>)}
                    </div>
                  );
                })}
              </div>
            </div>
          </Modal>
        )}

        {modalState && modalState.type === "move" && (
          <Modal title={`Move ${modalState.person} • ${startLabel}–${endLabel} • ${day}`} onClose={() => { setModalState(null); setOpenPerson(null); }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Pick target task</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.keys(LIMITS).map((t) => {
                  const reasons = checkMoveConflicts(result, modalState.person, day, startIdx, span, t);
                  const disabled = reasons.length > 0;
                  return (
                    <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button className="btn inline" style={{ opacity: disabled ? 0.45 : 1 }} onClick={() => { movePersonToTask(modalState.person, t); setModalState(null); setOpenPerson(null); }}>{t}</button>
                      {disabled && (<div style={{ fontSize: 12, color: "#666" }}>{reasons.join(",")}</div>)}
                    </div>
                  );
                })}
              </div>
            </div>
          </Modal>
        )}

        {modalState && modalState.type === "swap" && (
          <Modal title={`Swap ${modalState.person} • ${startLabel}–${endLabel} • ${day}`} onClose={() => { setModalState(null); setOpenPerson(null); }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Pick person to swap with</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {suggestions.filter((s) => s.name !== modalState.person).map((s) => {
                    const disabled = s.reasons.length > 0;
                    return (
                      <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button className="btn inline" style={{ opacity: disabled ? 0.45 : 1 }} onClick={() => { swapThisWith(modalState.person, s.name); setModalState(null); setOpenPerson(null); }}>Swap {s.name}</button>
                        {disabled && (<div style={{ fontSize: 12, color: "#666" }}>{s.reasons.join(",")}</div>)}
                      </div>
                    );
                })}
              </div>
            </div>
          </Modal>
        )}

        {renameModalOpen && (
          <Modal title={`Rename ${personToRename}`} onClose={() => { setRenameModalOpen(false); setPersonToRename(null); }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <label>New Name: <input type="text" id="new-name-input" defaultValue={personToRename} /></label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" onClick={() => {
                    const newName = (document.getElementById("new-name-input") || {}).value;
                    if (!newName) return alert("New name cannot be empty.");
                    renamePerson(personToRename, newName);
                    setRenameModalOpen(false); setPersonToRename(null);
                  }}>Rename</button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </td>
  );
}

function EmptyEditableCell({ day, hourIndex, staff, task, result, setResult, onPushUndo }) {
  const [open, setOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const label = HOURS[hourIndex];
  
  function pushUndo(prev) { if (onPushUndo) onPushUndo(prev); }

  function createShiftAndAssign(taskSel, spanSel, nameSel) {
    setResult((prev) => {
      pushUndo(prev);
      const out = deepClone(prev);
      const sh = { id: `${day}|${taskSel}|${hourIndex}-${hourIndex + spanSel}`, day, task: taskSel, startIdx: hourIndex, span: spanSel, min: 0, max: 99, assigned: [] };
      sh.assigned.push(nameSel);
      out.shifts.push(sh);
      if (!out.byDay[day]) out.byDay[day] = {};
      if (!out.byDay[day][taskSel]) out.byDay[day][taskSel] = [];
      out.byDay[day][taskSel].push({ startIdx: hourIndex, span: spanSel, people: [nameSel] });
      return recomputeSummaries(out);
    });
  }

  const suggestions = useMemo(() => {
    if (!result) return [];
    return computeCandidateListForShift(result, staff, day, hourIndex, 1, task);
  }, [result, staff, day, hourIndex, task]);

  return (
    <td style={{ backgroundColor: "#FFFFFF", textAlign: "center", padding: "8px", position: 'relative' }} onMouseOver={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="cell-wrap" style={{ minHeight: 22 }}>
        <div style={{ color: "#999" }}>—</div>
        <div style={{ position: "absolute", right: 6, top: 6, opacity: isHovered || open ? 1 : 0, transition: "opacity 0.2s ease-in-out" }}>
          <button className="btn inline" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>add</button>
        </div>
        {open && (
          <Modal title={`Create shift • ${label} • ${day}`} onClose={() => setOpen(false)}>
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <label>Task:
                  <select id="new-task-select" defaultValue={task || "Runner"}>
                    {Object.keys(LIMITS).map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </label>
              </div>
              <div>
                <label>Span (hours):
                  <select id="new-span">
                    {Array.from({ length: HOURS.length - hourIndex }, (_, i) => i + 1).slice(0, 4).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                  </select>
                </label>
              </div>
              <div>
                <label>Assign:
                  <select id="new-person">
                    <option value="">Select person…</option>
                    {suggestions.map((s) => (
                      <option key={s.name} value={s.name}>
                        {getDisplayName(s.name)} ({s.weekly}h){s.reasons?.length ? ` (${s.reasons.join(",")})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" onClick={() => {
                    const taskSel = (document.getElementById("new-task-select") || {}).value;
                    const spanSel = parseInt((document.getElementById("new-span") || {}).value || "1", 10);
                    const nameSel = (document.getElementById("new-person") || {}).value;
                    if (!taskSel || !nameSel) return alert("Please pick task and person");
                    createShiftAndAssign(taskSel, spanSel, nameSel);
                    setOpen(false);
                  }}>Create & Assign</button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </td>
  );
}

function TaskRow({ day, task, blocks, staff, result, setResult, onPushUndo, conflictsInfo, dismissedConflicts, onRenameAndRefreshStaff, highlightedNames, highlightColors, onToggleHighlight, onShowStaffInfo }) {
  const stripe = TASK_COLORS[task]?.stripe || "#eee";
  const startMap = {};
  for (const b of blocks || []) startMap[b.startIdx] = b;
  const cells = [];
  
  for (let h = 0; h < HOURS.length; h++) {
    if (startMap[h]) {
      const b = startMap[h];
      cells.push(
        <EditableCell key={`${day}-${task}-blk-${h}`} day={day} task={task} startIdx={b.startIdx} span={b.span}
          people={b.people || []} staff={staff} result={result} setResult={setResult} onPushUndo={onPushUndo}
          conflictsInfo={conflictsInfo} dismissedConflicts={dismissedConflicts} onRenameAndRefreshStaff={onRenameAndRefreshStaff}
          highlightedNames={highlightedNames} highlightColors={highlightColors} onToggleHighlight={onToggleHighlight} onShowStaffInfo={onShowStaffInfo}
        />
      );
      h += b.span - 1;
    } else {
      cells.push(<EmptyEditableCell key={`${day}-${task}-empty-${h}`} day={day} hourIndex={h} staff={staff} task={task} result={result} setResult={setResult} onPushUndo={onPushUndo} onRenameAndRefreshStaff={onRenameAndRefreshStaff} />);
    }
  }

  return (<tr><td className="stripe" style={{ backgroundColor: stripe }}></td><td className="task-name">{task}</td>{cells}</tr>);
}

function ScheduleTables({ byDay, activeDays, dayHeader, staff, result, setResult, onPushUndo, conflictsInfo, dismissedConflicts, onRenameAndRefreshStaff, highlightedNames, highlightColors, onToggleHighlight, onShowStaffInfo }) {
  const orderedTasks = useMemo(() => {
    const tasks = new Set();
    for (const d in byDay) for (const t in byDay[d]) tasks.add(t);
    const sortedTasks = Array.from(tasks).sort((a,b) => {
      const ai = PRIORITY.indexOf(a), bi = PRIORITY.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1; if (bi === -1) return -1;
      return ai - bi;
    });
    const floaterIndex = sortedTasks.indexOf("Floater");
    if (floaterIndex > -1) { const floater = sortedTasks.splice(floaterIndex, 1)[0]; sortedTasks.push(floater); }
    return sortedTasks;
  }, [byDay]);

  return (
    <div className="schedule-stack">
      {activeDays.map((d, i) => (
        <div className={`day-block ${i % 2 === 0 ? "alt0" : "alt1"}`} key={d}>
          <div className="day-title">{dayHeader(d)}</div>
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="stripe-col"></th><th className="task-col">Task</th>
                {HOURS.map((h) => (<th key={h} className="hour-col">{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {orderedTasks.map((task) => {
                const blocks = byDay?.[d]?.[task] || [];
                return (<TaskRow key={task} day={d} task={task} blocks={blocks} staff={staff} result={result} setResult={setResult} onPushUndo={onPushUndo} conflictsInfo={conflictsInfo} dismissedConflicts={dismissedConflicts} onRenameAndRefreshStaff={onRenameAndRefreshStaff} highlightedNames={highlightedNames} highlightColors={highlightColors} onToggleHighlight={onToggleHighlight} onShowStaffInfo={onShowStaffInfo} />);
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function PeopleCards({ staff, shifts, activeDays, dayHeader, fmpDate }) {
  const per = {};
  for (const p of staff) {
    per[p] = {};
    for (const d of activeDays) per[p][d] = Array(HOURS.length).fill("");
  }
  for (const sh of shifts) {
    for (const p of sh.assigned) {
      if (!per[p] || !per[p][sh.day]) continue;
      for (let h = sh.startIdx; h < sh.startIdx + sh.span; h++) per[p][sh.day][h] = sh.task;
    }
  }

  return (
    <div className="people-wrap">
      {staff.map((p) => (
        <div className="person-card" key={p}>
          <div className="person-head">{getDisplayName(p)}</div>
          <table className="person-table">
            <thead>
              <tr>
                <th className="hour-col">Hour</th>
                {activeDays.map((d) => {
                  const offset = ORDERED_LABELS.indexOf(d) - ORDERED_LABELS.indexOf("FMP");
                  const iso = addDaysISO(fmpDate, offset);
                  const [day, month] = fmtDateISO(iso).split(' ');
                  const dayLabel = d.replace(/[()]/g, "").trim();
                  return (
                    <th key={d} style={{ textAlign: "center", padding: "4px" }}>
                      <div style={{ marginBottom: "2px", fontSize: "12px", fontWeight: "700" }}>{day} {month}</div>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: "#444" }}>{dayLabel}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {HOURS.map((h, i) => (
                <tr key={h}>
                  <td className="hour-col">{h}</td>
                  {activeDays.map((d) => {
                    const t = per[p][d][i];
                    return (<td key={`${p}-${d}-${i}`} style={{ backgroundColor: t ? cellBg(t) : "", textAlign: "center", padding: "4px 6px", fontWeight: 600 }}>{t || ""}</td>);
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function PeopleListCompact({ staff, shifts, activeDays, dayHeader, fmpDate }) {
  const personDayShiftBlocks = {};
  for (const p of staff) {
    personDayShiftBlocks[p] = {};
    for (const d of activeDays) personDayShiftBlocks[p][d] = [];
  }

  for (const shift of shifts) {
    for (const personName of shift.assigned) {
      if (!staff.includes(personName)) continue;
      const arr = personDayShiftBlocks[personName][shift.day];
      if (arr.length && arr[arr.length - 1].task === shift.task && arr[arr.length - 1].startIdx + arr[arr.length - 1].span === shift.startIdx) {
        arr[arr.length - 1].span += shift.span;
      } else {
        arr.push({ task: shift.task, startIdx: shift.startIdx, span: shift.span });
      }
    }
  }

  for (const p in personDayShiftBlocks) {
    for (const d in personDayShiftBlocks[p]) personDayShiftBlocks[p][d].sort((a, b) => a.startIdx - b.startIdx);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {staff.map((p) => (
        <div className="person-list" key={p} style={{ width: "215px" }}>
          <div className="head">{getDisplayName(p)}</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {activeDays.map((d, i) => {
                const rows = personDayShiftBlocks[p][d] || [];
                const offset = ORDERED_LABELS.indexOf(d) - ORDERED_LABELS.indexOf("FMP");
                const iso = addDaysISO(fmpDate, offset);
                const [day, month] = fmtDateISO(iso).split(' ');
                
                if (!rows.length) {
                  return (
                    <tr key={`${p}-${d}-empty`}>
                      <td style={{ border: "1px solid var(--border)", padding: 6, width: "50px", verticalAlign: "middle", textAlign: "center" }}>
                        <div className="compact-date"><div>{day} {month}</div><small>{d}</small></div>
                      </td>
                      <td colSpan={2} style={{ border: "1px solid var(--border)", padding: 6 }}>No shifts</td>
                    </tr>
                  );
                }
                return rows.map((b, j) => {
                  const startLabel = HOURS[b.startIdx];
                  const endLabel = HOURS[b.startIdx + b.span - 1] === "11p" ? "12a" : HOURS[b.startIdx + b.span];
                  return (
                    <tr key={`${p}-${d}-${j}`}>
                      {j === 0 && (
                        <td rowSpan={rows.length} style={{ border: "1px solid var(--border)", padding: 6, width: "50px", verticalAlign: "middle", textAlign: "center" }}>
                          <div className="compact-date"><div>{day} {month}</div><small>{d}</small></div>
                        </td>
                      )}
                      <td style={{ border: "1px solid var(--border)", padding: 6, width: "70px", whiteSpace: "nowrap" }}>{startLabel}–{endLabel}</td>
                      <td style={{ border: "1px solid var(--border)", padding: 6, backgroundColor: TASK_COLORS[b.task]?.stripe, width: "85px" }}>{b.task}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Summaries({ staff, weeklyTotals, byTaskTotals, byDayTotals, activeDays, dayHeader }) {
  const allTasks = [];
  for (const p of staff)
    for (const t of Object.keys(byTaskTotals[p] || {}))
      if (!allTasks.includes(t)) allTasks.push(t);
  
  allTasks.sort((a, b) => {
    const ai = PRIORITY.indexOf(a), bi = PRIORITY.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });

  const taskColTotals = Object.fromEntries(allTasks.map((t) => [t, 0]));
  for (const p of staff) for (const t of allTasks) taskColTotals[t] += byTaskTotals[p]?.[t] || 0;

  const dayColTotals = Object.fromEntries(activeDays.map((d) => [d, 0]));
  for (const p of staff) for (const d of activeDays) dayColTotals[d] += byDayTotals[p]?.[d] || 0;

  const grandTotal = staff.reduce((a, s) => a + (weeklyTotals[s] || 0), 0);

  const medianPerTask = {};
  for (const t of allTasks) {
    const vals = staff.map((p) => byTaskTotals[p]?.[t] || 0).filter((v) => v > 0).sort((a, b) => a - b);
    if (!vals.length) medianPerTask[t] = 0;
    else {
      const mid = Math.floor(vals.length / 2);
      medianPerTask[t] = vals.length % 2 === 1 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
    }
  }
  
  const weeklyVals = staff.map((p) => weeklyTotals[p] || 0).sort((a, b) => a - b);
  const mid = Math.floor(weeklyVals.length / 2);
  const medianTotal = weeklyVals.length % 2 === 1 ? weeklyVals[mid] : Math.round((weeklyVals[mid - 1] + weeklyVals[mid]) / 2);

  return (
    <div className="summary-wrap">
      <h2>Staff × Task (hours)</h2>
      <table className="summary-table compact" style={{ width: "auto", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid var(--border)", padding: 6 }}>Staff</th>
            {allTasks.map((t) => (<th key={t} style={{ backgroundColor: TASK_COLORS[t]?.stripe, border: "1px solid var(--border)", padding: 6 }}>{t}</th>))}
            <th style={{ border: "1px solid var(--border)", padding: 6 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((p) => (
            <tr key={p}>
              <td className="row-head" style={{ textAlign: "right", padding: 6, border: "1px solid var(--border)" }}>{getDisplayName(p)}</td>
              {allTasks.map((t) => {
                const v = byTaskTotals[p]?.[t] || 0;
                return (<td key={t} style={{ backgroundColor: v ? TASK_COLORS[t]?.stripe : "", textAlign: "center", border: "1px solid var(--border)", padding: 6 }}>{v || ""}</td>);
              })}
              <td className="total-cell" style={{ border: "1px solid var(--border)", padding: 6 }}>{weeklyTotals[p] || 0}</td>
            </tr>
          ))}
          <tr className="summary-median">
            <td style={{ padding: 6, border: "1px solid var(--border)" }}>MEDIAN (non-zero)</td>
            {allTasks.map((t) => (<td key={t} style={{ textAlign: "center", padding: 6, border: "1px solid var(--border)" }}>{medianPerTask[t] || ""}</td>))}
            <td style={{ textAlign: "center", padding: 6, border: "1px solid var(--border)" }}>{medianTotal}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="col-head" style={{ padding: 6, border: "1px solid var(--border)" }}>Total</td>
            {allTasks.map((t) => (<td key={t} className="total-cell" style={{ padding: 6, border: "1px solid var(--border)" }}>{taskColTotals[t]}</td>))}
            <td className="total-cell" style={{ padding: 6, border: "1px solid var(--border)" }}>{grandTotal}</td>
          </tr>
        </tfoot>
      </table>

      <h2>Staff × Day (hours)</h2>
      <table className="summary-table compact" style={{ width: "auto", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ padding: 6 }}>Staff</th>
            {activeDays.map((d) => (<th key={d} style={{ padding: 6 }}>{dayHeader(d)}</th>))}
            <th style={{ padding: 6 }}>Weekly</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((p) => (
            <tr key={p}>
              <td className="row-head" style={{ textAlign: "right", padding: 6, border: "1px solid var(--border)" }}>{getDisplayName(p)}</td>
              {activeDays.map((d) => (<td key={d} style={{ textAlign: "center", padding: 6, border: "1px solid var(--border)" }}>{byDayTotals[p]?.[d] || 0}</td>))}
              <td className="total-cell" style={{ padding: 6, border: "1px solid var(--border)" }}>{weeklyTotals[p] || 0}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="staff-day-totals-row">
            <td className="col-head" style={{ padding: 6, border: "1px solid var(--border)" }}>Total</td>
            {activeDays.map((d) => (<td key={d} className="total-cell" style={{ padding: 6, border: "1px solid var(--border)" }}>{dayColTotals[d]}</td>))}
            <td className="total-cell" style={{ padding: 6, border: "1px solid var(--border)" }}>{grandTotal}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* =========================================================
   MAIN APP COMPONENT
   ========================================================= */

function App() {
  const [includeMinus3, setIncludeMinus3] = useState(false);
  const [includePlus3, setIncludePlus3] = useState(false);
  const [dualFullMoonMode, setDualFullMoonMode] = useState(false);
  const [activeTab, setActiveTab] = useState("schedule");
  const [isStaffListCollapsed, setIsStaffListCollapsed] = useState(false);
  
  // States mapped directly to Firebase below
  const [scheduleHistory, setScheduleHistory] = useState([]);
  const [savedSchedules, setSavedSchedules] = useState([]);
  const [dismissedConflicts, setDismissedConflicts] = useState([]);
  const [result, setResult] = useState(null);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSavedSchedulesModal, setShowSavedSchedulesModal] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [highlightedNames, setHighlightedNames] = useState({});
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [showStaffPanel, setShowStaffPanel] = useState(false);
  const [showSwapAssistant, setShowSwapAssistant] = useState(false);
  const [swapMode, setSwapMode] = useState('hours');
  const [swapConfig, setSwapConfig] = useState({ reduceHours: [], increaseHours: [], person: null, task: null, replacements: [] });

  const [enabledTasks, setEnabledTasks] = useState({
    "Runner": true, "Social Media": true, "Promo Out": true, "Promo In": true,
    "Promo Gate": true, "Games": true, "Beer Bar": true, "Bucket Bar": true,
  });

  const [fmpDate, setFmpDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Dynamic html2canvas load for generating PNGs in the preview environment
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('html2canvas-script')) {
      const script = document.createElement('script');
      script.id = 'html2canvas-script';
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      document.head.appendChild(script);
    }
  }, []);
  
  useEffect(() => {
    if (dualFullMoonMode) {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      const year = currentMonth === 0 ? currentYear - 1 : currentYear;
      setFmpDate(`${year}-12-31`);
    }
  }, [dualFullMoonMode]);

  // LOAD FIREBASE DATA ON MOUNT
  useEffect(() => {
    const loadFromFirebase = async () => {
      try {
        const histDoc = await getDoc(doc(db, "schedules", "history"));
        if (histDoc.exists()) setScheduleHistory(histDoc.data().list || []);

        const savedDoc = await getDoc(doc(db, "schedules", "finalSchedules"));
        if (savedDoc.exists()) setSavedSchedules(savedDoc.data().list || []);

        const resultDoc = await getDoc(doc(db, "schedules", "currentResult"));
        if (resultDoc.exists()) setResult(resultDoc.data().data || null);
      } catch (e) {
        console.error("Firebase Load Error:", e);
      }
    };
    loadFromFirebase();
  }, []);

  // LOAD DISMISSED CONFLICTS
  useEffect(() => {
    const loadDismissed = async () => {
      try {
        const dismissDoc = await getDoc(doc(db, "schedules", `dismissed-${fmpDate}`));
        if (dismissDoc.exists()) setDismissedConflicts(dismissDoc.data().list || []);
        else setDismissedConflicts([]);
      } catch (e) { console.error("Firebase Load Dismissed Error:", e); }
    };
    loadDismissed();
  }, [fmpDate]);

  const defaultStaff = Array.from({ length: 20 }, (_, i) => `${String.fromCharCode(65 + (i % 26))}${i + 1}`);
  const [staffInput, setStaffInput] = useState(defaultStaff.join("\n"));
  const staff = useMemo(() => staffInput.split("\n").map((s) => s.trim()).filter(Boolean), [staffInput]);

  const undoStack = useRef([]);
  const redoStack = useRef([]);
  
  function pushUndo(state) {
    if (!state) return;
    undoStack.current.push(deepClone(state));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }
  function undo() {
    if (!undoStack.current.length) return;
    const prev = undoStack.current.pop();
    if (result) redoStack.current.push(deepClone(result));
    setResult(prev);
  }
  function redo() {
    if (!redoStack.current.length) return;
    const next = redoStack.current.pop();
    if (result) undoStack.current.push(deepClone(result));
    setResult(next);
  }

  const conflictsInfo = useMemo(() => detectConflicts(result), [result]);

  // AUTOSAVE TO FIREBASE
  useEffect(() => {
    if (!result) return;
    const saveToHistory = async () => {
      const snapshot = {
        timestamp: new Date().toISOString(), date: fmpDate, staff: staff,
        result: result, enabledTasks: enabledTasks, includeMinus3: includeMinus3,
        includePlus3: includePlus3, dualFullMoonMode: dualFullMoonMode,
      };
      
      setScheduleHistory(prev => {
        const newHistory = [snapshot, ...prev].slice(0, 20); // Keep 20 versions
        setDoc(doc(db, "schedules", "history"), { list: newHistory }).catch(e => console.error(e));
        return newHistory;
      });
    };
    saveToHistory();
    const interval = setInterval(saveToHistory, 30000);
    return () => clearInterval(interval);
  }, [result, staff, fmpDate, enabledTasks, includeMinus3, includePlus3, dualFullMoonMode]);

  const highlightColors = [
    { bg: '#fef08a', text: '#000', name: 'yellow' }, { bg: '#86efac', text: '#000', name: 'green' },
    { bg: '#93c5fd', text: '#000', name: 'blue' }, { bg: '#f9a8d4', text: '#000', name: 'pink' },
    { bg: '#fdba74', text: '#000', name: 'orange' }, { bg: '#c4b5fd', text: '#000', name: 'purple' },
    { bg: '#fca5a5', text: '#000', name: 'red' }, { bg: '#d1d5db', text: '#000', name: 'gray' },
    { bg: '#fcd34d', text: '#000', name: 'amber' }, { bg: '#a7f3d0', text: '#000', name: 'mint' },
    { bg: '#1e40af', text: '#fff', name: 'dark blue' }, { bg: '#15803d', text: '#fff', name: 'dark green' },
    { bg: '#c026d3', text: '#fff', name: 'magenta' }, { bg: '#dc2626', text: '#fff', name: 'dark red' },
    { bg: '#ea580c', text: '#fff', name: 'dark orange' }, { bg: '#7c3aed', text: '#fff', name: 'dark purple' },
    { bg: '#0891b2', text: '#fff', name: 'cyan' }, { bg: '#ca8a04', text: '#fff', name: 'dark yellow' },
    { bg: '#000000', text: '#fff', name: 'black' }, { bg: '#78350f', text: '#fff', name: 'brown' },
  ];

  function toggleNameHighlight(name) {
    setHighlightedNames(prev => {
      if (prev[name] !== undefined) {
        const newHighlighted = {...prev};
        delete newHighlighted[name];
        return newHighlighted;
      } else {
        const usedColors = Object.values(prev);
        const nextColorIndex = usedColors.length % highlightColors.length;
        return {...prev, [name]: nextColorIndex};
      }
    });
  }

  function clearAllHighlights() { setHighlightedNames({}); }

  function dismissConflict(conflictMsg) {
    const newList = [...dismissedConflicts, conflictMsg];
    setDismissedConflicts(newList);
    setDoc(doc(db, "schedules", `dismissed-${fmpDate}`), { list: newList }).catch(e => console.error(e));
  }

  function clearDismissedConflicts() {
    setDismissedConflicts([]);
    setDoc(doc(db, "schedules", `dismissed-${fmpDate}`), { list: [] }).catch(e => console.error(e));
  }

  function showStaffInfo(staffName) {
    setSelectedStaff(staffName);
    setShowStaffPanel(true);
  }

  function handleFindBestHourSwap() {
    if (!result || !result.shifts) return;
    const overworked = swapConfig.reduceHours;
    const underworked = swapConfig.increaseHours;
    if (overworked.length === 0 || underworked.length === 0) return alert('Please select staff for both "too many hours" and "too few hours"');
    
    const getBusyHours = (person, day, excludeShiftId = null) => {
      const busy = new Set();
      for (const sh of result.shifts) {
        if (sh.id === excludeShiftId) continue;
        if (sh.day === day && sh.assigned.includes(person)) {
          for (let h = sh.startIdx; h < sh.startIdx + sh.span; h++) busy.add(h);
        }
      }
      return busy;
    };
    
    const canTakeShift = (person, shift, excludeShiftId = null) => {
      const busy = getBusyHours(person, shift.day, excludeShiftId);
      for (let h = shift.startIdx; h < shift.startIdx + shift.span; h++) if (busy.has(h)) return false;
      let currentDayHours = result.byDayTotals?.[person]?.[shift.day] || 0;
      if (excludeShiftId) {
        const excludedShift = result.shifts.find(s => s.id === excludeShiftId);
        if (excludedShift && excludedShift.day === shift.day) currentDayHours -= excludedShift.span;
      }
      if (currentDayHours + shift.span > 9) return false;
      return true;
    };
    
    const overworkedShifts = result.shifts.filter(sh => overworked.some(p => sh.assigned.includes(p))).sort((a, b) => b.span - a.span);
    const underworkedShifts = result.shifts.filter(sh => underworked.some(p => sh.assigned.includes(p))).sort((a, b) => a.span - b.span);
    
    const suggestions = [];
    for (const longShift of overworkedShifts) {
      const overworkedPerson = longShift.assigned.find(p => overworked.includes(p));
      if (!overworkedPerson) continue;
      for (const shortShift of underworkedShifts) {
        if (longShift.id === shortShift.id) continue;
        const underworkedPerson = shortShift.assigned.find(p => underworked.includes(p));
        if (!underworkedPerson || overworkedPerson === underworkedPerson) continue;
        
        const hoursDiff = longShift.span - shortShift.span;
        const overworkedCanTakeShort = canTakeShift(overworkedPerson, shortShift, longShift.id);
        const underworkedCanTakeLong = canTakeShift(underworkedPerson, longShift, shortShift.id);
        
        if (overworkedCanTakeShort && underworkedCanTakeLong && hoursDiff !== 0) {
          suggestions.push({
            type: 'hour_swap', from: overworkedPerson, to: underworkedPerson,
            fromShift: longShift, toShift: shortShift, hoursDiff: Math.abs(hoursDiff),
            description: hoursDiff > 0 
              ? `Swap ${overworkedPerson}'s ${longShift.span}h ${longShift.task} (${longShift.day}) with ${underworkedPerson}'s ${shortShift.span}h ${shortShift.task} (${shortShift.day}) → ${overworkedPerson} loses ${hoursDiff}h, ${underworkedPerson} gains ${hoursDiff}h`
              : `Swap ${overworkedPerson}'s ${longShift.span}h ${longShift.task} (${longShift.day}) with ${underworkedPerson}'s ${shortShift.span}h ${shortShift.task} (${shortShift.day}) → ${underworkedPerson} loses ${Math.abs(hoursDiff)}h, ${overworkedPerson} gains ${Math.abs(hoursDiff)}h`
          });
        }
      }
    }
    
    if (suggestions.length === 0) {
      for (const shift of overworkedShifts) {
        const overworkedPerson = shift.assigned.find(p => overworked.includes(p));
        if (!overworkedPerson) continue;
        for (const underworkedPerson of underworked) {
          if (overworkedPerson === underworkedPerson) continue;
          if (canTakeShift(underworkedPerson, shift, null)) {
            suggestions.push({
              type: 'reassign', from: overworkedPerson, to: underworkedPerson,
              fromShift: shift, toShift: null, hoursDiff: shift.span,
              description: `Give ${overworkedPerson}'s ${shift.span}h ${shift.task} shift (${shift.day}) to ${underworkedPerson} → ${overworkedPerson} loses ${shift.span}h, ${underworkedPerson} gains ${shift.span}h`
            });
          }
        }
      }
    }
    
    if (suggestions.length === 0) return alert('No valid swaps found. The selected people may not have compatible shifts that can be exchanged without conflicts.');
    
    suggestions.sort((a, b) => b.hoursDiff - a.hoursDiff);
    const best = suggestions[0];
    const confirmMsg = `Found ${suggestions.length} possible swap(s).\n\nBest swap:\n${best.description}\n\nExecute this swap?`;
    if (window.confirm(confirmMsg)) executeShiftSwap(best.from, best.to, best.fromShift, best.toShift);
  }

  function handleFindBestTaskSwap() {
    if (!result || !result.shifts) return;
    let task = swapConfig.task;
    const overloadedPerson = swapConfig.person;
    const candidates = swapConfig.replacements;
    if (!task || !overloadedPerson || candidates.length === 0) return alert('Please select a task, person with too much of it, and candidates to take shifts');
    
    const getRelatedTasks = (t) => (t === 'Promo Out' || t === 'Promo Gate') ? ['Promo Out', 'Promo Gate'] : [t];
    const relatedTasks = getRelatedTasks(task);
    
    const getBusyHours = (person, day) => {
      const busy = new Set();
      for (const sh of result.shifts) {
        if (sh.day === day && sh.assigned.includes(person)) {
          for (let h = sh.startIdx; h < sh.startIdx + sh.span; h++) busy.add(h);
        }
      }
      return busy;
    };
    
    const canTakeShift = (person, shift) => {
      const busy = getBusyHours(person, shift.day);
      for (let h = shift.startIdx; h < shift.startIdx + shift.span; h++) if (busy.has(h)) return false;
      const currentDayHours = result.byDayTotals?.[person]?.[shift.day] || 0;
      if (currentDayHours + shift.span > 9) return false;
      return true;
    };
    
    const overloadedShifts = result.shifts.filter(sh => relatedTasks.includes(sh.task) && sh.assigned.includes(overloadedPerson));
    if (overloadedShifts.length === 0) {
      const taskLabel = relatedTasks.length > 1 ? relatedTasks.join('/') : task;
      return alert(`${overloadedPerson} doesn't have any ${taskLabel} shifts to reassign.`);
    }
    
    const suggestions = [];
    for (const shift of overloadedShifts) {
      for (const candidate of candidates) {
        if (canTakeShift(candidate, shift)) {
          suggestions.push({
            type: 'task_swap', from: overloadedPerson, to: candidate, shift: shift,
            description: `Give ${overloadedPerson}'s ${shift.span}h ${shift.task} shift on ${shift.day} to ${candidate}`
          });
        }
      }
    }
    
    if (suggestions.length === 0) return alert(`No valid reassignments found. The candidates may all have conflicts during ${overloadedPerson}'s ${task} shifts.`);
    
    const best = suggestions[0];
    const confirmMsg = `Found ${suggestions.length} possible reassignment(s).\n\nBest option:\n${best.description}\n\nExecute this change?`;
    if (window.confirm(confirmMsg)) executeTaskReassign(best.from, best.to, best.shift);
  }

  function executeShiftSwap(person1, person2, shift1, shift2) {
    pushUndo(result);
    setResult(prev => {
      const out = deepClone(prev);
      const s1 = out.shifts.find(s => s.id === shift1.id);
      if (s1) { s1.assigned = s1.assigned.filter(p => p !== person1); s1.assigned.push(person2); }
      if (shift2) {
        const s2 = out.shifts.find(s => s.id === shift2.id);
        if (s2) { s2.assigned = s2.assigned.filter(p => p !== person2); s2.assigned.push(person1); }
      }
      return recomputeSummaries(out);
    });
    setShowSwapAssistant(false);
    setSwapConfig({ reduceHours: [], increaseHours: [], person: null, task: null, replacements: [] });
  }

  function executeTaskReassign(fromPerson, toPerson, shift) {
    pushUndo(result);
    setResult(prev => {
      const out = deepClone(prev);
      const s = out.shifts.find(s => s.id === shift.id);
      if (s) { s.assigned = s.assigned.filter(p => p !== fromPerson); s.assigned.push(toPerson); }
      return recomputeSummaries(out);
    });
    setShowSwapAssistant(false);
    setSwapConfig({ reduceHours: [], increaseHours: [], person: null, task: null, replacements: [] });
  }

  const renameAndRefreshStaff = (newStaffInput) => { setStaffInput(newStaffInput); };

  function handleGenerate() {
    const out = generateAssignments(staff, includeMinus3, includePlus3, dualFullMoonMode, enabledTasks);
    pushUndo(result);
    setResult(out);
    setIsStaffListCollapsed(true);
  }

  function handleSaveFirebase() {
    if (!result) return alert("No schedule to save");
    setDoc(doc(db, "schedules", "currentResult"), { data: result })
      .then(() => alert("Schedule saved to Firebase!"))
      .catch(e => alert("Error saving to Firebase: " + e.message));
  }

  function handleClearFirebase() {
    setDoc(doc(db, "schedules", "currentResult"), { data: null })
      .then(() => alert("Saved result cleared from Firebase!"))
      .catch(e => alert("Error clearing: " + e.message));
  }

  function handleRestoreFromHistory(snapshot) {
    setResult(snapshot.result);
    setStaffInput(snapshot.staff.join("\n"));
    setFmpDate(snapshot.date);
    setEnabledTasks(snapshot.enabledTasks);
    setIncludeMinus3(snapshot.includeMinus3);
    setIncludePlus3(snapshot.includePlus3);
    setDualFullMoonMode(snapshot.dualFullMoonMode);
    setShowHistoryModal(false);
    alert(`Restored schedule from ${new Date(snapshot.timestamp).toLocaleString()}`);
  }

  function handleExportSchedule() {
    if (!result) return alert("No schedule to export");
    const exportData = { timestamp: new Date().toISOString(), date: fmpDate, staff: staff, result: result, enabledTasks: enabledTasks, includeMinus3: includeMinus3, includePlus3: includePlus3, dualFullMoonMode: dualFullMoonMode };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-${fmpDate}-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportSchedule(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        setResult(imported.result);
        setStaffInput(imported.staff.join("\n"));
        setFmpDate(imported.date);
        setEnabledTasks(imported.enabledTasks);
        setIncludeMinus3(imported.includeMinus3);
        setIncludePlus3(imported.includePlus3);
        setDualFullMoonMode(imported.dualFullMoonMode);
        alert("Schedule imported successfully!");
      } catch (err) { alert("Error importing schedule: " + err.message); }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function handleSaveFinalVersion() {
    if (!result) return alert("No schedule to save");
    if (!scheduleName.trim()) return alert("Please enter a name for this schedule");
    
    const finalSchedule = {
      name: scheduleName.trim(), timestamp: new Date().toISOString(), date: fmpDate,
      staff: staff, result: result, enabledTasks: enabledTasks,
      includeMinus3: includeMinus3, includePlus3: includePlus3, dualFullMoonMode: dualFullMoonMode,
    };
    
    const newSaved = [finalSchedule, ...savedSchedules];
    setSavedSchedules(newSaved);
    setDoc(doc(db, "schedules", "finalSchedules"), { list: newSaved })
      .then(() => alert(`Schedule "${finalSchedule.name}" saved permanently in Firebase!`))
      .catch(e => alert("Error saving final version: " + e.message));
      
    setShowSaveModal(false);
    setScheduleName("");
  }

  function handleLoadSavedSchedule(schedule) {
    setResult(schedule.result);
    setStaffInput(schedule.staff.join("\n"));
    setFmpDate(schedule.date);
    setEnabledTasks(schedule.enabledTasks);
    setIncludeMinus3(schedule.includeMinus3);
    setIncludePlus3(schedule.includePlus3);
    setDualFullMoonMode(schedule.dualFullMoonMode);
    setShowSavedSchedulesModal(false);
    alert(`Loaded "${schedule.name}"`);
  }

  function handleDeleteSavedSchedule(idx) {
    if (!confirm('Delete this saved schedule?')) return;
    const newSaved = savedSchedules.filter((_, i) => i !== idx);
    setSavedSchedules(newSaved);
    setDoc(doc(db, "schedules", "finalSchedules"), { list: newSaved }).catch(e => console.error(e));
  }

  function handlePrint() {
    try {
      let printContent = '';
      if (activeTab === 'schedule') {
        const scheduleTables = document.querySelector('.schedule-stack');
        if (scheduleTables) printContent = scheduleTables.outerHTML;
        else return alert("No schedule content to print");
      } else {
        const tabContent = document.getElementById(activeTab);
        if (tabContent) printContent = tabContent.innerHTML;
        else return alert("No content available for printing");
      }
      
      for (const s of staff) {
        const parsed = parseStaffName(s);
        if (parsed.isSpecialist) {
          const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          printContent = printContent.replace(new RegExp(escaped, 'g'), parsed.displayName);
        }
      }
      
      const printWindow = window.open('', '_blank', 'width=1200,height=900');
      printWindow.document.write(`
        <html>
          <head>
            <title>Volunteer Schedule - ${activeTab}</title>
            <style>
              * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; print-color-adjust: exact !important; }
              body { font-family: 'Arial', sans-serif; margin: 15px; font-size: 13px; line-height: 1.1; color: black !important; }
              .schedule-stack { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; page-break-before: avoid; page-break-after: avoid; }
              .day-block { width: 48%; margin-bottom: 20px; break-inside: avoid; page-break-inside: avoid; display: inline-block; vertical-align: top; }
              .day-block:nth-child(2n+1):not(:first-child):not(:nth-child(2)) { page-break-before: always; }
              .schedule-table { border-collapse: collapse; width: 100%; margin: 5px 0; page-break-inside: avoid; font-size: 9px; table-layout: fixed; }
              .schedule-table th, .schedule-table td { border: 1px solid #000 !important; padding: 2px; text-align: center; font-size: 8px; line-height: 1.0; }
              .schedule-table .hour-col { width: calc((100% - 120px) / 11) !important; }
              .task-name { text-align: left !important; font-weight: bold; padding-left: 3px !important; font-size: 8px; width: 110px !important; }
              .stripe-col { width: 8px !important; }
              .day-title { background: #e0e0e0 !important; font-weight: bold; padding: 6px; border-bottom: 2px solid #000 !important; font-size: 11px; }
              .people-wrap { display: grid; grid-template-columns: repeat(3, 1fr); grid-gap: 10px; width: 100%; }
              .person-card { width: 100%; border: 2px solid #000 !important; break-inside: avoid; page-break-inside: avoid; box-sizing: border-box; display: flex; flex-direction: column; }
              .person-card:nth-child(6n+1):not(:first-child) { page-break-before: always; }
              .person-head { background: #f0f0f0 !important; font-weight: bold; padding: 6px; border-bottom: 1px solid #000 !important; font-size: 12px; }
              .person-table { width: 100%; border-collapse: collapse; flex-grow: 1; }
              .person-table th, .person-table td { border: 1px solid #000 !important; padding: 3px; text-align: center; font-size: 10px; }
              .list-wrap, div:has(.person-list) { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; width: 100% !important; gap: 4px !important; transform: scale(0.6) !important; transform-origin: top left !important; }
              .person-list { width: 100% !important; border: 2px solid #000 !important; break-inside: avoid !important; page-break-inside: avoid !important; box-sizing: border-box !important; display: flex !important; flex-direction: column !important; font-size: 0.75em !important; }
              .person-list table { width: 100% !important; font-size: 0.7em !important; }
              .person-list:nth-child(12n) { page-break-after: always !important; }
              .person-list .head { background: #f0f0f0 !important; font-weight: bold; padding: 6px; border-bottom: 1px solid #000 !important; font-size: 11px; }
              .person-list th, .person-list td { border: 1px solid #000 !important; padding: 2px; font-size: 9px; }
              .compact-date { font-weight: bold !important; background: #f5f5f5 !important; font-size: 9px; }
              td[style*="background-color: #FFF6A2"] { background: #FFF6A2 !important; }
              td[style*="background-color: #C5F7C8"] { background: #C5F7C8 !important; }
              td[style*="background-color: #CBE5FF"] { background: #CBE5FF !important; }
              td[style*="background-color: #BFF7F2"] { background: #BFF7F2 !important; }
              td[style*="background-color: #B6EFE6"] { background: #B6EFE6 !important; }
              td[style*="background-color: #DCCCFF"] { background: #DCCCFF !important; }
              td[style*="background-color: #FFD6E7"] { background: #FFD6E7 !important; }
              td[style*="background-color: #FFE1C6"] { background: #FFE1C6 !important; }
              td[style*="background-color: #EEEEEE"] { background: #EEEEEE !important; }
              .summary-table { border-collapse: collapse; margin: 10px 0; }
              .summary-table th, .summary-table td { border: 1px solid #000 !important; padding: 4px; font-size: 11px; }
              @media print { 
                body { margin: 0; font-size: 12px; }
                .person-card, .person-list, .day-block { break-inside: avoid; }
                h1, h2 { page-break-after: avoid; }
                @page { size: A4 portrait; margin: 0.5in; }
                .schedule-stack { page: landscape; }
                @page landscape { size: A4 landscape; margin: 0.5in; }
              }
            </style>
          </head>
          <body>
            <h1>Full Moon Party Volunteer Schedule - ${fmpDate}</h1>
            <h2>${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} View</h2>
            ${printContent}
            <div style="margin-top: 30px; text-align: center; font-size: 9px; color: #666;">
              Generated on ${new Date().toLocaleString()}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 1500);
    } catch (e) { alert("Print failed: " + e.message); }
  }

  function handleDownloadAsPNG(targetTab) {
    try {
      const element = document.getElementById(targetTab || activeTab);
      if (!element) return alert('No content found to download');

      const loadingMsg = document.createElement('div');
      loadingMsg.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #ff4fa3;border-radius:8px;z-index:9999;font-family:Arial,sans-serif;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
      loadingMsg.innerHTML = `<div>Generating PNG...</div><div style="font-size: 12px; color: #666; margin-top: 5px;">Please wait...</div>`;
      document.body.appendChild(loadingMsg);

      const stripSpecialistText = (clonedDoc) => {
        const replacements = [];
        for (const s of staff) {
          const parsed = parseStaffName(s);
          if (parsed.isSpecialist) replacements.push({ from: s, to: parsed.displayName });
        }
        if (replacements.length === 0) return;
        const staffNameElements = clonedDoc.querySelectorAll('.staff-name');
        staffNameElements.forEach(el => {
          let text = el.textContent;
          for (const r of replacements) if (text === r.from) el.textContent = r.to;
        });
        const allElements = clonedDoc.querySelectorAll('.head, .person-card h3, .day-title, td, th, div, span');
        allElements.forEach(el => {
          if (el.children.length === 0) {
            let text = el.textContent;
            let changed = false;
            for (const r of replacements) {
              if (text.includes(r.from)) { text = text.split(r.from).join(r.to); changed = true; }
            }
            if (changed) el.textContent = text;
          }
        });
      };

      if (targetTab === 'schedule' || (activeTab === 'schedule' && !targetTab)) {
        handleScheduleDayExports(element, loadingMsg, stripSpecialistText);
        return;
      }

      window.html2canvas(element, { useCORS: true, allowTaint: true, scale: 1.2, backgroundColor: '#ffffff', logging: false, width: element.scrollWidth, height: element.scrollHeight, onclone: stripSpecialistText })
      .then(canvas => {
        try {
          const imgData = canvas.toDataURL('image/png');
          const fileName = `volunteer-schedule-${targetTab || activeTab}-${fmpDate}.png`;
          const newWindow = window.open('', '_blank', 'width=1000,height=800');
          newWindow.document.write(`
            <html><head><title>${fileName}</title></head><body style="margin:0;padding:20px;text-align:center;">
              <h2>📥 Save Your Schedule Image</h2>
              <img src="${imgData}" style="max-width:100%; border:1px solid #ccc;" />
            </body></html>
          `);
          newWindow.document.close();
          document.body.removeChild(loadingMsg);
        } catch (err) {
          document.body.removeChild(loadingMsg);
          alert('Error creating image.');
        }
      });
    } catch (e) { alert("PNG export failed: " + e.message); }
  }

  function handleScheduleDayExports(scheduleElement, loadingMsg, stripSpecialistText) {
    const dayBlocks = scheduleElement.querySelectorAll('.day-block');
    if (dayBlocks.length === 0) { document.body.removeChild(loadingMsg); return alert("No day blocks found"); }
    
    let exportCount = 0;
    const totalDays = dayBlocks.length;
    const popupWindows = [];
    Array.from(dayBlocks).forEach((dayBlock, index) => {
      const newWindow = window.open('', `day_${index}`, 'width=900,height=700');
      if (newWindow) { newWindow.document.write(`<html><body><h3>Generating...</h3></body></html>`); newWindow.document.close(); popupWindows[index] = newWindow; }
    });
    
    dayBlocks.forEach((dayBlock, index) => {
      setTimeout(() => {
        window.html2canvas(dayBlock, { useCORS: true, allowTaint: true, scale: 4, backgroundColor: '#ffffff', logging: false, width: dayBlock.scrollWidth, height: dayBlock.scrollHeight, onclone: stripSpecialistText })
        .then(canvas => {
          const imgData = canvas.toDataURL('image/png');
          const fileName = `schedule-Day${index + 1}-${fmpDate}.png`;
          const targetWindow = popupWindows[index];
          if (targetWindow && !targetWindow.closed) {
            targetWindow.document.open();
            targetWindow.document.write(`<html><body style="text-align:center;"><img src="${imgData}" style="max-width:100%;" /></body></html>`);
            targetWindow.document.close();
          }
          exportCount++;
          if (exportCount === totalDays) { document.body.removeChild(loadingMsg); alert('Success! Saved multiple tabs.'); }
        }).catch(() => { exportCount++; if(exportCount === totalDays) document.body.removeChild(loadingMsg); });
      }, index * 500);
    });
  }

  function handleMultiCardExport(tabType) {
    try {
      const containerElement = document.getElementById(tabType);
      if (!containerElement) return alert('No content found to export');
      const cards = containerElement.querySelectorAll(tabType === 'people' ? '.person-card' : '.person-list');
      if (cards.length === 0) return alert('No cards found');

      const loadingMsg = document.createElement('div');
      loadingMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:2px solid #ff4fa3;border-radius:8px;z-index:9999;';
      loadingMsg.textContent = 'Creating grids...';
      document.body.appendChild(loadingMsg);

      const cardsPerPage = tabType === 'people' ? 12 : 15;
      const gridCols = tabType === 'people' ? 4 : 5;
      const gridRows = 3;
      const cardWidth = tabType === 'people' ? 330 : 250;
      const cardHeight = tabType === 'people' ? 590 : 550;
      const gridWidth = (cardWidth * gridCols) + (gridCols * 10);
      const gridHeight = (cardHeight * gridRows) + (gridRows * 10);
      
      const pageGroups = [];
      for (let i = 0; i < cards.length; i += cardsPerPage) pageGroups.push(Array.from(cards).slice(i, i + cardsPerPage));

      const popupWindows = [];
      pageGroups.forEach((_, pageIndex) => {
        const newWindow = window.open('', `${tabType}_grid_${pageIndex}`, 'width=1200,height=900');
        if (newWindow) { newWindow.document.write(`<html><body><h3>Loading...</h3></body></html>`); newWindow.document.close(); popupWindows[pageIndex] = newWindow; }
      });

      let exportCount = 0;
      pageGroups.forEach((cardGroup, pageIndex) => {
        setTimeout(() => {
          const pageContainer = document.createElement('div');
          pageContainer.style.cssText = `display:grid; grid-template-columns:repeat(${gridCols}, ${cardWidth}px); grid-template-rows:repeat(${gridRows}, ${cardHeight}px); gap:10px; padding:20px; background:white; width:${gridWidth + 40}px; height:${gridHeight + 40}px; box-sizing:border-box;`;
          cardGroup.forEach((card) => {
            const clonedCard = card.cloneNode(true);
            clonedCard.style.cssText = `border:2px solid #000; background:white; overflow:hidden; display:flex; flex-direction:column; width:${cardWidth}px; height:${cardHeight}px; box-sizing:border-box;`;
            pageContainer.appendChild(clonedCard);
          });
          while (pageContainer.children.length < cardsPerPage) {
            const placeholder = document.createElement('div');
            placeholder.style.cssText = `border:1px dashed #ccc; background:#f9f9f9; display:flex; align-items:center; justify-content:center; color:#999; font-size:12px; width:${cardWidth}px; height:${cardHeight}px;`;
            placeholder.textContent = '(empty)';
            pageContainer.appendChild(placeholder);
          }
          pageContainer.style.position = 'absolute'; pageContainer.style.left = '-9999px';
          document.body.appendChild(pageContainer);
          
          window.html2canvas(pageContainer, { useCORS: true, allowTaint: true, scale: 4, backgroundColor: '#ffffff', logging: false, width: gridWidth + 40, height: gridHeight + 40 })
          .then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const targetWindow = popupWindows[pageIndex];
            if (targetWindow && !targetWindow.closed) {
              targetWindow.document.open();
              targetWindow.document.write(`<html><body style="text-align:center;"><img src="${imgData}" style="max-width:100%;" /></body></html>`);
              targetWindow.document.close();
            }
            document.body.removeChild(pageContainer);
            exportCount++;
            if (exportCount === pageGroups.length) document.body.removeChild(loadingMsg);
          }).catch(() => {
            if (pageContainer.parentNode) document.body.removeChild(pageContainer);
            exportCount++;
            if (exportCount === pageGroups.length) document.body.removeChild(loadingMsg);
          });
        }, pageIndex * 500);
      });
    } catch (e) { alert("Grid export failed: " + e.message); }
  }

  function dayHeader(label) {
    if (!fmpDate) return label;
    if (dualFullMoonMode) {
      const dualMoonOffsets = { "FMP-2": -2, "FMP-1": -1, "FMP": 0, "FMP+1": 1, "FMP+2": 2, "FMP2": 3, "FMP2+1": 4, "FMP2+2": 5 };
      const offset = dualMoonOffsets[label] || 0;
      const iso = addDaysISO(fmpDate, offset);
      const parts = fmtDateISO(iso).split(" ");
      return `${parts[0]} ${parts[1]} (${label})`;
    }
    const offset = ORDERED_LABELS.indexOf(label) - ORDERED_LABELS.indexOf("FMP");
    const iso = addDaysISO(fmpDate, offset);
    const parts = fmtDateISO(iso).split(" ");
    return `${parts[0]} ${parts[1]} (${label})`;
  }

  const visibleDays = useMemo(() => {
    if (dualFullMoonMode) return ["FMP-2", "FMP-1", "FMP", "FMP+1", "FMP+2", "FMP2", "FMP2+1", "FMP2+2"];
    const base = ["FMP-2", "FMP-1", "FMP", "FMP+1", "FMP+2"];
    if (includeMinus3) base.unshift("FMP-3");
    if (includePlus3) base.push("FMP+3");
    return base;
  }, [includeMinus3, includePlus3, dualFullMoonMode]);

  function onPushUndo(prevState) { pushUndo(prevState); }

  function smartFixAuto() {
    if (!result) return;
    pushUndo(result);
    const out = deepClone(result);
    const conflicts = detectConflicts(out);
    for (const msg of conflicts.list) {
      if (msg.startsWith("Double-booked:")) {
        const m = msg.match(/^Double-booked: ([^\s]+) on ([^\s]+) at ([^\s]+) /);
        if (!m) continue;
        const name = m[1], day = m[2], hourLabel = m[3];
        const hourIdx = HOUR_INDEX[hourLabel];
        if (hourIdx === undefined) continue;
        const personShifts = out.shifts.filter((s) => s.day === day && s.assigned.includes(name) && s.startIdx <= hourIdx && s.startIdx + s.span > hourIdx);
        if (personShifts.length > 1) {
          personShifts.sort((a, b) => {
            const pa = PRIORITY.indexOf(a.task), pb = PRIORITY.indexOf(b.task);
            if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
            if (a.startIdx !== b.startIdx) return b.startIdx - a.startIdx;
            return b.span - a.span;
          });
          const shiftToRemove = personShifts[0];
          shiftToRemove.assigned = shiftToRemove.assigned.filter((n) => n !== name);
        }
      }
    }
    setResult(recomputeSummaries(out));
  }

  function smartFixRebalance() {
    if (!staff.length) return;
    pushUndo(result);
    setResult(generateAssignments(staff, includeMinus3, includePlus3, dualFullMoonMode, enabledTasks));
  }

  return (
    <div className="app-wrap">
      <h1>Full Moon Party Volunteer Staff Scheduler</h1>

      <div className="controls">
        <div className="row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label>FMP date: <input type="date" value={fmpDate} onChange={(e) => setFmpDate(e.target.value)} /></label>
          <label className="tablike"><input type="checkbox" checked={dualFullMoonMode} onChange={(e) => setDualFullMoonMode(e.target.checked)} /> 🌕🌕 Dual Full Moon (Dec 31 & Jan 3)</label>
          {!dualFullMoonMode && (
            <React.Fragment>
              <label className="tablike"><input type="checkbox" checked={includeMinus3} onChange={(e) => setIncludeMinus3(e.target.checked)} /> Include FMP-3</label>
              <label className="tablike"><input type="checkbox" checked={includePlus3} onChange={(e) => setIncludePlus3(e.target.checked)} /> Include FMP+3</label>
            </React.Fragment>
          )}
          <button onClick={() => setIsStaffListCollapsed(!isStaffListCollapsed)} className="btn small secondary" style={{ marginLeft: 'auto' }}>
            {isStaffListCollapsed ? 'Show Staff' : 'Hide Staff'}
          </button>
        </div>

        <div className="collapsible-content" style={{ display: isStaffListCollapsed ? 'none' : 'flex', flexDirection: 'column' }}>
          <div className="row" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontWeight: 700, marginRight: 8 }}>Tasks to Assign:</label>
            {Object.keys(enabledTasks).map(task => (
              <label key={task} className="tablike" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={enabledTasks[task]} onChange={(e) => setEnabledTasks({...enabledTasks, [task]: e.target.checked})} /> {task}
              </label>
            ))}
          </div>
          
          <div className="row" style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingTop: 8 }}>
            <div className="staff-input">
              <label>Staff (one per line):</label>
              <textarea rows={12} value={staffInput} onChange={(e) => setStaffInput(e.target.value)} />
              <div style={{ fontSize: 11, color: "#666", marginTop: 4, lineHeight: 1.3 }}>💡 Specialist format: Name: Task %</div>
            </div>
            <div className="actions">
              <button className="btn" onClick={handleGenerate}>Generate Schedule</button>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                <button className="btn small" onClick={handleSaveFirebase}>Save to Cloud (Active)</button>
                <button className="btn small" onClick={handleClearFirebase}>Clear Cloud Active</button>
                <button className="btn small" onClick={() => setShowSaveModal(true)}>⭐ Save Final Version</button>
                <button className="btn small" onClick={() => setShowSavedSchedulesModal(true)}>📚 Saved Schedules ({savedSchedules.length})</button>
                <button className="btn small" onClick={() => setShowHistoryModal(true)}>📜 History ({scheduleHistory.length})</button>
                <button className="btn small" onClick={handleExportSchedule}>💾 Export File</button>
                <label className="btn small" style={{ cursor: 'pointer', textAlign: 'center' }}>
                  📂 Import File <input type="file" accept=".json" onChange={handleImportSchedule} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tabbar-wrap">
        <div className="tabs">
          <div className={`tab ${activeTab === "schedule" ? "active" : ""}`} onClick={() => setActiveTab("schedule")}>Schedule</div>
          <div className={`tab ${activeTab === "people" ? "active" : ""}`} onClick={() => setActiveTab("people")}>Individual Cards</div>
          <div className={`tab ${activeTab === "list" ? "active" : ""}`} onClick={() => setActiveTab("list")}>Individual List</div>
          <div className={`tab ${activeTab === "summaries" ? "active" : ""}`} onClick={() => setActiveTab("summaries")}>Summaries</div>
          {result && (<button className="btn small" onClick={() => setShowSwapAssistant(true)} style={{ marginLeft: 'auto' }}>🔄 Smart Swap</button>)}
        </div>
        <div className="undo-redo">
          <button className="btn inline" onClick={undo}>Undo</button>
          <button className="btn inline" onClick={redo}>Redo</button>
        </div>
      </div>
      
      {result && (
        <div className="print-actions">
          <button onClick={handlePrint} className="btn small">Print Current Tab</button>
          {activeTab === 'schedule' && (<button onClick={() => handleDownloadAsPNG(activeTab)} className="btn small">Export Days as PNGs</button>)}
          {(activeTab === 'people' || activeTab === 'list') && (<button onClick={() => handleMultiCardExport(activeTab)} className="btn small">{activeTab === 'people' ? 'Export 12-Per-Page PNGs (4×3)' : 'Export 15-Per-Page PNGs (5×3)'}</button>)}
        </div>
      )}

      {!result && (<div className="hint">Paste staff list and click "Generate Schedule". Data syncs to the Cloud via Firebase automatically.</div>)}

      <div id="app-content-to-print">
        {result && activeTab === "schedule" && (
          <div id="schedule">
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Conflict key:</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 16, height: 10, background: "var(--conf-red)" }}></div> Double-booked</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 16, height: 10, background: "var(--conf-orange)" }}></div> Back-to-back same task</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 16, height: 10, background: "var(--conf-purple)" }}></div> &gt;9 hrs/day</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 16, height: 10, background: "var(--conf-blue)" }}></div> Uneven task distribution</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><div style={{ width: 16, height: 10, background: "var(--conf-deepred)" }}></div> +3 hrs above weekly avg</div>
                <div style={{ marginLeft: 12, display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ fontWeight: 700 }}>Smart Fixes:</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn small" onClick={smartFixAuto}>A) Auto attempt (safe)</button>
                    <button className="btn small" onClick={smartFixRebalance}>B) Rebalance (regenerate)</button>
                  </div>
                </div>
                {Object.keys(highlightedNames).length > 0 && (
                  <div style={{ marginLeft: 12 }}>
                    <button className="btn small" onClick={clearAllHighlights} style={{ background: '#6b7280', borderColor: '#6b7280' }}>Clear {Object.keys(highlightedNames).length} Highlights</button>
                  </div>
                )}
              </div>
            </div>

            <ScheduleTables byDay={result.byDay} activeDays={result.activeDays} dayHeader={dayHeader} staff={staff} result={result} setResult={setResult} onPushUndo={onPushUndo} conflictsInfo={conflictsInfo} dismissedConflicts={dismissedConflicts} onRenameAndRefreshStaff={renameAndRefreshStaff} highlightedNames={highlightedNames} highlightColors={highlightColors} onToggleHighlight={toggleNameHighlight} onShowStaffInfo={showStaffInfo} />
          </div>
        )}

        {result && activeTab === "people" && (
          <div id="people"><PeopleCards staff={staff} shifts={result.shifts} activeDays={result.activeDays} dayHeader={dayHeader} fmpDate={fmpDate} /></div>
        )}

        {result && activeTab === "list" && (
          <div id="list"><PeopleListCompact staff={staff} shifts={result.shifts} activeDays={visibleDays} dayHeader={dayHeader} fmpDate={fmpDate} /></div>
        )}

        {result && activeTab === "summaries" && (
          <div id="summaries"><Summaries staff={staff} weeklyTotals={result.weeklyTotals} byTaskTotals={result.byTaskTotals} byDayTotals={result.byDayTotals} activeDays={result.activeDays} dayHeader={dayHeader} /></div>
        )}

        {result && conflictsInfo.list && conflictsInfo.list.length > 0 && (
          <div className="conflict-wrap" style={{ marginTop: 18 }}>
            <strong>Warnings</strong>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Click X to dismiss warnings you've accepted</div>
            {conflictsInfo.list.filter(c => !dismissedConflicts.includes(c)).map((c, i) => (
              <div key={i} className="conflict" style={{ padding: 6, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, border: 'none', backgroundColor: '#f9fafb' }}>
                <button onClick={() => dismissConflict(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, color: '#dc2626', flexShrink: 0, fontWeight: 'bold', width: 20, height: 20 }} title="Dismiss this warning">✕</button>
                <span style={{ flex: 1 }}>{c}</span>
              </div>
            ))}
            {dismissedConflicts.length > 0 && (
              <button className="btn small secondary" onClick={clearDismissedConflicts} style={{ marginTop: 8 }}>Show {dismissedConflicts.length} Dismissed</button>
            )}
          </div>
        )}

        {/* MODALS */}
        {showSaveModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', padding: 24, borderRadius: 8, maxWidth: 400, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              <h2 style={{ marginTop: 0 }}>⭐ Save Final Version</h2>
              <p style={{ color: '#666', fontSize: 14, marginBottom: 16 }}>Save this schedule permanently with a custom name to the Firebase Cloud.</p>
              <input type="text" placeholder="Enter schedule name..." value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4, marginBottom: 16, fontSize: 14 }} onKeyPress={(e) => { if (e.key === 'Enter') handleSaveFinalVersion(); }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn secondary" onClick={() => setShowSaveModal(false)}>Cancel</button>
                <button className="btn" onClick={handleSaveFinalVersion} disabled={!scheduleName.trim()}>Save Schedule</button>
              </div>
            </div>
          </div>
        )}

        {showSavedSchedulesModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', padding: 24, borderRadius: 8, maxWidth: 800, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              <h2 style={{ marginTop: 0 }}>📚 Saved Schedules</h2>
              <p style={{ color: '#666', fontSize: 14 }}>{savedSchedules.length} permanently saved schedule{savedSchedules.length !== 1 ? 's' : ''}</p>
              {savedSchedules.length === 0 && (<p style={{ color: '#999', fontStyle: 'italic' }}>No saved schedules yet. Use "Save Final Version" to save a schedule permanently.</p>)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {savedSchedules.map((schedule, idx) => {
                  const date = new Date(schedule.timestamp);
                  return (
                    <div key={idx} style={{ padding: 12, border: '2px solid #ddd', borderRadius: 4, backgroundColor: '#fffbeb' }}>
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>⭐ {schedule.name}</div>
                      <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>Saved: {date.toLocaleString()} • {schedule.staff.length} staff • {schedule.date}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn small" onClick={() => handleLoadSavedSchedule(schedule)}>Load</button>
                        <button className="btn small secondary" onClick={() => handleDeleteSavedSchedule(idx)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setShowSavedSchedulesModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {showHistoryModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', padding: 24, borderRadius: 8, maxWidth: 800, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              <h2 style={{ marginTop: 0 }}>📜 Schedule History (Cloud Autosaves)</h2>
              <p style={{ color: '#666', fontSize: 14 }}>{scheduleHistory.length} version{scheduleHistory.length !== 1 ? 's' : ''} saved to Firebase</p>
              {scheduleHistory.length === 0 && (<p style={{ color: '#999', fontStyle: 'italic' }}>No history yet. Schedules auto-save to the cloud every 30 seconds.</p>)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {scheduleHistory.map((snapshot, idx) => {
                  const date = new Date(snapshot.timestamp);
                  const timeAgo = Math.floor((Date.now() - date.getTime()) / 60000);
                  const timeStr = timeAgo < 60 ? `${timeAgo}m ago` : timeAgo < 1440 ? `${Math.floor(timeAgo/60)}h ago` : `${Math.floor(timeAgo/1440)}d ago`;
                  return (
                    <div key={idx} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: idx === 0 ? '#f0f9ff' : 'white' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{date.toLocaleString()} ({timeStr})</div>
                        <div style={{ fontSize: 13, color: '#666' }}>{snapshot.staff.length} staff • {snapshot.date}</div>
                      </div>
                      <button className="btn small" onClick={() => handleRestoreFromHistory(snapshot)}>Restore</button>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn small secondary" onClick={() => {
                    if (confirm('Clear all cloud history? This cannot be undone.')) {
                      setScheduleHistory([]);
                      setDoc(doc(db, "schedules", "history"), { list: [] }).catch(e => console.error(e));
                    }
                  }}>Clear History</button>
                <button className="btn" onClick={() => setShowHistoryModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {showStaffPanel && selectedStaff && result && result.weeklyTotals && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowStaffPanel(false)}>
            <div style={{ backgroundColor: 'white', padding: 24, borderRadius: 8, maxWidth: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
              <h2 style={{ marginTop: 0 }}>📊 {selectedStaff}</h2>
              {(() => {
                const personHours = result.weeklyTotals[selectedStaff] || 0;
                const allHours = Object.values(result.weeklyTotals || {});
                const avgHours = allHours.length > 0 ? allHours.reduce((a, b) => a + b, 0) / allHours.length : 0;
                const maxHours = allHours.length > 0 ? Math.max(...allHours) : 0;
                const minHours = allHours.length > 0 ? Math.min(...allHours) : 0;
                const personTasks = result.byTaskTotals?.[selectedStaff] || {};
                const personDailyHours = {};
                for (const day of (result.activeDays || [])) personDailyHours[day] = result.byDayTotals?.[selectedStaff]?.[day] || 0;
                
                return (
                  <React.Fragment>
                    <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f0f9ff', borderRadius: 4 }}>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{personHours} hours total</div>
                      <div style={{ fontSize: 14, color: '#666' }}>Average: {avgHours.toFixed(1)}h | Range: {minHours}-{maxHours}h</div>
                    </div>
                    <h3 style={{ fontSize: 16, marginTop: 16, marginBottom: 8 }}>Task Breakdown</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(personTasks).sort((a, b) => b[1] - a[1]).map(([task, hours]) => (
                        <div key={task} style={{ display: 'flex', justifyContent: 'space-between', padding: 6, backgroundColor: '#f9fafb', borderRadius: 3 }}>
                          <span>{task}</span><span style={{ fontWeight: 600 }}>{hours}h</span>
                        </div>
                      ))}
                    </div>
                  </React.Fragment>
                );
              })()}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className="btn" onClick={() => setShowStaffPanel(false)}>Close</button></div>
            </div>
          </div>
        )}

        {showSwapAssistant && result && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: 'white', padding: 24, borderRadius: 8, maxWidth: 700, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
              <h2 style={{ marginTop: 0 }}>🔄 Smart Swap Assistant</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className={`btn small ${swapMode === 'hours' ? '' : 'secondary'}`} onClick={() => setSwapMode('hours')}>Hour Balancer</button>
                <button className={`btn small ${swapMode === 'tasks' ? '' : 'secondary'}`} onClick={() => setSwapMode('tasks')}>Task Balancer</button>
              </div>
              
              {swapMode === 'hours' ? (
                <div>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>Balance Hours</h3>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Who needs LESS hours?</label>
                    <select multiple size={5} value={swapConfig.reduceHours} onChange={(e) => setSwapConfig({...swapConfig, reduceHours: Array.from(e.target.selectedOptions, option => option.value)})} style={{ width: '100%', padding: 6 }}>
                      {staff.map(s => (<option key={s} value={s}>{s} ({result.weeklyTotals?.[s] || 0}h)</option>))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Who needs MORE hours?</label>
                    <select multiple size={5} value={swapConfig.increaseHours} onChange={(e) => setSwapConfig({...swapConfig, increaseHours: Array.from(e.target.selectedOptions, option => option.value)})} style={{ width: '100%', padding: 6 }}>
                      {staff.map(s => (<option key={s} value={s}>{s} ({result.weeklyTotals?.[s] || 0}h)</option>))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>Balance Tasks</h3>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Which task needs balancing?</label>
                    <select value={swapConfig.task || ''} onChange={(e) => setSwapConfig({...swapConfig, task: e.target.value, person: null, replacements: []})} style={{ width: '100%', padding: 8 }}>
                      <option value="">Select task...</option>
                      {Object.keys(LIMITS).map(t => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </div>
                  {swapConfig.task && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Who has too much {swapConfig.task}?</label>
                      <select value={swapConfig.person || ''} onChange={(e) => setSwapConfig({...swapConfig, person: e.target.value, replacements: []})} style={{ width: '100%', padding: 8 }}>
                        <option value="">Select person...</option>
                        {staff.map(s => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    </div>
                  )}
                  {swapConfig.person && swapConfig.task && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Who could take some {swapConfig.task} shifts?</label>
                      <select multiple size={5} value={swapConfig.replacements} onChange={(e) => setSwapConfig({...swapConfig, replacements: Array.from(e.target.selectedOptions, option => option.value)})} style={{ width: '100%', padding: 6 }}>
                        {staff.filter(s => s !== swapConfig.person).map(s => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button className="btn secondary" onClick={() => { setShowSwapAssistant(false); setSwapConfig({ reduceHours: [], increaseHours: [], person: null, task: null, replacements: [] }); }}>Close</button>
                <button className="btn" disabled={(swapMode === 'hours' && (swapConfig.reduceHours.length === 0 || swapConfig.increaseHours.length === 0)) || (swapMode === 'tasks' && (!swapConfig.person || !swapConfig.task || swapConfig.replacements.length === 0))} onClick={() => swapMode === 'hours' ? handleFindBestHourSwap() : handleFindBestTaskSwap()}>Find Best Swaps</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
