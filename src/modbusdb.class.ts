import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import PQueue from 'p-queue';
import timeout from 'p-timeout';
import { Api } from './api.class.js';
import { Datamap } from './datamap.class.js';
import { PriorityEnum, TypeEnum } from './enum.js';
import { ConfigInterface, SelectInterface, UnitConfigInterface } from './modbusdb.interface';
import { Transaction, TransactionOptionsInterface, TransactionTypeEnum } from './transaction.class.js';
import { KeyType, MapLikeType, SetLikeType } from './types';
import {
  createMap,
  getBit,
  getDivisorsOfNumber,
  isBool,
  isInt,
  isRegisterScope,
  isStateScope,
  mapGet,
  mergeMaps,
  setBit
} from './utils.js';

const TICKS_PER_ROUND = 12;
const TIMEOUT = 60;
const INTERVAL = 60;

interface WatchInterface {
  timer?: NodeJS.Timeout;
  round: number;
  tick: number;
  roundStartedAt: number;
  tickStartedAt: number;
  size: number;
}

export declare interface Modbusdb {
  unit(id: number): UnitConfigInterface & UnitStateInterface;
  on(event: 'data', listener: (data: Map<KeyType, number>) => void): this;
  on(event: 'request', listener: (t: Transaction) => void): this;
  on(event: 'response', listener: (t: Transaction) => void): this;
  on(event: 'tick', listener: () => void): this;
}

interface UnitStateInterface {
  timedOutTime: number;
  timeoutsCount: number;
  requestsCount: number;
  errorsCount: number;
}

interface DatabaseStateInterface {
  units: Map<number, UnitStateInterface>;
  requestsCount: number;
  errorsCount: number;
}

export class Modbusdb extends EventEmitter {
  private readonly _api: Api;
  private readonly _queue: PQueue;
  private readonly _datamap: Datamap;
  private readonly _watch: WatchInterface;

  private readonly _state: DatabaseStateInterface;

  private readonly timeout: number;
  private readonly interval: number;
  private readonly pendingTransactions: Set<Transaction>;
  private nextTransactionId: number;
  private responseTime: number[];
  private _destroyed: boolean;

  constructor(config: ConfigInterface) {
    super();

    this._api = new Api(config.driver);

    this._queue = new PQueue({
      concurrency: 1
    });

    this._datamap = config.datamap ?? new Datamap();

    this._state = {
      units: new Map(),
      requestsCount: 0,
      errorsCount: 0
    };

    this.timeout = Math.min(Math.max(config.timeout ?? TIMEOUT, 1), 900);
    this.interval = Math.min(Math.max(config.interval ?? INTERVAL, 60), 3600);

    this._watch = {
      round: 0,
      tick: 0,
      roundStartedAt: 0,
      tickStartedAt: 0,
      size: Math.min(Math.max(config.roundSize ?? TICKS_PER_ROUND, TICKS_PER_ROUND), 36)
    };

    this.pendingTransactions = new Set();

    this.nextTransactionId = 0;

    this.responseTime = [];

    this._destroyed = false;
  }

  get state() {
    return {
      reqCount: this._state.requestsCount,
      errCount: this._state.errorsCount,
      roundIndex: this._watch.round,
      tickIndex: Math.max(0, this._watch.tick),
      roundDuration: this._watch.roundStartedAt > 0 ? 1 + Date.now() - this._watch.roundStartedAt : 0,
      avgResTime:
        this.responseTime.length > 3
          ? Math.round(this.responseTime.reduce((total, time) => total + time, 0) / this.responseTime.length)
          : 0
    };
  }

