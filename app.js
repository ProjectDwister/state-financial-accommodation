const CONFIG = {
  sheetId: "13j4zLWkBqNhceu3ytC4gQ_E1-5Sp27p0Q5s6r1UVix0",
  firstMonth: { year: 2017, month: 9 },
  extraFutureMonths: 3,
  extraFutureFys: 1,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = {
  jan: "Jan", january: "Jan", feb: "Feb", february: "Feb", mar: "Mar", march: "Mar", apr: "Apr", april: "Apr",
  may: "May", jun: "Jun", june: "Jun", jul: "Jul", july: "Jul", aug: "Aug", august: "Aug",
  sep: "Sep", sept: "Sep", september: "Sep", oct: "Oct", october: "Oct", nov: "Nov", november: "Nov", dec: "Dec", december: "Dec",
};

const VALID_STATES = new Set([
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman & Nicobar Islands", "Chandigarh",
  "Dadra & Nagar Haveli and Daman & Diu", "Delhi", "Jammu & Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
  "Dadra & Nagar Haveli", "Daman & Diu",
]);

const STATE_ALIASES = new Map(Object.entries({
  "Orissa": "Odisha",
  "NCT of Delhi": "Delhi",
  "Delhi NCT": "Delhi",
  "National Capital Territory of Delhi": "Delhi",
  "Jammu and Kashmir": "Jammu & Kashmir",
  "J&K": "Jammu & Kashmir",
  "Andaman and Nicobar Islands": "Andaman & Nicobar Islands",
  "A & N Islands": "Andaman & Nicobar Islands",
  "A&N Islands": "Andaman & Nicobar Islands",
  "Dadra and Nagar Haveli and Daman and Diu": "Dadra & Nagar Haveli and Daman & Diu",
  "Dadra & Nagar Haveli And Daman & Diu": "Dadra & Nagar Haveli and Daman & Diu",
  "Dadra and Nagar Haveli": "Dadra & Nagar Haveli",
  "Daman and Diu": "Daman & Diu",
  "Pondicherry": "Puducherry",
}));

const INVALID_LABELS = new Set(["", "nan", "none", "state / ut", "state/ut", "state", "states", "total", "grand total", "all india", "all states", "subtotal", "sub total"]);
const state = { fact: [], rankings: [], loadedSheets: [], loading: false };

function normalizeStateName(value) {
  let s = String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return STATE_ALIASES.get(s) || s;
}

function cleanNum(value) {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function financialYearForMonth(month, year) {
  return month >= 4 ? `FY${year}-${String(year + 1).slice(-2)}` : `FY${year - 1}-${String(year).slice(-2)}`;
}

function monthSortDate(period) {
  const m = period.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})$/i);
  if (!m) return null;
  return new Date(Number(m[2]), MONTHS.indexOf(cap3(m[1])), 1).getTime();
}

function fySortDate(period) {
  const m = period.match(/^FY(\d{4})-(\d{2})$/i);
  if (!m) return null;
  return new Date(Number(m[1]), 3, 1).getTime();
}

function cap3(s) { return s.slice(0, 3).charAt(0).toUpperCase() + s.slice(1, 3).toLowerCase(); }
function fmtNum(x) { return Number(x || 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(Number(x)) ? 0 : 2 }); }
function metricLabel(metric) { return { sdf: "SDF", wma: "WMA", od: "Overdraft", total: "Total" }[metric] || metric.toUpperCase(); }

function sheetRowsFromGviz(table) {
  if (!table || !table.rows) return [];
  return table.rows.map(row => (row.c || []).map(cell => cell ? (cell.v ?? cell.f ?? "") : ""));
}

function jsonpSheet(sheetName) {
  const callback = `__gviz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=responseHandler:${callback}&sheet=${encodeURIComponent(sheetName)}&tq=${encodeURIComponent("select *")}`;
  return new Promise(resolve => {
    const script = document.createElement("script");
    let done = false;
    const cleanup = () => {
      delete window[callback];
      script.remove();
    };
    window[callback] = response => {
      done = true;
      cleanup();
      if (response && response.status === "ok") resolve({ sheetName, rows: sheetRowsFromGviz(response.table), ok: true });
      else resolve({ sheetName, rows: [], ok: false });
    };
    script.onerror = () => {
      if (!done) {
        cleanup();
        resolve({ sheetName, rows: [], ok: false });
      }
    };
    script.src = url;
    document.head.appendChild(script);
    setTimeout(() => {
      if (!done) {
        cleanup();
        resolve({ sheetName, rows: [], ok: false });
      }
    }, 12000);
  });
}

