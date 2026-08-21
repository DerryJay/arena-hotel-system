import Link from 'next/link';
import { Banknote, CheckCircle2, ClipboardCheck, CreditCard, Search } from 'lucide-react';
import { formatCurrency } from '../lib/dashboardMetrics';
import type { ReservationDetails, ReservationListItem, ReservationPaymentStatus } from '../lib/reservations';
import type { ReservationStatus } from '../lib/types';

interface ReservationsManagementProps {
  checkInAction: (formData: FormData) => Promise<void>;
  checkInError: string;
  checkInSuccess: string;
  paymentAction: (formData: FormData) => Promise<void>;
  paymentError: string;
  paymentKey: string;
  paymentSuccess: string;
  reservations: ReservationListItem[];
  search: string;
  selectedReservation?: ReservationDetails;
  status: string;
}

const reservationStatusLabels: Record<ReservationStatus, string> = {
  pending: 'Pending',
  reserved: 'Reserved',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No show'
};

const paymentStatusLabels: Record<ReservationPaymentStatus, string> = {
  unpaid: 'Unpaid',
  part_paid: 'Part Paid',
  paid: 'Paid'
};

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  pos_card: 'POS/Card'
};

function isCheckInEligible(reservation: ReservationListItem): boolean {
  return reservation.reservationStatus === 'confirmed' || reservation.reservationStatus === 'reserved';
}

