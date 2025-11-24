import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import bs58 from 'bs58';
import Modal from '../components/Modal';
import {
  getUtxos,
  sendTransaction,
  registerMint,
  type SendTransactionResponse,
  saveTransactionHistory,
} from '../lib/api';
import {
  DEFAULT_TX_FEE,
  createMetadataTransaction,
  type UtxoInput,
} from '../lib/transaction';
import {
  decryptWalletRecord,
  loadWalletRecord,
  type StoredWalletRecord,
} from '../lib/walletStorage';
import { formatErrorMessage } from '../lib/errors';
import { getWalletPassword } from '../lib/passwordStore';

const ZATOSHI_PER_ZEC = 10 ** 8;
const FAST_TX_TIP_ZEC = 0.0002;
const RECOMMENDED_TIP_DISPLAY = FAST_TX_TIP_ZEC.toFixed(8);
const ZCASH_TX_EXPLORER_BASE = 'https://blockchair.com/zcash/transaction';
const SAMPLE_TX_ID =
  'd5afd88323924ccc29bc8a7c68137d43690cbaf55c462535ead8ef83dfb745ff';

const MIME_TYPES = [
  { value: 'image/png', label: 'PNG Image' },
  { value: 'image/jpeg', label: 'JPEG Image' },
  { value: 'image/gif', label: 'GIF Image' },
  { value: 'image/webp', label: 'WebP Image' },
  { value: 'image/svg+xml', label: 'SVG Image' },
  { value: 'video/mp4', label: 'MP4 Video' },
  { value: 'audio/mpeg', label: 'MP3 Audio' },
  { value: 'text/plain', label: 'Plain Text' },
  { value: 'application/json', label: 'JSON' },
];

const MIME_TYPE_TO_HEX: Record<string, string> = {
  'image/png': '00',
  'image/jpeg': '01',
  'image/gif': '02',
  'image/webp': '03',
  'image/svg+xml': '04',
  'video/mp4': '05',
  'audio/mpeg': '06',
  'text/plain': '07',
  'application/json': '08',
};

const generateScript = (cid: string, mimeType: string): string => {
  const prefix = '000100';
  const mimeHex = MIME_TYPE_TO_HEX[mimeType] || '00';

  try {
    // Try to decode CID as base58 (common for IPFS v0 CIDs)
    const cidBytes = bs58.decode(cid);
    const cidHex = Buffer.from(cidBytes).toString('hex');
    const script = prefix + cidHex + mimeHex;
    return '6a' + (script.length / 2).toString(16) + prefix + cidHex + mimeHex;
  } catch {
    // If base58 decode fails, convert CID string to hex bytes
    const cidHex = Buffer.from(cid, 'utf-8').toString('hex');
    const script = prefix + cidHex + mimeHex;
    return '6a' + (script.length / 2).toString(16) + prefix + cidHex + mimeHex;
  }
};

// const extractCidFromScript = (scriptHex: string): string | null => {
//   try {
//     // Remove OP_RETURN opcode '6a' (first 2 chars)
//     if (!scriptHex.startsWith('6a')) {
//       return null;
//     }
//     let remaining = scriptHex.slice(2);

//     // Read length byte (next 2 hex chars = 1 byte)
//     if (remaining.length < 2) {
//       return null;
//     }
//     remaining = remaining.slice(2);

//     // Remove prefix '000100' (6 hex chars = 3 bytes)
//     if (!remaining.startsWith('000100')) {
//       return null;
//     }
//     remaining = remaining.slice(6);

//     // Remove MIME type hex (last 2 hex chars = 1 byte)
//     if (remaining.length < 2) {
//       return null;
//     }
//     const cidHex = remaining.slice(0, -2);

//     // Convert hex back to bytes
//     const cidBytes = Buffer.from(cidHex, 'hex');

//     // Try to encode as base58 first (for IPFS v0 CIDs)
//     try {
//       return bs58.encode(cidBytes);
//     } catch {
//       // If base58 encode fails, try UTF-8
//       try {
//         return cidBytes.toString('utf-8');
//       } catch {
//         return null;
//       }
//     }
//   } catch {
//     return null;
//   }
// };

