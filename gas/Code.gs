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
      case 'getVehicles':
        result = getVehicles(e.parameter.facilityId);
        break;
      case 'getSchedule':
        result = getSchedule(e.parameter.date, e.parameter.facilityId);
        break;
      case 'getRecords':
        // 未実装だが将来用
        result = []; 
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
      case 'checkIn':
        result = checkIn(data);
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

function getVehicles(facilityId) {
  const data = SheetHelper.getData('車両マスタ');
  const activeVehicles = data.filter(d => d['有効']);
  
  if (facilityId) {
    return activeVehicles.filter(d => d['事業所ID'] === facilityId);
  }
  return activeVehicles;
}

function getSchedule(dateString, facilityId) {
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
    return isSameDate && isSameFacility;
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
      vehicleId: sched['車両ID'],
      vehicleName: sched['車両名'],
      driver: sched['ドライバー'],
      routeOrder: sched['ルート順'],
      status: record ? record['ステータス'] : null,
      recordId: record ? record['記録ID'] : null,
      actualTime: record ? formatTime(record['実績時刻']) : null,
      note: record ? record['備考'] : null
    };
  });
}

function checkIn(payload) {
  const { scheduleId, status, note, date, facilityId, driver, vehicleId } = payload;
  
  if (!scheduleId) throw new Error('Schedule ID is required');

  const records = SheetHelper.getData('送迎記録');
  const existingRecord = records.find(r => r['予定ID'] === scheduleId);
  
  const timestamp = new Date(); // サーバー側時刻
  
  if (existingRecord) {
    SheetHelper.updateData('送迎記録', '予定ID', scheduleId, {
      'ステータス': status,
      '実績時刻': timestamp,
      '備考': note,
      'ドライバー': driver,
      '車両ID': vehicleId
    });
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
      '実績時刻': timestamp,
      'ステータス': status,
      'ドライバー': driver || schedule['ドライバー'],
      '車両ID': vehicleId || schedule['車両ID'],
      '車両名': schedule['車両名'], 
      '備考': note
    };
    
    const newId = SheetHelper.insertData('送迎記録', newRecord, 'R');
    return { message: 'Created', recordId: newId };
  }
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
