import assert from 'node:assert';
import { TypeEnum } from './enum.js';
import { DatamapInterface, SelectInterface, UnitConfigInterface } from './modbusdb.interface';
import { parseRegisterKey } from './register.js';
import { DatamapType, KeyType, MethodType, UnitType } from './types';
import { countRegisters, isNumber, isRegisterScope, isStateScope } from './utils.js';

export class Datamap {
  private readonly _map: Map<KeyType, DatamapInterface>;
  private readonly _units: Map<UnitType, UnitConfigInterface>;
  private readonly _watch: Map<number, Set<KeyType>>;

  constructor(datamap?: DatamapType[], units?: UnitConfigInterface[]) {
    this._map = new Map();
    this._units = new Map();
    this._watch = new Map();

    if (units != undefined && units.length > 0) {
      units.forEach((unit) => {
        this._units.set(unit.address, unit);
      });
    }

    if (datamap !== undefined) {
      this.fill(datamap);
    }
  }

  unit(address: UnitType): UnitConfigInterface {
    const unit = this._units.get(address);

    assert.ok(unit != undefined, `Unit ${address} not found.`);

    return unit;
  }

  selectOne(method: MethodType, keys: number[]) {
    const selects = this.selectAll(method, keys);

    assert.ok(selects.length === 1, 'SelectOne has more than one result.');

    return selects[0];
  }

  selectAll(method: MethodType, keys: number[]) {
    assert.ok(keys.length, 'Select: Keys length should be greater then 0');

    const items = keys.sort((a, b) => a - b).map((key) => this.get(key));

    const selected: SelectInterface[] = [];

    const select = {
      stages: <DatamapInterface[][]>[],
      stage: <DatamapInterface[]>[],
      current: items[0],
      prev: <DatamapInterface>items[0],
      goToStage: false
    };

    const addSelect = () => {
      if (select.stage.length === 0) return;

      const selectedUnit = this.unit(select.current.unit);

      selected.push({
        method,
        datamap: select.stage,
        unit: selectedUnit.address,
        scope: select.current.scope,
        useBigEndian: selectedUnit.bigEndian,
        swapWords: selectedUnit.swapWords,
        forceWriteMulti: selectedUnit.forceWriteMany
      });
    };

    for (const item of items) {
      const unit = this.unit(item.unit);

      const maxGap =
        unit.requestWithGaps && unit.maxRequestSize > 2 && method === 'read' ? Math.round(unit.maxRequestSize * 0.25) : 0;

      select.goToStage = select.current.scope === item.scope;
      select.goToStage = select.goToStage && select.current.unit === item.unit;

      if (select.prev !== null && item.address !== select.prev.address) {
        const gap = item.address - (select.prev.address + countRegisters(select.prev.type));
        select.goToStage = select.goToStage && gap <= maxGap;
      }

      select.goToStage =
        select.goToStage && item.address - select.current.address + countRegisters(item.type) <= unit.maxRequestSize;

      if (select.goToStage) {
        select.stage.push(item);
        select.prev = item;
      } else {
        addSelect();

        select.stages.push(select.stage);
        select.stage = [item];
        select.current = item;
        select.prev = item;
      }
    }

    if (select.stage.length > 0) {
      addSelect();

      select.stages.push(select.stage);
      select.stage = [];
    }

    return selected;
  }

  get(key: number): DatamapInterface {
    const current = this._map.get(key);

    assert.ok(current !== undefined, `Unable to get key '${key}'`);

    return current;
  }

  // find(unit: UnitType, scope: ScopeType, address: AddressType): DatamapInterface[] {
  //   return Array(16)
  //     .fill(0)
  //     .map((_, i) => createRegisterKey(unit, scope, address, i))
  //     .map((key) => this._map.get(key))
  //     .filter((item) => item !== undefined) as DatamapInterface[];
  // }

  get map() {
    return this._map;
  }

  items() {
    return this._map.values();
  }

  get watch() {
    return this._watch;
  }

  get size() {
    return this._map.size;
  }

  clear() {
    this._map.clear();
    this._units.clear();
    this._watch.clear();
  }

  private fill(datamap: DatamapType[]): void {
    datamap.forEach((item) => {
      const { key, type, scale, freq } = item;

      const [unit, scope, address, bit] = parseRegisterKey(key);

      assert.ok(unit > 0 && unit <= 250, `Invalid key = ${key}. Unit is out of range [1,250]`);
      assert.ok([1, 2, 3, 4].includes(scope), `Invalid key = ${key}. Provided scope not supported`);
      assert.ok(address >= 0 && address < 65535, `Invalid key = ${key}. Register is out of range [1,65535]`);

      if (isStateScope(scope)) {
        assert.ok(bit === 0, `Invalid key = ${key}. Provided scope does not supports 'bit' address`);
        assert.ok(type === undefined || type === TypeEnum.Bit, `Invalid key = ${key}. Provided scope supports only Bit type`);
        assert.ok(scale === undefined || scale === 0, `Invalid key = ${key}. Provided scope does not supports 'scale' option`);
      }

      if (isRegisterScope(scope)) {
        assert.ok(bit >= 0 && bit < 16, `Invalid key = ${key}. Bit is out of range [0,15]`);

        if (type !== TypeEnum.Bit) {
          assert.ok(bit === 0, `Invalid key = ${key}. Bit (${bit}) not allowed for the type ${type}`);
        }
      }

      if (scale !== undefined && isNumber(scale)) {
        assert.ok(scale >= 0 && scale <= 3, `Invalid key = ${key}. Scale is out of range [0,3]`);
      }

      if (freq !== undefined && isNumber(freq)) {
        assert.ok(freq >= 0 && freq <= 60, `Invalid key = ${key}. Frequency is out of range [0,60]`);
      }

      if (!this._units.has(unit)) {
        // TODO: provide global default config for all units...
        this._units.set(unit, {
          address: unit,
          maxRequestSize: 1,
          forceWriteMany: false,
          bigEndian: false,
          swapWords: false,
          requestWithGaps: true
        });
      }

      if (freq !== undefined && freq > 0) {
        const set = this._watch.get(freq) ?? new Set<KeyType>();
        set.add(key);
        this._watch.set(freq, set);
      }

      this._map.set(key, {
        key,
        unit,
        address,
        bit,
        scope,
        type: isStateScope(scope) ? TypeEnum.Bit : type ?? TypeEnum.UInt16,
        scale,
        freq
      });
    });
  }
}