  watch(): this {
    if (this._watch.timer) {
      clearTimeout(this._watch.timer);
    }

    if (this.datamap.watch.size === 0) {
      return this;
    }

    const roundDivisors = getDivisorsOfNumber(this._watch.size);
    const roundMap = createMap(roundDivisors, [...roundDivisors].reverse());
    const tickInterval = Math.floor(this.interval / this._watch.size) * 1000;

    const finishTick = () => {
      if (this._destroyed) return;

      this._watch.tick++;

      const tickTakenTime = Date.now() - this._watch.tickStartedAt;
      const nextTickIn = Math.max(tickInterval - tickTakenTime, 1000);

      this._watch.timer = setTimeout(run, nextTickIn);
    };

    const run = () => {
      if (this._destroyed) return;

      if (this._watch.tick >= this._watch.size) {
        this._watch.roundStartedAt = Date.now();
        this._watch.tickStartedAt = this._watch.roundStartedAt;
        this._watch.round++;
        this._watch.tick = 0;
      } else {
        this._watch.tickStartedAt = Date.now();
      }

      this.emit('tick');

      const keys = roundDivisors
        .filter((div) => (this._watch.tick + 1) % div === 0)
        .map((div) => this.datamap.watch.get(mapGet(roundMap, div)))
        .map((set) => (set != undefined ? Array.from(set.values()) : []))
        .flat();

      if (keys.length === 0) {
        return finishTick();
      }

      const selects = this.datamap.selectAll('read', keys);

      const tasks = selects.map((select: SelectInterface) =>
        this.request(TransactionTypeEnum.READ, select, {
          priority: PriorityEnum.LOW,
          timeout: this.timeout
        })
      );

      return this.run(tasks)
        .then(finishTick)
        .catch((err) => console.log('fatal error', err));
    };

    this._watch.timer = setTimeout(() => {
      this._watch.tick = 0;
      this._watch.round = 0;
      this._watch.roundStartedAt = Date.now();
      this._watch.tickStartedAt = this._watch.roundStartedAt;
      run();
    }, tickInterval);

    return this;
  }

  private onRequest(t: Transaction): void {
    if (this._destroyed) return;

    this.emit('request', t);
  }

  private onResponse(t: Transaction): void {
    if (this._destroyed) return;

    const unit = this.unit(t.unit);

    const hasError = t.error !== undefined;
    const isTimedOut = t.error !== undefined && t.error.isTimeout;

    this._state.requestsCount += 1;
    this._state.errorsCount += hasError ? 1 : 0;

    this._state.units.set(t.unit, {
      timedOutTime: isTimedOut ? Date.now() : 0,
      timeoutsCount: isTimedOut ? unit.timeoutsCount + 1 : 0,
      requestsCount: unit.requestsCount + 1,
      errorsCount: unit.errorsCount + (hasError ? 1 : 0)
    });

    if (!isTimedOut) {
      this.responseTime.push(t.duration);
    }

    if (this.responseTime.length > 99) {
      this.responseTime.shift();
    }

    this.emit('response', t);

    if (t.data !== undefined && t.data.size > 0) {
      this.emit('data', t.data);
    }
  }

  async mset(data: MapLikeType<KeyType, number>) {
    assert.ok(!this._destroyed, 'Instance is destroyed');

    const dataMap = data instanceof Array ? new Map(data) : data;

    assert.ok(dataMap.size > 0, 'Data is empty');

    const selects = this.datamap.selectAll('write', Array.from(dataMap.keys()));

    const request = (select: SelectInterface) =>
      this.request(TransactionTypeEnum.WRITE, select, {
        body: dataMap,
        priority: PriorityEnum.HIGH,
        timeout: this.timeout
      });

    return this.run(selects.map(request));
  }

  async mget(keys: SetLikeType<KeyType>) {
    assert.ok(!this._destroyed, 'Instance is destroyed');

    const keysSet = keys instanceof Array ? new Set(keys) : keys;

    assert.ok(keysSet.size > 0, 'Keys is empty');

    const selects = this.datamap.selectAll('read', Array.from(keysSet.values()));

    const request = (select: SelectInterface) =>
      this.request(TransactionTypeEnum.READ, select, {
        priority: PriorityEnum.NORMAL,
        timeout: this.timeout
      });

    return this.run(selects.map(request));
  }

  async get(key: KeyType) {
    assert.ok(!this._destroyed, 'Instance is destroyed');

    const select = this.datamap.selectOne('read', [key]);

    return this.request(TransactionTypeEnum.READ, select, {
      priority: PriorityEnum.NORMAL,
      timeout: this.timeout
    });
  }

  async set(key: KeyType, value: number) {
    assert.ok(!this._destroyed, 'Instance is destroyed');

    const select = this.datamap.selectOne('write', [key]);

    return this.request(TransactionTypeEnum.WRITE, select, {
      body: new Map([[key, value]]),
      priority: PriorityEnum.HIGH,
      timeout: this.timeout
    });
  }

  unit(id: number): UnitStateInterface & UnitConfigInterface {
    const unitConfig = this.datamap.unit(id);
    const unitState = this._state.units.get(id);

    return {
      ...unitConfig,
      requestsCount: unitState?.requestsCount ?? 0,
      errorsCount: unitState?.errorsCount ?? 0,
      timedOutTime: unitState?.timedOutTime ?? 0,
      timeoutsCount: unitState?.timeoutsCount ?? 0
    };
  }

