// app.js

// CONFIGURATION
const API_URL = 'https://script.google.com/macros/library/d/1qNE_bbEjtB7CZ9fccFE7bo_Nmxwxv5_zMG3aod_kJh_kdcf83EKfGYC6/3'; // デプロイ後に書き換えてください

// STATE MANAGEMENT
const Store = {
    data: {
        courses: [], // Added
        templates: [], // Added
        facilities: [],
        vehicles: [],
        users: [],
        schedules: [],
        pendingRecords: [] // Unsynced changes
    },
    status: {
        currentFacility: null,
        currentCourse: null, // Added
        currentVehicle: null,
        currentDriver: localStorage.getItem('ks_driver') || '', // Persist
        currentAttendant: localStorage.getItem('ks_attendant') || '', // Persist
        currentDate: new Date().toISOString().split('T')[0],
        isOffline: !navigator.onLine
    },

    // Save state to LocalStorage
    save() {
        localStorage.setItem('ks_data', JSON.stringify(this.data));
        localStorage.setItem('ks_status', JSON.stringify(this.status));
    },

    // Load state from LocalStorage
    load() {
        const d = localStorage.getItem('ks_data');
        const s = localStorage.getItem('ks_status');
        if (d) this.data = JSON.parse(d);
        if (s) this.status = JSON.parse(s);
    }
};

// API MANAGER
const API = {
    async fetch(action, params = {}) {
        if (Store.status.isOffline) throw new Error('Offline');

        const query = new URLSearchParams({ action, ...params }).toString();
        const response = await fetch(`${API_URL}?${query}`);
        const json = await response.json();

        if (!json.success) throw new Error(json.error || 'API Error');
        return json.data;
    },

    async post(action, data) {
        if (Store.status.isOffline) throw new Error('Offline');

        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action, ...data }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } // Avoid CORS Preflight
        });
        const json = await response.json();

        if (!json.success) throw new Error(json.error || 'API Error');
        return json.data;
    }
};

