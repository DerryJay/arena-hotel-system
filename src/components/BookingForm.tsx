import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { BookingRoomOption } from '../lib/booking';
import { formatCurrency } from '../lib/dashboardMetrics';

interface RoomTypeOption {
  id: string;
  name: string;
  baseRate: number;
}

interface BookingFormProps {
  action: (formData: FormData) => Promise<void>;
  availableRooms: BookingRoomOption[];
  checkIn: string;
  checkOut: string;
  error: string;
  roomTypeId: string;
  roomTypes: RoomTypeOption[];
}

export function BookingForm({ action, availableRooms, checkIn, checkOut, error, roomTypeId, roomTypes }: BookingFormProps) {
  const hasValidDates = Boolean(checkIn && checkOut && checkOut > checkIn);
  const defaultRoom = availableRooms[0];
  const defaultRate = defaultRoom?.baseRate ?? roomTypes.find((roomType) => roomType.id === roomTypeId)?.baseRate ?? roomTypes[0]?.baseRate ?? 0;

  return (
    <section className="booking-layout">
      <form className="panel booking-filter" method="get" action="/dashboard/new-booking">
        <div className="panel__header">
          <h2>Availability</h2>
          <span>{availableRooms.length} rooms</span>
        </div>
        <div className="form-grid">
          <label>
            Check-in date
            <input name="checkIn" type="date" defaultValue={checkIn} required />
          </label>
          <label>
            Check-out date
            <input name="checkOut" type="date" defaultValue={checkOut} required />
          </label>
          <label>
            Room type
            <select name="roomTypeId" defaultValue={roomTypeId}>
              <option value="">Any room type</option>
              {roomTypes.map((roomType) => (
                <option value={roomType.id} key={roomType.id}>{roomType.name}</option>
              ))}
            </select>
          </label>
          <button type="submit">
            <Plus size={18} /> Check availability
          </button>
        </div>
      </form>

      <form className="panel booking-form" action={action}>
        <div className="panel__header">
          <h2>Guest and stay</h2>
          <span>{hasValidDates ? 'Ready' : 'Choose dates first'}</span>
        </div>

        {error ? <p className="form-message" role="alert">{error}</p> : null}

        <input name="checkIn" type="hidden" value={checkIn} />
        <input name="checkOut" type="hidden" value={checkOut} />
        <input name="roomTypeId" type="hidden" value={roomTypeId} />

        <div className="form-grid">
          <label>
            Guest full name
            <input name="guestName" type="text" autoComplete="name" required />
          </label>
          <label>
            Phone number
            <input name="phone" type="tel" autoComplete="tel" required />
          </label>
          <label>
            Email optional
            <input name="email" type="email" autoComplete="email" />
          </label>
          <label>
            Adults
            <input name="adults" type="number" min="1" defaultValue="1" required />
          </label>
          <label>
            Children
            <input name="children" type="number" min="0" defaultValue="0" required />
          </label>
          <label>
            Booking source
            <select name="source" defaultValue="front_desk">
              <option value="front_desk">Front desk</option>
              <option value="phone">Phone</option>
              <option value="walk_in">Walk in</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label>
            Available room
            <select name="selectedRoomId" defaultValue={defaultRoom?.id ?? ''} required disabled={!hasValidDates || availableRooms.length === 0}>
              <option value="">Select room</option>
              {availableRooms.map((room) => (
                <option value={room.id} key={room.id}>
                  {room.roomNumber} - {room.roomTypeName} - {formatCurrency(room.baseRate)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nightly rate
            <input name="nightlyRate" type="number" min="0" step="100" defaultValue={defaultRate} required />
          </label>
          <label className="form-grid__wide">
            Notes optional
            <textarea name="notes" rows={4} />
          </label>
        </div>

        {!hasValidDates ? <p className="empty-state">Select valid dates to see available rooms.</p> : null}
        {hasValidDates && availableRooms.length === 0 ? <p className="empty-state">No rooms are available for this date range.</p> : null}

        <div className="form-actions">
          <Link className="text-action" href="/dashboard">Cancel</Link>
          <button type="submit" disabled={!hasValidDates || availableRooms.length === 0}>
            <Plus size={18} /> Confirm booking
          </button>
        </div>
      </form>
    </section>
  );
}

