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

    // 既存IDから `idPrefix + 数値` のみ抽出して次番を採番
    // 例: U001, U002 ... / 既存の長いIDは無視して互換維持
    const escapedPrefix = String(idPrefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idPattern = new RegExp('^' + escapedPrefix + '(\\d+)$');
    let maxNumber = 0;
    let maxDigits = 3;

    existingIds.forEach(id => {
      const match = String(id).match(idPattern);
      if (!match) return;

      const numStr = match[1];
      const num = parseInt(numStr, 10);
      if (!isNaN(num)) {
        if (num > maxNumber) {
          maxNumber = num;
        }
        if (numStr.length > maxDigits) {
          maxDigits = numStr.length;
        }
      }
    });

    const digitLength = Math.max(3, Math.min(4, Math.max(maxDigits, String(maxNumber + 1).length)));

    const generateId = function(startNumber) {
      return idPrefix + String(startNumber).padStart(digitLength, '0');
    };

    let nextNumber = maxNumber + 1;
    let newId = dataObj[idColumnName] ? String(dataObj[idColumnName]) : generateId(nextNumber);

    // 衝突時は再採番してガード
    while (existingIds.has(newId)) {
      nextNumber += 1;
      newId = generateId(nextNumber);
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
