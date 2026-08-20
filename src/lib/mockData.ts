import type { DashboardData } from './types';

export const demoDashboardData: DashboardData = {
  hotel: {
    id: 'demo-hotel',
    name: 'Arena Hotel',
    timezone: 'Africa/Lagos'
  },
  rooms: [
    { id: '101', roomNumber: '101', floor: '1', typeName: 'Classic Queen', status: 'occupied', nightlyRate: 45000 },
    { id: '102', roomNumber: '102', floor: '1', typeName: 'Classic Queen', status: 'available', nightlyRate: 45000 },
    { id: '201', roomNumber: '201', floor: '2', typeName: 'Executive King', status: 'dirty', nightlyRate: 75000 },
    { id: '202', roomNumber: '202', floor: '2', typeName: 'Executive King', status: 'occupied', nightlyRate: 75000 },
    { id: '301', roomNumber: '301', floor: '3', typeName: 'Arena Suite', status: 'maintenance', nightlyRate: 140000 },
    { id: '302', roomNumber: '302', floor: '3', typeName: 'Arena Suite', status: 'available', nightlyRate: 140000 }
  ],
  reservations: [
    {
      id: 'res-1',
      roomNumber: '101',
      guestName: 'Ada Okonkwo',
      status: 'checked_in',
      checkIn: '2026-08-20',
      checkOut: '2026-08-22',
      nightlyRate: 45000,
      balance: 0
    },
    {
      id: 'res-2',
      roomNumber: '202',
      guestName: 'Tunde Balogun',
      status: 'checked_in',
      checkIn: '2026-08-19',
      checkOut: '2026-08-21',
      nightlyRate: 75000,
      balance: 25000
    },
    {
      id: 'res-3',
      roomNumber: '102',
      guestName: 'Mina Carter',
      status: 'confirmed',
      checkIn: '2026-08-20',
      checkOut: '2026-08-23',
      nightlyRate: 45000,
      balance: 135000
    },
    {
      id: 'res-4',
      roomNumber: '201',
      guestName: 'Chika Nwosu',
      status: 'checked_out',
      checkIn: '2026-08-18',
      checkOut: '2026-08-20',
      nightlyRate: 75000,
      balance: 0
    }
  ],
  housekeeping: [
    { id: 'hk-1', roomNumber: '201', status: 'todo', dueOn: '2026-08-20', notes: 'Departure clean and minibar check' },
    { id: 'hk-2', roomNumber: '301', status: 'in_progress', dueOn: '2026-08-20', notes: 'Maintenance follow-up before sale' },
    { id: 'hk-3', roomNumber: '102', status: 'done', dueOn: '2026-08-20', notes: 'Inspect before arrival' }
  ]
};

