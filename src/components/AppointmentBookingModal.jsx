/**
 * src/components/AppointmentBookingModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Automated Appointment Booking Modal Component
 *
 * PURPOSE  : Shows available calendar slots, allows one-click booking,
 *            displays booking confirmation with confirmation code,
 *            and shows live CRM sync status after booking.
 *
 * INPUTS   : Props: { isOpen, onClose, onBooked, lead }
 * OUTPUTS  : Calls onBooked(appointment) when a slot is confirmed
 *
 * WHERE TO MODIFY:
 *   - Change slot display format → SlotButton sub-component
 *   - Add Google Calendar integration → crmAndCalendarService.js > bookAppointment()
 *   - Change confirmation email template → ConfirmationView
 *   - Add Calendly embed → replace slot list with <InlineWidget url={CALENDLY_URL} />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { getAvailableSlots, bookAppointment, formatSlotForDisplay, getCrmSyncStatus } from '../services/crmAndCalendarService';

// ── Sub-component: Individual slot button ──────────────────────────────────────
function SlotButton({ slot, selected, onSelect }) {
  const formatted = formatSlotForDisplay(slot);
  const isSelected = selected?.id === slot.id;

  return (
    <button
      onClick={() => onSelect(slot)}
      className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-200 ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50 shadow-sm'
          : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">{slot.label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{slot.duration_minutes} min · Product demo call</p>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
          isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
        }`}>
          {isSelected && <span className="text-white text-xs">✓</span>}
        </div>
      </div>
    </button>
  );
}

// ── Sub-component: Booking confirmation view ───────────────────────────────────
function ConfirmationView({ appointment, crmSyncState, onClose }) {
  return (
    <div className="text-center py-4">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl">✅</span>
      </div>
      <h3 className="text-xl font-bold text-gray-800 mb-1">Appointment Confirmed!</h3>
      <p className="text-gray-500 text-sm mb-4">
        Your meeting has been scheduled and calendar invites sent.
      </p>

      {/* Confirmation details */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left mb-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Confirmation Code</span>
            <span className="text-xs font-bold text-green-700 font-mono">{appointment.confirmationCode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Date & Time</span>
            <span className="text-xs font-semibold text-gray-700">{appointment.label}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Duration</span>
            <span className="text-xs font-semibold text-gray-700">{appointment.duration_minutes} minutes</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-gray-500">Type</span>
            <span className="text-xs font-semibold text-gray-700">Product Demo Call</span>
          </div>
        </div>
      </div>

      {/* CRM Sync status */}
      <div className={`flex items-center justify-center gap-2 py-2 px-4 rounded-full text-xs font-semibold mb-4 ${
        crmSyncState === 'success' ? 'bg-green-100 text-green-700' :
        crmSyncState === 'syncing' ? 'bg-amber-100 text-amber-700' :
        'bg-red-100 text-red-700'
      }`}>
        {crmSyncState === 'syncing' && <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />}
        {getCrmSyncStatus(crmSyncState).label}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 bg-indigo-50 rounded-xl p-3 text-xs text-indigo-700 text-left">
          <p className="font-bold mb-1">📧 Sent to</p>
          <p>{appointment.leadEmail || 'Calendar invite sent'}</p>
        </div>
        <div className="flex-1 bg-purple-50 rounded-xl p-3 text-xs text-purple-700 text-left">
          <p className="font-bold mb-1">📋 CRM Updated</p>
          <p>Status: Appointment Set</p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-all"
      >
        Done ✓
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AppointmentBookingModal({ isOpen, onClose, onBooked, lead }) {
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(null);
  const [crmSyncState, setCrmSyncState] = useState('idle');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  // Load slots when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setBooked(null);
    setSelectedSlot(null);
    setError('');

    setLoadingSlots(true);
    getAvailableSlots()
      .then(setSlots)
      .catch(err => setError(`Could not load slots: ${err.message}`))
      .finally(() => setLoadingSlots(false));
  }, [isOpen]);

  // Handle booking confirmation
  const handleBook = async () => {
    if (!selectedSlot || !lead) return;

    setBooking(true);
    setError('');

    try {
      const result = await bookAppointment({
        slotId: selectedSlot.id,
        leadId: lead.id,
        leadName: lead.name,
        leadEmail: lead.email,
        notes,
      });

      setBooked(result.appointment);

      // Simulate CRM sync
      setCrmSyncState('syncing');
      setTimeout(() => {
        setCrmSyncState('success');
        onBooked?.(result.appointment);
      }, 1500);

    } catch (err) {
      setError(err.message);
      setCrmSyncState('error');
    } finally {
      setBooking(false);
    }
  };

  if (!isOpen) return null;

  return (
    // Modal backdrop
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-green-600 p-5 text-white rounded-t-2xl flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📅</span>
              <h2 className="font-bold text-xl">Book Appointment</h2>
            </div>
            <p className="text-teal-200 text-sm mt-1">
              {lead ? `For ${lead.name} · ${lead.company}` : 'Select a time slot'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-5">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 mb-4">
              ⚠️ {error}
            </div>
          )}

          {/* Booking confirmed view */}
          {booked ? (
            <ConfirmationView appointment={booked} crmSyncState={crmSyncState} onClose={onClose} />
          ) : (
            <>
              {/* Slot selection */}
              <div className="mb-4">
                <h3 className="text-sm font-bold text-gray-700 mb-3">
                  🕐 Select a Time Slot
                </h3>
                {loadingSlots ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                  </div>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No available slots. Try again later.</p>
                ) : (
                  <div className="space-y-2">
                    {slots.map(slot => (
                      <SlotButton
                        key={slot.id}
                        slot={slot}
                        selected={selectedSlot}
                        onSelect={setSelectedSlot}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Optional notes */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  📝 Notes for the AE (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Prospect interested in Enterprise plan. Mentioned SOC2 compliance..."
                  rows={2}
                  className="w-full text-xs border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
              </div>

              {/* CRM sync indicator */}
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 mb-4 flex items-center gap-2">
                <span className="text-teal-500">🔄</span>
                <div>
                  <p className="text-xs font-semibold text-teal-700">Auto-CRM Sync Enabled</p>
                  <p className="text-xs text-teal-500">Booking will update lead status in CRM instantly</p>
                </div>
              </div>

              {/* Book button */}
              <button
                onClick={handleBook}
                disabled={!selectedSlot || booking || !lead}
                className="w-full bg-gradient-to-r from-teal-600 to-green-600 hover:from-teal-700 hover:to-green-700 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                {booking ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Booking & syncing to CRM...
                  </span>
                ) : (
                  `✅ Confirm Booking${selectedSlot ? ` · ${selectedSlot.label}` : ''}`
                )}
              </button>

              {!lead && (
                <p className="text-xs text-center text-gray-400 mt-2">
                  Select a lead first to enable booking
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
