// admin.js
// Admin Dashboard Logic

// DataManager for Admin (Simplified version of app.js DataManager)
const DataManager = {
    async init() {
        Store.load();

        if (navigator.onLine) {
            try {
                // Fetch basic data
                // Fetch basic data
                const facilities = await API.fetch('getFacilities');
                Store.data.facilities = facilities;

                const courses = await API.fetch('getCourses'); // All courses
                Store.data.courses = courses;

                const vehicles = await API.fetch('getVehicles');
                Store.data.vehicles = vehicles;

                const users = await API.fetch('getUsers');
                Store.data.users = users;

                Store.save();

                // AdminManager will handle rendering
                AdminManager.init();
                AdminManager.open();
            } catch (e) {
                console.warn('Init fetch failed', e);
                UI.toast('データ取得エラー: ' + e.message);
                // Still try to render offline data
                AdminManager.init();
                AdminManager.open();
            }
        } else {
            UI.toast('オフラインモード: 最新データではない可能性があります');
            AdminManager.init();
            AdminManager.open();
        }
    },

    async loadSchedule() {
        UI.showLoading(true);
        try {
            if (navigator.onLine) {
                // Fetch ALL schedules for the date (no facility filter? or use currentFacility?)
                // Admin might want to see all facilities or just one?
                // For now, let's assume ALL or filters by currentFacility if set.
                // Store.status.currentFacility might be null if accessed directly.
                // Let's fetch ALL for the date.
                const schedules = await API.fetch('getSchedule', {
                    date: Store.status.currentDate
                    // facilityId: Store.status.currentFacility 
                });
                Store.data.schedules = schedules;
                Store.save();
            }
        } catch (e) {
            console.error('Load schedule failed', e);
            UI.toast('データ取得失敗: ' + e.message);
        } finally {
            UI.showLoading(false);
        }
    }
};

// UI Helpers (Duplicate of app.js UI for independence)
const UI = {
    toastTimeout: null,

    showLoading(show) {
        const el = document.getElementById('loading-overlay');
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    },

    toast(msg) {
        const el = document.getElementById('toast');
        document.getElementById('toast-message').textContent = msg;
        el.classList.remove('hidden');
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            el.classList.add('hidden');
        }, 3000);
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
        const courseSelect = document.getElementById('template-course-select');
        if (courseSelect) {
            courseSelect.addEventListener('change', (e) => {
                this.renderTemplateOptions(e.target.value);
            });
        }

        const applyBtn = document.getElementById('btn-apply-template');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyTemplate();
            });
        }

        this.initMasterTab();
    },


    open() {
        // Initial render
        document.getElementById('admin-date-display').textContent = Store.status.currentDate;
        this.refreshData();
        this.switchTab('status'); // Default tab
    },

    async refreshData() {
        await DataManager.loadSchedule();

        // Render current tab
        const activeTab = document.querySelector('.tab[data-admin-tab].active');
        const tabName = activeTab ? activeTab.dataset.adminTab : 'status';

        if (tabName === 'status') this.renderStatus();
        if (tabName === 'edit') this.renderEditList();
        if (tabName === 'master') this.renderMasterTab();
    },

    switchTab(tabName) {
        // UI toggle
        document.querySelectorAll('.tab[data-admin-tab]').forEach(b => b.classList.remove('active'));
        const target = document.querySelector(`.tab[data-admin-tab="${tabName}"]`);
        if (target) target.classList.add('active');

        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
        const content = document.getElementById(`admin-tab-${tabName}`);
        if (content) content.classList.remove('hidden');

        if (tabName === 'status') this.renderStatus();
        if (tabName === 'edit') this.renderEditList();
        if (tabName === 'template') this.renderTemplateTab();
        if (tabName === 'master') this.renderMasterTab();
    },

    initMasterTab() {
        const select = document.getElementById('master-type-select');
        if (select) {
            select.addEventListener('change', () => this.renderMasterTab());
        }
    },

    renderMasterTab() {
        const type = document.getElementById('master-type-select').value;
        const list = document.getElementById('master-list');
        list.innerHTML = '';

        let data = [];
        if (type === 'vehicle') data = Store.data.vehicles || [];
        if (type === 'user') data = Store.data.users || [];

        if (data.length === 0) {
            list.innerHTML = '<p class="text-center">データがありません</p>';
            return;
        }

        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'user-item';
            div.style.justifyContent = 'space-between';

            let label = '';
            if (type === 'vehicle') label = item['車両名'];
            if (type === 'user') label = item['氏名'];

            div.innerHTML = `
                <span>${label}</span>
                <button class="btn-text" onclick="alert('編集機能はまだ実装されていません')">編集</button>
            `;
            list.appendChild(div);
        });
    },


    renderStatus() {
        const container = document.getElementById('course-status-list');
        if (!container) return;
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
        if (!container) return;
        container.innerHTML = '';

        const schedules = Store.data.schedules || [];
        if (schedules.length === 0) {
            container.innerHTML = '<p class="text-center">予定がありません</p>';
            return;
        }

        schedules.forEach(s => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.style.borderBottom = '1px solid #eee'; // Quick style
            div.style.padding = '0.5rem';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';

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
        // API call to delete
        // alert('削除機能はバックエンド実装待ちです (Not Implemented)');
        // Implement removal logic here if backend supports 'deleteSchedule'
        // For now, just optimistically remove and save? 
        // Backend doesn't support delete yet based on app logic.
        alert('削除機能はまだ利用できません');
    },

    renderTemplateTab() {
        // Populate courses
        const courseSelect = document.getElementById('template-course-select');
        if (!courseSelect) return;
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
                facilityId: Store.status.currentFacility || '', // Might be empty if not selected in this session? 
                // Admin might need to select Facility first if multiple?
                // For simplified version, assumes Facility is known or passed.
                // Actually, registerScheduleFromTemplate in Backend (Setup.gs) uses facilityId.
                // In admin.html, we didn't add facility selector.
                // We should probably rely on the course's facility.
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
});
