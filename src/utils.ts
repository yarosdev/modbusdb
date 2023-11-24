import { Buffer } from 'node:buffer';
import { ScopeEnum, TypeEnum } from './enum.js';
import assert from 'node:assert';

export const countRegisters = (type: TypeEnum): number => {
  switch (type) {
    case TypeEnum.Int32:
    case TypeEnum.UInt32:
    case TypeEnum.Float:
      return 2;
  }

  return 1;
};

export const isBool = (type: TypeEnum) => type === TypeEnum.Bit;
export const isFloat = (type: TypeEnum) => type === TypeEnum.Float;
export const isInt = (type: TypeEnum) => !isFloat(type) && !isBool(type);

export const isStateScope = (scope: ScopeEnum) => scope == ScopeEnum.InternalState || scope == ScopeEnum.PhysicalState;
export const isRegisterScope = (scope: ScopeEnum) => scope == ScopeEnum.InternalRegister || scope == ScopeEnum.PhysicalRegister;
export const isReadableScope = (scope: ScopeEnum) =>
  scope == ScopeEnum.InternalRegister ||
  scope == ScopeEnum.InternalState ||
  scope == ScopeEnum.PhysicalRegister ||
  scope == ScopeEnum.PhysicalState;
export const isWritableScope = (scope: ScopeEnum) => scope == ScopeEnum.InternalRegister || scope == ScopeEnum.InternalState;

export const readRegister = (buffer: Buffer, type: TypeEnum, bigEndian = true) => {
  if (type === TypeEnum.Int16) {
    return bigEndian ? buffer.readInt16BE() : buffer.readInt16LE();
  } else if (type === TypeEnum.UInt16) {
    return bigEndian ? buffer.readUInt16BE() : buffer.readUInt16LE();
  } else if (type === TypeEnum.Int32) {
    return bigEndian ? buffer.readInt32BE() : buffer.readInt32LE();
  } else if (type === TypeEnum.UInt32) {
    return bigEndian ? buffer.readUInt32BE() : buffer.readUInt32LE();
  } else if (type === TypeEnum.Float) {
    return bigEndian ? buffer.readFloatBE() : buffer.readFloatLE();
  } else {
    throw new Error('Read register type not supported');
  }
};

export const writeRegister = (value: number, type: TypeEnum, bigEndian = true) => {
  const buffer = Buffer.alloc(countRegisters(type) * 2);

  if (type === TypeEnum.Int16) {
    if (bigEndian) {
      buffer.writeInt16BE(value);
    } else {
      buffer.writeInt16LE(value);
    }
  } else if (type === TypeEnum.UInt16) {
    if (bigEndian) {
      buffer.writeUInt16BE(value);
    } else {
      buffer.writeUInt16LE(value);
    }
  } else if (type === TypeEnum.Int32) {
    if (bigEndian) {
      buffer.writeInt32BE(value);
    } else {
      buffer.writeInt32LE(value);
    }
  } else if (type === TypeEnum.UInt32) {
    if (bigEndian) {
      buffer.writeUInt32BE(value);
    } else {
      buffer.writeUInt32LE(value);
    }
  } else if (type === TypeEnum.Float) {
    if (bigEndian) {
      buffer.writeFloatBE(value);
    } else {
      buffer.writeFloatLE(value);
    }
  } else {
    throw new Error(`Write register type[${type}] not supported`);
  }

  return buffer;
};

export const getBit = (value: number, bit: number): number => {
  assert(bit >= 0 && bit < 16, 'BitIndex is out of range');
  return (value & Math.pow(2, bit)) > 0 ? 1 : 0;
};

export const setBit = (value: number, bit: number, state: boolean): number => {
  assert(bit >= 0 && bit < 16, 'BitIndex is out of range');
  return state ? value | Math.pow(2, bit) : ~(~value | Math.pow(2, bit));
};

export const arrayFirst = <T>(arr: Array<T>, message = 'First element of the array not found'): T => {
  const val = arr.at(0);
  assert.ok(val !== undefined, message);
  return val;
};
export const arrayLast = <T>(arr: Array<T>, message = 'Last element of the array not found'): T => {
  const val = arr.at(-1);
  assert.ok(val !== undefined, message);
  return val;
};

export const mapGet = <T, K>(map: Map<T, K>, key: T, message = 'Key not found in the map'): K => {
  const val = map.get(key);
  assert.ok(val !== undefined, message);
  return val;
};

export const mergeMaps = <T, K>(map1: Map<T, K>, map2: Map<T, K>): void => {
  for (const [key, val] of map2.entries()) {
    map1.set(key, val);
  }
};

export const isArrayOfNumbers = (data: Array<unknown>): data is NonNullable<Array<number>> => {
  return data.every((value) => typeof value === 'number');
};

export const isArrayOfBuffers = (data: Array<unknown>): data is NonNullable<Array<Buffer>> => {
  return data.every((value) => value instanceof Buffer);
};

export const bufferSlice = (buffer: Buffer, offset: number, size: number) => {
  assert.ok(buffer.length >= offset + size, 'Buffer slice is out of bounds');
  return buffer.subarray(offset, offset + size);
};

export const isNumber = (value: unknown): value is number => typeof value === 'number';

export const getDivisorsOfNumber = (number: number): Array<number> =>
  number > 0 ? Array.from({ length: number }, (_, i) => i + 1).filter((div) => number % div === 0) : [];

export const createMap = <T, R>(keys: Array<T>, values: Array<R>): Map<T, R> => {
  assert.ok(keys.length === values.length, 'Diff length of keys and values');
  const map = new Map<T, R>();
  keys.forEach((key, i) => {
    map.set(key, values[i]);
  });
  return map;
};

export const bufferSwapWords = (buf: Buffer): Buffer => {
  if (buf.length !== 4) {
    throw new Error(`swap words buf length must be 4, got: ${buf.length}`);
  }

  return Buffer.concat([buf.subarray(2, 4), buf.subarray(0, 2)]);
};
