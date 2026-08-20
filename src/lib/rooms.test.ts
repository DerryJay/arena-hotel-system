import { describe, expect, it } from 'vitest';
import {
  canDeleteRoom,
  isAuthorizedRoomManager,
  validateRoomInput,
  validateRoomSafety,
  type ManageRoomInput,
  type RoomSafetyState
} from './rooms';

const validInput: ManageRoomInput = {
  roomNumber: '108',
  roomTypeId: 'standard',
  floor: '1',
  status: 'available',
  notes: '',
  baseRate: 25000,
  capacity: 2,
  description: 'Standard room'
};

const safeState: RoomSafetyState = {
  accessHotelId: 'hotel-1',
  role: 'owner',
  roomHotelId: 'hotel-1',
  currentStatus: 'available',
  nextStatus: 'maintenance',
  roomNumber: '108',
  existingRoomNumbers: [],
  hasReservationHistory: false
};

describe('room management rules', () => {
  it('allows valid add and edit operations for authorised staff', () => {
    expect(isAuthorizedRoomManager('owner')).toBe(true);
    expect(isAuthorizedRoomManager('front_desk')).toBe(true);
    expect(validateRoomInput(validInput)).toEqual({ ok: true });
    expect(validateRoomSafety(safeState)).toEqual({ ok: true });
  });

  it('rejects unauthorised access', () => {
    expect(isAuthorizedRoomManager('housekeeping')).toBe(false);
    expect(validateRoomSafety({ ...safeState, role: 'housekeeping' })).toMatchObject({ ok: false });
  });

  it('prevents cross-hotel room changes', () => {
    expect(validateRoomSafety({ ...safeState, roomHotelId: 'hotel-2' })).toMatchObject({ ok: false });
  });

  it('rejects duplicate room numbers within the same hotel', () => {
    expect(validateRoomSafety({ ...safeState, existingRoomNumbers: ['108'] })).toMatchObject({ ok: false });
  });

  it('protects occupied rooms from ordinary status changes', () => {
    expect(validateRoomSafety({ ...safeState, currentStatus: 'occupied', nextStatus: 'available' })).toMatchObject({ ok: false });
    expect(validateRoomSafety({ ...safeState, currentStatus: 'occupied', nextStatus: 'maintenance' })).toMatchObject({ ok: false });
    expect(validateRoomSafety({ ...safeState, currentStatus: 'occupied', nextStatus: 'blocked' })).toMatchObject({ ok: false });
  });

  it('prevents ordinary editing from setting a room to occupied', () => {
    expect(validateRoomSafety({ ...safeState, currentStatus: 'available', nextStatus: 'occupied' })).toMatchObject({ ok: false });
  });

  it('allows operational status changes for non-occupied rooms', () => {
    expect(validateRoomSafety({ ...safeState, nextStatus: 'cleaning' })).toEqual({ ok: true });
    expect(validateRoomSafety({ ...safeState, nextStatus: 'blocked' })).toEqual({ ok: true });
  });

  it('does not allow creating rooms as occupied', () => {
    expect(validateRoomInput({ ...validInput, status: 'occupied' })).toMatchObject({ ok: false });
  });

  it('blocks destructive deletion when a room has reservation history', () => {
    expect(canDeleteRoom(true)).toBe(false);
    expect(canDeleteRoom(false)).toBe(true);
  });
});
