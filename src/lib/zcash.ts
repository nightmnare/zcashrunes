import { HDKey } from '@scure/bip32';
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getPublicKey } from '@noble/secp256k1';
import bs58 from 'bs58';

const TRANSPARENT_PREFIX = new Uint8Array([0x1c, 0xb8]); // Zcash mainnet P2PKH (t1)
const WIF_PREFIX = 0x80; // Zcash transparent WIF prefix
const COMPRESSED_FLAG = 0x01;
const ZCASH_DERIVATION_PATH = "m/44'/133'/0'/0/0";

export type TransparentAddressPayload = {
  mnemonic?: string;
  address: string;
  privateKeyWif: string;
};

const doubleSha256 = (input: Uint8Array) => sha256(sha256(input));

const privateKeyToWif = (privateKey: Uint8Array): string => {
  const payload = new Uint8Array(1 + privateKey.length + 1);
  payload[0] = WIF_PREFIX;
  payload.set(privateKey, 1);
  payload[payload.length - 1] = COMPRESSED_FLAG;

  const checksum = doubleSha256(payload).slice(0, 4);
  const wifBytes = new Uint8Array(payload.length + checksum.length);
  wifBytes.set(payload, 0);
  wifBytes.set(checksum, payload.length);

  return bs58.encode(wifBytes);
};

const deriveTransparentAddress = (
  privateKey: Uint8Array,
  mnemonic?: string
): TransparentAddressPayload => {
  const publicKey = getPublicKey(privateKey, true);
  const pubKeyHash = ripemd160(sha256(publicKey));

  const payload = new Uint8Array(TRANSPARENT_PREFIX.length + pubKeyHash.length);
  payload.set(TRANSPARENT_PREFIX, 0);
  payload.set(pubKeyHash, TRANSPARENT_PREFIX.length);

  const checksum = doubleSha256(payload).slice(0, 4);
  const addressBytes = new Uint8Array(payload.length + checksum.length);
  addressBytes.set(payload, 0);
  addressBytes.set(checksum, payload.length);

  return {
    mnemonic,
    address: bs58.encode(addressBytes),
    privateKeyWif: privateKeyToWif(privateKey),
  };
};

const normalizeMnemonic = (mnemonic: string) =>
  mnemonic.trim().toLowerCase().split(/\s+/).join(' ');

export const walletFromMnemonic = (
  rawMnemonic: string
): TransparentAddressPayload => {
  const mnemonic = normalizeMnemonic(rawMnemonic);
  if (!validateMnemonic(mnemonic, english)) {
    throw new Error('Invalid BIP39 mnemonic');
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed).derive(ZCASH_DERIVATION_PATH);

  if (!hdKey.privateKey) {
    throw new Error('Unable to derive private key from mnemonic');
  }

  return deriveTransparentAddress(hdKey.privateKey, mnemonic);
};

export const wifToPrivateKey = (wif: string): Uint8Array => {
  const decoded = bs58.decode(wif);
  if (decoded.length < 37) {
    throw new Error('Invalid WIF length');
  }

  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  const expectedChecksum = doubleSha256(payload).slice(0, 4);
  if (!checksum.every((byte, index) => byte === expectedChecksum[index])) {
    throw new Error('Invalid WIF checksum');
  }

  if (payload[0] !== WIF_PREFIX) {
    throw new Error('Unsupported WIF prefix');
  }

  const hasCompressedFlag = payload[payload.length - 1] === COMPRESSED_FLAG;
  const keyBytes = hasCompressedFlag ? payload.slice(1, -1) : payload.slice(1);

  if (keyBytes.length !== 32) {
    throw new Error('Invalid private key length');
  }

  return keyBytes;
};

export const walletFromWif = (wif: string): TransparentAddressPayload =>
  deriveTransparentAddress(wifToPrivateKey(wif));

export const generateTransparentAddress = (): TransparentAddressPayload => {
  const mnemonic = generateMnemonic(english, 128);
  return walletFromMnemonic(mnemonic);
};
