// All saving and loading lives here, so the storage method can be swapped
// later (e.g. for a cloud database) without touching the rest of the app.
//
// Data shape: { "2026-11-04": { flow, symptoms: [], mood, notes }, ... }

const KEY = 'cycle-tracker:entries:v1';

export function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function saveEntries(entries) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

// Ask the browser not to clear our data when the phone is low on space.
// Installed apps on Android Chrome are usually granted this.
export function requestPersistentStorage() {
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
}