  request(type: TransactionTypeEnum, select: SelectInterface, options?: TransactionOptionsInterface) {
    const task = () => {
      this.nextTransactionId = (this.nextTransactionId + 1) % 1024;

      const t = new Transaction(this.nextTransactionId, type, select.datamap, {
        bigEndian: select.useBigEndian,
        swapWords: select.swapWords,
        forceWriteMany: select.forceWriteMulti,
        ...options
      });

      if (this._destroyed) {
        return Promise.resolve(t.finish(new Error('Aborted')));
      }

      const unit = this.unit(t.unit);

      if (
        t.priority === PriorityEnum.LOW &&
        unit.timeoutsCount > 2 &&
        Date.now() - unit.timedOutTime < 3 * (options?.timeout ?? this.timeout) * 1000
      ) {
        return Promise.resolve(t.finish(new Error('Too many timeouts for this unit')));
      }

      this.pendingTransactions.add(t);

      this.onRequest(t);

      return timeout(this.execute(t), {
        milliseconds: t.timeout * 1000
      })
        .then((data) => {
          this.onResponse(t.finish(data));

          return t;
        })
        .catch((reason) => {
          this.onResponse(t.finish(reason));

          return t;
        })
        .finally(() => {
          this.pendingTransactions.delete(t);
        });
    };

    return this._queue.add(task, { priority: options?.priority });
  }

  private async execute(t: Transaction): Promise<Map<KeyType, number>> {
    if (t.done) {
      throw new Error('Unprocessable transaction');
    }

    const map = new Map(
      t.map.map(({ address, type }) => {
        if (isStateScope(t.scope)) {
          return [address, TypeEnum.Bit];
        }

        if (isRegisterScope(t.scope) && type === TypeEnum.Bit) {
          return [address, TypeEnum.UInt16];
        }

        return [address, type];
      })
    );

    const mapValues = (values: Map<number, number>) =>
      new Map<KeyType, number>(
        t.map.map((item) => {
          const value = mapGet(values, item.address, `No value in response for key=${item.key}`);

          if (isBool(item.type)) {
            if (isRegisterScope(item.scope)) {
              return [item.key, getBit(value, item.bit)];
            } else {
              return [item.key, value];
            }
          } else if (isInt(item.type)) {
            return [item.key, value / Math.pow(10, item.scale ?? 0)];
          } else {
            return [item.key, value];
          }
        })
      );

    const apiOptions = {
      bigEndian: t.bigEndian,
      forceWriteMany: t.forceWriteMany,
      swapWords: t.swapWords
    };

    if (t.type === TransactionTypeEnum.READ) {
      return this.api.read(t.unit, t.scope, map, apiOptions).then(mapValues);
    }

    if (t.type === TransactionTypeEnum.WRITE) {
      const data = new Map<number, number>();

      if (t.map.some((i) => isRegisterScope(i.scope) && i.type === TypeEnum.Bit)) {
        await this.api.read(t.unit, t.scope, map, apiOptions).then((currentData) => {
          mergeMaps(data, currentData);
        });
      }

      if (t.done) {
        throw new Error('Unprocessable transaction');
      }

      t.map.forEach((item) => {
        const value = t.body?.get(item.key) ?? 0;

        if (isBool(item.type)) {
          if (isRegisterScope(item.scope)) {
            data.set(item.address, setBit(mapGet(data, item.address), item.bit, value === 1));
          } else {
            data.set(item.address, value > 0 ? 1 : 0);
          }
        } else if (isInt(item.type)) {
          data.set(item.address, Math.floor(value * Math.pow(10, item.scale ?? 0)));
        } else {
          data.set(item.address, value);
        }
      });

      return this.api.write(t.unit, t.scope, map, data, apiOptions).then(() => mapValues(data));
    }

    throw new Error('Unprocessable transaction');
  }

  private async run(tasks: Array<PromiseLike<Transaction | void>>) {
    const startedAt = Date.now();
    const payload = new Map<KeyType, number>();

    const transactions = await Promise.all(tasks);

    transactions.forEach((t) => {
      if (!(t instanceof Transaction)) {
        throw new Error('Invalid task result, expected a Transaction');
      }

      if (t.data == null) {
        return;
      }

      if (!(t.data instanceof Map)) {
        throw new Error('Invalid task result data, expected a data to be a Map');
      }

      mergeMaps(payload, t.data);
    });

    return {
      totalTime: Date.now() - startedAt,
      transactions,
      payload
    };
  }

  destroy() {
    this._destroyed = true;

    clearTimeout(this._watch.timer);

    this.pendingTransactions.clear();

    this._queue.removeAllListeners();
    this._queue.clear();

    this.datamap.clear();

    this._state.units.clear();
  }

  get datamap() {
    return this._datamap;
  }

  get api() {
    return this._api;
  }
}