function candidateMonthlyTabs() {
  const out = [];
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + CONFIG.extraFutureMonths, 1);
  let d = new Date(CONFIG.firstMonth.year, CONFIG.firstMonth.month - 1, 1);
  while (d <= end) {
    out.push(`${MONTHS[d.getMonth()]}-${d.getFullYear()}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function candidateFyTabs() {
  const out = [];
  const now = new Date();
  const currentFyStart = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  for (let y = 2017; y <= currentFyStart + CONFIG.extraFutureFys; y++) out.push(`FY${y}-${String(y + 1).slice(-2)}`);
  return out;
}

function parseFactSheet(sheetName, rows) {
  const monthMatch = sheetName.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})$/i);
  const fyMatch = sheetName.match(/^FY(\d{4})-(\d{2})$/i);
  if (!monthMatch && !fyMatch) return [];

  let periodType, period, sortDate, financialYear;
  if (monthMatch) {
    const mon = cap3(monthMatch[1]);
    const year = Number(monthMatch[2]);
    const monthNum = MONTHS.indexOf(mon) + 1;
    periodType = "Month";
    period = `${mon}-${year}`;
    sortDate = new Date(year, monthNum - 1, 1).getTime();
    financialYear = financialYearForMonth(monthNum, year);
  } else {
    periodType = "FY";
    period = sheetName.toUpperCase();
    sortDate = new Date(Number(fyMatch[1]), 3, 1).getTime();
    financialYear = period;
  }

  const parsed = [];
  for (const row of rows.slice(4)) {
    const st = normalizeStateName(row[0]);
    if (INVALID_LABELS.has(st.toLowerCase())) continue;
    if (!VALID_STATES.has(st)) continue;
    const sdfAvg = cleanNum(row[1]);
    const sdfDays = cleanNum(row[2]);
    const wmaAvg = cleanNum(row[3]);
    const wmaDays = cleanNum(row[4]);
    const odAvg = cleanNum(row[5]);
    const odDays = cleanNum(row[6]);
    parsed.push({
      state: st, sdf_avg: sdfAvg, sdf_days: sdfDays, wma_avg: wmaAvg, wma_days: wmaDays, od_avg: odAvg, od_days: odDays,
      total_avg: sdfAvg + wmaAvg + odAvg,
      total_days: sdfDays + wmaDays + odDays,
      period_type: periodType, period, financial_year: financialYear, sort_date: sortDate,
    });
  }
  return parsed;
}

function parseRankings(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(x => String(x || "").trim());
  const idx = name => header.indexOf(name);
  const get = (row, name) => row[idx(name)];
  const out = [];
  for (const row of rows.slice(1)) {
    const st = normalizeStateName(get(row, "State / UT"));
    const fy = String(get(row, "Financial Year") || "").trim();
    if (!fy || !VALID_STATES.has(st)) continue;
    out.push({
      financial_year: fy,
      state: st,
      rank_sdf: cleanNum(get(row, "SDF ₹Cr-days/day")),
      sdf_rank: cleanNum(get(row, "SDF Rank")),
      rank_wma: cleanNum(get(row, "WMA ₹Cr-days/day")),
      wma_rank: cleanNum(get(row, "WMA Rank")),
      rank_od: cleanNum(get(row, "OD ₹Cr-days/day")),
      od_rank: cleanNum(get(row, "OD Rank")),
      rank_total: cleanNum(get(row, "Total ₹Cr-days/day")),
      total_rank: cleanNum(get(row, "Total Rank")),
    });
  }
  return out;
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  document.getElementById("refreshBtn")?.classList.add("loading");
  setStatus("Loading live data...");
  try {
    const tabs = [...candidateMonthlyTabs(), ...candidateFyTabs(), "Rankings"];
    const results = await Promise.all(tabs.map(t => jsonpSheet(t)));
    const fact = [];
    let rankings = [];
    const loaded = [];
    for (const res of results) {
      if (!res.ok || !res.rows.length) continue;
      if (res.sheetName === "Rankings") rankings = parseRankings(res.rows);
      else {
        const rows = parseFactSheet(res.sheetName, res.rows);
        if (rows.length) {
          fact.push(...rows);
          loaded.push(res.sheetName);
        }
      }
    }
    if (!fact.length) throw new Error("No usable monthly or FY tables were found. Check source sharing and tab names.");
    state.fact = fact;
    state.rankings = rankings;
    state.loadedSheets = loaded.concat(rankings.length ? ["Rankings"] : []);
    updateMetrics();
    setStatus(`Loaded ${state.loadedSheets.length} relevant tabs. Parsed ${state.fact.length.toLocaleString("en-IN")} rows.`);
  } catch (err) {
    setStatus(`<span class="error">Could not load data: ${err.message}</span>`);
  } finally {
    state.loading = false;
    document.getElementById("refreshBtn")?.classList.remove("loading");
  }
}

function updateMetrics() {
  const months = state.fact.filter(r => r.period_type === "Month").sort((a, b) => a.sort_date - b.sort_date);
  const fys = state.fact.filter(r => r.period_type === "FY").sort((a, b) => a.sort_date - b.sort_date);
  const latestMonth = months.at(-1)?.period || "-";
  const latestFy = fys.at(-1)?.period || "-";
  const latestRows = months.filter(r => r.period === latestMonth);
  const latestStates = new Set(latestRows.map(r => r.state)).size;
  document.getElementById("latestMonth").textContent = latestMonth;
  document.getElementById("latestFy").textContent = latestFy;
  document.getElementById("stateCount").textContent = latestStates;

  const leader = latestRows.slice().sort((a, b) => b.total_avg - a.total_avg)[0];
  if (leader) {
    document.getElementById("quickInsight").textContent = `${leader.state} leads in ${latestMonth}`;
    document.getElementById("quickInsightSub").textContent = `Highest total average utilisation: ₹${fmtNum(leader.total_avg)} Cr.`;
  }
}

function setStatus(html) { document.getElementById("detailsText").innerHTML = html; }
function availableStates() { return [...new Set(state.fact.map(r => r.state))].sort(); }

function findStates(question) {
  const q = question.toLowerCase();
  const hits = [];
  const aliases = new Map(Object.entries({
    "j&k": "Jammu & Kashmir", "jammu and kashmir": "Jammu & Kashmir", "odisha": "Odisha", "orissa": "Odisha",
    "uttar pradesh": "Uttar Pradesh", "up": "Uttar Pradesh", "madhya pradesh": "Madhya Pradesh", "mp": "Madhya Pradesh",
  }));
  for (const [alias, canonical] of aliases) if (new RegExp(`\\b${escapeReg(alias)}\\b`).test(q) && VALID_STATES.has(canonical)) hits.push(canonical);
  for (const st of availableStates()) if (q.includes(st.toLowerCase())) hits.push(st);
  return [...new Set(hits)];
}

function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function canonicalFyFromEndingYear(y) { if (y < 100) y += 2000; return `FY${y - 1}-${String(y).slice(-2)}`; }
function canonicalFyFromYears(start, end) { return `FY${start}-${String(end).slice(-2)}`; }

function parsePeriod(question) {
  const q = question.toLowerCase().replace(/[,._]+/g, " ");
  let m = q.match(/\b(?:fy|financial\s+year|fin\s+year)\s*(20\d{2})\s*[-/ ]\s*(\d{2}|20\d{2})\b/);
  if (m) return { period: canonicalFyFromYears(Number(m[1]), m[2]), period_type: "FY" };
  m = q.match(/\b(?:fy|financial\s+year|fin\s+year)\s*'?(20\d{2}|\d{2})\b/);
  if (m) return { period: canonicalFyFromEndingYear(Number(m[1])), period_type: "FY" };
  m = q.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*[-/' ]\s*(20\d{2}|\d{2})\b/);
  if (m) {
    const mon = MONTH_LONG[m[1]] || MONTH_LONG[m[1].slice(0, 3)];
    let y = Number(m[2]);
    if (y < 100) y += 2000;
    return { period: `${mon}-${y}`, period_type: "Month" };
  }
  if (/\b(latest|current|recent)\b/.test(q)) {
    const months = state.fact.filter(r => r.period_type === "Month").sort((a, b) => a.sort_date - b.sort_date);
    return { period: months.at(-1)?.period || null, period_type: "Month" };
  }
  return { period: null, period_type: null };
}

function parseQuestion(question) {
  const q = question.toLowerCase();
  const { period, period_type } = parsePeriod(question);
  let metric = "total";
  if (/\boverdraft\b|\bod\b/.test(q)) metric = "od";
  else if (/\bwma\b|ways|means/.test(q)) metric = "wma";
  else if (/\bsdf\b|special drawing/.test(q)) metric = "sdf";
  const valueKind = q.includes("day") && !q.includes("cr-days") ? "days" : "avg";
  let topN = 10;
  const n = q.match(/\btop\s+(\d+)\b|\bfirst\s+(\d+)\b/);
  if (n) topN = Math.min(Math.max(Number(n[1] || n[2]), 1), 30);
  return {
    states: findStates(question), period, period_type, metric, value_col: `${metric}_${valueKind}`, top_n: topN,
    direction: /lowest|least|bottom/.test(q) ? "bottom" : "top",
    wants_trend: /trend|history|over time|month wise|monthly|yearly|annual|year wise|year-wise/.test(q),
    wants_compare: /compare|versus| vs /.test(q),
    wants_rank: /rank|ranking/.test(q),
    wants_concept: /what does|meaning|interpret|signify|indicate/.test(q),
    wants_yearly: /yearly|annual|year wise|year-wise|fy trend|financial year trend/.test(q),
    across_time: !period && /all time|all-time|across all|all available|overall|historically|history|all periods|all time frames|all timeframes/.test(q),
  };
}

function publishedMonthRangeText() {
  const months = state.fact.filter(r => r.period_type === "Month").sort((a, b) => a.sort_date - b.sort_date);
  if (!months.length) return "No monthly RBI data is available.";
  const fmt = ts => new Date(ts).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return `${fmt(months[0].sort_date)} to ${fmt(months.at(-1).sort_date)}`;
}

function unavailablePeriodMessage(parsed) {
  const range = publishedMonthRangeText();
  if (parsed.period) return `RBI has not published data for ${parsed.period} in this dataset. As per the available RBI data, the monthly period is ${range}.`;
  return `RBI has not published data for the requested period in this dataset. Available RBI monthly data period is ${range}.`;
}

function conceptualAnswer() {
  return "High utilisation should be read in layers. SDF indicates use of the Standing Deposit Facility; WMA is a stronger signal of temporary cash mismatch; Overdraft is the strongest stress signal because it means the state has gone beyond normal WMA limits.";
}

function answerQuestion(question) {
  const p = parseQuestion(question);
  const q = question.toLowerCase();
  if (p.wants_concept && /sdf|wma|overdraft|od|utilisation|utilization/.test(q)) return { text: conceptualAnswer() };

  let df = state.fact.slice();
  if (p.period) df = df.filter(r => r.period.toLowerCase() === p.period.toLowerCase());
  if (p.period && !df.length) return { text: unavailablePeriodMessage(p) };
  if (p.states.length) df = df.filter(r => p.states.includes(r.state));

  if (p.wants_trend && p.states.length) {
    const type = p.wants_yearly ? "FY" : "Month";
    let trend = state.fact.filter(r => r.period_type === type && p.states.includes(r.state)).sort((a, b) => a.sort_date - b.sort_date);
    if (!trend.length) return { text: p.wants_yearly ? "I could not find yearly trend data for that state." : "I could not find monthly trend data for that state." };
    if (type === "Month") trend = trend.slice(-24);
    const cols = ["period", "state", `${p.metric}_avg`, `${p.metric}_days`];
    return { text: type === "FY" ? `Yearly ${metricLabel(p.metric)} trend for ${p.states.join(", ")}:` : `Monthly ${metricLabel(p.metric)} trend for ${p.states.join(", ")}. Showing the last 24 available observations.`, table: buildTable(trend, cols) };
  }

  if ((p.wants_compare || p.states.length > 1) && p.states.length) {
    if (!df.length) return { text: "I could not find data for that state/period combination." };
    if (!p.period) {
      const latest = latestMonthPeriod();
      df = df.filter(r => r.period === latest);
    }
    return { text: "Here is the comparison:", table: buildTable(df.sort((a, b) => b.total_avg - a.total_avg), ["period", "state", "sdf_avg", "sdf_days", "wma_avg", "wma_days", "od_avg", "od_days", "total_avg"]) };
  }

  if (p.wants_rank) {
    if (p.period && p.period.startsWith("FY") && state.rankings.length) {
      let r = state.rankings.filter(x => x.financial_year.toUpperCase() === p.period.toUpperCase());
      if (p.states.length) r = r.filter(x => p.states.includes(x.state));
      if (!r.length) return { text: `I could not find rankings for ${p.period}.` };
      const rankCol = p.metric === "total" ? "total_rank" : `${p.metric}_rank`;
      const valueCol = `rank_${p.metric}`;
      r = r.sort((a, b) => cleanNum(a[rankCol]) - cleanNum(b[rankCol])).slice(0, p.top_n);
      return { text: `Top ${p.top_n} by ${metricLabel(p.metric)} for ${p.period}:`, table: buildTable(r, ["financial_year", "state", valueCol, rankCol]) };
    }
    if (!df.length) {
      const latest = latestMonthPeriod();
      df = state.fact.filter(r => r.period === latest);
    }
    const ranked = df.sort((a, b) => b[p.value_col] - a[p.value_col]).slice(0, p.top_n).map((r, i) => ({ ...r, rank: i + 1 }));
    return { text: `Computed ranking by ${metricLabel(p.metric)}:`, table: buildTable(ranked, ["period", "state", p.value_col, "rank"]) };
  }

  if (p.states.length && df.length === 1) return { text: rowSummary(df[0]) };
  if (p.states.length && df.length) return { text: "I found these matching records:", table: buildTable(df.sort((a, b) => a.sort_date - b.sort_date).slice(-20), ["period", "state", "sdf_avg", "sdf_days", "wma_avg", "wma_days", "od_avg", "od_days", "total_avg"]) };

  const asc = p.direction === "bottom";
  const dirWord = asc ? "lowest" : "highest";
  if (p.across_time) {
    const grouped = aggregateAcrossTime(p.value_col);
    const out = grouped.sort((a, b) => asc ? a[p.value_col] - b[p.value_col] : b[p.value_col] - a[p.value_col]).slice(0, p.top_n);
    return { text: `States with the ${dirWord} ${metricLabel(p.metric)} ${p.value_col.endsWith("days") ? "days" : "average amount"} across all monthly tabs. FY summary tabs are excluded here to avoid double-counting the same data.`, table: buildTable(out, ["state", "period_range", "periods_count", p.value_col]) };
  }

  if (!df.length || !p.period) {
    const latest = latestMonthPeriod();
    df = state.fact.filter(r => r.period === latest);
  }
  const periodText = p.period || latestMonthPeriod();
  const out = df.sort((a, b) => asc ? a[p.value_col] - b[p.value_col] : b[p.value_col] - a[p.value_col]).slice(0, p.top_n);
  return { text: `States with the ${dirWord} ${metricLabel(p.metric)} ${p.value_col.endsWith("days") ? "days" : "average amount"} for ${periodText}:`, table: buildTable(out, ["period", "state", p.value_col]) };
}

function aggregateAcrossTime(valueCol) {
  const months = state.fact.filter(r => r.period_type === "Month");
  const map = new Map();
  for (const r of months) {
    if (!map.has(r.state)) map.set(r.state, { state: r.state, periods: new Set(), first: r.sort_date, latest: r.sort_date, sdf_avg: 0, wma_avg: 0, od_avg: 0, total_avg: 0, sdf_days: 0, wma_days: 0, od_days: 0, total_days: 0, n: 0 });
    const g = map.get(r.state);
    g.periods.add(r.period); g.first = Math.min(g.first, r.sort_date); g.latest = Math.max(g.latest, r.sort_date); g.n++;
    for (const c of ["sdf_avg", "wma_avg", "od_avg", "total_avg"]) g[c] += r[c];
    for (const c of ["sdf_days", "wma_days", "od_days", "total_days"]) g[c] += r[c];
  }
  return [...map.values()].map(g => {
    for (const c of ["sdf_avg", "wma_avg", "od_avg", "total_avg"]) g[c] = g[c] / Math.max(g.n, 1);
    g.periods_count = g.periods.size;
    g.period_range = `${periodShort(g.first)} to ${periodShort(g.latest)}`;
    return g;
  });
}

function periodShort(ts) { const d = new Date(ts); return `${MONTHS[d.getMonth()]}-${d.getFullYear()}`; }
function latestMonthPeriod() { return state.fact.filter(r => r.period_type === "Month").sort((a, b) => a.sort_date - b.sort_date).at(-1)?.period; }

function rowSummary(r) {
  return `<strong>${r.state} — ${r.period}</strong><br><br>SDF: ₹${fmtNum(r.sdf_avg)} Cr for ${fmtNum(r.sdf_days)} days<br><br>WMA: ₹${fmtNum(r.wma_avg)} Cr for ${fmtNum(r.wma_days)} days<br><br>Overdraft: ₹${fmtNum(r.od_avg)} Cr for ${fmtNum(r.od_days)} days<br><br>Total average accommodation: <strong>₹${fmtNum(r.total_avg)} Cr</strong>`;
}

const RENAME = {
  period: "Period", state: "State / UT", sdf_avg: "SDF Avg ₹ Cr", sdf_days: "SDF Days", wma_avg: "WMA Avg ₹ Cr", wma_days: "WMA Days",
  od_avg: "OD Avg ₹ Cr", od_days: "OD Days", total_avg: "Total Avg ₹ Cr", total_days: "Total Days", financial_year: "Financial Year",
  periods_count: "No. of Monthly Periods", period_range: "Period Range", rank_sdf: "SDF ₹Cr-days/day", rank_wma: "WMA ₹Cr-days/day",
  rank_od: "OD ₹Cr-days/day", rank_total: "Total ₹Cr-days/day", sdf_rank: "SDF Rank", wma_rank: "WMA Rank", od_rank: "OD Rank", total_rank: "Total Rank", rank: "Rank",
};

function buildTable(rows, cols) {
  return rows.map(r => Object.fromEntries(cols.filter(c => c in r).map(c => [RENAME[c] || c, r[c]])));
}

function tableHtml(table) {
  if (!table || !table.length) return "";
  const cols = Object.keys(table[0]);
  const head = cols.map(c => `<th>${escapeHtml(c)}</th>`).join("");
  const body = table.map(row => `<tr>${cols.map(c => {
    const v = row[c];
    const isNum = typeof v === "number" && Number.isFinite(v);
    return `<td class="${isNum ? "num" : ""}">${escapeHtml(isNum ? fmtNum(v) : String(v ?? ""))}</td>`;
  }).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch])); }

