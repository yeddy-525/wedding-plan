// ─────────────────────────────────────────────────────────────
// Wedding Plan - Google Apps Script Backend
// 배포 방법:
//   1. 이 코드를 GAS 에디터에 붙여넣기
//   2. 상단 배포 → 새 배포 → 웹 앱
//   3. 다음 사용자로 실행: 나 (yj.kim@...)
//   4. 액세스 권한: 모든 사람 (익명 포함)
//   5. 배포 → URL 복사 → 앱 설정에 붙여넣기
// ─────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    const sheet = getOrCreateSheet()
    const val = sheet.getRange('A1').getValue()
    return ContentService
      .createTextOutput(val || 'null')
      .setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

function doPost(e) {
  try {
    const sheet = getOrCreateSheet()
    const data = e.postData.contents
    JSON.parse(data) // 유효하지 않은 JSON이면 에러 throw
    sheet.getRange('A1').setValue(data)
    sheet.getRange('B1').setValue(
      new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    )
    return ContentService
      .createTextOutput('ok')
      .setMimeType(ContentService.MimeType.TEXT)
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName('WeddingData')
  if (!sheet) {
    sheet = ss.insertSheet('WeddingData')
    sheet.getRange('A1').setValue('null')
    sheet.getRange('B1').setValue('초기화')
  }
  return sheet
}
