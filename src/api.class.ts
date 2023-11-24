import { ScopeEnum, TypeEnum } from './enum.js';
import assert from 'node:assert';
import {
  arrayFirst,
  arrayLast,
  bufferSlice,
  countRegisters,
  isArrayOfBuffers,
  isArrayOfNumbers,
  isReadableScope,
  isWritableScope,
  mapGet,
  readRegister,
  bufferSwapWords,
  writeRegister
} from './utils.js';
import { DriverInterface } from './modbusdb.interface';
import { Buffer } from 'node:buffer';

const mapData = (addresses: number[], data: number[]): Map<number, number> => {
  const startAddress = arrayFirst(addresses);

  return new Map(
    addresses.map((address) => {
      return [address, data[address - startAddress] ?? 0];
    })
  );
};

type MapBufferOptionsType = {
  bigEndian: boolean;
  swapWords: boolean;
};

const mapBuffer = (
  addresses: number[],
  buffer: Buffer,
  types: Map<number, TypeEnum>,
  options: MapBufferOptionsType = { bigEndian: true, swapWords: false }
): Map<number, number> => {
  const startAddress = arrayFirst(addresses);

  return new Map(
    addresses.map((address) => {
      const offset = address - startAddress;
      const type = types.get(address) ?? TypeEnum.UInt16;

      let data = bufferSlice(buffer, offset * 2, countRegisters(type) * 2);

      if (countRegisters(type) === 2 && options.swapWords) {
        data = bufferSwapWords(data);
      }

      return [address, readRegister(data, type, options.bigEndian)];
    })
  );
};

const mapStates = (addresses: number[], data: Map<number, number>): number[] => {
  return addresses.map((address) => mapGet(data, address, `Value not defined for address=${address}`));
};

type MapNumbersOptionsType = {
  bigEndian: boolean;
  swapWords: boolean;
};

const mapNumbers = (
  addresses: number[],
  data: Map<number, number>,
  types: Map<number, TypeEnum>,
  options: MapNumbersOptionsType = {
    bigEndian: true,
    swapWords: false
  }
): Buffer[] => {
  return addresses.map((address) => {
    const value = mapGet(data, address, `Value not defined for address=${address}`);
    const type = types.get(address) ?? TypeEnum.UInt16;
    const buf = writeRegister(value, type, options.bigEndian);
    return countRegisters(type) === 2 && options.swapWords ? bufferSwapWords(buf) : buf;
  });
};

const createRequest = (map: Map<number, TypeEnum>) => {
  assert.ok(map.size > 0, 'Map is empty');

  const addresses = Array.from(map.keys());

  addresses.sort((a, b) => a - b);

  const startAddress = arrayFirst(addresses);
  const lastAddress = arrayLast(addresses);
  const lastType = mapGet(map, lastAddress, `Type not defined for address=${lastAddress}`);

  const registersCount = lastAddress + countRegisters(lastType) - startAddress;

  return { addresses, startAddress, registersCount };
};

interface OptionsInterface {
  bigEndian?: boolean;
  swapWords?: boolean;
  forceWriteMany?: boolean;
}

export class Api {
  constructor(private readonly driver: DriverInterface, public readonly bigEndian = true, public readonly swapWords = true) {}

  private useBigEndian(options?: OptionsInterface) {
    return options?.bigEndian ?? this.bigEndian;
  }

  private useSwapWords(options?: OptionsInterface) {
    return options?.swapWords ?? this.swapWords;
  }

  async read(
    unit: number,
    scope: ScopeEnum,
    map: Map<number, TypeEnum>,
    options?: OptionsInterface
  ): Promise<Map<number, number>> {
    assert.ok(isReadableScope(scope), 'This scope is not readable');

    const { addresses, startAddress, registersCount } = createRequest(map);

    assert.ok(registersCount > 0 && registersCount <= 999, 'Count is out of range [1, 999]');

    if (scope === ScopeEnum.InternalRegister) {
      return this.driver.readOutputRegisters(unit, startAddress, registersCount).then(({ buffer }) =>
        mapBuffer(addresses, buffer, map, {
          bigEndian: this.useBigEndian(options),
          swapWords: this.useSwapWords(options)
        })
      );
    }

    if (scope === ScopeEnum.PhysicalRegister) {
      return this.driver.readInputRegisters(unit, startAddress, registersCount).then(({ buffer }) =>
        mapBuffer(addresses, buffer, map, {
          bigEndian: this.useBigEndian(options),
          swapWords: this.useSwapWords(options)
        })
      );
    }

    if (scope === ScopeEnum.InternalState) {
      return this.driver.readOutputStates(unit, startAddress, registersCount).then(({ data }) => mapData(addresses, data));
    }

    if (scope === ScopeEnum.PhysicalState) {
      return this.driver.readInputStates(unit, startAddress, registersCount).then(({ data }) => mapData(addresses, data));
    }

    throw new Error('Scope not supported');
  }

  async write(
    unit: number,
    scope: ScopeEnum,
    map: Map<number, TypeEnum>,
    data: Map<number, number>,
    options?: OptionsInterface
  ): Promise<void> {
    assert.ok(isWritableScope(scope), 'This scope is not writable');

    const { addresses, startAddress } = createRequest(map);
    const forceMultiWrite = options?.forceWriteMany ?? false;

    if (scope === ScopeEnum.InternalRegister) {
      const body = mapNumbers(addresses, data, map, {
        bigEndian: this.useBigEndian(options),
        swapWords: this.useSwapWords(options)
      });

      assert.ok(isArrayOfBuffers(body), 'Invalid data, expected array of buffers');

      const buffer = Buffer.concat(body);

      return buffer.length > 2 || forceMultiWrite
        ? this.driver.writeRegisters(unit, startAddress, buffer)
        : this.driver.writeRegister(unit, startAddress, buffer);
    }

    if (scope === ScopeEnum.InternalState) {
      const body = mapStates(addresses, data);
      assert.ok(isArrayOfNumbers(body), 'Invalid data, expected array of numbers');
      return body.length > 1 || forceMultiWrite
        ? this.driver.writeStates(unit, startAddress, body)
        : this.driver.writeState(unit, startAddress, arrayFirst(body));
    }

    throw new Error('Scope not supported');
  }
}
