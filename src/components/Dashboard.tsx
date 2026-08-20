import { BedDouble, CalendarCheck, ClipboardCheck, DoorOpen, LogOut, WalletCards } from 'lucide-react';
import { StatCard } from './StatCard';
import type { DashboardData, HousekeepingStatus, ReservationStatus, RoomStatus } from '../lib/types';
import { formatCurrency, getDashboardStats } from '../lib/dashboardMetrics';

interface DashboardProps {
  data: DashboardData;
  staffName: string;
  logoutAction: () => Promise<void>;
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

export function Dashboard({ data, staffName, logoutAction }: DashboardProps) {
  const stats = getDashboardStats(data);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>{`Signed in as ${staffName}`}</p>
          <h1>{data.hotel.name}</h1>
        </div>
        <form action={logoutAction}>
          <button className="icon-button" type="submit" aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </form>
      </header>

      <section className="stats-grid" aria-label="Hotel performance">
        <StatCard label="Occupancy" value={`${stats.occupancyRate}%`} detail={`${stats.availableRooms} rooms available`} icon={BedDouble} />
        <StatCard label="Arrivals" value={String(stats.arrivals)} detail="Expected today" icon={CalendarCheck} />
        <StatCard label="Departures" value={String(stats.departures)} detail="Expected today" icon={DoorOpen} />
        <StatCard label="Housekeeping" value={String(stats.openHousekeeping)} detail="Open room tasks" icon={ClipboardCheck} />
        <StatCard label="Room revenue" value={formatCurrency(stats.expectedRoomRevenue)} detail="Active nightly value" icon={WalletCards} />
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
                <article className="list-row" key={reservation.id}>
                  <div>
                    <strong>{reservation.guestName}</strong>
                    <span>Room {reservation.roomNumber}</span>
                  </div>
                  <div className="list-row__meta">
                    <small>{reservationStatusLabels[reservation.status]}</small>
                    <span>{formatCurrency(reservation.balance)}</span>
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
