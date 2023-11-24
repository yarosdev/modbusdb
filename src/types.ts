import { ScopeEnum, TypeEnum } from './enum.js';

export type KeyType = number;
export type UnitType = number;
export type TableType = ScopeEnum;
export type AddressType = number;
export type BitType = number;

export type DatamapType = {
  key: KeyType;
  type?: TypeEnum;
  scale?: number;
  freq?: number;
};

export type MapLikeType<T, K> = Map<T, K> | Array<[T, K]>;
export type SetLikeType<T> = Set<T> | Array<T>;

export type MethodType = 'read' | 'write';
