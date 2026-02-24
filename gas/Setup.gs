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

  // サンプルデータの投入 (利用者マスタが空の場合)
  const userSheet = ss.getSheetByName('利用者マスタ');
  if (userSheet.getLastRow() <= 1) {
    userSheet.appendRow(['U001', '山田 太郎', 'ヤマダ タロウ', 'F001', '東京都千代田区', '', true]);
    userSheet.appendRow(['U002', '鈴木 花子', 'スズキ ハナコ', 'F001', '東京都新宿区', '', true]);
    userSheet.appendRow(['U003', '田中 次郎', 'タナカ ジロウ', 'F002', '大阪府大阪市', '', true]);
  }

  // サンプルデータの投入 (コースマスタが空の場合)
  const courseSheet = ss.getSheetByName('コースマスタ');
  if (courseSheet.getLastRow() <= 1) {
    courseSheet.appendRow(['C001', '早朝コース', 'F001', true]);
    courseSheet.appendRow(['C002', '夕方コース', 'F001', true]);
    courseSheet.appendRow(['C003', '大阪コース', 'F002', true]);
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


/**
 * テンプレート詳細シートの旧5列構成データを4列構成へ移行する。
 * 旧構成: [テンプレートID, ルート順, 時間, 種別, 利用者ID]
 * 新構成: [テンプレートID, 利用者ID, 便種別, デフォルト時刻]
 *
 * 既に5列目に利用者IDが入ってしまっている行を救済し、2-4列を正しい値へ再配置する。
 */
function migrateTemplateDetailTo4Columns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('テンプレート詳細');
  if (!sheet) throw new Error('シートが見つかりません: テンプレート詳細');

  const expectedHeaders = ['テンプレートID', '利用者ID', '便種別', 'デフォルト時刻'];
  sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight('bold');

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { migratedRows: 0, message: 'No data rows' };
  }

  const lastColumn = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  let migratedRows = 0;
  const normalized = values.map(row => {
    const templateId = row[0] || '';
    // 旧5列構成の場合は [1]=ルート順, [2]=時間, [3]=種別, [4]=利用者ID
    const legacyUserId = row[4];
    const legacyType = row[3];
    const legacyTime = row[2];

    const userId = legacyUserId || row[1] || '';
    const type = legacyType || row[2] || '';
    const time = legacyTime || row[3] || '';

    if (legacyUserId || legacyType || legacyTime) migratedRows += 1;

    return [templateId, userId, type, time];
  });

  sheet.getRange(2, 1, normalized.length, 4).setValues(normalized);
  if (lastColumn > 4) {
    sheet.getRange(1, 5, sheet.getMaxRows(), lastColumn - 4).clearContent();
  }

  return { migratedRows, totalRows: normalized.length };
}

/**
 * 管理者向け: コースIDを C001 形式で再採番し、関連シートの参照も同時更新する。
 *
 * 手順:
 * 1) 対象シートをバックアップ
 * 2) コースマスタを C001 連番で再採番
 * 3) 関連シートのコースID参照を同時更新
 * 4) 旧ID→新ID のマッピングを移行ログへ出力
 *
 * @returns {{runId:string, remapped:number, backupCount:number, backups:Array, mapping:Array}}
 */
function migrateCourseIdsToSequentialCFormat() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const runAt = new Date();
  const runId = Utilities.formatDate(runAt, 'JST', 'yyyyMMdd_HHmmss');
  const actor = Session.getActiveUser().getEmail() || 'unknown';

  const targetSheets = [
    { name: 'コースマスタ', column: 'コースID' },
    { name: '送迎予定', column: 'コースID' },
    { name: '送迎記録', column: 'コースID' },
    { name: '予定テンプレート', column: 'コースID' }
  ];

  // 1) バックアップを先に作成 (ロールバック可能性確保)
  const backups = createCourseIdMigrationBackups_(ss, runId, targetSheets);

  // 2) コースマスタの再採番
  const courseSheet = ss.getSheetByName('コースマスタ');
  if (!courseSheet) throw new Error('シートが見つかりません: コースマスタ');

  const courseRange = courseSheet.getDataRange();
  const courseValues = courseRange.getValues();
  if (courseValues.length <= 1) {
    return { runId, remapped: 0, backupCount: backups.length, backups, mapping: [] };
  }

  const headers = courseValues[0];
  const idCol = headers.indexOf('コースID');
  if (idCol === -1) throw new Error('コースマスタに コースID 列がありません');

  const mapping = [];
  for (let i = 1; i < courseValues.length; i += 1) {
    const oldId = String(courseValues[i][idCol] || '').trim();
    if (!oldId) continue;
    const newId = 'C' + String(mapping.length + 1).padStart(3, '0');
    mapping.push({ oldId, newId });
    courseValues[i][idCol] = newId;
  }

  if (mapping.length === 0) {
    return { runId, remapped: 0, backupCount: backups.length, backups, mapping: [] };
  }

  const idMap = {};
  mapping.forEach(row => {
    idMap[row.oldId] = row.newId;
  });

  courseRange.setValues(courseValues);

  // 3) 関連シートの参照整合性を維持
  ['送迎予定', '送迎記録', '予定テンプレート'].forEach(sheetName => {
    rewriteCourseIdColumn_(ss.getSheetByName(sheetName), 'コースID', idMap);
  });

  // 4) ログ出力
  appendCourseIdMigrationLog_(ss, runId, runAt, actor, mapping, backups);
  Logger.log(JSON.stringify({ runId, mapping, backups }, null, 2));

  return {
    runId,
    remapped: mapping.length,
    backupCount: backups.length,
    backups,
    mapping
  };
}

