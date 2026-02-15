/**
 * 送迎記録アプリ バックエンド (JSON API for PWA)
 */

function doGet(e) {
  const action = e.parameter.action;
  
  try {
    let result;
    switch (action) {
      case 'getFacilities':
        result = getFacilities();
        break;
      case 'getCourses':
        result = getCourses(e.parameter.facilityId);
        break;
      case 'getTemplates':
        result = getTemplates(e.parameter.courseId);
        break;
      case 'getVehicles':
        result = getVehicles(e.parameter.facilityId);
        break;
      case 'getSchedule':
        result = getSchedule(e.parameter.date, e.parameter.facilityId, e.parameter.courseId);
        break;
      case 'getRecords':
        // 未実装だが将来用
        result = []; 
        break;
      case 'getUsers':
        result = getUsers(e.parameter.facilityId);
        break;
      default:
        return jsonResponse({ error: 'Invalid action' });
    }
    return jsonResponse({ success: true, data: result });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doPost(e) {
  // POSTデータは e.postData.contents にある
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, error: 'Invalid JSON body' });
  }
  
  const action = data.action || e.parameter.action;
  
  try {
    let result;
    switch (action) {
      case 'getFacilities':
        result = getFacilities();
        break;
      case 'getCourses':
        result = getCourses(data.facilityId);
        break;
      case 'getTemplates':
        result = getTemplates(data.courseId);
        break;
      case 'getUsers':
         result = getUsers(data.facilityId);
         break;
      case 'checkIn':
        result = checkIn(data);
        break;
      case 'checkInBatch':
        result = checkInBatch(data);
        break;
      case 'registerSchedule':
        result = registerSchedule(data);
        break;
      case 'updateSchedule':
        result = updateSchedule(data);
        break;
      case 'deleteSchedule':
        result = deleteSchedule(data);
        break;
      case 'bulkUpdateSchedules':
        result = bulkUpdateSchedules(data);
        break;
      case 'setup':
        setup();
        result = { message: 'Database initialized' };
        break;
      default:
        return jsonResponse({ error: 'Invalid action' });
    }
    return jsonResponse({ success: true, data: result });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- 既存のロジック関数 (変更なし) ---

function getFacilities() {
  const data = SheetHelper.getData('事業所マスタ');
  return data.filter(d => d['有効']);
}

function getCourses(facilityId) {
  const data = SheetHelper.getData('コースマスタ');
  const activeCourses = data.filter(d => d['有効']);
  if (facilityId) {
    return activeCourses.filter(d => d['事業所ID'] === facilityId);
  }
  return activeCourses;
}

function getTemplates(courseId) {
  const templates = SheetHelper.getData('予定テンプレート');
  const details = SheetHelper.getData('テンプレート詳細');
  
  // Join details
  return templates.map(t => {
    if (courseId && t['コースID'] !== courseId) return null;
    
    // Get details for this template
    const myDetails = details.filter(d => d['テンプレートID'] === t['テンプレートID']);
    
    // Sort details?
    return {
       templateId: t['テンプレートID'],
       templateName: t['テンプレート名'],
       courseId: t['コースID'],
       items: myDetails.map(d => ({
         userId: d['利用者ID'],
         type: d['便種別'],
         time: d['デフォルト時刻']
       }))
    };
  }).filter(t => t); // remove nulls
}

function getVehicles(facilityId) {
  const data = SheetHelper.getData('車両マスタ');
  const activeVehicles = data.filter(d => d['有効']);
  
  if (facilityId) {
    return activeVehicles.filter(d => d['事業所ID'] === facilityId);
  }
  return activeVehicles;
}


function getSchedule(dateString, facilityId, courseId) {
  const schedules = SheetHelper.getData('送迎予定');
  const records = SheetHelper.getData('送迎記録');
  
  if (!dateString) throw new Error('Date is required');
  
  // 日付フィルタ
  const targetSchedules = schedules.filter(s => {
    const sDate = formatDate(s['日付']);
    // 日付指定は必須
    const isSameDate = sDate === dateString;
    // 事業所指定があればチェック、なければ全て
    const isSameFacility = facilityId ? s['事業所ID'] === facilityId : true;
    // コース指定
    const isSameCourse = courseId ? s['コースID'] === courseId : true;
    
    return isSameDate && isSameFacility && isSameCourse;
  });

  const targetRecords = records.filter(r => formatDate(r['日付']) === dateString);

  return targetSchedules.map(sched => {
    const record = targetRecords.find(r => r['予定ID'] === sched['予定ID']);
    return {
      scheduleId: sched['予定ID'],
      date: dateString,
      facilityId: sched['事業所ID'],
      userId: sched['利用者ID'],
      userName: sched['氏名'],
      type: sched['便種別'],
      scheduledTime: formatTime(sched['予定時刻']),
      courseId: sched['コースID'],
      vehicleId: sched['車両ID'],
      vehicleName: sched['車両名'],
      driver: sched['ドライバー'],
      attendant: sched['添乗員'], // Added
      routeOrder: sched['ルート順'],
      status: record ? record['ステータス'] : null,
      recordId: record ? record['記録ID'] : null,
      boardTime: record ? formatTime(record['乗車時刻']) : null,
      alightTime: record ? formatTime(record['降車時刻']) : null,
      note: record ? record['備考'] : null
    };
  });
}

function checkIn(payload) {
  const { scheduleId, status, note, date, facilityId, driver, attendant, vehicleId, courseId } = payload;
  
  if (!scheduleId) throw new Error('Schedule ID is required');

  const records = SheetHelper.getData('送迎記録');
  const existingRecord = records.find(r => r['予定ID'] === scheduleId);
  
  const timestamp = new Date(); // サーバー側時刻
  
  if (existingRecord) {
    const updateData = {
      'ステータス': status,
      '備考': note,
      'ドライバー': driver,
      'ステータス': status,
      '備考': note,
      'ドライバー': driver,
      '添乗員': attendant, // Added
      '車両ID': vehicleId
    };
    
    // Status specific updates
    if (status === '乗車済') {
      updateData['乗車時刻'] = timestamp;
    } else if (status === '降車済') {
      updateData['降車時刻'] = timestamp;
    } else if (status === null) {
      // Data clear (Reset) -> Keep times? Or clear? 
      // Usually reset means mistake correction. Let's clear both for simplicity or keep logs.
      // User says "Reset", implies back to start.
      updateData['乗車時刻'] = '';
      updateData['降車時刻'] = '';
    }
    
    SheetHelper.updateData('送迎記録', '予定ID', scheduleId, updateData);
    return { message: 'Updated', recordId: existingRecord['記録ID'] };
  } else {
    // 新規作成時、スケジュール情報が必要。パラメータで渡してもらうか、ここで引くか。
    // オフライン同期の場合、クライアントがスケジュール情報を持っているはずだが、
    // ここでは安全のためスケジュールシートから引く
    const schedules = SheetHelper.getData('送迎予定');
    const schedule = schedules.find(s => s['予定ID'] === scheduleId);
    
    // スケジュールが見つからない場合（削除された等）、クライアントからの情報を信じるかエラーにするか。
    // ここではエラーにする。
    if (!schedule) throw new Error('Schedule not found: ' + scheduleId);
    
    // 必須項目の補完
    const newRecord = {
      '予定ID': scheduleId,
      '日付': date || formatDate(schedule['日付']),
      '事業所ID': facilityId || schedule['事業所ID'],
      '利用者ID': schedule['利用者ID'],
      '氏名': schedule['氏名'],
      '便種別': schedule['便種別'],
      '予定時刻': schedule['予定時刻'],
      '予定時刻': schedule['予定時刻'],
      '乗車時刻': (status === '乗車済') ? timestamp : '',
      '降車時刻': (status === '降車済') ? timestamp : '',
      'ステータス': status,
      'コースID': courseId || schedule['コースID'], // Added
      'ドライバー': driver || schedule['ドライバー'],
      '添乗員': attendant || schedule['添乗員'], // Added
      '車両ID': vehicleId || schedule['車両ID'],
      '車両名': schedule['車両名'], 
      '備考': note
    };
    
    const newId = SheetHelper.insertData('送迎記録', newRecord, 'R');
    return { message: 'Created', recordId: newId };
  }
}

function checkInBatch(payload) {
  const records = payload && payload.records;

  if (!Array.isArray(records)) {
    throw new Error('records must be an array');
  }

  let successCount = 0;
  let failCount = 0;
  const failedDetails = [];

  records.forEach(record => {
    try {
      checkIn(record);
      successCount += 1;
    } catch (err) {
      failCount += 1;
      failedDetails.push({
        scheduleId: record && record.scheduleId ? record.scheduleId : null,
        error: err.toString()
      });
    }
  });

  return {
    successCount: successCount,
    failCount: failCount,
    failedDetails: failedDetails
  };
}

function getUsers(facilityId) {
  const data = SheetHelper.getData('利用者マスタ');
  const activeUsers = data.filter(d => d['有効']);
  if (facilityId) {
    return activeUsers.filter(d => d['事業所ID'] === facilityId);
  }
  return activeUsers;
}

function registerSchedule(payload) {
  const { date, facilityId, vehicleId, vehicleName, driver, items } = payload;
  
  if (!date || !facilityId || !items || !Array.isArray(items)) {
    throw new Error('Missing required fields for registration');
  }

  const results = [];
  items.forEach((item, index) => {
    // item: { userId, userName, type, time }
    const newSchedule = {
      '日付': date,
      '事業所ID': facilityId,
      '利用者ID': item.userId,
      '氏名': item.userName,
      '便種別': item.type,
      '便種別': item.type,
      '予定時刻': item.time,
      'コースID': payload.courseId,
      '車両ID': vehicleId,
      '車両名': vehicleName,
      'ドライバー': driver,
      '添乗員': payload.attendant,
      'ルート順': index + 1
    };
    
    // insertData(sheetName, data, prefix)
    const newId = SheetHelper.insertData('送迎予定', newSchedule, 'S');
    results.push(newId);
  });

  return { count: results.length, ids: results };
}

function formatDate(date) {
  if (!date) return '';
  if (typeof date === 'string') return date.substring(0, 10);
  return Utilities.formatDate(date, 'JST', 'yyyy-MM-dd');
}

function formatTime(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  return Utilities.formatDate(date, 'JST', 'HH:mm');
}

function updateSchedule(payload) {
  const { scheduleId, time, vehicleId, vehicleName } = payload;
  if (!scheduleId) throw new Error('Schedule ID is required');

  // Update '送迎予定'
  // Note: SheetHelper.updateData works by key column.
  // We want to update specific fields.
  
  const updateData = {};
  if (time !== undefined) updateData['予定時刻'] = time;
  if (vehicleId !== undefined) updateData['車両ID'] = vehicleId;
  if (vehicleName !== undefined) updateData['車両名'] = vehicleName;
  
  SheetHelper.updateData('送迎予定', '予定ID', scheduleId, updateData);
  
  // Also update '送迎記録' if it exists, to keep consistency?
  // If record exists, it might have its own overrides. 
  // For now, let's sync the Schedule fields in Record if record exists.
  const records = SheetHelper.getData('送迎記録');
  const record = records.find(r => r['予定ID'] === scheduleId);
  if (record) {
     SheetHelper.updateData('送迎記録', '予定ID', scheduleId, updateData);
  }

  return { message: 'Updated', scheduleId };
}

function deleteSchedule(payload) {
  const { scheduleId } = payload;
  if (!scheduleId) throw new Error('Schedule ID is required');

  // Delete from '送迎予定'
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('送迎予定');
  const data = sh.getDataRange().getValues();
  // Find row index (1-based), header is row 1
  // ID is in column A (index 0)
  
  // SheetHelper doesn't have deleteRow method exposed directly or easily?
  // Let's implement simple row finding.
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === scheduleId) {
       sh.deleteRow(i + 1);
       break;
    }
  }
  
  // Delete from '送迎記録' as well
  const shRec = ss.getSheetByName('送迎記録');
  const dataRec = shRec.getDataRange().getValues();
  // Records might have multiple? No, 1:1 usually.
  // Loop backwards to be safe if multiple
  for (let i = dataRec.length - 1; i >= 1; i--) {
    // Record has '予定ID' in col B (index 1)? content says: 
    // '記録ID', '予定ID'... -> Record ID is col 0, Schedule ID is col 1.
    // Let's verify header. `SampleData.gs` says:
    // ensureSheet(ss, '送迎記録', ['記録ID', '予定ID', ...
    if (dataRec[i][1] === scheduleId) {
      shRec.deleteRow(i + 1);
    }
  }

  return { message: 'Deleted', scheduleId };
}

