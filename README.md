# modbusdb
An abstraction layer over the modbus protocol

![npm](https://img.shields.io/npm/dm/modbusdb)
![npm](https://img.shields.io/npm/v/modbusdb)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/C1C2RHVTE)

### Install
`npm install modbusdb`

## The main thing
```javascript

// Create a KEYs for modbus register
// 1 - Discrete Inputs
// 2 - Coils
// 3 - Input Registers
// 4 - Holding Registers
// createRegisterKey(UnitAddress: 1-254, ModbusTable: 1-4, RegisterAddress: 1-65000, BitIndex: 0-15 (optional))
const temperature = createRegisterKey(1, 4, 10) // Unit=1, Table=Holding Registers, Address=10
const speed = createRegisterKey(1, 3, 500) // Unit=1, Table=Input Registers, Address=500
const mode = createRegisterKey(1, 4, 856) // Unit=1, Table=Holding Registers, Address=856

const db = new Modbusdb(...);

// Read multiple values from slave modbus device:
const result = await db.mget([
  temperature,
  speed,
  mode
])

// Write values into modbus device:
const result = await db.mset(
  [
    [speed, 60],
    [mode, 10],
  ]
)

// That`s it! As easy as possible and developer friendly:)

```

### Example

```typescript
import { Modbusdb, ModbusSerialDriver, Datamap, createRegisterKey, TypeEnum, ScopeEnum } from "modbusdb";

import ModbusRTU from 'modbus-serial';

const bootstrap = async () => {
  const client = new ModbusRTU();

  // open connection to a serial port
  // await client.connectRTUBuffered("/dev/ttyUSB0", { baudRate: 9600 });
  await client.connectTcpRTUBuffered("127.0.0.1", { port: 8502 })
  // .... or any possible way in `modbus-serial`
  // connection issues are not handled by `modbusdb`

  const units = [
    {
      address: 1,
      forceWriteMany: true, // Use 15(0x0f) and 16(0x10) functions for single register, default: false
      bigEndian: true, // You can use BigEndian for byte order, default: false
      swapWords: false, // This is applicable only for multi-registers types such as int32, float etc, default: false
      requestWithGaps: true, // If requesting address 10 and 13 allow to send one request to the device, default: true
      maxRequestSize: 32, // How many registers to be requested in one round-trip with device, default: 1
    }
  ];
  
  // 1 -> ScopeEnum.PhysicalState -> Discrete Inputs
  // 2 -> ScopeEnum.InternalState -> Coils
  // 3 -> ScopeEnum.PhysicalRegister -> Input Registers
  // 4 -> ScopeEnum.InternalRegister -> Holding Registers
  
  // Define a schema for a database:
  const schema = [
    // Every data item has a unique int32 key (like ID), this key depends on unit,table,address...
    {
      key: createRegisterKey(1, ScopeEnum.InternalRegister, 10), // Encode [unit,table,address,bit index] into a single 32bit integer key
      type: TypeEnum.Int16, // default: UInt16
      scale: 2, // 123 int will become a float number 1.23, so it means multiply a register value by 10^-2, default: 0
      freq: 12 // How often to poll this register, just remember "polling frequency" for now:), default: 0
    },
    {
      key: createRegisterKey(1, ScopeEnum.InternalRegister, 11),
      type: TypeEnum.Int32,
      freq: 6
    },
    {
      key: createRegisterKey(1, ScopeEnum.PhysicalRegister, 99)
    },
    {
      key: createRegisterKey(1, ScopeEnum.InternalRegister, 15, 2), // Here is a SINGLE third-bit of the register (not coil and not discrete input)
      type: TypeEnum.Bit
    },
  ]

  const db = new Modbusdb({
    driver: new ModbusSerialDriver(client),
    datamap: new Datamap(schema, units),
    interval: 60, // 60 seconds
    timeout: 15, // 15 seconds
    roundSize: 12 // interval 60 divided by 12 is 5sec, so every 5 seconds modbusdb will poll for data
    // when round size is 12 we can divide interval by 12, and we have six integer "chunks of time" in the given "interval"
    // cause 12 has 6 Divisors (https://en.wikipedia.org/wiki/Table_of_divisors)
    // ---> time --->
    // 0sec |5sec |10sec |15sec|20sec|25sec|....
    // |<-                          round=60sec                           ->|
    // 1-----2-----3-----4-----5-----6-----7-----8-----9-----10-----11-----12
    // X-----X-----X-----X-----X-----X-----X-----X-----X------X------X-----X <- polling frequency is 12
    // X-----------X-----------X-----------X-----------X-------------X------ <- polling frequency is 6
    // X-----------------X-----------------X------------------X------------- <- polling frequency is 4
    // X-----------------------X-----------------------X-------------------- <- polling frequency is 3
    // X-----------------------------------X-------------------------------- <- polling frequency is 2
    // X-------------------------------------------------------------------- <- polling frequency is 1
    // X this is when request are made
    // so "polling frequency" means how many times request a register in a given "interval"
    // this pattern repeats over time :)
  })

  db.on('tick', () => {
    console.log('tick') // this is a round tick, triggered every [interval/roundSize] seconds
  });

  db.on('response', (t) => {
    console.log('transaction', t)
  });

  db.on('data', (data) => {
    console.log('data', data)
  });

  db.watch() // Start polling (if you wish to)

  // request three registers: unit=1, table=HoldingRegister,InputRegister, address=10,11,99
  const result = await db.mget([
    createRegisterKey(1, ScopeEnum.InternalRegister, 10),
    createRegisterKey(1, ScopeEnum.InternalRegister, 11),
    createRegisterKey(1, ScopeEnum.PhysicalRegister, 99)
  ])

  console.log('mget result', result)
}

// Start out app:
bootstrap();

``` 

## TODO
1. Create documentation
2. Add unit tests
3. Make more examples

## Links
1. https://github.com/yaacov/node-modbus-serial
