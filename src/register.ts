import assert from 'node:assert';
import { AddressType, BitType, UnitType, TableType } from './types.js';

const KEY_SIZE = 32;
const UNIT_SIZE = 8;
const TABLE_SIZE = 4;
const ADDRESS_SIZE = 16;

export const createRegisterKey = (unit: UnitType, table: TableType, address: AddressType, bit: BitType = 0) => {
  assert(unit >= 0 && unit <= 255, 'Unit is out of range');
  assert(table >= 0 && table < 16, 'Table is out of range');
  assert(address >= 0 && address <= 65535, 'Address is out of range');
  assert(bit >= 0 && bit < 16, 'Bit is out of range');

  const num =
    (unit << (KEY_SIZE - UNIT_SIZE)) |
    (table << (KEY_SIZE - UNIT_SIZE - TABLE_SIZE)) |
    (address << (KEY_SIZE - UNIT_SIZE - TABLE_SIZE - ADDRESS_SIZE)) |
    bit;

  return num >>> 0;
};

export const parseRegisterKey = (key: number): [UnitType, TableType, AddressType, BitType] => [
  (key >> (KEY_SIZE - UNIT_SIZE)) & 0xff,
  (key >> (KEY_SIZE - UNIT_SIZE - TABLE_SIZE)) & 0xf,
  (key >> (KEY_SIZE - UNIT_SIZE - TABLE_SIZE - ADDRESS_SIZE)) & 0xffff,
  key & 0xf
];
