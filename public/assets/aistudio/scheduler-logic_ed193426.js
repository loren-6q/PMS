/* =========================================================
   CORE SCHEDULING ALGORITHMS & LOGIC
   This file contains pure JavaScript. No React needed.
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
