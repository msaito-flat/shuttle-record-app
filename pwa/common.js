// common.js
// Shared logic for Driver App and Admin App

// CONFIGURATION
const API_URL = 'https://script.google.com/macros/s/AKfycbwj5ZNC3gTMZzMsjFGatdOfFn6o7GOGSHPfImS1Dcj_BRDTKmunOzsNLTXVBWexMg/exec';
const APP_VERSION = 'v1.0.14'; // Display Version

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
        currentDate: new Date().toISOString().split('T')[0],
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
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const json = await response.json();

        if (!json.success) throw new Error(json.error || 'API Error');
        return json.data;
    }
};
