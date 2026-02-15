// admin.js
// Admin Dashboard Logic

// DataManager for Admin (Simplified version of app.js DataManager)
const DataManager = {
    async init() {
        Store.load();
        Store.status.isOffline = !navigator.onLine;
        Store.save();

        // Show UI first with cached data for faster first paint
        AdminManager.init();
        AdminManager.open();

        if (Store.status.isOffline) {
            UI.toast('オフラインモード: 最新データではない可能性があります');
            return;
        }

        // Start independent requests in parallel
        const facilitiesPromise = API.fetch('getFacilities');
        const coursesPromise = API.fetch('getCourses');
        const vehiclesPromise = API.fetch('getVehicles');
        const usersPromise = API.fetch('getUsers');

        // Required data for initial dashboard context
        const requiredResults = await Promise.allSettled([
            facilitiesPromise,
            coursesPromise
        ]);

        let hasRequiredUpdate = false;
        const [facilitiesResult, coursesResult] = requiredResults;

        if (facilitiesResult.status === 'fulfilled') {
            Store.data.facilities = facilitiesResult.value;
            hasRequiredUpdate = true;
        } else {
            console.warn('Init fetch failed: facilities', facilitiesResult.reason);
        }

        if (coursesResult.status === 'fulfilled') {
            Store.data.courses = coursesResult.value;
            hasRequiredUpdate = true;
        } else {
            console.warn('Init fetch failed: courses', coursesResult.reason);
        }

        if (hasRequiredUpdate) {
            Store.save();
            AdminManager.refreshData();
        }

        // Follow-up non-blocking data
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

            if (updated) {
                Store.save();
                const activeTab = document.querySelector('.tab[data-admin-tab].active');
                if (activeTab && activeTab.dataset.adminTab === 'master') {
                    AdminManager.renderMasterTab();
                }
            }
        });
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
    networkListenersBound: false,
    currentEditCourseId: '',
    draftSchedules: [],
    originalDraftFingerprint: '',
    editFilters: { type: '', user: '', noVehicle: false },

    init() {
        this.bindNetworkListeners();

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

        // Editor Listeners
        const editCourseSelect = document.getElementById('edit-course-select');
        if (editCourseSelect) {
            editCourseSelect.addEventListener('change', (e) => {
                this.initEditor(e.target.value);
            });
        }

        const loadTemplateBtn = document.getElementById('btn-load-template');
        if (loadTemplateBtn) {
            loadTemplateBtn.addEventListener('click', () => {
                this.loadFromTemplate();
            });
        }

        const addRowBtn = document.getElementById('btn-add-row');
        if (addRowBtn) {
            addRowBtn.addEventListener('click', () => {
                this.addEmptyRow();
            });
        }

        const saveBulkBtn = document.getElementById('btn-save-bulk');
        if (saveBulkBtn) {
            saveBulkBtn.addEventListener('click', () => {
                this.saveBulk();
            });
        }

        const filterType = document.getElementById('edit-filter-type');
        const filterUser = document.getElementById('edit-filter-user');
        const filterNoVehicle = document.getElementById('edit-filter-no-vehicle');
        if (filterType) {
            filterType.addEventListener('change', (e) => {
                this.editFilters.type = e.target.value;
                this.renderEditorTable();
            });
        }
        if (filterUser) {
            filterUser.addEventListener('input', (e) => {
                this.editFilters.user = e.target.value;
                this.renderEditorTable();
            });
        }
        if (filterNoVehicle) {
            filterNoVehicle.addEventListener('change', (e) => {
                this.editFilters.noVehicle = e.target.checked;
                this.renderEditorTable();
            });
        }

        this.initMasterTab();
    },

    bindNetworkListeners() {
        if (this.networkListenersBound) return;
        this.networkListenersBound = true;

        window.addEventListener('online', () => {
            Store.status.isOffline = false;
            Store.save();

            const activeTab = document.querySelector('.tab[data-admin-tab].active');
            if (activeTab && activeTab.dataset.adminTab === 'status') {
                this.refreshData();
                return;
            }

            DataManager.loadSchedule();
        });

        window.addEventListener('offline', () => {
            Store.status.isOffline = true;
            Store.save();
        });
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
        if (tabName === 'edit') this.reInitEditorState(); // Re-load editor data
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
        if (tabName === 'edit') {
            this.initEditTabUI(); // Setup select options
            this.reInitEditorState();
        }
        if (tabName === 'master') this.renderMasterTab();
    },

    initMasterTab() {
        const select = document.getElementById('master-type-select');
        if (select) {
            select.addEventListener('change', () => this.renderMasterTab());
        }
        const masterSearchInput = document.getElementById('master-search-input');
        if (masterSearchInput) {
            masterSearchInput.addEventListener('input', () => this.renderMasterTab());
        }
        document.getElementById('btn-master-add').addEventListener('click', () => this.addMasterRow());
        document.getElementById('btn-master-save').addEventListener('click', () => this.saveMaster());

        // Template Save
        const btnSaveTemplate = document.getElementById('btn-save-template');
        if (btnSaveTemplate) {
            btnSaveTemplate.addEventListener('click', () => this.saveAsTemplate());
        }
    },

    // Master Column Definitions
    masterDefs: {
        'user': {
            label: '利用者マスタ',
            idField: '利用者ID',
            fields: [
                { key: '利用者ID', label: 'ID', readonly: true, width: '80px' },
                { key: '氏名', label: '氏名', type: 'text' },
                { key: 'フリガナ', label: 'フリガナ', type: 'text' },
                { key: '住所', label: '住所', type: 'text' },
                { key: '事業所ID', label: '事業所', type: 'select', source: 'facilities', valueKey: '事業所ID', labelKey: '事業所名' },
                { key: '備考', label: '備考', type: 'text' },
                { key: '有効', label: '有効', type: 'checkbox' }
            ]
        },
        'vehicle': {
            label: '車両マスタ',
            idField: '車両ID',
            fields: [
                { key: '車両ID', label: 'ID', readonly: true, width: '80px' },
                { key: '車両名', label: '車両名', type: 'text' },
                { key: '車種', label: '車種', type: 'text' },
                { key: 'ナンバー', label: 'ナンバー', type: 'text' },
                { key: '定員', label: '定員', type: 'number', width: '60px' },
                { key: '事業所ID', label: '事業所', type: 'select', source: 'facilities', valueKey: '事業所ID', labelKey: '事業所名' },
                { key: '有効', label: '有効', type: 'checkbox' }
            ]
        },
        'course': {
            label: 'コースマスタ',
            idField: 'コースID',
            fields: [
                { key: 'コースID', label: 'ID', readonly: true, width: '80px' },
                { key: 'コース名', label: 'コース名', type: 'text' },
                { key: '事業所ID', label: '事業所', type: 'select', source: 'facilities', valueKey: '事業所ID', labelKey: '事業所名' },
                { key: '有効', label: '有効', type: 'checkbox' }
            ]
        },
        'facility': {
            label: '事業所マスタ',
            idField: '事業所ID',
            fields: [
                { key: '事業所ID', label: 'ID', readonly: true, width: '80px' },
                { key: '事業所名', label: '事業所名', type: 'text' },
                { key: 'デフォルト', label: 'デフォルト', type: 'checkbox' },
                { key: '有効', label: '有効', type: 'checkbox' }
            ]
        }
    },

    renderMasterTab() {
        const type = document.getElementById('master-type-select').value;
        const container = document.getElementById('master-table-container');
        container.innerHTML = '';

        const def = this.masterDefs[type];
        if (!def) return;

        // Get Data
        let data = [];
        if (type === 'user') data = Store.data.users || [];
        if (type === 'vehicle') data = Store.data.vehicles || [];
        if (type === 'course') data = Store.data.courses || [];
        if (type === 'facility') data = Store.data.facilities || [];

        const query = (document.getElementById('master-search-input')?.value || '').trim().toLowerCase();
        if (query) {
            data = data.filter(item => def.fields.some(field => {
                const value = item[field.key];
                return String(value === undefined || value === null ? '' : value).toLowerCase().includes(query);
            }));
        }

        // Clone for draft (if we want safely, but direct render is easier for now)
        // We will read from DOM on save.

        const table = document.createElement('table');
        table.className = 'editor-table';

        // Header
        const thead = document.createElement('thead');
        const trHead = document.createElement('tr');
        def.fields.forEach(f => {
            const th = document.createElement('th');
            th.textContent = f.label;
            if (f.width) th.style.width = f.width;
            trHead.appendChild(th);
        });
        // Action col
        const thAction = document.createElement('th');
        thAction.textContent = '操作';
        thAction.style.width = '60px';
        trHead.appendChild(thAction);
        thead.appendChild(trHead);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');
        tbody.id = 'master-tbody';

        data.forEach(item => {
            tbody.appendChild(this.createMasterRow(type, item, def));
        });
        table.appendChild(tbody);
        container.appendChild(table);
    },

    createMasterRow(type, item, def) {
        const tr = document.createElement('tr');
        tr.dataset.id = item[def.idField] || ''; // Empty for new

        def.fields.forEach(f => {
            const td = document.createElement('td');
            const val = item[f.key];

            if (f.readonly) {
                td.textContent = val || '(自動)';
                td.dataset.key = f.key; // Store key to read later if needed
            } else if (f.type === 'select') {
                const select = document.createElement('select');
                // Options
                if (f.source === 'facilities') {
                    (Store.data.facilities || []).forEach(fac => {
                        const op = document.createElement('option');
                        op.value = fac[f.valueKey];
                        op.textContent = fac[f.labelKey];
                        if (String(fac[f.valueKey]) === String(val)) op.selected = true;
                        select.appendChild(op);
                    });
                }
                select.dataset.key = f.key;
                td.appendChild(select);
            } else if (f.type === 'checkbox') {
                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.checked = val === true || val === 'true' || val === ''; // Default true?
                chk.dataset.key = f.key;
                td.appendChild(chk);
            } else {
                const input = document.createElement('input');
                input.type = f.type || 'text';
                input.value = val !== undefined ? val : '';
                input.dataset.key = f.key;
                td.appendChild(input);
            }
            tr.appendChild(td);
        });

        // Action
        const tdAction = document.createElement('td');
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-icon';
        btnDel.innerHTML = '<span class="material-icons-round">delete</span>';
        btnDel.onclick = () => {
            if (confirm('この行を削除しますか？(物理削除はされません)')) {
                tr.remove(); // Visual remove. Actual remove logic from data is complicated.
                // If it has ID, we might need to flag as deleted or just omit from save?
                // Save logic: "upsert". If omitted?
                // Our backend `updateMasterData` only updates items passed.
                // It does NOT delete items not passed.
                // So removing from UI just means "don't update this".
                // We need explicit delete/disable.
                // For now, removing row avoids processing it.
                // *Correction*: User probably wants to Disable, not Delete physically.
                // The "Valid" checkbox is for that.
                // "Delete" for new rows is fine.
                // "Delete" for existing rows -> Maybe alert "Please use Valid checkbox to disable".
                if (tr.dataset.id) {
                    alert('既存データは「有効」チェックを外して無効化してください。\n(表示から消すことはできません)');
                    // Restore? Or just re-render?
                    this.renderMasterTab();
                }
            }
        };
        tdAction.appendChild(btnDel);
        tr.appendChild(tdAction);

        return tr;
    },

    addMasterRow() {
        const type = document.getElementById('master-type-select').value;
        const def = this.masterDefs[type];
        if (!def) return;

        const tbody = document.getElementById('master-tbody');
        // Empty item
        const item = {};
        def.fields.forEach(f => {
            // Default values
            if (f.key === '有効') item[f.key] = true;
        });

        tbody.insertBefore(this.createMasterRow(type, item, def), tbody.firstChild);
    },

    async saveMaster() {
        const type = document.getElementById('master-type-select').value;
        const def = this.masterDefs[type];
        if (!def) return;

        const tbody = document.getElementById('master-tbody');
        const rows = tbody.querySelectorAll('tr');

        const items = [];
        rows.forEach(tr => {
            const item = {};
            // ID
            if (tr.dataset.id) item[def.idField] = tr.dataset.id;

            // Inputs
            tr.querySelectorAll('input, select').forEach(input => {
                const key = input.dataset.key;
                if (!key) return;

                if (input.type === 'checkbox') {
                    item[key] = input.checked;
                } else {
                    item[key] = input.value;
                }
            });

            // Add to list
            items.push(item);
        });

        if (!confirm('マスタデータを保存しますか？')) return;

        UI.showLoading(true);
        try {
            await API.post('updateMasterData', { type, items });
            UI.toast('保存しました');
            // Refresh
            DataManager.init(); // Reload all data
            setTimeout(() => {
                this.renderMasterTab(); // Re-render this tab
            }, 1000);
        } catch (e) {
            alert('保存失敗: ' + e.message);
        } finally {
            UI.showLoading(false);
        }
    },

    async saveAsTemplate() {
        if (!this.currentEditCourseId) {
            alert('コースが選択されていません');
            return;
        }

        const name = prompt('テンプレート名を入力してください:');
        if (!name) return;

        UI.showLoading(true);
        try {
            // Use draftSchedules
            const items = this.draftSchedules.map((s, i) => ({
                type: s.type,
                time: s.scheduledTime,
                userId: s.userId,
                routeOrder: i + 1,
            }));

            await API.post('createTemplate', {
                courseId: this.currentEditCourseId,
                templateName: name,
                items: items
            });

            UI.toast('テンプレートとして保存しました');
        } catch (e) {
            alert('作成失敗: ' + e.message);
        } finally {
            UI.showLoading(false);
        }
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
            const progress = total > 0 ? Math.round((finished / total) * 100) : 0;

            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '1rem';

            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.marginBottom = '0.5rem';

            const courseName = document.createElement('strong');
            courseName.textContent = c['コース名'] || '';
            header.appendChild(courseName);

            const finishedText = document.createElement('span');
            finishedText.textContent = `${finished}/${total} 完了`;
            header.appendChild(finishedText);

            const progressBase = document.createElement('div');
            progressBase.style.background = '#eee';
            progressBase.style.height = '10px';
            progressBase.style.borderRadius = '5px';
            progressBase.style.overflow = 'hidden';

            const progressBar = document.createElement('div');
            progressBar.style.background = 'var(--success-color)';
            progressBar.style.width = `${progress}%`;
            progressBar.style.height = '100%';
            progressBase.appendChild(progressBar);

            const detail = document.createElement('div');
            detail.style.marginTop = '0.5rem';
            detail.style.fontSize = '0.8rem';
            detail.style.color = 'var(--text-sub)';
            detail.textContent = `乗車中: ${boarded}人 / 未着手: ${total - finished - boarded}人`;

            card.appendChild(header);
            card.appendChild(progressBase);
            card.appendChild(detail);
            container.appendChild(card);
        });

        if (container.childElementCount === 0) {
            const empty = document.createElement('p');
            empty.className = 'text-center';
            empty.style.padding = '2rem';
            empty.textContent = '予定がありません';
            container.appendChild(empty);
        }
    },

    // --- Bulk Editor Logic ---

    initEditTabUI() {
        const courseSelect = document.getElementById('edit-course-select');
        // Populate courses
        courseSelect.innerHTML = '';
        const defaultCourseOption = document.createElement('option');
        defaultCourseOption.value = '';
        defaultCourseOption.textContent = 'コースを選択';
        courseSelect.appendChild(defaultCourseOption);
        if (Store.data.courses) {
            Store.data.courses.forEach(c => {
                const op = document.createElement('option');
                op.value = c['コースID'];
                op.textContent = c['コース名'];
                courseSelect.appendChild(op);
            });
        }

        // Restore selected if any
        if (this.currentEditCourseId) {
            courseSelect.value = this.currentEditCourseId;
        }
    },

    reInitEditorState() {
        if (this.currentEditCourseId) {
            this.initEditor(this.currentEditCourseId, false); // false = don't reset draft if already loaded?
            // Actually, if we switched tabs or refreshed data, we should reload from Store
            // But if user has unsaved changes...
            // For now, simple version: Reload from store triggers overwrite.
            // Let's reload from Store.
            this.initEditor(this.currentEditCourseId, true);
        } else {
            document.getElementById('editor-container').classList.add('hidden');
            document.getElementById('editor-empty').classList.remove('hidden');
        }
    },

    async initEditor(courseId, reloadFromStore = true) {
        this.currentEditCourseId = courseId;

        if (!courseId) {
            document.getElementById('editor-container').classList.add('hidden');
            document.getElementById('editor-empty').classList.remove('hidden');
            this.updateEditorSummary();
            return;
        }

        document.getElementById('editor-container').classList.remove('hidden');
        document.getElementById('editor-empty').classList.add('hidden');

        // Populate Template Select for this Course AND 'common' templates?
        // For now, just course specific.
        // Note: We need to fetch templates for this course.
        this.renderTemplateOptionsForEditor(courseId);

        if (reloadFromStore) {
            // Filter schedules for this course
            const schedules = (Store.data.schedules || []).filter(s => s.courseId === courseId);
            // Sort by order
            schedules.sort((a, b) => (a.routeOrder || 99) - (b.routeOrder || 99));

            // Allow manual sort? For now, just display in order.

            // Deep copy for draft
            this.draftSchedules = schedules.map(s => ({ ...s }));
            this.originalDraftFingerprint = this.buildScheduleFingerprint(this.draftSchedules);
        }

        this.renderEditorTable();
    },

    async renderTemplateOptionsForEditor(courseId) {
        const templateSelect = document.getElementById('edit-template-select');
        templateSelect.innerHTML = '';
        const loadingOption = document.createElement('option');
        loadingOption.value = '';
        loadingOption.textContent = '読み込み中...';
        templateSelect.appendChild(loadingOption);
        try {
            const templates = await API.fetch('getTemplates', { courseId });
            templateSelect.innerHTML = '';
            const defaultTemplateOption = document.createElement('option');
            defaultTemplateOption.value = '';
            defaultTemplateOption.textContent = 'テンプレートを選択...';
            templateSelect.appendChild(defaultTemplateOption);
            templates.forEach(t => {
                const op = document.createElement('option');
                op.value = t.templateId;
                op.textContent = t.templateName;
                templateSelect.appendChild(op);
            });
        } catch (e) {
            console.warn(e);
            templateSelect.innerHTML = '';
            const errorOption = document.createElement('option');
            errorOption.textContent = 'エラー';
            templateSelect.appendChild(errorOption);
        }
    },

    async loadFromTemplate() {
        const templateId = document.getElementById('edit-template-select').value;
        if (!templateId) return;

            if (this.draftSchedules.length > 0) {
                if (!confirm('現在の編集内容を破棄して、テンプレートを展開しますか？')) return;
            }

            UI.showLoading(true);
            try {
                // We need template details. `API.fetch('getTemplates')` returns details in `items`.
                // But we already fetched them in renderTemplateOptionsForEditor... 
                // We should have stored them or fetch again.
                // Let's fetch again for simplicity or cache in Store.
                const courseId = this.currentEditCourseId;
                const templates = await API.fetch('getTemplates', { courseId });
                const template = templates.find(t => t.templateId === templateId);

                if (!template) throw new Error('Template not found');

                // Convert template items to schedules
                // item: { userId, type, time }

                // Note: Template items don't have vehicle info usually?
                // Or they might. Our getTemplates (Code.gs) returns: userId, type, time.
                // Where is vehicle? 
                // Previous implementation had vehicle in `registerScheduleFromTemplate`.
                // `registerScheduleFromTemplate` took `vehicleId` as argument from UI.

                // In Bulk Editor, we don't have a single vehicle selector.
                // We should assign a default vehicle or leave blank?
                // Let's leave blank or use first available.

                const users = Store.data.users || [];

                // Map to Draft Object
                this.draftSchedules = template.items.map((item, index) => {
                    const user = users.find(u => u['利用者ID'] === item.userId);
                    return {
                        scheduleId: null, // New
                        userId: item.userId,
                        userName: user ? user['氏名'] : item.userId,
                        type: item.type,
                        scheduledTime: item.time,
                        vehicleId: '', // User must select
                        vehicleName: '',
                        routeOrder: index + 1
                    };
                });

                this.originalDraftFingerprint = this.buildScheduleFingerprint([]);
                UI.toast('テンプレートを展開しました');
                this.renderEditorTable();

            } catch (e) {
                alert('展開失敗: ' + e.message);
            } finally {
                UI.showLoading(false);
            }
        },

        addEmptyRow() {
            this.draftSchedules.push({
                scheduleId: null,
                userId: '',
                userName: '',
                type: '迎え',
                scheduledTime: '09:00',
                vehicleId: '',
                vehicleName: '',
                routeOrder: this.draftSchedules.length + 1
            });
            this.renderEditorTable();
        },

        removeRow(index) {
            this.draftSchedules.splice(index, 1);
            this.renderEditorTable();
        },

        updateRow(index, field, value) {
            const item = this.draftSchedules[index];
            if (!item) return;
            item[field] = value;

            if (field === 'userId') {
                const u = (Store.data.users || []).find(user => user['利用者ID'] === value);
                item.userName = u ? u['氏名'] : '';
            }
            if (field === 'vehicleId') {
                const v = (Store.data.vehicles || []).find(veh => veh['車両ID'] === value);
                item.vehicleName = v ? v['車両名'] : '';
            }

            this.renderEditorTable();
        },

        getFilteredDraftSchedules() {
            const typeFilter = this.editFilters.type;
            const userFilter = (this.editFilters.user || '').trim().toLowerCase();
            const noVehicleFilter = this.editFilters.noVehicle;

            return this.draftSchedules
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => {
                    if (typeFilter && item.type !== typeFilter) return false;
                    if (noVehicleFilter && item.vehicleId) return false;
                    if (userFilter) {
                        const userName = item.userName || ((Store.data.users || []).find(u => u['利用者ID'] === item.userId)?.['氏名'] || '');
                        if (!String(userName).toLowerCase().includes(userFilter)) return false;
                    }
                    return true;
                });
        },

        normalizeScheduleForFingerprint(item) {
            return {
                userId: item.userId || '',
                type: item.type || '',
                scheduledTime: item.scheduledTime || '',
                vehicleId: item.vehicleId || ''
            };
        },

        buildScheduleFingerprint(schedules) {
            return JSON.stringify((schedules || []).map(s => this.normalizeScheduleForFingerprint(s)));
        },

        getRowErrors(index) {
            const row = this.draftSchedules[index];
            if (!row) return [];
            const errors = [];

            if (!row.userId) errors.push('利用者未選択');
            if (!row.scheduledTime) errors.push('時刻未入力');

            const duplicate = this.draftSchedules.some((target, targetIndex) => {
                if (targetIndex === index) return false;
                return target.userId && row.userId && target.userId === row.userId && target.type === row.type && target.scheduledTime === row.scheduledTime;
            });
            if (duplicate) errors.push('重複（同一利用者・種別・時刻）');

            return errors;
        },

        updateEditorSummary() {
            const total = this.draftSchedules.length;
            const unset = this.draftSchedules.filter(s => !s.userId || !s.scheduledTime || !s.vehicleId).length;
            const currentFingerprint = this.buildScheduleFingerprint(this.draftSchedules);
            const baseline = this.originalDraftFingerprint || this.buildScheduleFingerprint([]);
            const changed = currentFingerprint === baseline ? 0 : total;

            const totalEl = document.getElementById('summary-total');
            const unsetEl = document.getElementById('summary-unset');
            const changedEl = document.getElementById('summary-changed');
            if (totalEl) totalEl.textContent = String(total);
            if (unsetEl) unsetEl.textContent = String(unset);
            if (changedEl) changedEl.textContent = String(changed);
        },

        renderEditorTable() {
            const tbody = document.getElementById('editor-tbody');
            tbody.innerHTML = '';

            const vehicles = Store.data.vehicles || [];
            const users = Store.data.users || [];

            const filteredRows = this.getFilteredDraftSchedules();
            filteredRows.forEach(({ item, index }) => {
                const tr = document.createElement('tr');
                tr.dataset.rowIndex = String(index);

                const rowErrors = this.getRowErrors(index);
                if (rowErrors.length > 0) {
                    tr.style.background = '#fef2f2';
                    tr.style.outline = '1px solid #fecaca';
                    tr.title = rowErrors.join(' / ');
                }

                const timeTd = document.createElement('td');
                const timeInput = document.createElement('input');
                timeInput.type = 'time';
                timeInput.value = item.scheduledTime || '';
                timeInput.addEventListener('change', (e) => this.updateRow(index, 'scheduledTime', e.target.value));
                timeTd.appendChild(timeInput);
                tr.appendChild(timeTd);

                const typeTd = document.createElement('td');
                const typeSelect = document.createElement('select');
                ['迎え', '送り'].forEach(typeLabel => {
                    const option = document.createElement('option');
                    option.value = typeLabel;
                    option.textContent = typeLabel;
                    option.selected = item.type === typeLabel;
                    typeSelect.appendChild(option);
                });
                typeSelect.addEventListener('change', (e) => this.updateRow(index, 'type', e.target.value));
                typeTd.appendChild(typeSelect);
                tr.appendChild(typeTd);

                const userTd = document.createElement('td');
                const userSelect = document.createElement('select');
                const defaultUserOption = document.createElement('option');
                defaultUserOption.value = '';
                defaultUserOption.textContent = '選択...';
                userSelect.appendChild(defaultUserOption);
                users.forEach(u => {
                    const op = document.createElement('option');
                    op.value = u['利用者ID'];
                    op.textContent = u['氏名'];
                    if (u['利用者ID'] === item.userId) op.selected = true;
                    userSelect.appendChild(op);
                });
                userSelect.addEventListener('change', (e) => this.updateRow(index, 'userId', e.target.value));
                userTd.appendChild(userSelect);
                if (rowErrors.some(err => err.includes('利用者'))) {
                    const errorHint = document.createElement('div');
                    errorHint.style.fontSize = '0.72rem';
                    errorHint.style.color = '#b91c1c';
                    errorHint.textContent = '利用者を選択してください';
                    userTd.appendChild(errorHint);
                }
                tr.appendChild(userTd);

                const vehicleTd = document.createElement('td');
                const vehSelect = document.createElement('select');
                const defaultVehicleOption = document.createElement('option');
                defaultVehicleOption.value = '';
                defaultVehicleOption.textContent = '未指定';
                vehSelect.appendChild(defaultVehicleOption);
                vehicles.forEach(v => {
                    const op = document.createElement('option');
                    op.value = v['車両ID'];
                    op.textContent = v['車両名'];
                    if (v['車両ID'] === item.vehicleId) op.selected = true;
                    vehSelect.appendChild(op);
                });
                vehSelect.addEventListener('change', (e) => this.updateRow(index, 'vehicleId', e.target.value));
                vehicleTd.appendChild(vehSelect);
                tr.appendChild(vehicleTd);

                const actionTd = document.createElement('td');
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn-icon';
                const deleteIcon = document.createElement('span');
                deleteIcon.className = 'material-icons-round';
                deleteIcon.textContent = 'delete';
                deleteBtn.appendChild(deleteIcon);
                deleteBtn.addEventListener('click', () => this.removeRow(index));
                actionTd.appendChild(deleteBtn);
                if (rowErrors.some(err => err.includes('重複'))) {
                    const dupHint = document.createElement('div');
                    dupHint.style.fontSize = '0.72rem';
                    dupHint.style.color = '#b91c1c';
                    dupHint.textContent = '重複あり';
                    actionTd.appendChild(dupHint);
                }
                tr.appendChild(actionTd);

                tbody.appendChild(tr);
            });

            if (filteredRows.length === 0) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 5;
                td.style.textAlign = 'center';
                td.style.color = '#999';
                td.style.padding = '1rem';
                td.textContent = '条件に一致する行がありません';
                tr.appendChild(td);
                tbody.appendChild(tr);
            }

            this.updateEditorSummary();
        },

        async saveBulk() {
            if (!this.currentEditCourseId) return;

            const invalidRowIndex = this.draftSchedules.findIndex((_, index) => this.getRowErrors(index).length > 0);
            if (invalidRowIndex >= 0) {
                this.renderEditorTable();
                const rowEl = document.querySelector(`#editor-tbody tr[data-row-index="${invalidRowIndex}"]`);
                if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                alert('必須項目不足または重複があります。エラー行を確認してください。');
                return;
            }

            if (!confirm('この内容で保存しますか？\n(既存の予定は上書きされます)')) return;

            UI.showLoading(true);
            try {
                const payloadSchedules = this.draftSchedules.map((s, i) => ({
                    scheduleId: s.scheduleId,
                    userId: s.userId,
                    userName: s.userName,
                    type: s.type,
                    time: s.scheduledTime,
                    vehicleId: s.vehicleId,
                    vehicleName: s.vehicleName,
                    routeOrder: i + 1,
                    facilityId: this.getFacilityIdForCourse(this.currentEditCourseId)
                }));

                await API.post('bulkUpdateSchedules', {
                    date: Store.status.currentDate,
                    courseId: this.currentEditCourseId,
                    schedules: payloadSchedules
                });

                UI.toast('保存しました');
                this.originalDraftFingerprint = this.buildScheduleFingerprint(this.draftSchedules);
                this.refreshData();
            } catch (e) {
                console.error(e);
                alert('保存失敗: ' + e.message);
            } finally {
                UI.showLoading(false);
            }
        },

        getFacilityIdForCourse(courseId) {
            const c = (Store.data.courses || []).find(x => x['コースID'] === courseId);
            return c ? c['事業所ID'] : '';
        }
    };

    // INITIALIZATION
    window.addEventListener('DOMContentLoaded', () => {
        DataManager.init();
    });