function reservationDetailPath(reservationId: string): string {
  return `/dashboard/reservations?reservation=${encodeURIComponent(reservationId)}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos'
  }).format(new Date(value));
}

function PaymentHistory({ reservation }: { reservation: ReservationDetails }) {
  if (reservation.payments.length === 0) {
    return <p className="empty-state">No payments recorded yet.</p>;
  }

  return (
    <div className="payment-list">
      {reservation.payments.map((payment) => (
        <div className="payment-row" key={payment.id}>
          <div>
            <strong>{formatCurrency(payment.amount)}</strong>
            <span>{paymentMethodLabels[payment.method] ?? payment.method}</span>
            {payment.reference ? <small>{payment.reference}</small> : null}
            {payment.notes ? <small>{payment.notes}</small> : null}
          </div>
          <small>{formatDateTime(payment.postedAt)}</small>
        </div>
      ))}
    </div>
  );
}

function ReservationDetailsPanel({
  checkInAction,
  paymentAction,
  paymentKey,
  reservation
}: {
  checkInAction: (formData: FormData) => Promise<void>;
  paymentAction: (formData: FormData) => Promise<void>;
  paymentKey: string;
  reservation: ReservationDetails;
}) {
  const returnTo = reservationDetailPath(reservation.id);

  return (
    <div className="panel reservation-detail-panel">
      <div className="panel__header">
        <div>
          <h2>{reservation.bookingReference}</h2>
          <span>{reservation.guestName} - Room {reservation.roomNumber}</span>
        </div>
        <span className="status-badge" data-status={reservation.reservationStatus}>{reservationStatusLabels[reservation.reservationStatus]}</span>
      </div>

      <div className="reservation-detail-grid">
        <div>
          <small>Guest</small>
          <strong>{reservation.guestName}</strong>
          <span>{reservation.guestPhone || 'No phone'}</span>
          <span>{reservation.guestEmail || 'No email'}</span>
        </div>
        <div>
          <small>Room</small>
          <strong>{reservation.roomNumber}</strong>
          <span>{reservation.roomTypeName}</span>
        </div>
        <div>
          <small>Stay</small>
          <strong>{reservation.checkIn} to {reservation.checkOut}</strong>
          <span>{reservation.nights} nights</span>
          <span>{reservation.adults} adults, {reservation.children} children</span>
        </div>
        <div>
          <small>Source</small>
          <strong>{reservation.source}</strong>
          <span>Created {formatDateTime(reservation.createdAt)}</span>
        </div>
      </div>

      <div className="finance-strip">
        <div>
          <small>Nightly rate</small>
          <strong>{formatCurrency(reservation.nightlyRate)}</strong>
        </div>
        <div>
          <small>Total accommodation</small>
          <strong>{formatCurrency(reservation.stayValue)}</strong>
        </div>
        <div>
          <small>Payments received</small>
          <strong>{formatCurrency(reservation.amountPaid)}</strong>
        </div>
        <div>
          <small>Balance</small>
          <strong>{formatCurrency(reservation.balance)}</strong>
        </div>
        <div>
          <small>Payment status</small>
          <strong>{paymentStatusLabels[reservation.paymentStatus]}</strong>
        </div>
      </div>

      <div className="reservation-actions">
        {isCheckInEligible(reservation) ? (
          <form action={checkInAction}>
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="secondary-inline-action" type="submit">
              <ClipboardCheck size={16} /> Check In
            </button>
          </form>
        ) : null}
      </div>

      <div className="payment-workspace">
        <section>
          <h3>Payments Already Received</h3>
          <PaymentHistory reservation={reservation} />
        </section>

        <form className="record-payment-form" action={paymentAction}>
          <h3>Record Payment</h3>
          <input type="hidden" name="reservationId" value={reservation.id} />
          <input type="hidden" name="paymentKey" value={paymentKey} />
          <label>
            Amount received
            <input name="amount" type="number" min="1" step="100" required />
          </label>
          <label>
            Payment method
            <select name="method" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="pos_card">POS/Card</option>
            </select>
          </label>
          <label>
            Reference optional
            <input name="reference" type="text" />
          </label>
          <label>
            Note optional
            <textarea name="notes" rows={3} />
          </label>
          <button type="submit">
            <Banknote size={18} /> Record Payment
          </button>
        </form>
      </div>
    </div>
  );
}

export function ReservationsManagement({
  checkInAction,
  checkInError,
  checkInSuccess,
  paymentAction,
  paymentError,
  paymentKey,
  paymentSuccess,
  reservations,
  search,
  selectedReservation,
  status
}: ReservationsManagementProps) {
  return (
    <section className="reservations-layout">
      {paymentError ? <p className="dashboard-alert dashboard-alert--error">{paymentError}</p> : null}
      {paymentSuccess ? <p className="dashboard-alert dashboard-alert--success"><CheckCircle2 size={18} /> {paymentSuccess}</p> : null}
      {checkInError ? <p className="dashboard-alert dashboard-alert--error">{checkInError}</p> : null}
      {checkInSuccess ? <p className="dashboard-alert dashboard-alert--success"><CheckCircle2 size={18} /> {checkInSuccess}</p> : null}

      <form className="panel reservation-filter" method="get" action="/dashboard/reservations">
        <div className="panel__header">
          <h2>Reservations Management</h2>
          <span>{reservations.length} reservations</span>
        </div>
        <div className="form-grid form-grid--compact">
          <label>
            Search
            <input name="search" type="search" defaultValue={search} placeholder="Reference, guest, phone, room" />
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">All statuses</option>
              {Object.entries(reservationStatusLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <button type="submit">
            <Search size={18} /> Search
          </button>
        </div>
      </form>

      <div className="reservations-grid-layout">
        <div className="panel reservations-table-panel">
          <div className="panel__header">
            <h2>Reservations</h2>
            <span>Live data</span>
          </div>
          {reservations.length > 0 ? (
            <div className="rooms-table-wrap">
              <table className="rooms-table reservations-table">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>Guest</th>
                    <th>Room</th>
                    <th>Dates</th>
                    <th>Nights</th>
                    <th>Rate</th>
                    <th>Stay Value</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((reservation) => (
                    <tr key={reservation.id}>
                      <td><Link className="table-link" href={reservationDetailPath(reservation.id)}>{reservation.bookingReference}</Link></td>
                      <td>{reservation.guestName}<br /><small>{reservation.guestPhone || '-'}</small></td>
                      <td>{reservation.roomNumber}<br /><small>{reservation.roomTypeName}</small></td>
                      <td>{reservation.checkIn}<br /><small>{reservation.checkOut}</small></td>
                      <td>{reservation.nights}</td>
                      <td>{formatCurrency(reservation.nightlyRate)}</td>
                      <td>{formatCurrency(reservation.stayValue)}</td>
                      <td>{formatCurrency(reservation.amountPaid)}</td>
                      <td>{formatCurrency(reservation.balance)}</td>
                      <td><span className="status-badge" data-status={reservation.reservationStatus}>{reservationStatusLabels[reservation.reservationStatus]}</span></td>
                      <td><span className="payment-badge" data-status={reservation.paymentStatus}><CreditCard size={14} /> {paymentStatusLabels[reservation.paymentStatus]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No reservations match these filters.</p>
          )}
        </div>

        {selectedReservation ? (
          <ReservationDetailsPanel
            checkInAction={checkInAction}
            paymentAction={paymentAction}
            paymentKey={paymentKey}
            reservation={selectedReservation}
          />
        ) : (
          <div className="panel reservation-detail-panel">
            <div className="panel__header">
              <h2>Reservation Details</h2>
              <span>Empty</span>
            </div>
            <p className="empty-state">Select a reservation to see details and record payment.</p>
          </div>
        )}
      </div>
    </section>
  );
}
