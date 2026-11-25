/**
 * src/services/crmAndCalendarService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — CRM Lead Management & Calendar Booking Service
 *
 * PURPOSE  : Handles available slot lookup, appointment creation, and CRM
 *            lead record updates. All operations go through the local Express
 *            server (port 3001) which uses mockCrmRecords.json as its data store.
 *            Swap the base URL constants for production CRM/calendar APIs.
 *
 * INPUTS   : Lead ID, slot ID, booking details, BANT/sentiment scores
 * OUTPUTS  : Appointment confirmation object, updated lead record, slot list
 *
 * WHERE TO MODIFY:
 *   - Switch to real HubSpot → replace fetch calls in updateCrmLead()
 *   - Switch to Google Calendar → replace bookAppointment() fetch with gcal API
 *   - Change API base URL → API_BASE constant
 *   - Extend lead fields → see updateCrmLead() payload
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// ── Generic fetch wrapper with error handling ─────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'TypeError') {
      // Network error — server likely not running
      throw new Error('Cannot connect to Fortivex API server. Run: npm run server');
    }
    throw err;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CALENDAR — Slot Availability
// ════════════════════════════════════════════════════════════════════════════

/**
 * Fetches available appointment slots from the backend.
 * In production: replace with Google Calendar / Calendly API call.
 * @returns {Promise<Array>} Array of { id, date, time, label, duration_minutes, available }
 */
export async function getAvailableSlots() {
  const data = await apiFetch('/api/calendar/slots');
  return data.slots || [];
}

/**
 * Books an appointment for a lead.
 * @param {Object} booking
 * @param {string} booking.slotId     - ID of the chosen calendar slot
 * @param {string} booking.leadId     - CRM lead ID
 * @param {string} booking.leadName   - Full name of the prospect
 * @param {string} booking.leadEmail  - Email for calendar invite
 * @param {string} booking.notes      - Optional notes to attach to appointment
 * @returns {Promise<Object>} { success, appointment: { id, confirmationCode, ... } }
 */
export async function bookAppointment({ slotId, leadId, leadName, leadEmail, notes = '' }) {
  if (!slotId || !leadId || !leadName) {
    throw new Error('slotId, leadId, and leadName are required to book an appointment');
  }

  const data = await apiFetch('/api/calendar/book', {
    method: 'POST',
    body: JSON.stringify({ slotId, leadId, leadName, leadEmail, notes }),
  });

  return data;
}

// ════════════════════════════════════════════════════════════════════════════
// CRM — Lead Management
// ════════════════════════════════════════════════════════════════════════════

/**
 * Fetches all lead records from the CRM.
 * @returns {Promise<Array>} Array of lead objects
 */
export async function getAllLeads() {
  const data = await apiFetch('/api/crm/leads');
  return data.leads || [];
}

/**
 * Updates a CRM lead record with post-call data.
 * Called at the end of each turn or when the call ends.
 * @param {string} leadId
 * @param {Object} updates - Partial lead update { bant_score, sentiment_score, status, notes }
 * @returns {Promise<Object>} Updated lead record
 */
export async function updateCrmLead(leadId, updates) {
  if (!leadId) throw new Error('leadId is required');

  const data = await apiFetch(`/api/crm/leads/${leadId}/update`, {
    method: 'POST',
    body: JSON.stringify(updates),
  });

  return data.lead;
}

/**
 * Convenience function: syncs BANT + sentiment to CRM after each turn.
 * @param {string} leadId
 * @param {Object} bantScores - { budget, authority, need, timeline }
 * @param {number} sentimentScore - 0–1
 * @param {string} qualificationStatus - 'hot' | 'warm' | 'cold'
 */
export async function syncLeadScoresToCrm(leadId, bantScores, sentimentScore, qualificationStatus) {
  const avgBant = Object.values(bantScores).reduce((a, b) => a + b, 0) / 4;

  const statusMap = { hot: 'hot', warm: 'warm', cold: 'cold' };
  return updateCrmLead(leadId, {
    bant_score: Math.round(avgBant),
    sentiment_score: parseFloat(sentimentScore.toFixed(2)),
    status: statusMap[qualificationStatus] || 'in_progress',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS (UI display)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Formats a slot object for display in AppointmentBookingModal.
 * @param {Object} slot
 * @returns {Object} Display-friendly slot
 */
export function formatSlotForDisplay(slot) {
  return {
    ...slot,
    displayTime: `${slot.label} (${slot.duration_minutes} min)`,
    dateFormatted: new Date(`${slot.date}T${slot.time}:00Z`).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
  };
}

/**
 * Builds a CRM sync status message for the UI status indicator.
 * @param {'idle'|'syncing'|'success'|'error'} state
 * @param {Object} lead - Lead data (optional)
 * @returns {{ label: string, color: string }}
 */
export function getCrmSyncStatus(state, lead = null) {
  const statusMap = {
    idle:    { label: 'CRM: Ready',         color: '#6b7280' },
    syncing: { label: 'CRM: Syncing...',    color: '#f59e0b' },
    success: { label: `CRM: Synced ✓`,     color: '#10b981' },
    error:   { label: 'CRM: Sync Failed',  color: '#ef4444' },
  };
  return statusMap[state] || statusMap.idle;
}