/**
 * 管理者向け: migrateCourseIdsToSequentialCFormat 実行時のバックアップから復元する。
 * @param {string} runId 例: 20260224_101530
 */
function rollbackCourseIdMigration(runId) {
  if (!runId) throw new Error('runId を指定してください');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backupLog = ensureSheet(ss, '移行バックアップ_コースID', [
    '実行ID', '実行日時', '対象シート', 'バックアップシート名'
  ]);

  const values = backupLog.getDataRange().getValues();
  if (values.length <= 1) throw new Error('バックアップログにデータがありません');

  const targets = values
    .slice(1)
    .filter(row => String(row[0]) === String(runId))
    .map(row => ({ targetName: String(row[2] || ''), backupName: String(row[3] || '') }))
    .filter(row => row.targetName && row.backupName);

  if (targets.length === 0) throw new Error('指定 runId のバックアップが見つかりません: ' + runId);

  targets.forEach(item => {
    const target = ss.getSheetByName(item.targetName);
    const backup = ss.getSheetByName(item.backupName);
    if (!target || !backup) {
      throw new Error('復元対象が見つかりません: ' + item.targetName + ' / ' + item.backupName);
    }

    const backupValues = backup.getDataRange().getValues();
    target.clearContents();
    if (backupValues.length > 0 && backupValues[0].length > 0) {
      target.getRange(1, 1, backupValues.length, backupValues[0].length).setValues(backupValues);
      if (backupValues.length >= 1) {
        target.setFrozenRows(1);
        target.getRange(1, 1, 1, backupValues[0].length).setFontWeight('bold');
      }
    }
  });

  return { runId, restoredSheets: targets.length };
}

function createCourseIdMigrationBackups_(ss, runId, targetSheets) {
  const backupLog = ensureSheet(ss, '移行バックアップ_コースID', [
    '実行ID', '実行日時', '対象シート', 'バックアップシート名'
  ]);

  const runAt = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm:ss');
  const backups = [];

  targetSheets.forEach(item => {
    const source = ss.getSheetByName(item.name);
    if (!source) return;

    const backupName = ('BK_' + runId + '_' + item.name).substring(0, 99);
    const existing = ss.getSheetByName(backupName);
    if (existing) ss.deleteSheet(existing);

    const backup = source.copyTo(ss).setName(backupName);
    ss.setActiveSheet(source);
    ss.moveActiveSheet(1);
    ss.setActiveSheet(backup);
    ss.moveActiveSheet(ss.getNumSheets());

    backupLog.appendRow([runId, runAt, item.name, backupName]);
    backups.push({ sheetName: item.name, backupSheetName: backupName });
  });

  return backups;
}

function rewriteCourseIdColumn_(sheet, columnName, idMap) {
  if (!sheet) return;
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;

  const headers = values[0];
  const col = headers.indexOf(columnName);
  if (col === -1) return;

  let updated = false;
  for (let i = 1; i < values.length; i += 1) {
    const current = String(values[i][col] || '').trim();
    if (!current) continue;
    const next = idMap[current];
    if (next && next !== current) {
      values[i][col] = next;
      updated = true;
    }
  }

  if (updated) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }
}

function appendCourseIdMigrationLog_(ss, runId, runAt, actor, mapping, backups) {
  const logSheet = ensureSheet(ss, '移行ログ_コースID', [
    '実行ID', '実行日時', '実行者', '旧コースID', '新コースID', 'バックアップシート一覧'
  ]);

  const runAtStr = Utilities.formatDate(runAt, 'JST', 'yyyy-MM-dd HH:mm:ss');
  const backupNames = backups.map(b => b.backupSheetName).join(', ');
  const rows = mapping.map(item => [runId, runAtStr, actor, item.oldId, item.newId, backupNames]);
  if (rows.length > 0) {
    logSheet.getRange(logSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}
