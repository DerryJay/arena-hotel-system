import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffHotelAccessRecord } from './auth/access';
import type { RoomStatus } from './types';

export interface RoomTypeManagementOption {
  id: string;
  name: string;
  baseRate: number;
  capacity: number;
  description: string;
}

export interface ManagedRoom {
  id: string;
  roomNumber: string;
  typeId: string;
  typeName: string;
  baseRate: number;
  status: RoomStatus;
  floor: string;
  capacity: number;
  description: string;
  notes: string;
}

export interface RoomManagementData {
  rooms: ManagedRoom[];
  roomTypes: RoomTypeManagementOption[];
}

export interface ManageRoomInput {
  roomId?: string;
  roomNumber: string;
  roomTypeId: string;
  floor?: string;
  status: RoomStatus;
  notes?: string;
  baseRate: number;
  capacity: number;
  description?: string;
}

export interface ManageRoomResult {
  ok: boolean;
  message: string;
  roomId?: string;
}

export interface RoomSafetyState {
  accessHotelId: string | null;
  role: string;
  roomHotelId: string;
  currentStatus: RoomStatus;
  nextStatus: RoomStatus;
  roomNumber: string;
  existingRoomNumbers: string[];
  hasReservationHistory: boolean;
}

interface RoomRow {
  id: string;
  room_number: string;
  floor: string | null;
  status: RoomStatus;
  notes: string | null;
  room_type_id: string;
  room_types: {
    name: string;
    base_rate: number | string;
    max_occupancy: number;
    description: string | null;
  } | null;
}

interface RoomTypeRow {
  id: string;
  name: string;
  base_rate: number | string;
  max_occupancy: number;
  description: string | null;
}

interface ManageRoomRpcRow {
  ok: boolean;
  message: string;
  room_id: string | null;
}

const roomManagementRoles = new Set(['owner', 'front_desk']);
const manuallySelectableStatuses = new Set<RoomStatus>(['available', 'cleaning', 'maintenance', 'blocked']);
const allEditableStatuses = new Set<RoomStatus>(['available', 'occupied', 'cleaning', 'maintenance', 'blocked']);

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  return 0;
}

export function isAuthorizedRoomManager(role: string): boolean {
  return roomManagementRoles.has(role);
}

export function validateRoomInput(input: ManageRoomInput): { ok: true } | { ok: false; message: string } {
  if (!input.roomNumber.trim()) {
    return { ok: false, message: 'Room number is required.' };
  }

  if (!input.roomTypeId) {
    return { ok: false, message: 'Room type is required.' };
  }

  if (!Number.isFinite(input.baseRate) || input.baseRate < 0) {
    return { ok: false, message: 'Nightly rate must be zero or greater.' };
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    return { ok: false, message: 'Capacity must be at least 1.' };
  }

  if (!allEditableStatuses.has(input.status)) {
    return { ok: false, message: 'Invalid room status.' };
  }

  if (!input.roomId && !manuallySelectableStatuses.has(input.status)) {
    return { ok: false, message: 'New rooms cannot be created as occupied.' };
  }

  return { ok: true };
}

export function validateRoomSafety(state: RoomSafetyState): { ok: true } | { ok: false; message: string } {
  if (!state.accessHotelId || !isAuthorizedRoomManager(state.role)) {
    return { ok: false, message: 'You are not authorised to manage rooms.' };
  }

  if (state.roomHotelId !== state.accessHotelId) {
    return { ok: false, message: 'Room not found for this hotel.' };
  }

  if (state.existingRoomNumbers.includes(state.roomNumber.trim().toLowerCase())) {
    return { ok: false, message: 'A room with this number already exists for this hotel.' };
  }

  if (state.currentStatus === 'occupied' && state.nextStatus !== 'occupied') {
    return { ok: false, message: 'Occupied rooms can only be released by checkout.' };
  }

  if (state.currentStatus !== 'occupied' && state.nextStatus === 'occupied') {
    return { ok: false, message: 'Rooms can only become occupied through check-in.' };
  }

  if (state.hasReservationHistory) {
    return { ok: true };
  }

  return { ok: true };
}

export function canDeleteRoom(hasReservationHistory: boolean): boolean {
  return !hasReservationHistory;
}

export async function getRoomManagementData(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  filters: { search?: string; status?: string } = {}
): Promise<RoomManagementData> {
  if (!access.hotel_id) {
    throw new Error('Authenticated staff profile is missing a hotel id.');
  }

  let roomsQuery = supabase
    .from('rooms')
    .select('id, room_number, floor, status, notes, room_type_id, room_types(name, base_rate, max_occupancy, description)')
    .eq('hotel_id', access.hotel_id)
    .order('room_number', { ascending: true });

  if (filters.search?.trim()) {
    roomsQuery = roomsQuery.ilike('room_number', `%${filters.search.trim()}%`);
  }

  if (filters.status && allEditableStatuses.has(filters.status as RoomStatus)) {
    roomsQuery = roomsQuery.eq('status', filters.status);
  }

  const [roomsResponse, roomTypesResponse] = await Promise.all([
    roomsQuery,
    supabase
      .from('room_types')
      .select('id, name, base_rate, max_occupancy, description')
      .eq('hotel_id', access.hotel_id)
      .order('base_rate', { ascending: true })
  ]);

  if (roomsResponse.error) {
    throw new Error(`Unable to load rooms: ${roomsResponse.error.message}`);
  }

  if (roomTypesResponse.error) {
    throw new Error(`Unable to load room types: ${roomTypesResponse.error.message}`);
  }

  const roomTypes = ((roomTypesResponse.data ?? []) as unknown as RoomTypeRow[]).map((roomType) => ({
    id: roomType.id,
    name: roomType.name,
    baseRate: toNumber(roomType.base_rate),
    capacity: roomType.max_occupancy,
    description: roomType.description ?? ''
  }));

  return {
    roomTypes,
    rooms: ((roomsResponse.data ?? []) as unknown as RoomRow[]).map((room) => ({
      id: room.id,
      roomNumber: room.room_number,
      typeId: room.room_type_id,
      typeName: room.room_types?.name ?? 'Unassigned',
      baseRate: toNumber(room.room_types?.base_rate),
      status: room.status,
      floor: room.floor ?? '',
      capacity: room.room_types?.max_occupancy ?? 1,
      description: room.room_types?.description ?? '',
      notes: room.notes ?? ''
    }))
  };
}

export async function manageRoom(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  input: ManageRoomInput
): Promise<ManageRoomResult> {
  if (!access.hotel_id || !isAuthorizedRoomManager(access.role)) {
    return { ok: false, message: 'You are not authorised to manage rooms.' };
  }

  const validation = validateRoomInput(input);

  if (!validation.ok) {
    return validation;
  }

  const response = await supabase
    .rpc('manage_room', {
      p_room_id: input.roomId || null,
      p_room_number: input.roomNumber.trim(),
      p_room_type_id: input.roomTypeId,
      p_floor: input.floor?.trim() || null,
      p_status: input.status,
      p_notes: input.notes?.trim() || null,
      p_base_rate: input.baseRate,
      p_max_occupancy: input.capacity,
      p_description: input.description?.trim() || null
    })
    .single<ManageRoomRpcRow>();

  if (response.error) {
    const isDuplicate = response.error.code === '23505' || response.error.message.toLowerCase().includes('duplicate');
    return {
      ok: false,
      message: isDuplicate ? 'A room with this number already exists for this hotel.' : `Unable to save room: ${response.error.message}`
    };
  }

  return {
    ok: response.data.ok,
    message: response.data.message,
    roomId: response.data.room_id ?? undefined
  };
}

