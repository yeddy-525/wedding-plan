// ─────────────────────────────────────────────────────────────────────────
// Wedding Plan GAS Backend v2 — 테이블 구조
// 배포: 웹 앱 / 다음 사용자로 실행: 나 / 액세스: 모든 사람 (익명 포함)
// ★ 기존 배포 삭제 후 새로 배포 → 새 URL을 앱 설정에 입력
// ─────────────────────────────────────────────────────────────────────────

const SH = {
  SETTINGS : 'Settings',
  VENDORS  : 'Vendors',
  TASKS    : 'Tasks',
  TIMELINE : 'Timeline',
  EXPENSES : 'Expenses',
  JWEDDING : 'JWedding',
  JWMEMO   : 'JWedding_Memo',
  NOTES    : 'Notes',
  LOG      : 'Log'
}

// ── 진입점 ────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const cfg = readSettings(ss)
    const D = {
      vendors : readVendors(ss),
      tasks   : readRows(ss, SH.TASKS,    ['id','text','date','dn']),
      tl      : readTimeline(ss),
      expenses: readRows(ss, SH.EXPENSES, ['id','cat','name','amount','date','note']),
      jwedding: readJwedding(ss),
      jwMemo  : readRows(ss, SH.JWMEMO,   ['id','title','content','date']),
      notes   : readRows(ss, SH.NOTES,    ['id','title','content','link','date']),
      log     : readRows(ss, SH.LOG,      ['id','type','text','detail','date']),
      settings: cfg.settings,
      _savedAt: cfg.savedAt
    }
    return ContentService.createTextOutput(JSON.stringify(D))
      .setMimeType(ContentService.MimeType.JSON)
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const D  = JSON.parse(e.postData.contents)

    writeVendors (ss, D.vendors  || {hall:[],studio:[],makeup:[],dress:[]})
    writeRows    (ss, SH.TASKS,    D.tasks    || [], ['id','text','date','dn'])
    writeTimeline(ss, D.tl       || [])
    writeRows    (ss, SH.EXPENSES, D.expenses || [], ['id','cat','name','amount','date','note'])
    writeJwedding(ss, D.jwedding || {})
    writeRows    (ss, SH.JWMEMO,   D.jwMemo   || [], ['id','title','content','date'])
    writeRows    (ss, SH.NOTES,    D.notes    || [], ['id','title','content','link','date'])
    writeRows    (ss, SH.LOG,      (D.log||[]).slice(0,50), ['id','type','text','detail','date'])
    writeSettings(ss, D.settings  || {}, D._savedAt || 0)

    return ContentService.createTextOutput('ok')
      .setMimeType(ContentService.MimeType.TEXT)
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────

function getOrCreate(ss, name, headers) {
  let sh = ss.getSheetByName(name)
  if (!sh) {
    sh = ss.insertSheet(name)
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#E8F0FE')
    sh.setFrozenRows(1)
  }
  return sh
}

function readRows(ss, sheetName, fields) {
  const sh = ss.getSheetByName(sheetName)
  if (!sh || sh.getLastRow() < 2) return []
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, fields.length).getValues()
  return data.filter(r => r[0] !== '' && r[0] !== null).map(r => {
    const obj = {}
    fields.forEach((f, i) => {
      let v = r[i]
      if (v === 'true')  v = true
      if (v === 'false') v = false
      if (typeof v === 'string' && (v.startsWith('[') || v.startsWith('{'))) {
        try { v = JSON.parse(v) } catch(_) {}
      }
      obj[f] = v
    })
    return obj
  })
}

function writeRows(ss, sheetName, rows, fields) {
  const sh = getOrCreate(ss, sheetName, fields)
  if (sh.getLastRow() > 1)
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent()
  if (!rows || rows.length === 0) return
  const data = rows.map(row => fields.map(f => {
    const v = row[f]
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') return JSON.stringify(v)
    return v
  }))
  sh.getRange(2, 1, data.length, fields.length).setValues(data)
}

// ── 업체 (카테고리별 분리 저장) ───────────────────────────────────────────

const V_FIELDS = ['id','cat','name','price','deposit','loc','cap','status','tags','note']

function readVendors(ss) {
  const sh = ss.getSheetByName(SH.VENDORS)
  const result = {hall:[], studio:[], makeup:[], dress:[]}
  if (!sh || sh.getLastRow() < 2) return result
  sh.getRange(2, 1, sh.getLastRow() - 1, V_FIELDS.length).getValues()
    .filter(r => r[0]).forEach(r => {
      const v = {}
      V_FIELDS.forEach((f, i) => {
        let val = r[i]
        if (typeof val === 'string' && val.startsWith('[')) {
          try { val = JSON.parse(val) } catch(_) {}
        }
        v[f] = val
      })
      const cat = v.cat
      if (result[cat]) result[cat].push(v)
    })
  return result
}

