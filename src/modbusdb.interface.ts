import { ScopeEnum, TypeEnum } from './enum.js';
import { KeyType, UnitType, BitType, AddressType, MethodType } from './types';
import { Buffer } from 'buffer';
import { Datamap } from './datamap.class.js';

export interface ReadResultInterface {
  buffer: Buffer;
  data: number[];
}

export interface DriverInterface {
  // fc=1
  readOutputStates(unit: number, startAddress: number, count: number): Promise<ReadResultInterface>;
  // fc=2
  readInputStates(unit: number, startAddress: number, count: number): Promise<ReadResultInterface>;
  // fc=3
  readOutputRegisters(unit: number, startAddress: number, count: number): Promise<ReadResultInterface>;
  // fc=4
  readInputRegisters(unit: number, startAddress: number, count: number): Promise<ReadResultInterface>;
  // fc=5
  writeState(unit: number, startAddress: number, data: number): Promise<void>;
  // fc=6
  writeRegister(unit: number, startAddress: number, data: Buffer): Promise<void>;
  // fc=15
  writeStates(unit: number, startAddress: number, data: number[]): Promise<void>;
  // fc=16
  writeRegisters(unit: number, startAddress: number, data: Buffer): Promise<void>;
}

export interface DatamapInterface {
  key: KeyType;
  unit: UnitType;
  scope: ScopeEnum;
  address: AddressType;
  bit: BitType;
  type: TypeEnum;
  scale?: number;
  freq?: number;
}

export interface UnitConfigInterface {
  address: number;
  forceWriteMany: boolean;
  bigEndian: boolean;
  swapWords: boolean;
  requestWithGaps: boolean;
  maxRequestSize: number;
}

export interface ConfigInterface {
  driver: DriverInterface;
  datamap?: Datamap;
  interval?: number;
  timeout?: number;
  roundSize?: number;
}

export interface SelectInterface {
  method: MethodType;
  unit: UnitType;
  scope: ScopeEnum;
  datamap: DatamapInterface[];
  useBigEndian: boolean;
  forceWriteMulti: boolean;
  swapWords: boolean;
}
