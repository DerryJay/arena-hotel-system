import Link from 'next/link';
import { Edit3, Plus, Search } from 'lucide-react';
import { formatCurrency } from '../lib/dashboardMetrics';
import type { ManagedRoom, RoomTypeManagementOption } from '../lib/rooms';
import type { RoomStatus } from '../lib/types';

interface RoomManagementProps {
  action: (formData: FormData) => Promise<void>;
  editRoomId: string;
  error: string;
  rooms: ManagedRoom[];
  roomTypes: RoomTypeManagementOption[];
  search: string;
  status: string;
  success: string;
}

const roomStatusLabels: Record<RoomStatus, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  blocked: 'Blocked'
};

const editableStatuses: RoomStatus[] = ['available', 'cleaning', 'maintenance', 'blocked'];

function getRoomType(roomTypes: RoomTypeManagementOption[], roomTypeId: string) {
  return roomTypes.find((roomType) => roomType.id === roomTypeId) ?? roomTypes[0];
}

function RoomForm({ action, room, roomTypes }: { action: (formData: FormData) => Promise<void>; room?: ManagedRoom; roomTypes: RoomTypeManagementOption[] }) {
  const selectedType = getRoomType(roomTypes, room?.typeId ?? '');
  const isOccupied = room?.status === 'occupied';

  return (
    <form className="panel room-editor" action={action}>
      <div className="panel__header">
        <h2>{room ? `Edit Room ${room.roomNumber}` : 'Add Room'}</h2>
        <span>{room ? roomStatusLabels[room.status] : 'New'}</span>
      </div>
      {room ? <input type="hidden" name="roomId" value={room.id} /> : null}
      <div className="form-grid">
        <label>
          Room
          <input name="roomNumber" type="text" defaultValue={room?.roomNumber ?? ''} required />
        </label>
        <label>
          Type
          <select name="roomTypeId" defaultValue={room?.typeId ?? selectedType?.id ?? ''} required>
            {roomTypes.map((roomType) => (
              <option value={roomType.id} key={roomType.id}>{roomType.name}</option>
            ))}
          </select>
        </label>
        <label>
          Rate/Night
          <input name="baseRate" type="number" min="0" step="100" defaultValue={room?.baseRate ?? selectedType?.baseRate ?? 0} required />
        </label>
        <label>
          Floor
          <input name="floor" type="text" defaultValue={room?.floor ?? ''} />
        </label>
        <label>
          Capacity
          <input name="capacity" type="number" min="1" defaultValue={room?.capacity ?? selectedType?.capacity ?? 1} required />
        </label>
        <label>
          Status
          {isOccupied ? (
            <>
              <input type="hidden" name="status" value="occupied" />
              <input value="Occupied" disabled />
            </>
          ) : (
            <select name="status" defaultValue={room?.status ?? 'available'}>
              {editableStatuses.map((statusOption) => (
                <option value={statusOption} key={statusOption}>{roomStatusLabels[statusOption]}</option>
              ))}
            </select>
          )}
        </label>
        <label className="form-grid__wide">
          Description
          <textarea name="description" rows={3} defaultValue={room?.description ?? selectedType?.description ?? ''} />
        </label>
        <label className="form-grid__wide">
          Notes
          <textarea name="notes" rows={3} defaultValue={room?.notes ?? ''} />
        </label>
      </div>
      {isOccupied ? <p className="empty-state">Occupied status is controlled by check-in and checkout.</p> : null}
      <div className="form-actions">
        {room ? <Link className="text-action" href="/dashboard/rooms">Cancel</Link> : null}
        <button type="submit">
          <Plus size={18} /> {room ? 'Save Room' : 'Add Room'}
        </button>
      </div>
    </form>
  );
}

export function RoomManagement({ action, editRoomId, error, rooms, roomTypes, search, status, success }: RoomManagementProps) {
  const editRoom = rooms.find((room) => room.id === editRoomId);

  return (
    <section className="rooms-layout">
      {error ? <p className="dashboard-alert dashboard-alert--error">{error}</p> : null}
      {success ? <p className="dashboard-alert dashboard-alert--success">{success}</p> : null}

      <form className="panel room-filter" method="get" action="/dashboard/rooms">
        <div className="panel__header">
          <h2>Room Management</h2>
          <span>{rooms.length} rooms</span>
        </div>
        <div className="form-grid form-grid--compact">
          <label>
            Search
            <input name="search" type="search" defaultValue={search} placeholder="Room number" />
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="">All statuses</option>
              {(['available', 'occupied', 'cleaning', 'maintenance', 'blocked'] as RoomStatus[]).map((statusOption) => (
                <option value={statusOption} key={statusOption}>{roomStatusLabels[statusOption]}</option>
              ))}
            </select>
          </label>
          <button type="submit">
            <Search size={18} /> Search
          </button>
        </div>
      </form>

      <div className="rooms-grid-layout">
        <div className="panel rooms-table-panel">
          <div className="panel__header">
            <h2>Rooms</h2>
            <Link className="text-action" href="/dashboard/rooms">Add Room</Link>
          </div>
          {rooms.length > 0 ? (
            <div className="rooms-table-wrap">
              <table className="rooms-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Type</th>
                    <th>Rate/Night</th>
                    <th>Status</th>
                    <th>Floor</th>
                    <th>Capacity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.id}>
                      <td>{room.roomNumber}</td>
                      <td>{room.typeName}</td>
                      <td>{formatCurrency(room.baseRate)}</td>
                      <td><span className="status-badge" data-status={room.status}>{roomStatusLabels[room.status]}</span></td>
                      <td>{room.floor || '-'}</td>
                      <td>{room.capacity}</td>
                      <td>
                        <Link className="icon-text-action" href={`/dashboard/rooms?edit=${room.id}`}>
                          <Edit3 size={16} /> Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No rooms match these filters.</p>
          )}
        </div>

        {roomTypes.length > 0 ? (
          <RoomForm action={action} room={editRoom} roomTypes={roomTypes} />
        ) : (
          <div className="panel">
            <div className="panel__header">
              <h2>Add Room</h2>
              <span>Unavailable</span>
            </div>
            <p className="empty-state">Create a room type before adding rooms.</p>
          </div>
        )}
      </div>
    </section>
  );
}