function addMessage(role, content, table) {
  const chat = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.innerHTML = `<div class="avatar">${role === "user" ? "☻" : "🤖"}</div><div class="bubble">${content}${tableHtml(table)}</div>`;
  chat.appendChild(div);
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

document.getElementById("questionForm").addEventListener("submit", async evt => {
  evt.preventDefault();
  const input = document.getElementById("questionInput");
  const question = input.value.trim();
  if (!question) return;
  addMessage("user", escapeHtml(question));
  input.value = "";
  if (!state.fact.length) {
    addMessage("assistant", "Data is still loading. Please try again in a few seconds.");
    return;
  }
  const ans = answerQuestion(question);
  addMessage("assistant", ans.text, ans.table);
});

document.getElementById("refreshBtn").addEventListener("click", () => loadData());

document.querySelectorAll(".suggestion").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById("questionInput");
    input.value = btn.textContent.trim();
    input.focus();
  });
});

const savedTheme = localStorage.getItem("rbi-liquidity-theme");
if (savedTheme === "dark") document.documentElement.dataset.theme = "dark";
const themeBtn = document.getElementById("themeBtn");
if (themeBtn) {
  themeBtn.textContent = document.documentElement.dataset.theme === "dark" ? "☀" : "☾";
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    localStorage.setItem("rbi-liquidity-theme", next);
    themeBtn.textContent = next === "dark" ? "☀" : "☾";
  });
}

loadData();
