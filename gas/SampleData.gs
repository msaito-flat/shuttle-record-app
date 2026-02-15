/**
 * テスト用サンプルデータ生成スクリプト
 * エディタで `createSampleData` を選択して実行してください。
 */
function createSampleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
  
  // 1. 利用者マスタのサンプル
  let userSheet = ss.getSheetByName('利用者マスタ');
  if (!userSheet) {
    console.error('シートが見つかりません: 利用者マスタ');
    return;
  }
  
  // データクリア（ヘッダー以外）
  if (userSheet.getLastRow() > 1) {
    userSheet.deleteRows(2, userSheet.getLastRow() - 1);
  }
  
  const users = [
    // F001 - High Ace Group
    ['U001', '田中 太郎', 'タナカ タロウ', 'F001', '東京都X区1-1', '車いす', true],
    ['U002', '佐藤 花子', 'サトウ ハナコ', 'F001', '東京都X区1-2', '', true],
    ['U006', '加藤 四郎', 'カトウ シロウ', 'F001', '東京都X区1-5', '車いす', true],
    ['U007', '吉田 五郎', 'ヨシダ ゴロウ', 'F001', '東京都X区1-6', '', true],
    ['U009', '小林 七郎', 'コバヤシ シチロウ', 'F001', '東京都X区1-7', '', true],
    ['U013', '齋藤 十一郎', 'サイトウ ジュウイチロウ', 'F001', '東京都X区1-10', '車いす', true],
    
    // F001 - Tanto Group
    ['U004', '山田 次郎', 'ヤマダ ジロウ', 'F001', '東京都X区1-3', '', true],
    ['U005', '高橋 三郎', 'タカハシ サブロウ', 'F001', '東京都X区1-4', '', true],
    ['U011', '木村 九郎', 'キムラ クロウ', 'F001', '東京都X区1-8', '', true],
    ['U012', '林 十郎', 'ハヤシ ジュウロウ', 'F001', '東京都X区1-9', '独歩（杖）', true],
    
    // F002 - Caravan Group
    ['U003', '鈴木 一郎', 'スズキ イチロウ', 'F002', '東京都Y区2-1', '独歩', true],
    ['U008', '中村 六郎', 'ナカムラ ロクロウ', 'F002', '東京都Y区2-2', '独歩', true],
    ['U010', '松本 八郎', 'マツモト ハチロウ', 'F002', '東京都Y区2-3', '車いす', true],
    ['U014', '渡辺 十二郎', 'ワタナベ ジュウニロウ', 'F002', '東京都Y区2-4', '', true],
    ['U015', '井上 十三郎', 'イノウエ ジュウザブロウ', 'F002', '東京都Y区2-5', '車いす', true]
  ];
  
  users.forEach(u => userSheet.appendRow(u));

  // 3. コースマスタのサンプル
  let courseSheet = ss.getSheetByName('コースマスタ');
  if (courseSheet.getLastRow() > 1) {
    courseSheet.deleteRows(2, courseSheet.getLastRow() - 1);
  }
  const courses = [
    ['C001', '我孫子コース', 'F001', true],
    ['C002', '白井コース', 'F001', true],
    ['C003', '柏コース', 'F002', true]
  ];
  courses.forEach(c => courseSheet.appendRow(c));

  // 4. 予定テンプレートのサンプル
  let templateSheet = ss.getSheetByName('予定テンプレート');
  let templateDetailSheet = ss.getSheetByName('テンプレート詳細');
  
  if (templateSheet.getLastRow() > 1) templateSheet.deleteRows(2, templateSheet.getLastRow() - 1);
  if (templateDetailSheet.getLastRow() > 1) templateDetailSheet.deleteRows(2, templateDetailSheet.getLastRow() - 1);

  const templates = [
    ['T001', '月・水・金_我孫子(迎え)', 'C001', 'F001'],
    ['T002', '月・水・金_我孫子(送り)', 'C001', 'F001']
  ];
  templates.forEach(t => templateSheet.appendRow(t));

  const templateDetails = [
    ['T001', 'U001', '迎え', '08:30'],
    ['T001', 'U002', '迎え', '08:40'],
    ['T001', 'U006', '迎え', '08:50'],
    ['T002', 'U001', '送り', '16:00'],
    ['T002', 'U002', '送り', '16:10'],
    ['T002', 'U006', '送り', '16:20']
  ];
  templateDetails.forEach(td => templateDetailSheet.appendRow(td));

  
  // 2. 送迎予定のサンプル (今日の日付で作成)
  let scheduleSheet = ss.getSheetByName('送迎予定');
  if (scheduleSheet.getLastRow() > 1) {
    scheduleSheet.deleteRows(2, scheduleSheet.getLastRow() - 1);
  }
  
  // Headers check/update
  const scheduleHeaders = ['予定ID', '日付', '事業所ID', '利用者ID', '氏名', '便種別', '予定時刻', 'コースID', '車両ID', '車両名', 'ドライバー', '添乗員', 'ルート順'];
  scheduleSheet.getRange(1, 1, 1, scheduleHeaders.length).setValues([scheduleHeaders]);
  scheduleSheet.getRange(1, 1, 1, scheduleHeaders.length).setFontWeight('bold');
  
  const schedules = [
    // ----------------------------------------------------
    // F001 - V001 (ハイエース1号) / Driver: SUZUKI
    // Course: C001 (我孫子コース)
    // ----------------------------------------------------
    // Morning (Pickup)
    ['S101', today, 'F001', 'U001', '田中 太郎', '迎え', '08:30', 'C001', 'V001', 'ハイエース1号', '鈴木', '高橋(添)', 1],
    ['S102', today, 'F001', 'U002', '佐藤 花子', '迎え', '08:40', 'C001', 'V001', 'ハイエース1号', '鈴木', '高橋(添)', 2],
    ['S103', today, 'F001', 'U006', '加藤 四郎', '迎え', '08:50', 'C001', 'V001', 'ハイエース1号', '鈴木', '高橋(添)', 3],
    ['S104', today, 'F001', 'U007', '吉田 五郎', '迎え', '09:00', 'C001', 'V001', 'ハイエース1号', '鈴木', '高橋(添)', 4],
    
    // Evening (Dropoff)
    ['S201', today, 'F001', 'U001', '田中 太郎', '送り', '16:00', 'C001', 'V001', 'ハイエース1号', '鈴木', '高橋(添)', 1],
    ['S202', today, 'F001', 'U002', '佐藤 花子', '送り', '16:10', 'C001', 'V001', 'ハイエース1号', '鈴木', '高橋(添)', 2],
    ['S203', today, 'F001', 'U006', '加藤 四郎', '送り', '16:20', 'C001', 'V001', 'ハイエース1号', '鈴木', '高橋(添)', 3],

    // ----------------------------------------------------
    // F001 - V002 (タント) / Driver: SATO
    // Course: C002 (白井コース)
    // ----------------------------------------------------
    // Morning
    ['S301', today, 'F001', 'U004', '山田 次郎', '迎え', '08:50', 'C002', 'V002', 'タント', '佐藤', '', 1],
    ['S302', today, 'F001', 'U005', '高橋 三郎', '迎え', '09:00', 'C002', 'V002', 'タント', '佐藤', '', 2],
    
    // Evening
    ['S401', today, 'F001', 'U004', '山田 次郎', '送り', '15:30', 'C002', 'V002', 'タント', '佐藤', '', 1],
    ['S402', today, 'F001', 'U005', '高橋 三郎', '送り', '15:45', 'C002', 'V002', 'タント', '佐藤', '', 2],
  ];
  
  schedules.forEach(s => scheduleSheet.appendRow(s));
  
  // Also fix Record Sheet headers just in case
  let recordSheet = ss.getSheetByName('送迎記録');
  if (recordSheet) {
      const recordHeaders = ['記録ID', '予定ID', '日付', '事業所ID', '利用者ID', '氏名', '便種別', '予定時刻', '乗車時刻', '降車時刻', 'ステータス', 'コースID', 'ドライバー', '添乗員', '車両ID', '車両名', '備考'];
      recordSheet.getRange(1, 1, 1, recordHeaders.length).setValues([recordHeaders]);
      recordSheet.getRange(1, 1, 1, recordHeaders.length).setFontWeight('bold');
  }

  console.log('サンプルデータを作成しました: ' + today);
}
