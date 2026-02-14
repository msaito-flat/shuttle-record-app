/**
 * セットアップスクリプト
 * 初回実行時にスプレッドシートの構造を初期化します。
 */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 事業所マスタ
  ensureSheet(ss, '事業所マスタ', [
    '事業所ID', '事業所名', 'デフォルト', '有効'
  ]);
  
  // 2. 車両マスタ
  ensureSheet(ss, '車両マスタ', [
    '車両ID', '車両名', '車種', 'ナンバー', '事業所ID', '定員', '有効'
  ]);
  
  // 3. 利用者マスタ
  ensureSheet(ss, '利用者マスタ', [
    '利用者ID', '氏名', 'フリガナ', '事業所ID', '住所', '備考', '有効'
  ]);
  
  // 4. コースマスタ (New)
  ensureSheet(ss, 'コースマスタ', [
    'コースID', 'コース名', '事業所ID', '有効'
  ]);

  // 5. 予定テンプレート (New)
  ensureSheet(ss, '予定テンプレート', [
    'テンプレートID', 'テンプレート名', 'コースID', '事業所ID'
  ]);

  // 6. テンプレート詳細 (New)
  ensureSheet(ss, 'テンプレート詳細', [
    'テンプレートID', '利用者ID', '便種別', 'デフォルト時刻'
  ]);
  
  // 7. 送迎予定 (Updated)
  ensureSheet(ss, '送迎予定', [
    '予定ID', '日付', '事業所ID', '利用者ID', '氏名', '便種別', '予定時刻', 'コースID', '車両ID', '車両名', 'ドライバー', '添乗員', 'ルート順'
  ]);
  
  // 8. 送迎記録 (Updated)
  ensureSheet(ss, '送迎記録', [
    '記録ID', '予定ID', '日付', '事業所ID', '利用者ID', '氏名', '便種別', '予定時刻', '乗車時刻', '降車時刻', 'ステータス', 'コースID', 'ドライバー', '添乗員', '車両ID', '車両名', '備考'
  ]);
  
  // サンプルデータの投入 (事業所マスタが空の場合)
  const facilitySheet = ss.getSheetByName('事業所マスタ');
  if (facilitySheet.getLastRow() <= 1) {
    facilitySheet.appendRow(['F001', '本社', true, true]);
    facilitySheet.appendRow(['F002', '第2事業所', false, true]);
  }

  // サンプルデータの投入 (車両マスタが空の場合)
  const vehicleSheet = ss.getSheetByName('車両マスタ');
  if (vehicleSheet.getLastRow() <= 1) {
    vehicleSheet.appendRow(['V001', 'ハイエース1号', 'ハイエース', '12-34', 'F001', 10, true]);
    vehicleSheet.appendRow(['V002', 'タント', 'タント', '56-78', 'F001', 4, true]);
    vehicleSheet.appendRow(['V003', 'キャラバン', 'キャラバン', '90-12', 'F002', 10, true]);
  }
}

/**
 * シートが存在することを確認し、なければ作成する
 */
function ensureSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    // ヘッダー行を固定・太字
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  } else {
    // ヘッダー確認（簡易的）
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (currentHeaders[0] === '') {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }
  return sheet;
}
