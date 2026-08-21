import Link from 'next/link';
import { AlertTriangle, Banknote, CheckCircle2, ClipboardCheck, CreditCard, DoorClosed, Link2, Search } from 'lucide-react';
import { formatCurrency } from '../lib/dashboardMetrics';
import type { ReservationDetails, ReservationListItem, ReservationPaymentStatus } from '../lib/reservations';
import type { ReservationStatus } from '../lib/types';

interface ReservationsManagementProps {
  checkInAction: (formData: FormData) => Promise<void>;
  checkInError: string;
  checkInSuccess: string;
  checkoutAction: (formData: FormData) => Promise<void>;
  checkoutError: string;
  checkoutSuccess: string;
  paystackAction: (formData: FormData) => Promise<void>;
  paystackError: string;
  paystackReference: string;
  paystackSuccess: string;
  paystackUrl: string;
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
  pos_card: 'POS/Card',
  paystack_card: 'Paystack/Card'
};

function isCheckInEligible(reservation: ReservationListItem): boolean {
  return reservation.reservationStatus === 'confirmed' || reservation.reservationStatus === 'reserved';
}

function isCheckoutEligible(reservation: ReservationListItem): boolean {
  return reservation.reservationStatus === 'checked_in';
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
  const receivedPayments = reservation.payments.filter((payment) => payment.status === 'paid' || payment.status === 'partially_paid');

  if (receivedPayments.length === 0) {
    return <p className="empty-state">No payments recorded yet.</p>;
  }

  return (
    <div className="payment-list">
      {receivedPayments.map((payment) => (
        <article className="payment-row" key={payment.id}>
          <div className="payment-row__main">
            <strong>{formatCurrency(payment.amount)}</strong>
            <span>{paymentMethodLabels[payment.method] ?? payment.method}</span>
            {payment.reference ? <small>Reference: {payment.reference}</small> : null}
            {payment.notes ? <small>Note: {payment.notes}</small> : null}
          </div>
          <time dateTime={payment.postedAt}>{formatDateTime(payment.postedAt)}</time>
        </article>
      ))}
    </div>
  );
}

function ReservationDetailsPanel({
  checkInAction,
  checkoutAction,
  paystackAction,
  paymentAction,
  paymentKey,
  reservation
}: {
  checkInAction: (formData: FormData) => Promise<void>;
  checkoutAction: (formData: FormData) => Promise<void>;
  paystackAction: (formData: FormData) => Promise<void>;
  paymentAction: (formData: FormData) => Promise<void>;
  paymentKey: string;
  reservation: ReservationDetails;
}) {
  const returnTo = reservationDetailPath(reservation.id);
  const hasBalance = reservation.balance > 0;

  return (
    <div className="panel reservation-detail-panel">
      <div className="panel__header reservation-detail-header">
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
          <small>Folio charges</small>
          <strong>{formatCurrency(reservation.folioCharges)}</strong>
        </div>
        <div>
          <small>Payments received</small>
          <strong>{formatCurrency(reservation.amountPaid)}</strong>
        </div>
        <div>
          <small>Outstanding balance</small>
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

        {isCheckoutEligible(reservation) ? (
          <form className="checkout-form" action={checkoutAction}>
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="checkout-summary">
              <strong>Check out {reservation.guestName}</strong>
              <span>{reservation.bookingReference} - Room {reservation.roomNumber}</span>
              <span>Outstanding balance: {formatCurrency(reservation.balance)}</span>
            </div>
            {hasBalance ? (
              <label className="checkout-confirmation">
                <input type="checkbox" name="confirmBalanceDue" value="yes" required />
                <span>I confirm checkout with an outstanding balance due.</span>
              </label>
            ) : null}
            {hasBalance ? (
              <p className="checkout-warning"><AlertTriangle size={16} /> This checkout will record an unpaid balance.</p>
            ) : null}
            <button className="secondary-inline-action" type="submit">
              <DoorClosed size={16} /> Check Out
            </button>
          </form>
        ) : null}
      </div>

      <div className="payment-workspace">
        <section className="payment-history-section">
          <h3>Payments Already Received</h3>
          <PaymentHistory reservation={reservation} />
        </section>

        <form className="record-payment-form" action={paystackAction}>
          <h3>Pay Online</h3>
          <input type="hidden" name="reservationId" value={reservation.id} />
          <label>
            Amount to pay
            <input name="paystackAmount" type="number" min="1" max={Math.max(1, reservation.balance)} step="1" defaultValue={reservation.balance > 0 ? reservation.balance : undefined} required disabled={reservation.balance <= 0} />
          </label>
          <label>
            Guest email
            <input name="paystackEmail" type="email" defaultValue={reservation.guestEmail} required disabled={reservation.balance <= 0} />
          </label>
          {!reservation.guestEmail && reservation.balance > 0 ? <p className="form-message">Paystack requires a customer email for online payment links.</p> : null}
          {reservation.balance <= 0 ? <p className="form-message">This reservation is fully paid.</p> : null}
          <button type="submit" disabled={reservation.balance <= 0}>
            <Link2 size={18} /> Generate Paystack Link
          </button>
        </form>

        <form className="record-payment-form" action={paymentAction}>
          <h3>Record Payment</h3>
          <input type="hidden" name="reservationId" value={reservation.id} />
          <input type="hidden" name="paymentKey" value={paymentKey} />
          <input type="hidden" name="outstandingBalance" value={reservation.balance} />
          <label>
            Amount received
            <input name="amount" type="number" min="1" max={Math.max(1, reservation.balance)} step="1" required disabled={reservation.balance <= 0} />
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
          {reservation.balance <= 0 ? <p className="form-message">This reservation is fully paid.</p> : null}
          <button type="submit" disabled={reservation.balance <= 0}>
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
  checkoutAction,
  checkoutError,
  checkoutSuccess,
  paystackAction,
  paystackError,
  paystackReference,
  paystackSuccess,
  paystackUrl,
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
      {paystackError ? <p className="dashboard-alert dashboard-alert--error">{paystackError}</p> : null}
      {paystackSuccess ? (
        <div className="dashboard-alert dashboard-alert--success dashboard-alert--stacked">
          <span><CheckCircle2 size={18} /> {paystackSuccess}</span>
          {paystackUrl ? <a href={paystackUrl} target="_blank" rel="noreferrer">Open Paystack checkout link</a> : null}
          {paystackUrl ? <code>{paystackUrl}</code> : null}
          {paystackReference ? <small>Reference: {paystackReference}</small> : null}
        </div>
      ) : null}
      {checkInError ? <p className="dashboard-alert dashboard-alert--error">{checkInError}</p> : null}
      {checkInSuccess ? <p className="dashboard-alert dashboard-alert--success"><CheckCircle2 size={18} /> {checkInSuccess}</p> : null}
      {checkoutError ? <p className="dashboard-alert dashboard-alert--error">{checkoutError}</p> : null}
      {checkoutSuccess ? <p className="dashboard-alert dashboard-alert--success"><CheckCircle2 size={18} /> {checkoutSuccess}</p> : null}

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
            checkoutAction={checkoutAction}
            paystackAction={paystackAction}
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