function bulkUpdateSchedules(payload) {
  const { date, courseId, schedules } = payload;
  if (!date || !courseId || !Array.isArray(schedules)) {
    throw new Error('Invalid payload for bulk update');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('送迎予定');
  const allData = sh.getDataRange().getValues();
  const headers = allData[0];
  
  // Helper to map column name to index
  const colMap = {};
  headers.forEach((h, i) => colMap[h] = i);
  
  // 1. Find existing schedules for this date & course
  // We need to store their Row Index to update or delete.
  // Note: deleting rows shifts indices, so we should delete from bottom up or be careful.
  // Strategy:
  // - Identify existing IDs.
  // - For each payload item:
  //    - If ID exists -> Update Row.
  //    - If ID is empty -> Insert Row.
  // - After processing all payload items, any existing IDs that were NOT in payload -> Delete Row.

  const existingRows = []; // { id, rowIndex (1-based), rowData }
  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    const rDate = formatDate(row[colMap['日付']]);
    const rCourse = row[colMap['コースID']];
    if (rDate === date && rCourse === courseId) {
      existingRows.push({
        id: row[colMap['予定ID']],
        rowIndex: i + 1,
        row: row
      });
    }
  }

  const processedIds = new Set();
  const validFacilityId = existingRows.length > 0 ? existingRows[0].row[colMap['事業所ID']] : (schedules.length > 0 ? schedules[0].facilityId : '');
  
  // Note: if creating new, we need facilityId. Payload items should have it, or we infer from somewhere?
  // Frontend sends facilityId in items? Or we assume course's facility?
  // Let's assume payload items have basic info or we default to what we know.
  // Actually, course is tied to facility.
  
  // 2. Process Payload
  schedules.forEach((item, index) => {
    // fields: scheduleId (optional), userId, userName, type, time, vehicleId, vehicleName, driver, attendant, routeOrder
    
    if (item.scheduleId && existingRows.find(r => r.id === item.scheduleId)) {
      // UPDATE
      const target = existingRows.find(r => r.id === item.scheduleId);
      processedIds.add(item.scheduleId);
      
      // Map updates
      const updateObj = {};
      if (item.time !== undefined) updateObj['予定時刻'] = item.time;
      if (item.type !== undefined) updateObj['便種別'] = item.type;
      if (item.vehicleId !== undefined) updateObj['車両ID'] = item.vehicleId;
      if (item.vehicleName !== undefined) updateObj['車両名'] = item.vehicleName;
      if (item.driver !== undefined) updateObj['ドライバー'] = item.driver;
      if (item.attendant !== undefined) updateObj['添乗員'] = item.attendant;
      if (item.routeOrder !== undefined) updateObj['ルート順'] = item.routeOrder;
      
      // Use SheetHelper.updateData logic but with known row? 
      // SheetHelper.updateData searches by key. We can use it.
      SheetHelper.updateData('送迎予定', '予定ID', item.scheduleId, updateObj);
      
    } else {
      // CREATE
      // Need Facility ID. 
      // If we don't have it in item, try to find from context.
      // We can look up Course -> Facility mapping but "CourseMaster" read is needed.
      // Or just require it in payload.
      const newItem = {
        '日付': date,
        '事業所ID': item.facilityId || validFacilityId, // Fallback
        '利用者ID': item.userId,
        '氏名': item.userName,
        '便種別': item.type,
        '予定時刻': item.time,
        'コースID': courseId,
        '車両ID': item.vehicleId,
        '車両名': item.vehicleName,
        'ドライバー': item.driver,
        '添乗員': item.attendant,
        'ルート順': item.routeOrder || (index + 1)
      };
      const newId = SheetHelper.insertData('送迎予定', newItem, 'S');
      // No need to track ID for deletion since it's new
    }
  });

  // 3. Delete missing
  // Delete from bottom to top to avoid index shift issues affecting subsequent deletes?
  // OR: get IDs to delete, then call deleteSchedule?
  // calling deleteSchedule is cleaner but slower (fetches data each time).
  // Let's use deleteSchedule logic but efficient? 
  // For safety and simplicity, let's use the loop but be careful.
  // Actually, easiest is to collect IDs to delete and assume they are valid.
  
  const toDelete = existingRows.filter(r => !processedIds.has(r.id));
  // Sort by rowIndex descending
  toDelete.sort((a, b) => b.rowIndex - a.rowIndex);
  
  toDelete.forEach(r => {
    // We can't trust rowIndex if we inserted rows? 
    // Wait, inserts allow append (at bottom), so existing row indices shouldn't change unless we delete.
    // So if we delete descending, it's safe.
    // BUT SheetHelper.insertData appends.
    // So existing rows are safe.
    
    // However, calling `sh.deleteRow` requires valid index.
    // If we rely on stored rowIndex, need to be sure.
    // Safe bet: find by ID again or just Delete by ID using deleteSchedule logic.
    // deleteSchedule searches by ID.
    // Let's just manually delete here to be sure.
    
    // Actually, calling deleteSchedule(id) for each is safer regarding '送迎記録' cleanup.
    deleteSchedule({ scheduleId: r.id });
  });

  return { message: 'Bulk update completed', count: schedules.length };
}
