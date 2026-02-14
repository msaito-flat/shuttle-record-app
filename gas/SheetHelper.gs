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
    
    // ID生成 (簡易的: タイムスタンプ + ランダム)
    const newId = idPrefix + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss') + Math.floor(Math.random() * 100);
    if (!dataObj[headers[0]]) {
      dataObj[headers[0]] = newId; // 最初のカラムをIDと仮定
    }
    
    const row = headers.map(header => dataObj[header] || '');
    sheet.appendRow(row);
    return newId;
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
    const headers = data[0];
    const keyIndex = headers.indexOf(keyColumn);
    
    if (keyIndex === -1) throw new Error('Key column not found: ' + keyColumn);
    
    // ヘッダー行を除くデータ行を探索 (1-based index for getRange)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][keyIndex]) === String(keyValue)) {
        const rowIndex = i + 1; // 行番号
        
        // 更新するカラムを特定してセット
        Object.keys(updateData).forEach(key => {
          const colIndex = headers.indexOf(key);
          if (colIndex !== -1) {
            sheet.getRange(rowIndex, colIndex + 1).setValue(updateData[key]);
          }
        });
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
