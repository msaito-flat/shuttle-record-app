// app.js
// Driver App Logic

// Relies on common.js for Store, API

// SYNC MANAGER (Driver only for now)
const SyncManager = {
    async sync() {
        if (Store.status.isOffline || Store.data.pendingRecords.length === 0) return;

        UI.toast('同期中...');
        const queue = [...Store.data.pendingRecords];
        const BATCH_SIZE = 10;

        for (let i = 0; i < queue.length; i += BATCH_SIZE) {
            const records = queue.slice(i, i + BATCH_SIZE);

            try {
                const result = await API.post('checkInBatch', { records });
                const failedScheduleIds = new Set((result.failedDetails || []).map(item => item.scheduleId));

                if (failedScheduleIds.size === 0) {
                    const successTimestamps = new Set(records.map(record => record.timestamp));
                    Store.data.pendingRecords = Store.data.pendingRecords.filter(record => !successTimestamps.has(record.timestamp));
                } else {
                    Store.data.pendingRecords = Store.data.pendingRecords.filter(record => {
                        if (!records.some(batchRecord => batchRecord.timestamp === record.timestamp)) {
                            return true;
                        }
                        return failedScheduleIds.has(record.scheduleId);
                    });
                }

                Store.save();
            } catch (e) {
                console.error('Batch sync failed', records, e);
                if (!navigator.onLine) break;
            }
        }

        if (Store.data.pendingRecords.length === 0) {
            UI.toast('同期完了');
        }
        UI.updateSyncStatus();
    },

    pushRecord(record) {
        // Add timestamp for unique ID in queue
        record.timestamp = Date.now();
        Store.data.pendingRecords.push(record);
        Store.save();
        UI.updateSyncStatus();

        // Try to sync immediately if online
        if (navigator.onLine) this.sync();
    }
};

// DATA LOADING (Driver specific)
const DataManager = {
    async init() {
        console.log('DataManager init');

        // Show Version
        const vEl = document.getElementById('app-version');
        if (vEl && typeof APP_VERSION !== 'undefined') {
            vEl.textContent = `(${APP_VERSION})`;
            vEl.style.opacity = '1.0';
        }

        Store.load();

        // Cached data first for faster first paint
        UI.renderFacilities();
        UI.renderCourses();

        if (!navigator.onLine) {
            return;
        }

        // Start independent requests in parallel
        const facilitiesPromise = API.fetch('getFacilities');
        const coursesPromise = API.fetch('getCourses');
        const vehiclesPromise = API.fetch('getVehicles');
        const usersPromise = API.fetch('getUsers');

        // Required for setup screen (wait for these first)
        const [facilitiesResult, coursesResult] = await Promise.allSettled([
            facilitiesPromise,
            coursesPromise
        ]);

        let hasNewData = false;
        if (facilitiesResult.status === 'fulfilled') {
            Store.data.facilities = facilitiesResult.value;
            hasNewData = true;
        } else {
            console.warn('Init fetch failed: facilities', facilitiesResult.reason);
        }

        if (coursesResult.status === 'fulfilled') {
            Store.data.courses = coursesResult.value;
            hasNewData = true;
        } else {
            console.warn('Init fetch failed: courses', coursesResult.reason);
        }

        if (hasNewData) {
            Store.save();
        }

        // Apply dependent rendering after required data is settled
        UI.renderFacilities();
        UI.renderCourses();

        // Follow-up data (non-blocking for first paint)
        Promise.allSettled([vehiclesPromise, usersPromise]).then(results => {
            let updated = false;
            const [vehiclesResult, usersResult] = results;

            if (vehiclesResult.status === 'fulfilled') {
                Store.data.vehicles = vehiclesResult.value;
                updated = true;
            } else {
                console.warn('Init fetch failed: vehicles', vehiclesResult.reason);
            }

            if (usersResult.status === 'fulfilled') {
                Store.data.users = usersResult.value;
                updated = true;
            } else {
                console.warn('Init fetch failed: users', usersResult.reason);
            }

            if (updated) Store.save();
        });

        // Pre-load templates if course selected (follow-up)
        if (Store.status.currentCourse) {
            this.getTemplates();
        }
    },

    // Optimized: Uses pre-loaded data
    async getCourses() {
        // Just re-render, data is already in Store.data.courses (ALL courses)
        UI.renderCourses();
    },

    async getTemplates() {
        if (navigator.onLine) {
            try {
                const templates = await API.fetch('getTemplates', {
                    courseId: Store.status.currentCourse
                });
                Store.data.templates = templates;
                Store.save();
            } catch (e) {
                console.warn('Fetch templates failed', e);
            }
        }
    },

    async loadSchedule() {
        UI.showLoading(true);
        try {
            if (navigator.onLine) {
                const schedules = await API.fetch('getSchedule', {
                    date: Store.status.currentDate,
                    facilityId: Store.status.currentFacility,
                    courseId: Store.status.currentCourse // Filter by course
                });
                Store.data.schedules = schedules;
                Store.save();
            }
            UI.renderSchedule();
        } catch (e) {
            console.error('Load schedule failed', e);
            UI.toast('オフライン: 保存されたデータを表示します');
            UI.renderSchedule();
        } finally {
            UI.showLoading(false);
        }
    },

    // Optimized: Users are pre-loaded
    async getUsers() {
        // No-op or render if needed
    }
};

