import { Buffer } from 'buffer';

/**
 * Runes Protocol Constants
 * Based on ord specification
 */
export const OP_RETURN_OPCODE = 0x6a; // OP_RETURN
export const OP_13_OPCODE = 0x5d; // OP_13 (required after OP_RETURN)

/**
 * Runes Protocol Tags
 * Tags are grouped by parity (even/odd)
 * Unrecognized odd tags are ignored
 * Unrecognized even tags produce a cenotaph
 */
export const Tag = {
  Body: 0, // Marks end of fields, following integers are edicts
  Flags: 2,
  Rune: 4,
  Premine: 6,
  Cap: 8,
  Amount: 10,
  HeightStart: 12,
  HeightEnd: 14,
  OffsetStart: 16,
  OffsetEnd: 18,
  Mint: 20,
  Pointer: 22,
  Cenotaph: 126,

  Divisibility: 1,
  Spacers: 3,
  Symbol: 5,
  Nop: 127,
} as const;

/**
 * Flags bitmap
 * Position is 1 << FLAG_VALUE
 */
export const Flag = {
  Etching: 0, // Marks transaction as containing an etching
  Terms: 1, // Marks etching as having open mint terms
  Turbo: 2, // Opts into future protocol changes
  Cenotaph: 127, // Unrecognized
} as const;

/**
 * Runes Etch Parameters
 */
export type RuneEtchParams = {
  runeName?: string; // Optional - if omitted, reserved rune name is allocated
  runeSymbol?: string; // Optional symbol (Unicode codepoint)
  runeSupply?: string; // Total supply (for terms cap)
  runeDecimals?: string; // Divisibility (0-255)
  limitPerMint?: string; // Amount per mint (for terms amount)
  premine?: string; // Premined amount
  spacers?: number; // Bitfield for • spacers in name
  terms?: {
    amount?: string; // Amount per mint
    cap?: string; // Total mint cap
    height?: [string | undefined, string | undefined]; // [start, end] absolute block heights
    offset?: [string | undefined, string | undefined]; // [start, end] relative to etching block
  };
  turbo?: boolean; // Turbo flag
};

/**
 * Runes Mint Parameters
 */
export type RuneMintParams = {
  runeId: string; // Format: "block:tx"
};

/**
 * Runes Transfer Parameters (Edict)
 */
export type RuneTransferParams = {
  runeId: string; // Format: "block:tx" or "0:0" for rune being etched
  amount: string; // Amount to transfer (0 means all remaining)
  output: number; // Output index (equal to num outputs means distribute to all)
};

/**
 * Rune ID structure
 */
export type RuneId = {
  block: number;
  tx: number;
};

/**
 * Encode LEB128 (Little Endian Base 128) varint
 * Each byte has MSB set except the last
 * Maximum 18 bytes for u128
 */
export const encodeLEB128 = (value: bigint): Buffer => {
  if (value < 0n) {
    throw new Error('LEB128 encoding requires non-negative value');
  }

  const bytes: number[] = [];
  let remaining = value;

  while (true) {
    const byte = Number(remaining & 0x7fn); // 7 bits
    remaining = remaining >> 7n;

    if (remaining === 0n) {
      bytes.push(byte); // Last byte, MSB not set
      break;
    } else {
      bytes.push(byte | 0x80); // MSB set to indicate continuation
    }

    if (bytes.length > 18) {
      throw new Error('LEB128 value exceeds 18 bytes (u128 limit)');
    }
  }

  return Buffer.from(bytes);
};

/**
 * Encode a number string as LEB128
 */
export const encodeLEB128Number = (numStr: string): Buffer => {
  try {
    const num = BigInt(numStr);
    if (num < 0n) {
      throw new Error('Number must be non-negative');
    }
    return encodeLEB128(num);
  } catch {
    throw new Error(`Invalid number: ${numStr}`);
  }
};

/**
 * Encode Rune name as modified base-26 integer
 * A=0, B=1, ..., Z=25, AA=26, AB=27, etc.
 */
export const encodeRuneName = (name: string): bigint => {
  if (!name || name.length === 0) {
    throw new Error('Rune name cannot be empty');
  }

  let value = 0n;
  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    if (char < 'A' || char > 'Z') {
      throw new Error(`Invalid character in rune name: ${char}`);
    }
    const charValue = BigInt(char.charCodeAt(0) - 'A'.charCodeAt(0));
    value = value * 26n + charValue;
  }

  // Check for reserved names (AAAAAAAAAAAAAAAAAAAAAAAAAA and above)
  // According to spec: 6402364363415443603228541259936211926 is the base value
  // for AAAAAAAAAAAAAAAAAAAAAAAAAA (26 A's)
  const reservedThresholdValue = 6402364363415443603228541259936211926n;

  if (value >= reservedThresholdValue) {
    throw new Error('Rune name is reserved');
  }

  return value;
};

