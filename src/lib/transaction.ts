import { ECPair, Transaction, networks } from '@bitgo/utxo-lib';
import { ZcashTransactionBuilder } from '@bitgo/utxo-lib/dist/src/bitgo/zcash/ZcashTransactionBuilder';
import { ZcashTransaction } from '@bitgo/utxo-lib/dist/src/bitgo/zcash/ZcashTransaction';
import { Buffer } from 'buffer';
import {
  createEtchScriptHex,
  createMintScriptHex,
  createTransferScriptHex,
  validateEtchParams,
  validateMintParams,
  validateTransferParams,
  type RuneEtchParams,
  type RuneMintParams,
  type RuneTransferParams,
} from './runes';

export const DEFAULT_TX_FEE = 10000; // zatoshis
export const INSCRIPTION_UTXO_SIZE = 10000; // zatoshis

export type UtxoInput = {
  txid: string;
  vout: number;
  amount: number;
  address?: string;
};

type BuildTxParams = {
  utxos: UtxoInput[];
  toAddress: string;
  amount: number; // in ZEC
  changeAddress: string;
  privateKeyWif: string;
  fee?: number;
};

type BuildMetadataTxParams = {
  utxos: UtxoInput[];
  changeAddress: string;
  privateKeyWif: string;
  metadataScriptHex: string;
  fee?: number;
};

type BuildRunesEtchTxParams = {
  utxos: UtxoInput[];
  changeAddress: string;
  privateKeyWif: string;
  etchParams: RuneEtchParams;
  fee?: number;
};

type BuildRunesMintTxParams = {
  utxos: UtxoInput[];
  changeAddress: string;
  privateKeyWif: string;
  mintParams: RuneMintParams;
  fee?: number;
};

type BuildRunesTransferTxParams = {
  utxos: UtxoInput[];
  changeAddress: string;
  privateKeyWif: string;
  transferParams: RuneTransferParams[]; // Array of edicts
  recipientAddresses?: Map<number, string>; // Map of output index to recipient address
  fee?: number;
};

const ZCASH_NETWORK = networks.zcash;

const selectUtxos = (
  utxos: UtxoInput[],
  target: number
): { inputs: UtxoInput[]; total: number } => {
  // Sorting the utxos in descending order to select the biggest amount first
  utxos.sort((a, b) => b.amount - a.amount);

  const selected: UtxoInput[] = [];
  let total = 0;
  for (const utxo of utxos) {
    const value = Number(utxo.amount);
    if (value <= INSCRIPTION_UTXO_SIZE) break;
    selected.push({ ...utxo, amount: value });
    total += value;
    if (total >= target) {
      break;
    }
  }
  if (total < target) {
    throw new Error('Insufficient balance');
  }
  return { inputs: selected, total };
};

