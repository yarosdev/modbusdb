import { TimeoutError } from 'p-timeout';
import { KeyType } from './types';
import { PriorityEnum, ScopeEnum } from './enum.js';
import assert from 'node:assert';
import { arrayFirst } from './utils.js';
import { DatamapInterface } from './modbusdb.interface.js';

class TransactionError extends Error {
  constructor(public readonly reason: Error) {
    super(reason.message);
  }

  get isTimeout() {
    return this.reason.name === 'TimeoutError';
  }
}

export enum TransactionTypeEnum {
  READ = 1,
  WRITE
}

export interface TransactionOptionsInterface {
  body?: Map<KeyType, number>;
  priority?: PriorityEnum;
  timeout?: number;
  bigEndian?: boolean;
  swapWords?: boolean;
  forceWriteMany?: boolean;
}

export class Transaction {
  public readonly unit: number;
  public readonly scope: ScopeEnum;
  public readonly body?: Map<KeyType, number>;
  public readonly priority: PriorityEnum;

  public readonly bigEndian: boolean;
  public readonly swapWords: boolean;
  public readonly forceWriteMany: boolean;

  private _startedAt: number;
  private _finishedAt?: number;
  private _timeout: number;

  private _data?: Map<KeyType, number>;
  private _error?: TransactionError;

  constructor(
    public readonly id: number,
    public readonly type: TransactionTypeEnum,
    public readonly map: DatamapInterface[],
    options?: TransactionOptionsInterface
  ) {
    assert.ok(map.length > 0, 'Keys is empty');

    const { unit, scope } = arrayFirst(map);

    assert.ok(
      map.every((i) => i.unit === unit && i.scope === scope),
      'Cross unit/scope transaction error'
    );

    this.unit = unit;
    this.scope = scope;
    this.bigEndian = options?.bigEndian ?? false;
    this.swapWords = options?.swapWords ?? false;
    this.forceWriteMany = options?.forceWriteMany ?? false;
    this.body = options?.body;
    this.priority = options?.priority ?? PriorityEnum.LOW;
    this._startedAt = Date.now();
    this._timeout = options?.timeout ?? 60;
  }

  finish(result: Map<KeyType, number> | TransactionError | Error) {
    if (this.done) return this;

    this._finishedAt = Date.now();

    if (result instanceof TransactionError) {
      this._error = result;
    } else if (result instanceof Error) {
      this._error = new TransactionError(result);
    } else {
      this._data = result;
    }

    return this;
  }

  get duration() {
    const finishedAt = this._finishedAt === undefined ? Date.now() : this._finishedAt;
    return finishedAt - this._startedAt;
  }

  get data() {
    return this._data;
  }

  get error() {
    return this._error;
  }

  get isTimedOut() {
    return this.error !== undefined && this.error.reason instanceof TimeoutError;
  }

  get done() {
    return this._finishedAt !== undefined;
  }

  get timeout() {
    return this._timeout;
  }
}