/**
 * Encode Rune symbol as Unicode codepoint
 */
export const encodeRuneSymbol = (symbol: string): number => {
  if (symbol.length === 0) {
    throw new Error('Symbol cannot be empty');
  }
  if (symbol.length > 1) {
    throw new Error('Symbol must be a single character');
  }
  return symbol.charCodeAt(0);
};

/**
 * Parse Rune ID from "block:tx" format
 */
export const parseRuneId = (runeIdStr: string): RuneId => {
  const parts = runeIdStr.split(':');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid Rune ID format: ${runeIdStr}. Expected "block:tx"`
    );
  }

  const block = parseInt(parts[0], 10);
  const tx = parseInt(parts[1], 10);

  if (isNaN(block) || isNaN(tx) || block < 0 || tx < 0) {
    throw new Error(`Invalid Rune ID values: ${runeIdStr}`);
  }

  return { block, tx };
};

/**
 * Encode Rune ID as two LEB128 values (block, tx)
 */
export const encodeRuneId = (runeId: RuneId | string): Buffer => {
  const id = typeof runeId === 'string' ? parseRuneId(runeId) : runeId;
  const blockBytes = encodeLEB128(BigInt(id.block));
  const txBytes = encodeLEB128(BigInt(id.tx));
  return Buffer.concat([blockBytes, txBytes]);
};

/**
 * Encode edicts with delta encoding
 * Edicts must be sorted by Rune ID (block, then tx)
 * Delta encoding: block delta, then if block delta is 0, tx delta; else absolute tx
 */
export const encodeEdicts = (
  edicts: Array<{ runeId: string; amount: string; output: number }>
): Buffer => {
  if (edicts.length === 0) {
    return Buffer.alloc(0);
  }

  // Parse and sort edicts by Rune ID
  const parsed = edicts.map((e) => ({
    id: parseRuneId(e.runeId),
    amount: BigInt(e.amount),
    output: e.output,
  }));

  parsed.sort((a, b) => {
    if (a.id.block !== b.id.block) {
      return a.id.block - b.id.block;
    }
    return a.id.tx - b.id.tx;
  });

  // Delta encode
  const encoded: Buffer[] = [];
  let lastBlock = 0;
  let lastTx = 0;

  for (const edict of parsed) {
    const blockDelta = edict.id.block - lastBlock;
    const blockDeltaBytes = encodeLEB128(BigInt(blockDelta));

    let txBytes: Buffer;
    if (blockDelta === 0) {
      // Transaction index delta
      const txDelta = edict.id.tx - lastTx;
      txBytes = encodeLEB128(BigInt(txDelta));
    } else {
      // Absolute transaction index
      txBytes = encodeLEB128(BigInt(edict.id.tx));
    }

    const amountBytes = encodeLEB128(edict.amount);
    const outputBytes = encodeLEB128(BigInt(edict.output));

    encoded.push(blockDeltaBytes, txBytes, amountBytes, outputBytes);

    lastBlock = edict.id.block;
    lastTx = edict.id.tx;
  }

  return Buffer.concat(encoded);
};

/**
 * Encode etching flags
 */
export const encodeFlags = (params: RuneEtchParams): number => {
  let flags = 0;
  if (
    params.runeName !== undefined ||
    params.runeSymbol !== undefined ||
    params.runeDecimals !== undefined
  ) {
    flags |= 1 << Flag.Etching;
  }
  if (params.terms !== undefined) {
    flags |= 1 << Flag.Terms;
  }
  if (params.turbo === true) {
    flags |= 1 << Flag.Turbo;
  }
  return flags;
};

/**
 * Encode etching runestone
 */
export const encodeEtching = (params: RuneEtchParams): Buffer => {
  const fields: Buffer[] = [];

  // Flags
  const flags = encodeFlags(params);
  if (flags > 0) {
    fields.push(encodeLEB128(BigInt(Tag.Flags)), encodeLEB128(BigInt(flags)));
  }

  // Rune name (if provided)
  if (params.runeName !== undefined && params.runeName.length > 0) {
    const runeValue = encodeRuneName(params.runeName);
    fields.push(encodeLEB128(BigInt(Tag.Rune)), encodeLEB128(runeValue));
  }

  // Divisibility
  if (params.runeDecimals !== undefined) {
    const divisibility = parseInt(params.runeDecimals, 10);
    if (divisibility < 0 || divisibility > 255) {
      throw new Error('Divisibility must be between 0 and 255');
    }
    fields.push(
      encodeLEB128(BigInt(Tag.Divisibility)),
      encodeLEB128(BigInt(divisibility))
    );
  }

  // Spacers
  if (params.spacers !== undefined) {
    fields.push(
      encodeLEB128(BigInt(Tag.Spacers)),
      encodeLEB128(BigInt(params.spacers))
    );
  }

  // Symbol
  if (params.runeSymbol !== undefined && params.runeSymbol.length > 0) {
    const symbolCode = encodeRuneSymbol(params.runeSymbol);
    fields.push(
      encodeLEB128(BigInt(Tag.Symbol)),
      encodeLEB128(BigInt(symbolCode))
    );
  }

  // Premine
  if (params.premine !== undefined) {
    fields.push(
      encodeLEB128(BigInt(Tag.Premine)),
      encodeLEB128Number(params.premine)
    );
  }

  // Terms
  if (params.terms !== undefined) {
    if (params.terms.amount !== undefined) {
      fields.push(
        encodeLEB128(BigInt(Tag.Amount)),
        encodeLEB128Number(params.terms.amount)
      );
    }
    if (params.terms.cap !== undefined) {
      fields.push(
        encodeLEB128(BigInt(Tag.Cap)),
        encodeLEB128Number(params.terms.cap)
      );
    }
    if (params.terms.height !== undefined) {
      const [start, end] = params.terms.height;
      if (start !== undefined) {
        fields.push(
          encodeLEB128(BigInt(Tag.HeightStart)),
          encodeLEB128Number(start)
        );
      }
      if (end !== undefined) {
        fields.push(
          encodeLEB128(BigInt(Tag.HeightEnd)),
          encodeLEB128Number(end)
        );
      }
    }
    if (params.terms.offset !== undefined) {
      const [start, end] = params.terms.offset;
      if (start !== undefined) {
        fields.push(
          encodeLEB128(BigInt(Tag.OffsetStart)),
          encodeLEB128Number(start)
        );
      }
      if (end !== undefined) {
        fields.push(
          encodeLEB128(BigInt(Tag.OffsetEnd)),
          encodeLEB128Number(end)
        );
      }
    }
  }

  // Body tag (marks end of fields)
  fields.push(encodeLEB128(BigInt(Tag.Body)));

  return Buffer.concat(fields);
};

/**
 * Encode mint runestone
 */
export const encodeMint = (params: RuneMintParams): Buffer => {
  const fields: Buffer[] = [];
  const runeId = parseRuneId(params.runeId);

  // Mint tag with Rune ID
  fields.push(encodeLEB128(BigInt(Tag.Mint)));
  fields.push(encodeRuneId(runeId));

  // Body tag
  fields.push(encodeLEB128(BigInt(Tag.Body)));

  return Buffer.concat(fields);
};

/**
 * Encode transfer runestone (with edicts)
 */
export const encodeTransfer = (edicts: RuneTransferParams[]): Buffer => {
  const fields: Buffer[] = [];

  // Body tag (marks end of fields, start of edicts)
  fields.push(encodeLEB128(BigInt(Tag.Body)));

  // Encode edicts
  const edictsData = edicts.map((e) => ({
    runeId: e.runeId,
    amount: e.amount,
    output: e.output,
  }));
  const edictsEncoded = encodeEdicts(edictsData);

  return Buffer.concat([...fields, edictsEncoded]);
};

/**
 * Create OP_RETURN OP_13 script with Runes payload
 * Format: OP_RETURN (0x6a) OP_13 (0x5d) + data push opcode + length + payload bytes
 *
 * For data < 76 bytes, we use direct push opcode (0x01-0x4b where value is length)
 * For data 76-255 bytes, we use OP_PUSHDATA1 (0x4c) + 1-byte length + data
 * For data 256-65535 bytes, we use OP_PUSHDATA2 (0x4d) + 2-byte length + data
 * For data >= 65536 bytes, we use OP_PUSHDATA4 (0x4e) + 4-byte length + data
 */
export const createRunesOpReturnScript = (payload: Buffer): Buffer => {
  if (!payload || payload.length === 0) {
    throw new Error('Payload cannot be empty');
  }

  const opReturn = Buffer.from([OP_RETURN_OPCODE, OP_13_OPCODE]);

  // Push the payload data using proper push opcodes
  let pushOpcode: Buffer;

  const payloadLength = payload.length;

  if (payloadLength < 76) {
    // Direct push opcode (0x01-0x4b, where opcode value is the length)
    // Note: 0x00 is not a valid push opcode, so payloadLength must be >= 1
    pushOpcode = Buffer.from([payloadLength]);
  } else if (payloadLength < 256) {
    // OP_PUSHDATA1 (0x4c) + 1-byte length
    pushOpcode = Buffer.from([0x4c, payloadLength]);
  } else if (payloadLength < 65536) {
    // OP_PUSHDATA2 (0x4d) + 2-byte length (little-endian)
    const lengthBuf = Buffer.allocUnsafe(2);
    lengthBuf.writeUInt16LE(payloadLength, 0);
    pushOpcode = Buffer.concat([Buffer.from([0x4d]), lengthBuf]);
  } else {
    // OP_PUSHDATA4 (0x4e) + 4-byte length (little-endian)
    const lengthBuf = Buffer.allocUnsafe(4);
    lengthBuf.writeUInt32LE(payloadLength, 0);
    pushOpcode = Buffer.concat([Buffer.from([0x4e]), lengthBuf]);
  }

  return Buffer.concat([opReturn, pushOpcode, payload]);
};

/**
 * Create hex-encoded OP_RETURN script for etch transaction
 */
export const createEtchScriptHex = (params: RuneEtchParams): string => {
  const etchingData = encodeEtching(params);
  const script = createRunesOpReturnScript(etchingData);
  return script.toString('hex');
};

/**
 * Create hex-encoded OP_RETURN script for mint transaction
 */
export const createMintScriptHex = (params: RuneMintParams): string => {
  const mintData = encodeMint(params);
  const script = createRunesOpReturnScript(mintData);
  return script.toString('hex');
};

/**
 * Create hex-encoded OP_RETURN script for transfer transaction
 */
export const createTransferScriptHex = (
  edicts: RuneTransferParams[]
): string => {
  const transferData = encodeTransfer(edicts);
  const script = createRunesOpReturnScript(transferData);
  return script.toString('hex');
};

/**
 * Validate Runes etch parameters
 */
export const validateEtchParams = (params: RuneEtchParams): void => {
  // Rune name validation (if provided)
  if (params.runeName !== undefined && params.runeName.length > 0) {
    try {
      encodeRuneName(params.runeName);
    } catch (error) {
      throw new Error(
        `Invalid rune name: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
    }
  }

  // Divisibility validation
  if (params.runeDecimals !== undefined) {
    const divisibility = parseInt(params.runeDecimals, 10);
    if (isNaN(divisibility) || divisibility < 0 || divisibility > 255) {
      throw new Error('Divisibility must be between 0 and 255');
    }
  }

  // Terms validation
  if (params.terms !== undefined) {
    if (params.terms.amount !== undefined) {
      try {
        const amount = BigInt(params.terms.amount);
        if (amount <= 0n) {
          throw new Error('Terms amount must be greater than zero');
        }
      } catch {
        throw new Error('Invalid terms amount');
      }
    }
    if (params.terms.cap !== undefined) {
      try {
        const cap = BigInt(params.terms.cap);
        if (cap <= 0n) {
          throw new Error('Terms cap must be greater than zero');
        }
      } catch {
        throw new Error('Invalid terms cap');
      }
    }
  }

  // Supply validation (if provided)
  if (params.runeSupply !== undefined) {
    try {
      const supply = BigInt(params.runeSupply);
      if (supply <= 0n) {
        throw new Error('Rune supply must be greater than zero');
      }
    } catch {
      throw new Error('Invalid rune supply');
    }
  }

  // Limit per mint validation (if provided)
  if (params.limitPerMint !== undefined) {
    try {
      const limit = BigInt(params.limitPerMint);
      if (limit <= 0n) {
        throw new Error('Limit per mint must be greater than zero');
      }
      if (params.runeSupply !== undefined) {
        const supply = BigInt(params.runeSupply);
        if (limit > supply) {
          throw new Error('Limit per mint cannot exceed total supply');
        }
      }
    } catch {
      throw new Error('Invalid limit per mint');
    }
  }
};

/**
 * Validate Runes mint parameters
 */
export const validateMintParams = (params: RuneMintParams): void => {
  if (!params.runeId || params.runeId.trim().length === 0) {
    throw new Error('Rune ID is required');
  }
  try {
    parseRuneId(params.runeId);
  } catch {
    throw new Error('Invalid Rune ID format');
  }
};

/**
 * Validate Runes transfer parameters
 */
export const validateTransferParams = (edicts: RuneTransferParams[]): void => {
  if (edicts.length === 0) {
    throw new Error('At least one edict is required for transfer');
  }

  for (const edict of edicts) {
    if (!edict.runeId || edict.runeId.trim().length === 0) {
      throw new Error('Rune ID is required for each edict');
    }
    try {
      parseRuneId(edict.runeId);
    } catch {
      throw new Error(`Invalid Rune ID format: ${edict.runeId}`);
    }
    try {
      const amount = BigInt(edict.amount);
      if (amount < 0n) {
        throw new Error('Amount must be non-negative');
      }
    } catch {
      throw new Error(`Invalid amount: ${edict.amount}`);
    }
    if (edict.output < 0) {
      throw new Error('Output index must be non-negative');
    }
  }
};