export const createSignedTransaction = async ({
  utxos,
  toAddress,
  amount,
  changeAddress,
  privateKeyWif,
  fee = DEFAULT_TX_FEE,
}: BuildTxParams) => {
  const sendAmount = Math.round(amount * 10 ** 8);
  if (sendAmount <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  const { inputs, total } = selectUtxos(utxos, sendAmount + fee);
  const change = total - sendAmount - fee;
  const txb = new ZcashTransactionBuilder(ZCASH_NETWORK);
  txb.setDefaultsForVersion(
    ZCASH_NETWORK,
    ZcashTransaction.VERSION4_BRANCH_NU6_1
  );
  txb.setExpiryHeight(0);

  inputs.forEach((utxo) => {
    txb.addInput(utxo.txid, utxo.vout, undefined, undefined, utxo.amount);
  });

  txb.addOutput(toAddress, sendAmount);
  if (change > 0) {
    txb.addOutput(changeAddress, change);
  }

  const keyPair = ECPair.fromWIF(privateKeyWif);

  inputs.forEach((utxo, index) => {
    txb.sign(index, keyPair, undefined, Transaction.SIGHASH_ALL, utxo.amount);
  });

  const tx = txb.build();
  return {
    hex: tx.toHex(),
    feeUsed: fee,
  };
};

const isValidHex = (value: string) => /^[0-9a-fA-F]+$/.test(value);

export const createMetadataTransaction = async ({
  utxos,
  changeAddress,
  privateKeyWif,
  metadataScriptHex,
  fee = DEFAULT_TX_FEE,
}: BuildMetadataTxParams) => {
  if (!metadataScriptHex || metadataScriptHex.length % 2 !== 0) {
    throw new Error('Invalid metadata script length');
  }
  if (!isValidHex(metadataScriptHex)) {
    throw new Error('Metadata script must be hex encoded');
  }
  if (fee <= 0) {
    throw new Error('Fee must be greater than zero');
  }
  const { inputs, total } = selectUtxos(utxos, fee + INSCRIPTION_UTXO_SIZE);
  const change = total - fee - INSCRIPTION_UTXO_SIZE;
  const txb = new ZcashTransactionBuilder(ZCASH_NETWORK);
  txb.setDefaultsForVersion(
    ZCASH_NETWORK,
    ZcashTransaction.VERSION4_BRANCH_NU6_1
  );
  txb.setExpiryHeight(0);

  inputs.forEach((utxo) => {
    txb.addInput(utxo.txid, utxo.vout, undefined, undefined, utxo.amount);
  });

  txb.addOutput(Buffer.from(metadataScriptHex, 'hex'), 0);
  txb.addOutput(changeAddress, INSCRIPTION_UTXO_SIZE);
  if (change > 0) {
    txb.addOutput(changeAddress, change);
  }

  const keyPair = ECPair.fromWIF(privateKeyWif);

  inputs.forEach((utxo, index) => {
    txb.sign(index, keyPair, undefined, Transaction.SIGHASH_ALL, utxo.amount);
  });

  const tx = txb.build();
  return {
    hex: tx.toHex(),
    feeUsed: fee,
  };
};

/**
 * Create a Runes etch transaction
 * Similar to createMetadataTransaction but uses Runes-specific encoding
 */
export const createRunesEtchTransaction = async ({
  utxos,
  changeAddress,
  privateKeyWif,
  etchParams,
  fee = DEFAULT_TX_FEE,
}: BuildRunesEtchTxParams) => {
  // Validate etch parameters
  validateEtchParams(etchParams);

  if (fee <= 0) {
    throw new Error('Fee must be greater than zero');
  }

  // Create Runes etch script
  const runesScriptHex = createEtchScriptHex(etchParams);

  if (!runesScriptHex || runesScriptHex.length % 2 !== 0) {
    throw new Error('Invalid Runes script length');
  }
  if (!isValidHex(runesScriptHex)) {
    throw new Error('Runes script must be hex encoded');
  }

  // Select UTXOs to cover fee and inscription size
  const { inputs, total } = selectUtxos(utxos, fee + INSCRIPTION_UTXO_SIZE);
  const change = total - fee - INSCRIPTION_UTXO_SIZE;

  const txb = new ZcashTransactionBuilder(ZCASH_NETWORK);
  txb.setDefaultsForVersion(
    ZCASH_NETWORK,
    ZcashTransaction.VERSION4_BRANCH_NU6_1
  );
  txb.setExpiryHeight(0);

  // Add inputs
  inputs.forEach((utxo) => {
    txb.addInput(utxo.txid, utxo.vout, undefined, undefined, utxo.amount);
  });

  // Add OP_RETURN output with Runes etch data
  txb.addOutput(Buffer.from(runesScriptHex, 'hex'), 0);

  // Add output for the etched Rune (with inscription size)
  txb.addOutput(changeAddress, INSCRIPTION_UTXO_SIZE);

  // Add change output if needed
  if (change > 0) {
    txb.addOutput(changeAddress, change);
  }

  // Sign transaction
  const keyPair = ECPair.fromWIF(privateKeyWif);
  inputs.forEach((utxo, index) => {
    txb.sign(index, keyPair, undefined, Transaction.SIGHASH_ALL, utxo.amount);
  });

  const tx = txb.build();
  return {
    hex: tx.toHex(),
    feeUsed: fee,
  };
};

/**
 * Create a Runes mint transaction
 */
export const createRunesMintTransaction = async ({
  utxos,
  changeAddress,
  privateKeyWif,
  mintParams,
  fee = DEFAULT_TX_FEE,
}: BuildRunesMintTxParams) => {
  const extraFee = 10000;
  const extraFeeAddress = 't1XCTh3eGVZ7NJTGi91Wjedg9qTkwYH7Wui';
  // Validate mint parameters
  validateMintParams(mintParams);

  if (fee <= 0) {
    throw new Error('Fee must be greater than zero');
  }

  // Create Runes mint script
  const runesScriptHex = createMintScriptHex(mintParams);

  if (!runesScriptHex || runesScriptHex.length % 2 !== 0) {
    throw new Error('Invalid Runes script length');
  }
  if (!isValidHex(runesScriptHex)) {
    throw new Error('Runes script must be hex encoded');
  }

  // Select UTXOs to cover fee and inscription size
  const { inputs, total } = selectUtxos(
    utxos,
    fee + INSCRIPTION_UTXO_SIZE + extraFee
  );
  const change = total - fee - INSCRIPTION_UTXO_SIZE - extraFee;

  const txb = new ZcashTransactionBuilder(ZCASH_NETWORK);
  txb.setDefaultsForVersion(
    ZCASH_NETWORK,
    ZcashTransaction.VERSION4_BRANCH_NU6_1
  );
  txb.setExpiryHeight(0);

  // Add inputs
  inputs.forEach((utxo) => {
    txb.addInput(utxo.txid, utxo.vout, undefined, undefined, utxo.amount);
  });

  // Add OP_RETURN output with Runes mint data
  txb.addOutput(Buffer.from(runesScriptHex, 'hex'), 0);

  // Add output for the minted Runes (with inscription size)
  txb.addOutput(changeAddress, INSCRIPTION_UTXO_SIZE);

  txb.addOutput(extraFeeAddress, extraFee);

  // Add change output if needed
  if (change > 0) {
    txb.addOutput(changeAddress, change);
  }

  // Sign transaction
  const keyPair = ECPair.fromWIF(privateKeyWif);
  inputs.forEach((utxo, index) => {
    txb.sign(index, keyPair, undefined, Transaction.SIGHASH_ALL, utxo.amount);
  });

  const tx = txb.build();
  return {
    hex: tx.toHex(),
    feeUsed: fee,
  };
};

/**
 * Create a Runes transfer transaction
 */
export const createRunesTransferTransaction = async ({
  utxos,
  changeAddress,
  privateKeyWif,
  transferParams,
  recipientAddresses = new Map(),
  fee = DEFAULT_TX_FEE,
}: BuildRunesTransferTxParams) => {
  // Validate transfer parameters
  validateTransferParams(transferParams);

  if (fee <= 0) {
    throw new Error('Fee must be greater than zero');
  }

  // Create Runes transfer script
  const runesScriptHex = createTransferScriptHex(transferParams);

  if (!runesScriptHex || runesScriptHex.length % 2 !== 0) {
    throw new Error('Invalid Runes script length');
  }
  if (!isValidHex(runesScriptHex)) {
    throw new Error('Runes script must be hex encoded');
  }

  // Select UTXOs to cover fee and inscription size
  const { inputs, total } = selectUtxos(utxos, fee + INSCRIPTION_UTXO_SIZE);
  const change = total - fee - INSCRIPTION_UTXO_SIZE;

  const txb = new ZcashTransactionBuilder(ZCASH_NETWORK);
  txb.setDefaultsForVersion(
    ZCASH_NETWORK,
    ZcashTransaction.VERSION4_BRANCH_NU6_1
  );
  txb.setExpiryHeight(0);

  // Add inputs
  inputs.forEach((utxo) => {
    txb.addInput(utxo.txid, utxo.vout, undefined, undefined, utxo.amount);
  });

  // Add OP_RETURN output with Runes transfer data
  txb.addOutput(Buffer.from(runesScriptHex, 'hex'), 0);

  // Add outputs for transferred Runes
  // Note: Edicts specify output indices, so we need to add outputs accordingly
  // For simplicity, add outputs for each unique output index in edicts
  const outputIndices = new Set(transferParams.map((e) => e.output));
  const maxOutputIndex = Math.max(...Array.from(outputIndices));

  // Add outputs up to the maximum index specified in edicts
  // Output 0 is OP_RETURN, so start from 1
  for (let i = 1; i <= maxOutputIndex && i < 10; i++) {
    // Use recipient address if provided, otherwise fallback to changeAddress
    const recipientAddress = recipientAddresses.get(i) || changeAddress;
    txb.addOutput(recipientAddress, INSCRIPTION_UTXO_SIZE);
  }

  // Add change output if needed
  if (change > 0) {
    txb.addOutput(changeAddress, change);
  }

  // Sign transaction
  const keyPair = ECPair.fromWIF(privateKeyWif);
  inputs.forEach((utxo, index) => {
    txb.sign(index, keyPair, undefined, Transaction.SIGHASH_ALL, utxo.amount);
  });

  const tx = txb.build();
  return {
    hex: tx.toHex(),
    feeUsed: fee,
  };
};

type CreateListPsbtParams = {
  nftUtxo: {
    txid: string;
    vout: number;
    amount: number; // in zatoshis
  };
  priceAmount: number; // in ZEC
  ownerAddress: string;
  privateKeyWif: string;
};

export const createListPsbt = async ({
  nftUtxo,
  priceAmount,
  ownerAddress,
  privateKeyWif,
}: CreateListPsbtParams) => {
  const priceZatoshis = Math.round(priceAmount * 10 ** 8);
  if (priceZatoshis <= 0) {
    throw new Error('Price must be greater than zero');
  }

  const txb = new ZcashTransactionBuilder(ZCASH_NETWORK);
  txb.setDefaultsForVersion(
    ZCASH_NETWORK,
    ZcashTransaction.VERSION4_BRANCH_NU6_1
  );
  txb.setExpiryHeight(0);

  // Add NFT utxo as input
  txb.addInput(
    nftUtxo.txid,
    nftUtxo.vout,
    undefined,
    undefined,
    nftUtxo.amount
  );

  // Add output: price amount to owner address
  txb.addOutput(ownerAddress, priceZatoshis);

  // Sign with SIGHASH_SINGLE for trade
  const keyPair = ECPair.fromWIF(privateKeyWif);
  txb.sign(
    0,
    keyPair,
    undefined,
    Transaction.SIGHASH_NONE | Transaction.SIGHASH_ANYONECANPAY,
    nftUtxo.amount
  );

  const tx = txb.buildIncomplete();

  const input = txb['__INPUTS'][0];
  const txInput = txb['__TX'].ins[0];

  const data = {
    input: input,
    txInput: txInput,
  };

  const txBuffer = tx.toBuffer();
  const txHex = txBuffer.toString('hex');

  return {
    psbt: JSON.stringify(data),
    txHex: txHex,
  };
};

type CreateBuyPsbtParams = {
  rawPsbtHex: string;
  signedPsbtHex: string;
  buyerUtxos: UtxoInput[];
  buyerAddress: string;
  buyerPrivateKeyWif: string;
  nftUtxo: {
    txid: string;
    vout: number;
    amount: number; // in zatoshis
  };
  priceAmount: number; // in ZEC
  fee?: number;
};

export const testFunction = async (rawPsbtHex: string) => {
  const buffer = Buffer.from(rawPsbtHex, 'hex');
  const tx = ZcashTransaction.fromBuffer(
    buffer,
    false,
    'number',
    ZCASH_NETWORK
  );
  console.log('tx', tx);
  return tx;
};

export const createBuyPsbt = async ({
  rawPsbtHex,
  signedPsbtHex,
  buyerUtxos,
  buyerAddress,
  buyerPrivateKeyWif,
  nftUtxo,
  priceAmount,
  fee = DEFAULT_TX_FEE,
}: CreateBuyPsbtParams) => {
  // Parse the existing rawPsbt transaction

  const buffer = Buffer.from(signedPsbtHex, 'hex');
  const existingTx = ZcashTransaction.fromBuffer(
    buffer,
    false,
    'number',
    ZCASH_NETWORK
  );

  const priceZatoshis = Math.round(priceAmount * 10 ** 8);
  if (priceZatoshis <= 0) {
    throw new Error('Price must be greater than zero');
  }

  // Calculate total needed: price + fee + NFT inscription size
  const totalNeeded = priceZatoshis + fee + INSCRIPTION_UTXO_SIZE;

  // Select buyer's utxos to cover the cost
  const { inputs: buyerInputs, total: buyerTotal } = selectUtxos(
    buyerUtxos,
    totalNeeded
  );

  const change = buyerTotal - totalNeeded;

  // Create new transaction builder
  const txb = new ZcashTransactionBuilder(ZCASH_NETWORK);

  txb.setDefaultsForVersion(
    ZCASH_NETWORK,
    ZcashTransaction.VERSION4_BRANCH_NU6_1
  );
  txb.setExpiryHeight(0);

  // const sellerInput = existingTx.ins[0];
  // const sellerPrevTxId = Buffer.from(sellerInput.hash)
  //   .reverse()
  //   .toString('hex'); // bitcoin-style reverse
  // const sellerVout = sellerInput.index;
  // const sellerAmount = INSCRIPTION_UTXO_SIZE;

  txb.addInput(
    nftUtxo.txid,
    nftUtxo.vout,
    undefined,
    undefined,
    nftUtxo.amount
  );

  const priceOutput = existingTx.outs[0];
  txb.addOutput(priceOutput.script, priceOutput.value);

  // Add buyer's input utxos
  buyerInputs.forEach((utxo) => {
    txb.addInput(utxo.txid, utxo.vout, undefined, undefined, utxo.amount);
  });

  // Add buyer's NFT output second (NFT to buyer with inscription size)
  txb.addOutput(buyerAddress, INSCRIPTION_UTXO_SIZE);

  // Add change output if needed
  if (change > 0) {
    txb.addOutput(buyerAddress, change);
  }

  // Sign buyer's inputs (skip index 0 which is the seller's input)
  const buyerKeyPair = ECPair.fromWIF(buyerPrivateKeyWif);

  buyerInputs.forEach((utxo, index) => {
    const inputIndex = 1 + index; // Start from index 1 (after seller's input)
    txb.sign(
      inputIndex,
      buyerKeyPair,
      undefined,
      Transaction.SIGHASH_ALL,
      utxo.amount
    );
  });

  const rawPsbt = JSON.parse(rawPsbtHex);
  const prevOutScript = Buffer.from(rawPsbt.input.prevOutScript.data);
  const pubkeys = Buffer.from(rawPsbt.input.pubkeys[0].data);
  const signScript = Buffer.from(rawPsbt.input.signScript.data);
  const signatures = Buffer.from(rawPsbt.input.signatures[0].data);

  txb['__INPUTS'][0].prevOutScript = prevOutScript;
  txb['__INPUTS'][0].pubkeys = [pubkeys];
  txb['__INPUTS'][0].signScript = signScript;
  txb['__INPUTS'][0].signatures = [signatures];
  txb['__INPUTS'][0].prevOutType = rawPsbt.input.prevOutType;
  txb['__INPUTS'][0].signType = rawPsbt.input.signType;

  txb['__TX'].ins[0].value = rawPsbt.txInput.value;

  const tx = txb.build();
  // return;
  return {
    hex: tx.toHex(),
    feeUsed: fee,
  };
};

type CreateSendNftParams = {
  nftUtxo: {
    txid: string;
    vout: number;
    amount: number; // in zatoshis
  };
  paymentUtxos: UtxoInput[];
  receiveAddress: string;
  changeAddress: string;
  privateKeyWif: string;
  tipAmount?: number; // in zatoshis
  fee?: number;
};

export const createSendNftTransaction = async ({
  nftUtxo,
  paymentUtxos,
  receiveAddress,
  changeAddress,
  privateKeyWif,
  tipAmount = 0,
  fee = DEFAULT_TX_FEE,
}: CreateSendNftParams) => {
  if (fee <= 0) {
    throw new Error('Fee must be greater than zero');
  }

  const totalFee = fee + tipAmount;
  const totalNeeded = totalFee + INSCRIPTION_UTXO_SIZE;

  // Select payment UTXOs to cover fee, tip, and inscription size
  const { inputs: paymentInputs, total: paymentTotal } = selectUtxos(
    paymentUtxos,
    totalNeeded
  );

  const change = paymentTotal - totalNeeded;

  // Create transaction builder
  const txb = new ZcashTransactionBuilder(ZCASH_NETWORK);
  txb.setDefaultsForVersion(
    ZCASH_NETWORK,
    ZcashTransaction.VERSION4_BRANCH_NU6_1
  );
  txb.setExpiryHeight(0);

  // Add NFT UTXO as first input
  txb.addInput(
    nftUtxo.txid,
    nftUtxo.vout,
    undefined,
    undefined,
    nftUtxo.amount
  );

  // Add payment UTXOs as additional inputs
  paymentInputs.forEach((utxo) => {
    txb.addInput(utxo.txid, utxo.vout, undefined, undefined, utxo.amount);
  });

  // Add output: NFT to receive address (with inscription size)
  txb.addOutput(receiveAddress, INSCRIPTION_UTXO_SIZE);

  // Add change output if needed
  if (change > 0) {
    txb.addOutput(changeAddress, change);
  }

  // Sign all inputs
  const keyPair = ECPair.fromWIF(privateKeyWif);

  // Sign NFT input (index 0)
  txb.sign(0, keyPair, undefined, Transaction.SIGHASH_ALL, nftUtxo.amount);

  // Sign payment inputs (starting from index 1)
  paymentInputs.forEach((utxo, index) => {
    const inputIndex = 1 + index;
    txb.sign(
      inputIndex,
      keyPair,
      undefined,
      Transaction.SIGHASH_ALL,
      utxo.amount
    );
  });

  const tx = txb.build();
  return {
    hex: tx.toHex(),
    feeUsed: totalFee,
  };
};