function writeVendors(ss, vendors) {
  const sh = getOrCreate(ss, SH.VENDORS, V_FIELDS)
  if (sh.getLastRow() > 1)
    sh.getRange(2, 1, sh.getLastRow() - 1, V_FIELDS.length).clearContent()
  const rows = []
  Object.entries(vendors).forEach(([cat, list]) => {
    list.forEach(v => {
      rows.push(V_FIELDS.map(f => {
        const val = f === 'cat' ? cat : (v[f] ?? '')
        return typeof val === 'object' ? JSON.stringify(val) : val
      }))
    })
  })
  if (rows.length > 0)
    sh.getRange(2, 1, rows.length, V_FIELDS.length).setValues(rows)
}

// ── 타임라인 (월 × 태스크 펼쳐서 저장) ──────────────────────────────────

const TL_FIELDS = ['month_id','mo','mb','task_id','task_text','task_cat','task_dn']

function readTimeline(ss) {
  const sh = ss.getSheetByName(SH.TIMELINE)
  if (!sh || sh.getLastRow() < 2) return []
  const months = {}
  sh.getRange(2, 1, sh.getLastRow() - 1, TL_FIELDS.length).getValues()
    .filter(r => r[0]).forEach(r => {
      const mId = r[0]
      if (!months[mId]) months[mId] = {id: mId, mo: r[1], mb: Number(r[2]), tasks: []}
      if (r[3]) months[mId].tasks.push({
        id  : r[3],
        text: r[4],
        cat : r[5],
        dn  : r[6] === true || r[6] === 'true'
      })
    })
  return Object.values(months)
}

function writeTimeline(ss, tl) {
  const sh = getOrCreate(ss, SH.TIMELINE, TL_FIELDS)
  if (sh.getLastRow() > 1)
    sh.getRange(2, 1, sh.getLastRow() - 1, TL_FIELDS.length).clearContent()
  const rows = []
  tl.forEach(m => {
    if (m.tasks && m.tasks.length > 0)
      m.tasks.forEach(t => rows.push([m.id, m.mo, m.mb, t.id, t.text, t.cat, t.dn]))
    else
      rows.push([m.id, m.mo, m.mb, '', '', '', ''])
  })
  if (rows.length > 0)
    sh.getRange(2, 1, rows.length, TL_FIELDS.length).setValues(rows)
}

// ── 제이웨딩 일일 기록 ────────────────────────────────────────────────────

const JW_FIELDS = ['date','p1_done','p1_url','p2_done','p2_url','p3_done','p3_url','comment','commentUrl']

function readJwedding(ss) {
  const sh = ss.getSheetByName(SH.JWEDDING)
  const result = {}
  if (!sh || sh.getLastRow() < 2) return result
  sh.getRange(2, 1, sh.getLastRow() - 1, JW_FIELDS.length).getValues()
    .filter(r => r[0]).forEach(r => {
      result[r[0]] = {
        p1: {done: r[1]===true||r[1]==='true', url: r[2]||''},
        p2: {done: r[3]===true||r[3]==='true', url: r[4]||''},
        p3: {done: r[5]===true||r[5]==='true', url: r[6]||''},
        comment   : r[7]===true||r[7]==='true',
        commentUrl: r[8]||''
      }
    })
  return result
}

function writeJwedding(ss, jwedding) {
  const sh = getOrCreate(ss, SH.JWEDDING, JW_FIELDS)
  if (sh.getLastRow() > 1)
    sh.getRange(2, 1, sh.getLastRow() - 1, JW_FIELDS.length).clearContent()
  const rows = Object.entries(jwedding).map(([date, d]) => [
    date,
    d.p1?.done||false, d.p1?.url||'',
    d.p2?.done||false, d.p2?.url||'',
    d.p3?.done||false, d.p3?.url||'',
    d.comment||false,  d.commentUrl||''
  ])
  if (rows.length > 0)
    sh.getRange(2, 1, rows.length, JW_FIELDS.length).setValues(rows)
}

// ── 설정 ──────────────────────────────────────────────────────────────────

function readSettings(ss) {
  const sh = ss.getSheetByName(SH.SETTINGS)
  if (!sh || sh.getLastRow() < 1) return {settings:{}, savedAt:0}
  const rows = sh.getDataRange().getValues()
  const map  = {}
  rows.forEach(r => { if (r[0]) map[String(r[0])] = r[1] })
  let settings = {}
  try { settings = JSON.parse(map['data'] || '{}') } catch(_) {}
  return {settings, savedAt: Number(map['_savedAt']) || 0}
}

function writeSettings(ss, settings, savedAt) {
  const sh = getOrCreate(ss, SH.SETTINGS, ['key', 'value'])
  sh.clearContents()
  sh.getRange(1, 1, 1, 2).setValues([['key','value']]).setFontWeight('bold').setBackground('#E8F0FE')
  sh.getRange(2, 1, 2, 2).setValues([
    ['data',     JSON.stringify(settings)],
    ['_savedAt', savedAt || 0]
  ])
}
