import { DriverInterface, ReadResultInterface } from '../modbusdb.interface';
import ModbusRTU from 'modbus-serial';
import { Buffer } from 'buffer';

export class ModbusSerialDriver implements DriverInterface {
  constructor(private readonly client: ModbusRTU) {}

  readInputRegisters(unit: number, startAddress: number, count: number): Promise<ReadResultInterface> {
    this.client.setID(unit);
    return this.client.readInputRegisters(startAddress, count).then(({ buffer, data }) => ({ buffer, data }));
  }

  readInputStates(unit: number, startAddress: number, count: number): Promise<ReadResultInterface> {
    this.client.setID(unit);
    return this.client
      .readDiscreteInputs(startAddress, count)
      .then(({ buffer, data }) => ({ buffer, data: data.slice(0, count).map((d) => (d ? 1 : 0)) }));
  }

  readOutputRegisters(unit: number, startAddress: number, count: number): Promise<ReadResultInterface> {
    this.client.setID(unit);
    return this.client.readHoldingRegisters(startAddress, count).then(({ buffer, data }) => ({ buffer, data }));
  }

  readOutputStates(unit: number, startAddress: number, count: number): Promise<ReadResultInterface> {
    this.client.setID(unit);
    return this.client
      .readCoils(startAddress, count)
      .then(({ buffer, data }) => ({ buffer, data: data.slice(0, count).map((d) => (d ? 1 : 0)) }));
  }

  writeRegister(unit: number, startAddress: number, data: Buffer): Promise<void> {
    this.client.setID(unit);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return this.client.writeRegister(startAddress, data).then(() => {
      return;
    });
  }

  writeRegisters(unit: number, startAddress: number, data: Buffer): Promise<void> {
    this.client.setID(unit);
    return this.client.writeRegisters(startAddress, data).then(() => {
      return;
    });
  }

  writeState(unit: number, startAddress: number, data: number): Promise<void> {
    this.client.setID(unit);
    return this.client.writeCoil(startAddress, data > 0).then(() => {
      return;
    });
  }

  writeStates(unit: number, startAddress: number, data: number[]): Promise<void> {
    this.client.setID(unit);
    return this.client
      .writeCoils(
        startAddress,
        data.map((v) => v > 0)
      )
      .then(() => {
        return;
      });
  }
}
