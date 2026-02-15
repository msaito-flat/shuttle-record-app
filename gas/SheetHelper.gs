/**
 * シート操作のヘルパー関数群
 */

const SheetHelper = {
  /**
   * 指定したシートの全データをオブジェクト配列として取得
   * @param {string} sheetName 
   * @returns {Array<Object>}
   */
  getData: function(sheetName) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return []; // ヘッダーのみまたは空
    
    const headers = data[0];
    const rows = data.slice(1);
    
    return rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
  },

  /**
   * 新しい行を追加し、生成されたIDを返す
   * @param {string} sheetName 
   * @param {Object} dataObj 
   * @param {string} idPrefix 
   */
  insertData: function(sheetName, dataObj, idPrefix) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    const idColumnName = headers[0]; // 最初のカラムをIDと仮定

    // 既存IDを高速に照合できるようSet化
    const lastRow = sheet.getLastRow();
    const existingIds = new Set();
    if (lastRow >= 2) {
      const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      idValues.forEach(row => {
        const id = row[0];
        if (id !== '' && id !== null && id !== undefined) {
          existingIds.add(String(id));
        }
      });
    }

    // ID生成: 既存プレフィックス + ミリ秒タイムスタンプ + UUID相当ランダム
    // 形式例: U20260101123456789a1b2c3d4e5f64789ab0c123456789def
    // NOTE: 大量同時登録がさらに増える場合は、PropertiesServiceでカウンタを管理する
    // 方式も比較検討できる。
    const generateId = function() {
      const timestamp = Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmssSSS');
      const randomPart = Utilities.getUuid().replace(/-/g, '');
      return idPrefix + timestamp + randomPart;
    };

    let newId = dataObj[idColumnName] ? String(dataObj[idColumnName]) : generateId();

    // 衝突時は再生成してガード
    while (existingIds.has(newId)) {
      newId = generateId();
    }

    if (!dataObj[idColumnName]) {
      dataObj[idColumnName] = newId;
    }
    
    const row = headers.map(header => dataObj[header] || '');
    sheet.appendRow(row);
    return dataObj[idColumnName];
  },

  /**
   * 指定したキーと値に一致する行を更新
   * @param {string} sheetName 
   * @param {string} keyColumn ヘッダー名
   * @param {string} keyValue 
   * @param {Object} updateData 更新したいデータのキーバリュー
   */
  updateData: function(sheetName, keyColumn, keyValue, updateData) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    if (data.length === 0) return false;

    const headers = data[0];
    const keyIndex = headers.indexOf(keyColumn);

    if (keyIndex === -1) throw new Error('Key column not found: ' + keyColumn);

    const colMap = {};
    headers.forEach((header, index) => {
      colMap[header] = index;
    });

    // ヘッダー行を除くデータ行を探索 (1-based index for getRange)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][keyIndex]) === String(keyValue)) {
        const rowIndex = i + 1; // 行番号

        // 既存行をベースに更新対象行を再構築し、1回の setValues で反映
        const row = data[i].slice();
        Object.keys(updateData).forEach(key => {
          const colIndex = colMap[key];
          if (colIndex !== undefined && updateData[key] !== undefined) {
            row[colIndex] = updateData[key];
          }
        });

        sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
        return true;
      }
    }
    return false;
  },
  
  /**
   * 今日の日付文字列を取得 (yyyy-MM-dd)
   */
  getTodayString: function() {
    return Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
  }
};