// UI MANAGER
const UI = {
    toastTimeout: null,

    init() {
        // Event Listeners
        document.getElementById('setup-facility').addEventListener('change', (e) => {
            Store.status.currentFacility = e.target.value;
            // Reset course
            Store.status.currentCourse = null;
            document.getElementById('btn-start-session').disabled = true;
            document.getElementById('btn-start-session').style.opacity = '0.5';

            Store.save();
            DataManager.getCourses(); // Fetch new courses
        });

        document.getElementById('setup-driver').value = Store.status.currentDriver || '';
        document.getElementById('setup-driver').addEventListener('change', (e) => {
            Store.status.currentDriver = e.target.value;
            localStorage.setItem('ks_driver', Store.status.currentDriver);
        });

        document.getElementById('setup-attendant').value = Store.status.currentAttendant || '';
        document.getElementById('setup-attendant').addEventListener('change', (e) => {
            Store.status.currentAttendant = e.target.value;
            localStorage.setItem('ks_attendant', Store.status.currentAttendant);
        });

        document.getElementById('setup-date').value = Store.status.currentDate;
        document.getElementById('setup-date').addEventListener('change', (e) => {
            Store.status.currentDate = e.target.value;
            Store.save();
        });

        document.getElementById('btn-back-setup').addEventListener('click', () => {
            history.back(); // Use history back
        });

        document.getElementById('btn-start-session').addEventListener('click', () => {
            this.startSession();
        });

        document.getElementById('btn-sync').addEventListener('click', () => SyncManager.sync());

        // Tab Filtering
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.renderSchedule(e.target.dataset.filter);
            });
        });

        // Modal logic
        document.querySelector('.close-modal').addEventListener('click', () => {
            document.getElementById('modal-memo').classList.add('hidden');
        });

        window.addEventListener('online', () => {
            Store.status.isOffline = false;
            this.updateConnectionStatus();
            SyncManager.sync();
        });
        window.addEventListener('offline', () => {
            Store.status.isOffline = true;
            this.updateConnectionStatus();
        });

        // History api
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.view === 'main') {
                document.getElementById('view-setup').classList.add('hidden');
                document.getElementById('view-main').classList.remove('hidden');
            } else {
                // Default / Setup
                document.getElementById('view-setup').classList.remove('hidden');
                document.getElementById('view-main').classList.add('hidden');
            }
        });

        this.updateConnectionStatus();

        // Show Version
        const vEl = document.getElementById('app-version');
        if (vEl) vEl.textContent = `(${APP_VERSION})`;

        // No Attendant Checkbox logic
        const chk = document.getElementById('chk-no-attendant');
        const attInput = document.getElementById('setup-attendant');

        // Restore state if needed (or just rely on text value)
        if (Store.status.currentAttendant === 'なし') {
            chk.checked = true;
            attInput.disabled = true;
            attInput.value = '';
        }

        chk.addEventListener('change', (e) => {
            if (e.target.checked) {
                attInput.disabled = true;
                attInput.value = '';
                Store.status.currentAttendant = 'なし'; // specific value for "None"
            } else {
                attInput.disabled = false;
                Store.status.currentAttendant = '';
            }
            localStorage.setItem('ks_attendant', Store.status.currentAttendant);
        });
    },

    renderFacilities() {
        const select = document.getElementById('setup-facility');
        if (!select) return;
        select.innerHTML = '';
        Store.data.facilities.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f['事業所ID'];
            opt.textContent = f['事業所名'];
            if (f['デフォルト'] && !Store.status.currentFacility) {
                Store.status.currentFacility = f['事業所ID']; // Set default
            }
            if (f['事業所ID'] === Store.status.currentFacility) opt.selected = true;
            select.appendChild(opt);
        });
    },

    renderCourses() {
        const container = document.getElementById('course-list');
        if (!container) return;
        container.innerHTML = '';

        const facilityId = Store.status.currentFacility;
        let courses = Store.data.courses || [];

        if (facilityId) {
            courses = courses.filter(c => c['事業所ID'] === facilityId);
        }

        if (courses.length === 0) {
            container.innerHTML = '<p style="color:var(--text-sub); text-align:center;">コースがありません。<br>管理者に確認してください。</p>';
            return;
        }

        if (Store.status.currentCourse) {
            const exists = courses.find(c => c['コースID'] === Store.status.currentCourse);
            if (!exists) {
                Store.status.currentCourse = null;
                document.getElementById('btn-start-session').disabled = true;
                document.getElementById('btn-start-session').style.opacity = '0.5';
            } else {
                document.getElementById('btn-start-session').disabled = false;
                document.getElementById('btn-start-session').style.opacity = '1';
            }
        }

        courses.forEach(c => {
            const btn = document.createElement('div');
            btn.className = `vehicle-btn ${c['コースID'] === Store.status.currentCourse ? 'selected' : ''}`;
            btn.innerHTML = `${c['コース名']}`;
            btn.onclick = () => {
                Store.status.currentCourse = c['コースID'];
                Store.save();
                this.renderCourses();
                DataManager.getTemplates();
                document.getElementById('btn-start-session').disabled = false;
                document.getElementById('btn-start-session').style.opacity = '1';
            };
            container.appendChild(btn);
        });
    },

    startSession() {
        if (!Store.status.currentCourse) return;

        const driver = Store.status.currentDriver;
        const attendant = Store.status.currentAttendant;

        if (!driver) {
            alert('ドライバー名を入力してください');
            return;
        }
        if (!attendant) {
            alert('添乗員名を入力してください (いない場合は「添乗員なし」をチェック)');
            return;
        }

        DataManager.loadSchedule();

        const c = Store.data.courses.find(c => c['コースID'] === Store.status.currentCourse);
        const cName = c ? c['コース名'] : '';

        document.getElementById('header-subtitle').textContent = `${Store.status.currentDate} / ${cName}`;

        history.pushState({ view: 'main' }, '', '#main');
        document.getElementById('view-setup').classList.add('hidden');
        document.getElementById('view-main').classList.remove('hidden');
    },

    renderSchedule(filterType = 'all') {
        const list = document.getElementById('schedule-list');
        if (!list) return;
        list.innerHTML = '';

        let schedules = Store.data.schedules || [];
        const currentCourse = Store.status.currentCourse;

        schedules = schedules.filter(s => s.courseId === currentCourse);

        if (filterType === 'unboarded') {
            schedules = schedules.filter(s => !s.status || s.status === '未乗車');
        }
        if (filterType === 'undropped') {
            schedules = schedules.filter(s => s.status === '乗車済');
        }

        if (filterType === 'pickup') schedules = schedules.filter(s => s.type === '迎え');
        if (filterType === 'dropoff') schedules = schedules.filter(s => s.type === '送り');

        if (schedules.length === 0) {
            document.getElementById('empty-state').classList.remove('hidden');
            return;
        }
        document.getElementById('empty-state').classList.add('hidden');

        schedules.forEach(s => {
            const card = document.createElement('div');
            const isRiding = s.status === '乗車済';
            const isDone = s.status === '降車済';
            const isSkip = s.status === '欠席';
            const isCancel = s.status === 'キャンセル';

            let statusClass = '';
            if (isRiding) statusClass = 'status-riding';
            if (isDone) statusClass = 'status-done';
            if (isSkip) statusClass = 'status-skip';
            if (isCancel) statusClass = 'status-cancel';

            let currentStep = '未乗車';
            let nextAction = '乗車';
            let btnHtml = '';
            let helperTextHtml = '';
            if (isCancel || isSkip) {
                currentStep = s.status;
                nextAction = 'メモで変更';
                btnHtml = `<button class="btn-action btn-action-neutral" disabled><span class="material-icons-round">block</span>一覧から変更不可</button>`;
                helperTextHtml = `<div class="action-helper-text">状態変更はメモ画面で実行してください</div>`;
            } else if (!s.status || s.status === '未乗車') {
                currentStep = '未乗車';
                nextAction = '乗車';
                btnHtml = `<button class="btn-action btn-action-ride" onclick="event.stopPropagation(); UI.toggleCheck('${s.scheduleId}')"><span class="material-icons-round">directions_car</span>乗車</button>`;
            } else if (s.status === '乗車済') {
                currentStep = '乗車済';
                nextAction = '降車';
                btnHtml = `<button class="btn-action btn-action-drop" onclick="event.stopPropagation(); UI.toggleCheck('${s.scheduleId}')"><span class="material-icons-round">south</span>降車</button>`;
            } else if (s.status === '降車済') {
                currentStep = '降車済';
                nextAction = '操作不要';
                btnHtml = `<button class="btn-action btn-action-done" disabled><span class="material-icons-round">check_circle</span>完了済み</button>`;
                helperTextHtml = `<div class="action-helper-text">完了済み（再操作不要）</div>`;
            } else {
                currentStep = s.status || '未設定';
                nextAction = 'メモで確認';
                btnHtml = `<button class="btn-action btn-action-neutral" disabled><span class="material-icons-round">help</span>一覧から変更不可</button>`;
                helperTextHtml = `<div class="action-helper-text">必要な場合はメモ画面から状態を変更してください</div>`;
            }

            let timeDisplay = s.scheduledTime;
            if (s.boardTime) timeDisplay += ` <span style="font-size:0.8em; color:var(--primary-color)">IN ${s.boardTime}</span>`;
            if (s.alightTime) timeDisplay += ` <span style="font-size:0.8em; color:var(--success-color)">OUT ${s.alightTime}</span>`;

            card.className = `schedule-card ${statusClass}`;
            card.innerHTML = `
                <div class="card-content" onclick="UI.openMemo('${s.scheduleId}')">
                    <div class="card-time">
                        <span class="material-icons-round" style="font-size:16px">${s.type === '迎え' ? 'directions_car' : 'home'}</span>
                        ${timeDisplay}
                    </div>
                    <div class="card-name">${s.userName}</div>
                    <div class="card-badges">
                        <span class="badge type-${s.type === '迎え' ? 'pickup' : 'dropoff'}">${s.type}</span>
                        ${s.status ? `<span class="badge">${s.status}</span>` : ''}
                    </div>
                </div>
                <div class="card-action">
                    <div class="step-chips" aria-label="現在ステップと次アクション">
                        <span class="step-chip">現在: ${currentStep}</span>
                        <span class="step-chip step-chip-next">次: ${nextAction}</span>
                    </div>
                    ${btnHtml}
                    ${helperTextHtml}
                    <button class="memo-btn" onclick="event.stopPropagation(); UI.openMemo('${s.scheduleId}')">
                        <span class="material-icons-round" style="font-size:20px">edit_note</span>
                    </button>
                </div>
            `;
            list.appendChild(card);
        });
    },

    toggleCheck(id) {
        const s = Store.data.schedules.find(item => item.scheduleId === id);
        if (!s) return;

        let newStatus = null;
        if (!s.status || s.status === '未乗車') newStatus = '乗車済';
        else if (s.status === '乗車済') newStatus = '降車済';
        else if (s.status === '降車済') return;
        else return;

        this.updateStatus(id, newStatus);
    },

    updateStatus(id, status, note = null) {
        const s = Store.data.schedules.find(item => item.scheduleId === id);
        if (s) {
            s.status = status;
            if (note !== null) s.note = note;
            Store.save();

            const activeTab = document.querySelector('.tab.active');
            const filter = activeTab ? activeTab.dataset.filter : 'all';
            this.renderSchedule(filter);

            SyncManager.pushRecord({
                scheduleId: id,
                status: status,
                note: s.note,
                date: Store.status.currentDate,
                facilityId: Store.status.currentFacility,
                courseId: Store.status.currentCourse,
                vehicleId: Store.status.currentVehicle,
                driver: Store.status.currentDriver,
                attendant: Store.status.currentAttendant
            });

            this.toast('記録されました');
        }
    },

    openMemo(id) {
        const s = Store.data.schedules.find(item => item.scheduleId === id);
        if (!s) return;

        document.getElementById('modal-user-name').textContent = s.userName;
        document.getElementById('modal-note').value = s.note || '';

        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.className = 'status-btn';
            if (btn.dataset.status === s.status) btn.classList.add('selected');

            btn.onclick = () => {
                document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
        });

        const saveBtn = document.getElementById('btn-save-memo');
        saveBtn.onclick = () => {
            const selectedBtn = document.querySelector('.status-btn.selected');
            const newStatus = selectedBtn ? selectedBtn.dataset.status : s.status;
            const newNote = document.getElementById('modal-note').value;

            this.updateStatus(id, newStatus, newNote);
            document.getElementById('modal-memo').classList.add('hidden');
        };

        document.getElementById('modal-memo').classList.remove('hidden');
    },

    showLoading(show) {
        const el = document.getElementById('loading-overlay');
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    },

    updateConnectionStatus() {
        const el = document.getElementById('connection-status');
        if (Store.status.isOffline) el.classList.remove('hidden');
        else el.classList.add('hidden');
    },

    updateSyncStatus() {
        const count = Store.data.pendingRecords.length;
        const btn = document.getElementById('btn-sync');
        if (count > 0) {
            btn.style.color = 'var(--warning-color)';
        } else {
            btn.style.color = 'var(--text-main)';
        }
    },

    toast(msg) {
        const el = document.getElementById('toast');
        document.getElementById('toast-message').textContent = msg;
        el.classList.remove('hidden');
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            el.classList.add('hidden');
        }, 2000);
    }
};

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
    DataManager.init();
    UI.init();
});