// SYNC MANAGER
const SyncManager = {
    async sync() {
        if (Store.status.isOffline || Store.data.pendingRecords.length === 0) return;

        UI.toast('同期中...');
        const queue = [...Store.data.pendingRecords];

        for (const record of queue) {
            try {
                await API.post('checkIn', record);
                // Success: remove from queue
                Store.data.pendingRecords = Store.data.pendingRecords.filter(r => r.timestamp !== record.timestamp);
                Store.save();
            } catch (e) {
                console.error('Sync failed for record', record, e);
                // Stop syncing on error if network issue
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

// DATA LOADING
const DataManager = {
    async init() {
        Store.load();
        UI.renderFacilities();
        UI.renderVehicles(); // Render based on loaded state

        if (navigator.onLine) {
            try {
                const courses = await API.fetch('getCourses', {
                    facilityId: Store.status.currentFacility
                });
                Store.data.courses = courses;

                // Pre-load templates if course selected
                if (Store.status.currentCourse) {
                    await this.getTemplates();
                }

                // Vehicles are still needed for assignment
                const vehicles = await API.fetch('getVehicles');
                Store.data.vehicles = vehicles;

                Store.save();
                UI.renderFacilities();
                UI.renderCourses(); // Changed
            } catch (e) {
                console.warn('Init fetch failed', e);
            }
        }
    },

    async getCourses() {
        if (navigator.onLine) {
            try {
                const courses = await API.fetch('getCourses', {
                    facilityId: Store.status.currentFacility
                });
                Store.data.courses = courses;
                Store.save();
            } catch (e) {
                console.warn('Fetch courses failed', e);
            }
        }
    },

    async getTemplates() {
        if (navigator.onLine) { // && Store.status.currentCourse
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

    async getUsers() {
        if (navigator.onLine) {
            try {
                const users = await API.fetch('getUsers', {
                    facilityId: Store.status.currentFacility
                });
                Store.data.users = users;
                Store.save();
            } catch (e) {
                console.warn('Fetch users failed', e);
            }
        }
    }
};

// UI MANAGER
const UI = {
    toastTimeout: null,

    init() {
        // Event Listeners
        document.getElementById('setup-facility').addEventListener('change', (e) => {
            Store.status.currentFacility = e.target.value;
            Store.save();
            this.renderCourses();
        });

        document.getElementById('setup-driver').value = Store.status.currentDriver;
        document.getElementById('setup-driver').addEventListener('change', (e) => {
            Store.status.currentDriver = e.target.value;
            localStorage.setItem('ks_driver', Store.status.currentDriver);
        });

        document.getElementById('setup-attendant').value = Store.status.currentAttendant;
        document.getElementById('setup-attendant').addEventListener('change', (e) => {
            Store.status.currentAttendant = e.target.value;
            localStorage.setItem('ks_attendant', Store.status.currentAttendant);
        });

        document.getElementById('setup-date').value = Store.status.currentDate;
        document.getElementById('setup-date').addEventListener('change', (e) => {
            Store.status.currentDate = e.target.value;
            Store.save();
        });

        /*/ Removed toggle-all-vehicles logic /*/

        document.getElementById('btn-back-setup').addEventListener('click', () => {
            document.getElementById('view-main').classList.add('hidden');
            document.getElementById('view-setup').classList.remove('hidden');
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

        document.getElementById('btn-go-admin').addEventListener('click', () => AdminManager.open());
        document.getElementById('btn-admin-back').addEventListener('click', () => AdminManager.close());
        document.getElementById('btn-admin-cancel').addEventListener('click', () => AdminManager.close());
        document.getElementById('btn-admin-submit').addEventListener('click', () => AdminManager.submit());

        this.updateConnectionStatus();
    },

    renderFacilities() {
        const select = document.getElementById('setup-facility');
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
        const container = document.getElementById('course-list'); // Changed ID in HTML (Need to update HTML)
        if (!container) return;
        container.innerHTML = '';

        const facilityId = Store.status.currentFacility;
        let courses = Store.data.courses || [];

        if (facilityId) {
            courses = courses.filter(c => c['事業所ID'] === facilityId);
        }

        courses.forEach(c => {
            const btn = document.createElement('div');
            btn.className = `vehicle-btn ${c['コースID'] === Store.status.currentCourse ? 'selected' : ''}`;
            btn.innerHTML = `${c['コース名']}`;
            btn.onclick = () => {
                Store.status.currentCourse = c['コースID'];
                Store.save();
                this.renderCourses();
                DataManager.getTemplates(); // Backround fetch
                // Auto start logic if user wants to proceed
                this.startSession();
            };
            container.appendChild(btn);
        });
    },

    startSession() {
        if (!Store.status.currentCourse) return;
        DataManager.loadSchedule();

        // find course name for header
        const c = Store.data.courses.find(c => c['コースID'] === Store.status.currentCourse);
        const cName = c ? c['コース名'] : '';

        document.getElementById('header-subtitle').textContent = `${Store.status.currentDate} / ${cName}`;
        document.getElementById('view-setup').classList.add('hidden');
        document.getElementById('view-main').classList.remove('hidden');
    },

    renderSchedule(filterType = 'all') {
        const list = document.getElementById('schedule-list');
        list.innerHTML = '';

        let schedules = Store.data.schedules || [];

        // Filter based on selected vehicle (?) - Plan said flexible.
        // Usually driver sees only their vehicle's schedule. 
        // But if they selected a vehicle, they should see schedules assigned to that vehicle.
        // IF schedule has no vehicle assigned, maybe show it too?
        // For simplicity, showing ALL for the facility/date, sorted by route/time.
        // Logic: Filter by vehicle IF schedule has vehicle assigned.

        // Update: User requested flexible operation.
        // So we should show schedules for the Selected Vehicle.
        // AND schedules with no vehicle?

        const currentCourse = Store.status.currentCourse;
        schedules = schedules.filter(s => {
            // Show if assigned to current course
            return s.courseId === currentCourse;
        });

        // Tab filter
        if (filterType === 'pickup') schedules = schedules.filter(s => s.type === '迎え');
        if (filterType === 'dropoff') schedules = schedules.filter(s => s.type === '送り');
        if (filterType === 'unfinished') schedules = schedules.filter(s => !s.status);

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
            const isUnfinished = !s.status;

            let statusClass = '';
            if (isRiding) statusClass = 'status-riding';
            if (isDone) statusClass = 'status-done';
            if (isSkip) statusClass = 'status-skip';
            if (isCancel) statusClass = 'status-cancel';

            // Determine Icon
            let actionIcon = 'radio_button_unchecked';
            if (isRiding) actionIcon = 'directions_car'; // To Alight
            if (isDone) actionIcon = 'check_circle'; // Done

            // Times display
            let timeDisplay = s.scheduledTime;
            if (s.boardTime) timeDisplay += ` <span style="font-size:0.8em; color:var(--primary-color)">IN ${s.boardTime}</span>`;
            if (s.alightTime) timeDisplay += ` <span style="font-size:0.8em; color:var(--success-color)">OUT ${s.alightTime}</span>`;

            card.className = `schedule-card ${statusClass}`;
            card.innerHTML = `
                <div class="card-content" onclick="UI.openMemo('${s.scheduleId}')"> <!-- Text area opens memo -->
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
                    <button class="check-btn" onclick="event.stopPropagation(); UI.toggleCheck('${s.scheduleId}')">
                        <span class="material-icons-round">${actionIcon}</span>
                    </button>
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

        // Toggle logic: Null -> '乗車済' -> '降車済' -> Null
        let newStatus = null;
        if (!s.status) newStatus = '乗車済';
        else if (s.status === '乗車済') newStatus = '降車済';
        else if (s.status === '降車済') newStatus = null; // Reset
        else newStatus = null; // Other statuses reset to null

        this.updateStatus(id, newStatus);
    },

    updateStatus(id, status, note = null) {
        // Optimistic Update
        const s = Store.data.schedules.find(item => item.scheduleId === id);
        if (s) {
            s.status = status;
            if (note !== null) s.note = note;
            Store.save();
            this.renderSchedule(); // Re-render list

            // Queue sync
            SyncManager.pushRecord({
                scheduleId: id,
                status: status,
                note: s.note,
                date: Store.status.currentDate,
                facilityId: Store.status.currentFacility,
                courseId: Store.status.currentCourse, // Added
                vehicleId: Store.status.currentVehicle,
                driver: Store.status.currentDriver, // Updated
                attendant: Store.status.currentAttendant // Added
            });

            this.toast('保存しました');
        }
    },

    openMemo(id) {
        const s = Store.data.schedules.find(item => item.scheduleId === id);
        if (!s) return;

        document.getElementById('modal-user-name').textContent = s.userName;
        document.getElementById('modal-note').value = s.note || '';

        // Status buttons logic
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.className = 'status-btn'; // reset
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

// ADMIN MANAGER
const AdminManager = {
    init() {
        // Tab switching
        document.querySelectorAll('.tab[data-admin-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.adminTab;
                this.switchTab(tab);
            });
        });

        // Date picker
        const dateInput = document.getElementById('admin-dashboard-date');
        dateInput.value = Store.status.currentDate;
        dateInput.addEventListener('change', (e) => {
            Store.status.currentDate = e.target.value;
            Store.save();
            document.getElementById('admin-date-display').textContent = Store.status.currentDate;
            this.refreshData();
        });

        // Template actions
        document.getElementById('template-course-select').addEventListener('change', (e) => {
            this.renderTemplateOptions(e.target.value);
        });

        document.getElementById('btn-apply-template').addEventListener('click', () => {
            this.applyTemplate();
        });

        // Add Schedule Adhoc
        document.getElementById('btn-add-schedule-adhoc').addEventListener('click', () => {
            alert('個別追加機能は未実装です');
        });

        // Back button
        document.getElementById('btn-admin-back').addEventListener('click', () => {
            document.getElementById('view-admin').classList.add('hidden');
            document.getElementById('view-setup').classList.remove('hidden');
        });
    },

    open() {
        document.getElementById('view-setup').classList.add('hidden');
        document.getElementById('view-admin').classList.remove('hidden');
        document.getElementById('admin-date-display').textContent = Store.status.currentDate;
        this.refreshData();
        this.switchTab('status'); // Default tab
    },

    async refreshData() {
        // Fetch all schedules for the date (across all courses)
        UI.showLoading(true);
        try {
            await DataManager.loadSchedule(); // Loads into Store.data.schedules

            // Render current tab
            const activeTab = document.querySelector('.tab[data-admin-tab].active');
            const tabName = activeTab ? activeTab.dataset.adminTab : 'status';

            if (tabName === 'status') this.renderStatus();
            if (tabName === 'edit') this.renderEditList();
        } finally {
            UI.showLoading(false);
        }
    },

    switchTab(tabName) {
        // UI toggle
        document.querySelectorAll('.tab[data-admin-tab]').forEach(b => b.classList.remove('active'));
        document.querySelector(`.tab[data-admin-tab="${tabName}"]`).classList.add('active');

        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(`admin-tab-${tabName}`).classList.remove('hidden');

        if (tabName === 'status') this.renderStatus();
        if (tabName === 'edit') this.renderEditList();
        if (tabName === 'template') this.renderTemplateTab();
    },

    renderStatus() {
        const container = document.getElementById('course-status-list');
        container.innerHTML = '';

        const courses = Store.data.courses || [];
        const schedules = Store.data.schedules || [];

        courses.forEach(c => {
            const courseSchedules = schedules.filter(s => s.courseId === c['コースID']);
            if (courseSchedules.length === 0) return;

            const total = courseSchedules.length;
            const finished = courseSchedules.filter(s => s.status === '降車済').length;
            const boarded = courseSchedules.filter(s => s.status === '乗車済').length;

            // Progress calculation
            const progress = total > 0 ? Math.round((finished / total) * 100) : 0;

            const div = document.createElement('div');
            div.className = 'card';
            div.style.marginBottom = '1rem';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                    <strong>${c['コース名']}</strong>
                    <span>${finished}/${total} 完了</span>
                </div>
                <div style="background:#eee; height:10px; border-radius:5px; overflow:hidden;">
                    <div style="background:var(--success-color); width:${progress}%; height:100%;"></div>
                </div>
                <div style="margin-top:0.5rem; font-size:0.8rem; color:var(--text-sub);">
                    乗車中: ${boarded}人 / 未着手: ${total - finished - boarded}人
                </div>
            `;
            container.appendChild(div);
        });

        if (container.innerHTML === '') {
            container.innerHTML = '<p class="text-center" style="padding:2rem;">予定がありません</p>';
        }
    },

    renderEditList() {
        const container = document.getElementById('admin-schedule-list');
        container.innerHTML = '';

        const schedules = Store.data.schedules || [];
        if (schedules.length === 0) {
            container.innerHTML = '<p class="text-center">予定がありません</p>';
            return;
        }

        schedules.forEach(s => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `
                <div>
                    <strong>${s.userName}</strong>
                    <span class="badge ${s.type === '迎え' ? 'badge-blue' : 'badge-orange'}">${s.type}</span>
                    <span style="margin-left:0.5rem; font-size:0.9rem;">${s.scheduledTime}</span>
                    <span style="margin-left:0.5rem; font-size:0.8rem; color:#666;">${s.vehicleName || '-'}</span>
                </div>
                <div>
                    <button class="btn-text" style="color:red;" onclick="AdminManager.deleteSchedule('${s.scheduleId}')">削除</button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    async deleteSchedule(id) {
        if (!confirm('この予定を削除しますか？')) return;
        alert('削除機能はバックエンド実装待ちです (Not Implemented)');
    },

    renderTemplateTab() {
        // Populate courses
        const courseSelect = document.getElementById('template-course-select');
        courseSelect.innerHTML = '<option value="">コースを選択</option>';
        if (Store.data.courses) {
            Store.data.courses.forEach(c => {
                const op = document.createElement('option');
                op.value = c['コースID'];
                op.textContent = c['コース名'];
                courseSelect.appendChild(op);
            });
        }

        // Vehicle select
        const vehicleSelect = document.getElementById('template-vehicle-select');
        vehicleSelect.innerHTML = '<option value="">指定なし</option>';
        if (Store.data.vehicles) {
            Store.data.vehicles.forEach(v => {
                const op = document.createElement('option');
                op.value = v['車両ID'];
                op.textContent = v['車両名'];
                vehicleSelect.appendChild(op);
            });
        }
    },

    async renderTemplateOptions(courseId) {
        const templateSelect = document.getElementById('template-select');
        templateSelect.innerHTML = '<option value="">読み込み中...</option>';

        if (!courseId) {
            templateSelect.innerHTML = '';
            return;
        }

        try {
            const templates = await API.fetch('getTemplates', { courseId });
            templateSelect.innerHTML = '';

            if (templates.length === 0) {
                const op = document.createElement('option');
                op.textContent = 'テンプレートがありません';
                templateSelect.appendChild(op);
                return;
            }

            templates.forEach(t => {
                const op = document.createElement('option');
                op.value = t.templateId;
                op.textContent = t.templateName;
                templateSelect.appendChild(op);
            });
        } catch (e) {
            console.error(e);
            templateSelect.innerHTML = '<option>エラー</option>';
        }
    },

    async applyTemplate() {
        const courseId = document.getElementById('template-course-select').value;
        const templateId = document.getElementById('template-select').value;
        const vehicleId = document.getElementById('template-vehicle-select').value;

        // Find vehicle name if selected
        let vehicleName = '';
        if (vehicleId) {
            const v = Store.data.vehicles.find(veh => veh['車両ID'] === vehicleId);
            if (v) vehicleName = v['車両名'];
        }

        const date = Store.status.currentDate;

        if (!courseId || !templateId) {
            alert('コースとテンプレートを選択してください');
            return;
        }

        if (!confirm('このテンプレートで予定を作成しますか？')) return;

        UI.showLoading(true);
        try {
            const res = await API.fetch('registerScheduleFromTemplate', {
                date,
                facilityId: Store.status.currentFacility,
                courseId,
                templateId,
                vehicleId,
                vehicleName,
                driver: '',
                attendant: ''
            });
            UI.toast(`${res.count}件の予定を作成しました`);
            this.refreshData();
            this.switchTab('edit');
        } catch (e) {
            alert('作成に失敗しました: ' + e.message);
        } finally {
            UI.showLoading(false);
        }
    }
};


// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
    DataManager.init();
    UI.init();
});
