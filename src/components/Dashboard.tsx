import Link from 'next/link';
import { BedDouble, Building2, CalendarCheck, CheckCircle2, ClipboardCheck, DoorOpen, LogOut, Plus, ReceiptText, WalletCards } from 'lucide-react';
import { StatCard } from './StatCard';
import type { DashboardData, HousekeepingStatus, Reservation, ReservationStatus, RoomStatus } from '../lib/types';
import { formatCurrency, getDashboardStats } from '../lib/dashboardMetrics';

interface CheckInResultMessage {
  message: string;
  reference: string;
  guest: string;
  room: string;
  early: boolean;
}

interface DashboardProps {
  data: DashboardData;
  staffName: string;
  logoutAction: () => Promise<void>;
  checkInAction: (formData: FormData) => Promise<void>;
  checkInError?: string;
  checkInResult?: CheckInResultMessage;
}

const roomStatusLabels: Record<RoomStatus, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  blocked: 'Blocked'
};

const reservationStatusLabels: Record<ReservationStatus, string> = {
  pending: 'Pending',
  reserved: 'Reserved',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No show'
};

const housekeepingStatusLabels: Record<HousekeepingStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  verified: 'Verified'
};

function isCheckInEligible(reservation: Reservation): boolean {
  return reservation.status === 'confirmed' || reservation.status === 'reserved';
}

function isEarlyCheckIn(reservation: Reservation): boolean {
  return reservation.checkIn > new Date().toISOString().slice(0, 10);
}

export function Dashboard({ data, staffName, logoutAction, checkInAction, checkInError = '', checkInResult }: DashboardProps) {
  const stats = getDashboardStats(data);
  const hasCheckInResult = Boolean(checkInResult?.message);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>{`Signed in as ${staffName}`}</p>
          <h1>{data.hotel.name}</h1>
        </div>
        <div className="topbar__actions">
          <Link className="text-action" href="/dashboard/reservations">
            <ReceiptText size={18} /> Reservations
          </Link>
          <Link className="text-action" href="/dashboard/rooms">
            <Building2 size={18} /> Rooms
          </Link>
          <Link className="primary-action" href="/dashboard/new-booking">
            <Plus size={18} /> New Booking
          </Link>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </button>
          </form>
        </div>
      </header>

      {checkInError ? <p className="dashboard-alert dashboard-alert--error">{checkInError}</p> : null}
      {hasCheckInResult ? (
        <div className="dashboard-alert dashboard-alert--success">
          <CheckCircle2 size={18} />
          <span>
            {checkInResult?.reference ? `${checkInResult.reference} - ` : ''}{checkInResult?.message}
            {checkInResult?.guest ? ` ${checkInResult.guest}` : ''}{checkInResult?.room ? ` is now in Room ${checkInResult.room}.` : ''}
            {checkInResult?.early ? ' Early check-in warning: reservation dates were not changed.' : ''}
          </span>
        </div>
      ) : null}

      <section className="stats-grid" aria-label="Hotel performance">
        <StatCard label="Occupancy" value={`${stats.occupancyRate}%`} detail={`${stats.availableRooms} rooms available`} icon={BedDouble} />
        <StatCard label="Arrivals" value={String(stats.arrivals)} detail="Expected today" icon={CalendarCheck} />
        <StatCard label="Departures" value={String(stats.departures)} detail="Expected today" icon={DoorOpen} />
        <StatCard label="Housekeeping" value={String(stats.openHousekeeping)} detail="Rooms cleaning" icon={ClipboardCheck} />
        <StatCard label="Active Stay Value" value={formatCurrency(stats.activeStayValue)} detail="Booked accommodation value" icon={WalletCards} />
        <StatCard label="Payments Received" value={formatCurrency(stats.paymentsReceived)} detail="Actual recorded payments" icon={ReceiptText} />
      </section>

      <section className="workspace-grid">
        <div className="panel panel--wide">
          <div className="panel__header">
            <h2>Rooms</h2>
            <span>{data.rooms.length} total</span>
          </div>
          {data.rooms.length > 0 ? (
            <div className="room-grid">
              {data.rooms.map((room) => (
                <article className="room-tile" data-status={room.status} key={room.id}>
                  <strong>{room.roomNumber}</strong>
                  <span>{room.typeName}</span>
                  <small>{roomStatusLabels[room.status]}</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No rooms have been created for this hotel.</p>
          )}
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>Reservations</h2>
            <span>{data.reservations.length} total</span>
          </div>
          {data.reservations.length > 0 ? (
            <div className="list-stack">
              {data.reservations.map((reservation) => (
                <article className="list-row reservation-row" key={reservation.id}>
                  <div>
                    <strong>{reservation.bookingReference ?? 'Pending reference'}</strong>
                    <span>{reservation.guestName} - Room {reservation.roomNumber}</span>
                    <span>{reservation.checkIn} to {reservation.checkOut}</span>
                    <span>{formatCurrency(reservation.totalStayValue)} total - {formatCurrency(reservation.nightlyRate)}/night</span>
                    <span>{formatCurrency(reservation.amountPaid)} paid - {formatCurrency(reservation.balance)} balance</span>
                    {isCheckInEligible(reservation) && isEarlyCheckIn(reservation) ? (
                      <small className="reservation-warning">Early check-in: scheduled for {reservation.checkIn}</small>
                    ) : null}
                  </div>
                  <div className="list-row__meta reservation-row__actions">
                    <small>{reservationStatusLabels[reservation.status]}</small>
                    {isCheckInEligible(reservation) ? (
                      <form action={checkInAction}>
                        <input type="hidden" name="reservationId" value={reservation.id} />
                        <button className="secondary-inline-action" type="submit">Check In</button>
                      </form>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No reservations yet.</p>
          )}
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>Housekeeping</h2>
            <span>{data.housekeeping.length} tasks</span>
          </div>
          {data.housekeeping.length > 0 ? (
            <div className="list-stack">
              {data.housekeeping.map((task) => (
                <article className="list-row" key={task.id}>
                  <div>
                    <strong>Room {task.roomNumber}</strong>
                    <span>{task.notes || 'No notes'}</span>
                  </div>
                  <div className="list-row__meta">
                    <small>{housekeepingStatusLabels[task.status]}</small>
                    <span>{task.dueOn}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No housekeeping tasks yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