const MintPage = () => {
  const navigate = useNavigate();
  const [cid, setCid] = useState('');
  const [cidFocused, setCidFocused] = useState(false);
  const [mimeType, setMimeType] = useState(MIME_TYPES[0].value);
  const [mimeMenuOpen, setMimeMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [tipAmount, setTipAmount] = useState(RECOMMENDED_TIP_DISPLAY);
  const [mintProcessing, setMintProcessing] = useState(false);
  const [walletRecord, setWalletRecord] = useState<StoredWalletRecord | null>(
    () => (typeof window === 'undefined' ? null : loadWalletRecord())
  );
  const [txResultModalOpen, setTxResultModalOpen] = useState(false);
  const [txResultPayload, setTxResultPayload] =
    useState<SendTransactionResponse | null>(null);

  const parsedTip = Number(tipAmount);
  const tipAmountIsFinite = Number.isFinite(parsedTip);
  const normalizedTip = tipAmountIsFinite && parsedTip > 0 ? parsedTip : 0;
  const tipIsNegative = tipAmountIsFinite && parsedTip < 0;
  const tipZatoshis = Math.round(normalizedTip * ZATOSHI_PER_ZEC);
  const baseFeeZec = DEFAULT_TX_FEE / ZATOSHI_PER_ZEC;
  const totalFeeZec = (DEFAULT_TX_FEE + tipZatoshis) / ZATOSHI_PER_ZEC;

  const selectedMime = MIME_TYPES.find((item) => item.value === mimeType);
  const walletAddress = walletRecord?.address ?? null;
  const txResultId = txResultPayload?.result ?? null;
  const txResultError = formatErrorMessage(txResultPayload?.error) || null;
  const txHasError = Boolean(txResultError);
  const txExplorerUrl = `${ZCASH_TX_EXPLORER_BASE}/${
    txResultId || SAMPLE_TX_ID
  }`;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setMimeMenuOpen(false);
      }
    };

    if (mimeMenuOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }

    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [mimeMenuOpen]);

  const handleMimeSelect = (value: string) => {
    setMimeType(value);
    setMimeMenuOpen(false);
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleFocus = () => {
      setWalletRecord(loadWalletRecord());
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleMint = async () => {
    if (!cid.trim()) {
      toast.error('Enter an IPFS CID to inscribe');
      return;
    }
    if (tipIsNegative) {
      toast.error('Tip amount must be zero or greater');
      return;
    }
    const record = loadWalletRecord();
    if (!record) {
      toast.error('Create or unlock your wallet in the Wallet tab first');
      return;
    }

    const walletPassword = getWalletPassword();
    if (!walletPassword) {
      toast.error('Wallet password not available. Please unlock your wallet.');
      navigate('/wallet');
      return;
    }

    setMintProcessing(true);
    try {
      const wallet = await decryptWalletRecord(walletPassword, record);
      const utxoList = await getUtxos({ address: wallet.address });
      const normalizedUtxos: UtxoInput[] = Array.isArray(utxoList)
        ? (utxoList as UtxoInput[])
        : [];
      if (!normalizedUtxos.length) {
        toast.error('No funds available to cover the inscribe fee');
        return;
      }
      const feeZatoshis = DEFAULT_TX_FEE + tipZatoshis;
      const metadataScript = generateScript(cid.trim(), mimeType);
      const { hex } = await createMetadataTransaction({
        utxos: normalizedUtxos,
        changeAddress: wallet.address,
        privateKeyWif: wallet.privateKeyWif,
        metadataScriptHex: metadataScript,
        fee: feeZatoshis,
      });
      const response = await sendTransaction({ hex });
      setTxResultPayload(response);
      setTxResultModalOpen(true);
      if (response.error) {
        toast.error(response.error || 'Please increase fee');
        return;
      }

      await registerMint({
        address: wallet.address,
        ipfs_cid: cid.trim(),
        ipfs_type: mimeType,
        inscriptionId: response.result ?? '',
        utxo: response.result ? response.result + ':1' : '',
        price: 0,
        isSale: false,
        collectionId: 'others',
      });

      await saveTransactionHistory({
        from: wallet.address,
        to: wallet.address,
        inscriptionId: response.result ?? '',
        reason: 'Mint',
        price: 0,
      });
      setCid('');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to inscribe'
      );
    } finally {
      setMintProcessing(false);
      setWalletRecord(loadWalletRecord());
    }
  };

  const closeTxResultModal = () => {
    setTxResultModalOpen(false);
    setTxResultPayload(null);
  };

  return (
    <>
      <Toaster
        position='top-center'
        toastOptions={{
          duration: 4000,
          className: 'rounded-2xl text-sm shadow-lg',
          style: {
            background: '#0f172a',
            color: '#e2e8f0',
            border: '1px solid rgba(148, 163, 184, 0.3)',
          },
          success: {
            iconTheme: {
              primary: '#34d399',
              secondary: '#0f172a',
            },
          },
          error: {
            iconTheme: {
              primary: '#f87171',
              secondary: '#0f172a',
            },
          },
        }}
      />
      <main className='w-full px-2 py-4 md:px-4 md:py-10'>
        <div className='mx-auto w-full max-w-3xl rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-2xl shadow-slate-900/50 md:rounded-3xl md:p-8'>
          <h1 className='text-2xl font-semibold text-white'>Inscribe NFT</h1>
          <p className='mt-2 text-sm text-slate-400'>
            Provide the IPFS CID and media type for the asset you want to
            inscribe.
          </p>

          <label className='mt-8 block text-sm font-medium text-slate-300'>
            IPFS CID
            <input
              type='text'
              value={cid}
              onChange={(event) => setCid(event.target.value)}
              placeholder={
                cidFocused
                  ? ''
                  : 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
              }
              onFocus={() => setCidFocused(true)}
              onBlur={() => setCidFocused(false)}
              disabled={mintProcessing}
              className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
            />
          </label>

          <div className='mt-6 text-sm font-medium text-slate-300'>
            MIME Type
            <div className='relative mt-2' ref={dropdownRef}>
              <button
                type='button'
                onClick={() => setMimeMenuOpen((prev) => !prev)}
                className='flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none transition hover:border-indigo-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
              >
                <span>
                  <span className='text-xs uppercase tracking-widest text-slate-400'>
                    {selectedMime?.value}
                  </span>
                  <span className='ml-2 font-semibold text-white'>
                    {selectedMime?.label}
                  </span>
                </span>
                <span
                  className={`transition ${
                    mimeMenuOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                >
                  ▼
                </span>
              </button>
              {mimeMenuOpen ? (
                <div className='absolute z-20 mt-3 w-full overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur'>
                  {MIME_TYPES.map((option) => (
                    <button
                      type='button'
                      key={option.value}
                      onClick={() => handleMimeSelect(option.value)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-sm transition ${
                        option.value === mimeType
                          ? 'bg-indigo-500/20 text-indigo-100'
                          : 'text-slate-200 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className='text-left'>
                        <p className='text-xs uppercase tracking-widest text-slate-400'>
                          {option.value}
                        </p>
                        <p className='font-semibold'>{option.label}</p>
                      </div>
                      {option.value === mimeType ? (
                        <span aria-label='Selected' role='img'>
                          ✅
                        </span>
                      ) : (
                        <span className='text-slate-500'>Select</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className='mt-6 text-sm font-medium text-slate-300'>
            Fast Tip (ZEC)
            <div className='mt-2 flex items-center justify-between'>
              <input
                type='number'
                step='0.00000001'
                min='0'
                value={tipAmount}
                onChange={(event) => setTipAmount(event.target.value)}
                placeholder={RECOMMENDED_TIP_DISPLAY}
                disabled={mintProcessing}
                className='w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
              />
              <button
                type='button'
                onClick={() => setTipAmount(RECOMMENDED_TIP_DISPLAY)}
                disabled={mintProcessing}
                className='ml-3 whitespace-nowrap rounded-2xl border border-indigo-500/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-indigo-100 transition hover:border-indigo-400 disabled:opacity-60'
              >
                Use {RECOMMENDED_TIP_DISPLAY}
              </button>
            </div>
            <p className='mt-2 text-xs text-slate-400'>
              Base fee {baseFeeZec.toFixed(8)} ZEC · Total fee with tip{' '}
              {totalFeeZec.toFixed(8)} ZEC
            </p>
          </div>

          <div className='mt-6 rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4'>
            <p className='text-xs uppercase tracking-widest text-slate-400'>
              Inscribing Wallet
            </p>
            {walletAddress ? (
              <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                {walletAddress}
              </p>
            ) : (
              <p className='mt-2 text-sm text-rose-200'>
                No wallet detected. Create or unlock a wallet from the Wallet
                tab.
              </p>
            )}
          </div>

          <button
            type='button'
            onClick={handleMint}
            disabled={!walletRecord || mintProcessing}
            className='mt-8 w-full rounded-2xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-emerald-100 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60'
          >
            {mintProcessing ? 'Inscribing...' : 'Inscribe'}
          </button>
        </div>
      </main>
      <Modal
        open={txResultModalOpen}
        title='Inscribe Transaction Status'
        onClose={closeTxResultModal}
      >
        {txResultPayload ? (
          <div className='space-y-4'>
            <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-400'>
                Result
              </p>
              {txResultId ? (
                <a
                  href={txExplorerUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='mt-2 inline-flex break-all font-mono text-sm text-indigo-200 underline'
                >
                  {txResultId}
                </a>
              ) : (
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  No transaction id
                </p>
              )}
            </div>
            <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-400'>
                Status
              </p>
              <p
                className={`mt-2 text-sm ${
                  txHasError ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {txHasError
                  ? txResultError ?? 'Please increase fee'
                  : 'Success'}
              </p>
            </div>
            {txHasError ? (
              <p className='text-sm text-rose-200'>
                Please increase fee and try again.
              </p>
            ) : (
              <div className='space-y-3'>
                <p className='text-sm text-emerald-200'>
                  Inscribe transaction broadcasted successfully.
                </p>
                <a
                  href={txExplorerUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='block rounded-2xl border border-indigo-500/60 bg-indigo-500/10 px-4 py-2 text-center text-sm font-medium text-indigo-100 hover:border-indigo-400'
                >
                  View transaction
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className='text-sm text-slate-300'>Awaiting transaction result…</p>
        )}
      </Modal>
    </>
  );
};

export default MintPage;
