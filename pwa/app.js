// app.js
// Driver App Logic

// Relies on common.js for Store, API

// SYNC MANAGER (Driver only for now)
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

// DATA LOADING (Driver specific)
const DataManager = {
    async init() {
        Store.load();
        UI.renderFacilities();
        // UI.renderVehicles(); // Not currently used in HTML

        if (navigator.onLine) {
            try {
                constcourses = await API.fetch('getCourses', {
                    facilityId: Store.status.currentFacility
                });
                Store.data.courses = courses; // typo fix in variable name? const courses

                // Pre-load templates if course selected
                if (Store.status.currentCourse) {
                    await this.getTemplates();
                }

                // Vehicles are still needed for assignment
                const vehicles = await API.fetch('getVehicles');
                Store.data.vehicles = vehicles;

                Store.save();
                UI.renderFacilities();
                UI.renderCourses();
            } catch (e) {
                console.warn('Init fetch failed', e);
            }
        } else {
            UI.renderFacilities();
            UI.renderCourses();
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
                UI.renderCourses(); // Re-render logic
            } catch (e) {
                console.warn('Fetch courses failed', e);
            }
        }
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

        // Setup button to admin page (now a link in HTML, but here logic just in case)
        // No listener needed for <a href>

        this.updateConnectionStatus();
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

        console.log('Rendering courses for facility:', facilityId);

        if (facilityId) {
            courses = courses.filter(c => c['事業所ID'] === facilityId);
        }

        if (courses.length === 0) {
            container.innerHTML = '<p style="color:var(--text-sub); text-align:center;">コースがありません。<br>管理者に確認してください。</p>';
            return;
        }

        courses.forEach(c => {
            const btn = document.createElement('div');
            btn.className = `vehicle-btn ${c['コースID'] === Store.status.currentCourse ? 'selected' : ''}`;
            btn.innerHTML = `${c['コース名']}`;
            btn.onclick = () => {
                Store.status.currentCourse = c['コースID'];
                Store.save();
                this.renderCourses(); // Re-render to show selection state
                DataManager.getTemplates();
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
        if (!list) return;
        list.innerHTML = '';

        let schedules = Store.data.schedules || [];
        const currentCourse = Store.status.currentCourse;

        schedules = schedules.filter(s => {
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
        else newStatus = null;

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
                courseId: Store.status.currentCourse,
                vehicleId: Store.status.currentVehicle,
                driver: Store.status.currentDriver,
                attendant: Store.status.currentAttendant
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

// INITIALIZATION
window.addEventListener('DOMContentLoaded', () => {
    DataManager.init();
    UI.init();
});
