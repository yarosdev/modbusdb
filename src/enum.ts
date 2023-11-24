export enum ScopeEnum {
  PhysicalState = 1,
  InternalState,
  PhysicalRegister,
  InternalRegister
}

export enum TypeEnum {
  Bit = 1,
  // reserved:
  // Int8,
  // UInt8,
  Int16 = 4,
  UInt16,
  Int32,
  UInt32,
  Float
}

export enum PriorityEnum {
  LOW = 1,
  NORMAL = 3,
  HIGH = 5
}
