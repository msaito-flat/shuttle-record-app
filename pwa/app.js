// app.js

// CONFIGURATION
const API_URL = 'https://script.google.com/macros/s/AKfycbxBvTypedkpwJYLeGhc6CRbCwFuWRmS8EDI2Xw2_PI4Mf6XmMU6FIWWoXoG8t2PF6h1/exec'; // デプロイ後に書き換えてください

// STATE MANAGEMENT
const Store = {
    data: {
        facilities: [],
        vehicles: [],
        users: [], // Added for admin
        schedules: [],
        pendingRecords: [] // Unsynced changes
    },
    status: {
        currentFacility: null,
        currentVehicle: null,
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
                const facilities = await API.fetch('getFacilities');
                Store.data.facilities = facilities;

                const vehicles = await API.fetch('getVehicles');
                Store.data.vehicles = vehicles;

                Store.save();
                UI.renderFacilities();
                UI.renderVehicles();
            } catch (e) {
                console.warn('Init fetch failed', e);
            }
        }
    },

    async loadSchedule() {
        UI.showLoading(true);
        try {
            if (navigator.onLine) {
                const schedules = await API.fetch('getSchedule', {
                    date: Store.status.currentDate,
                    facilityId: Store.status.currentFacility
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
            this.renderVehicles();
        });

        document.getElementById('setup-date').value = Store.status.currentDate;
        document.getElementById('setup-date').addEventListener('change', (e) => {
            Store.status.currentDate = e.target.value;
            Store.save();
        });

        document.getElementById('toggle-all-vehicles').addEventListener('click', () => {
            this.renderVehicles(true); // Show all
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

    renderVehicles(showAll = false) {
        const container = document.getElementById('vehicle-list');
        container.innerHTML = '';

        const facilityId = Store.status.currentFacility;
        let vehicles = Store.data.vehicles;

        if (!showAll && facilityId) {
            vehicles = vehicles.filter(v => v['事業所ID'] === facilityId);
        }

        vehicles.forEach(v => {
            const btn = document.createElement('div');
            btn.className = `vehicle-btn ${v['車両ID'] === Store.status.currentVehicle ? 'selected' : ''}`;
            btn.innerHTML = `${v['車両名']}<small>${v['車種']} ${v['ナンバー']}</small>`;
            btn.onclick = () => {
                Store.status.currentVehicle = v['車両ID'];
                Store.save();
                this.renderVehicles(showAll);
                // Auto start logic if user wants to proceed
                this.startSession();
            };
            container.appendChild(btn);
        });
    },

    startSession() {
        if (!Store.status.currentVehicle) return;
        DataManager.loadSchedule();

        // find vehicle name for header
        const v = Store.data.vehicles.find(v => v['車両ID'] === Store.status.currentVehicle);
        const vName = v ? v['車両名'] : '';

        document.getElementById('header-subtitle').textContent = `${Store.status.currentDate} / ${vName}`;
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

        const currentVehicle = Store.status.currentVehicle;
        schedules = schedules.filter(s => {
            // Show if assigned to current vehicle OR (no vehicle assigned AND matching facility)
            // But getSchedule API already filters by facility.
            return s.vehicleId === currentVehicle || !s.vehicleId;
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
                vehicleId: Store.status.currentVehicle,
                driver: 'Driver' // Should act ask driver name in setup. Fixed for now or add input.
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
    async open() {
        UI.showLoading(true);
        await DataManager.getUsers();

        // Setup default values
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('admin-date').value = tomorrow.toISOString().split('T')[0];

        this.renderVehicles();
        this.renderUsers();

        document.getElementById('view-setup').classList.add('hidden');
        document.getElementById('view-admin').classList.remove('hidden');
        UI.showLoading(false);
    },

    close() {
        document.getElementById('view-admin').classList.add('hidden');
        document.getElementById('view-setup').classList.remove('hidden');
    },

    renderVehicles() {
        const select = document.getElementById('admin-vehicle');
        select.innerHTML = '';
        Store.data.vehicles.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v['車両ID'];
            opt.textContent = `${v['車両名']} (${v['車種']})`;
            select.appendChild(opt);
        });
    },

    renderUsers() {
        const container = document.getElementById('admin-user-list');
        container.innerHTML = '';

        Store.data.users.forEach(u => {
            const div = document.createElement('label');
            div.className = 'user-item';
            div.innerHTML = `
                <input type="checkbox" name="admin-user" value="${u['利用者ID']}" data-name="${u['氏名']}">
                <div class="user-info">
                    <span class="user-name">${u['氏名']}</span>
                    <span class="user-sub">${u['フリガナ']} | ${u['備考'] || ''}</span>
                </div>
            `;
            container.appendChild(div);
        });
    },

    async submit() {
        const date = document.getElementById('admin-date').value;
        const vehicleId = document.getElementById('admin-vehicle').value;
        const driver = document.getElementById('admin-driver').value;
        const type = document.getElementById('admin-type').value;
        const time = document.getElementById('admin-time').value;

        const selectedCheckboxes = document.querySelectorAll('input[name="admin-user"]:checked');
        if (selectedCheckboxes.length === 0) {
            UI.toast('利用者を選択してください');
            return;
        }

        const v = Store.data.vehicles.find(v => v['車両ID'] === vehicleId);
        const vehicleName = v ? v['車両名'] : '';

        const items = Array.from(selectedCheckboxes).map(cb => ({
            userId: cb.value,
            userName: cb.dataset.name,
            type: type,
            time: time
        }));

        UI.showLoading(true);
        try {
            await API.post('registerSchedule', {
                date,
                facilityId: Store.status.currentFacility,
                vehicleId,
                vehicleName,
                driver,
                items
            });
            UI.toast('登録が完了しました');
            this.close();
        } catch (e) {
            console.error('Registration failed', e);
            UI.toast('エラー: ' + e.message);
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
