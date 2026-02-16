// common.js
// Shared logic for Driver App and Admin App

// CONFIGURATION
const API_URL = 'https://script.google.com/macros/s/AKfycbzsObRAaz7aKZ-6rD6GF9wMOCtJcVWFaqaCMWkSfiQ/exec';
const APP_VERSION = 'v1.0.21'; // Display Version

const ADMIN_REQUIRED_ACTIONS = [
    'updateMasterData',
    'bulkUpdateSchedules',
    'createTemplate'
];

function getApiVersionErrorMessage() {
    return '接続先APIが旧版です。GASの再デプロイまたはURL設定を確認してください';
}

function toUserFriendlyApiError(rawError) {
    if (rawError === 'Invalid action') {
        return getApiVersionErrorMessage();
    }
    return rawError;
}

function getTodayDateString() {
    const now = new Date();
    const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localTime.toISOString().split('T')[0];
}

// STATE MANAGEMENT
const Store = {
    data: {
        courses: [],
        templates: [],
        facilities: [],
        vehicles: [],
        users: [],
        schedules: [],
        pendingRecords: []
    },
    status: {
        currentFacility: null,
        currentCourse: null,
        currentVehicle: null,
        currentDriver: localStorage.getItem('ks_driver') || '',
        currentAttendant: localStorage.getItem('ks_attendant') || '',
        currentDate: getTodayDateString(),
        isOffline: !navigator.onLine
    },

    save() {
        localStorage.setItem('ks_data', JSON.stringify(this.data));
        localStorage.setItem('ks_status', JSON.stringify(this.status));
    },

    load() {
        const d = localStorage.getItem('ks_data');
        const s = localStorage.getItem('ks_status');
        if (d) this.data = JSON.parse(d);
        if (s) this.status = { ...this.status, ...JSON.parse(s) };

        // Always default to today's local date when the app is opened.
        this.status.currentDate = getTodayDateString();
    }
};

// API MANAGER
const API = {
    async fetch(action, params = {}) {
        if (Store.status.isOffline) throw new Error('Offline');

        const query = new URLSearchParams({ action, ...params }).toString();
        const response = await fetch(`${API_URL}?${query}`);
        const json = await response.json();

        if (!json.success) throw new Error(toUserFriendlyApiError(json.error || 'API Error'));
        return json.data;
    },

    async post(action, data) {
        if (Store.status.isOffline) throw new Error('Offline');

        // GAS deployment differences:
        // - newer backend reads `action` from JSON body
        // - older backend reads `action` from query parameter
        // Send both to avoid "Invalid action" on master save operations.
        const postUrl = `${API_URL}?${new URLSearchParams({ action }).toString()}`;

        const response = await fetch(postUrl, {
            method: 'POST',
            body: JSON.stringify({ action, ...data }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const json = await response.json();

        if (!json.success) throw new Error(toUserFriendlyApiError(json.error || 'API Error'));
        return json.data;
    },

    async getApiInfo() {
        return this.fetch('getApiInfo');
    },

    async ensureAdminCompatibility() {
        const apiInfo = await this.getApiInfo();
        const supportedActions = Array.isArray(apiInfo && apiInfo.supportedActions) ? apiInfo.supportedActions : [];
        const hasRequiredActions = ADMIN_REQUIRED_ACTIONS.every((action) => supportedActions.includes(action));

        if (!hasRequiredActions) {
            throw new Error(getApiVersionErrorMessage());
        }

        return apiInfo;
    }
};
