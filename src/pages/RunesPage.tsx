import { useState, useEffect, useMemo } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import {
  getUtxos,
  sendTransaction,
  registerRuneEtch,
  registerRuneMint,
  updateRuneEtchMintedAmount,
  getRuneEtchByRuneId,
  getAvailableRunes,
  type SendTransactionResponse,
  type RuneEtchDto,
} from '../lib/api';
import {
  DEFAULT_TX_FEE,
  createRunesEtchTransaction,
  createRunesMintTransaction,
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

type Tab = 'etch' | 'mint';

const toBigIntSafe = (value?: string | number | null): bigint => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.max(0, Math.trunc(value)));
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
};

const toBlockHeight = (runeId?: string): number => {
  if (!runeId) return 0;
  const [heightPart] = runeId.split(':');
  if (!heightPart) return 0;
  const parsed = Number(heightPart);
  return Number.isFinite(parsed) ? parsed : 0;
};

const RunesPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('etch');
  const [walletRecord, setWalletRecord] = useState<StoredWalletRecord | null>(
    () => (typeof window === 'undefined' ? null : loadWalletRecord())
  );

  // Etch form state
  const [runeName, setRuneName] = useState('');
  const [runeSymbol, setRuneSymbol] = useState('');
  const [runeSupply, setRuneSupply] = useState('');
  const [runeDecimals, setRuneDecimals] = useState('0');
  const [limitPerMint, setLimitPerMint] = useState('');
  const [etchTipAmount, setEtchTipAmount] = useState(RECOMMENDED_TIP_DISPLAY);
  const [etchProcessing, setEtchProcessing] = useState(false);
  const [etchTxResultModalOpen, setEtchTxResultModalOpen] = useState(false);
  const [etchTxResultPayload, setEtchTxResultPayload] =
    useState<SendTransactionResponse | null>(null);

  // Mint form state
  const [runeId, setRuneId] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [mintTipAmount, setMintTipAmount] = useState(RECOMMENDED_TIP_DISPLAY);
  const [mintProcessing, setMintProcessing] = useState(false);
  const [mintTxResultModalOpen, setMintTxResultModalOpen] = useState(false);
  const [mintTxResultPayload, setMintTxResultPayload] =
    useState<SendTransactionResponse | null>(null);


  // Available runes list
  const [availableRunes, setAvailableRunes] = useState<RuneEtchDto[]>([]);
  const [loadingAvailableRunes, setLoadingAvailableRunes] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const walletAddress = walletRecord?.address ?? null;

  // Etch calculations
  const parsedEtchTip = Number(etchTipAmount);
  const etchTipAmountIsFinite = Number.isFinite(parsedEtchTip);
  const normalizedEtchTip =
    etchTipAmountIsFinite && parsedEtchTip > 0 ? parsedEtchTip : 0;
  const etchTipIsNegative = etchTipAmountIsFinite && parsedEtchTip < 0;
  const etchTipZatoshis = Math.round(normalizedEtchTip * ZATOSHI_PER_ZEC);
  const etchBaseFeeZec = DEFAULT_TX_FEE / ZATOSHI_PER_ZEC;
  const etchTotalFeeZec = (DEFAULT_TX_FEE + etchTipZatoshis) / ZATOSHI_PER_ZEC;

  // Mint calculations
  const parsedMintTip = Number(mintTipAmount);
  const mintTipAmountIsFinite = Number.isFinite(parsedMintTip);
  const normalizedMintTip =
    mintTipAmountIsFinite && parsedMintTip > 0 ? parsedMintTip : 0;
  const mintTipIsNegative = mintTipAmountIsFinite && parsedMintTip < 0;
  const mintTipZatoshis = Math.round(normalizedMintTip * ZATOSHI_PER_ZEC);
  const mintBaseFeeZec = DEFAULT_TX_FEE / ZATOSHI_PER_ZEC;
  const mintTotalFeeZec = (DEFAULT_TX_FEE + mintTipZatoshis) / ZATOSHI_PER_ZEC;

  const etchTxResultId = etchTxResultPayload?.result ?? null;
  const etchTxResultError =
    formatErrorMessage(etchTxResultPayload?.error) || null;
  const etchTxHasError = Boolean(etchTxResultError);
  const etchTxExplorerUrl = `${ZCASH_TX_EXPLORER_BASE}/${
    etchTxResultId || SAMPLE_TX_ID
  }`;

  const mintTxResultId = mintTxResultPayload?.result ?? null;
  const mintTxResultError =
    formatErrorMessage(mintTxResultPayload?.error) || null;
  const mintTxHasError = Boolean(mintTxResultError);
  const mintTxExplorerUrl = `${ZCASH_TX_EXPLORER_BASE}/${
    mintTxResultId || SAMPLE_TX_ID
  }`;

  const handleEtch = async () => {
    if (!runeName.trim()) {
      toast.error('Enter a rune name');
      return;
    }
    if (!runeSymbol.trim()) {
      toast.error('Enter a rune symbol');
      return;
    }
    if (!runeSupply.trim() || Number(runeSupply) <= 0) {
      toast.error('Enter a valid supply amount');
      return;
    }
    if (!limitPerMint.trim() || Number(limitPerMint) <= 0) {
      toast.error('Enter a valid limit per mint amount');
      return;
    }
    if (etchTipIsNegative) {
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

    setEtchProcessing(true);
    try {
      const wallet = await decryptWalletRecord(walletPassword, record);
      const utxoList = await getUtxos({ address: wallet.address });
      const normalizedUtxos: UtxoInput[] = Array.isArray(utxoList)
        ? (utxoList as UtxoInput[])
        : [];
      if (!normalizedUtxos.length) {
        toast.error('No funds available to cover the etch fee');
        return;
      }
      const feeZatoshis = DEFAULT_TX_FEE + etchTipZatoshis;

      // Create Runes etch transaction
      // Map form fields to Runes protocol structure
      const etchParams: {
        runeName?: string;
        runeSymbol?: string;
        runeDecimals?: string;
        terms?: {
          cap?: string;
          amount?: string;
        };
      } = {};

      if (runeName.trim()) {
        etchParams.runeName = runeName.trim();
      }

      if (runeSymbol.trim()) {
        etchParams.runeSymbol = runeSymbol.trim();
      }

      if (runeDecimals.trim()) {
        etchParams.runeDecimals = runeDecimals.trim();
      }

      // Build terms object if supply or limit per mint is provided
      if (runeSupply.trim() || limitPerMint.trim()) {
        etchParams.terms = {};
        if (runeSupply.trim()) {
          etchParams.terms.cap = runeSupply.trim();
        }
        if (limitPerMint.trim()) {
          etchParams.terms.amount = limitPerMint.trim();
        }
      }

      const { hex } = await createRunesEtchTransaction({
        utxos: normalizedUtxos,
        changeAddress: wallet.address,
        privateKeyWif: wallet.privateKeyWif,
        etchParams,
        fee: feeZatoshis,
      });

      const response = await sendTransaction({ hex });
      setEtchTxResultPayload(response);
      setEtchTxResultModalOpen(true);
      if (response.error) {
        toast.error(response.error || 'Please increase fee');
        return;
      }

      // Save etch data to Firestore
      if (response.result) {
        try {
          await registerRuneEtch({
            address: wallet.address,
            runeName: runeName.trim(),
            runeSymbol: runeSymbol.trim(),
            runeSupply: runeSupply.trim(),
            runeDecimals: runeDecimals.trim(),
            limitPerMint: limitPerMint.trim(),
            mintedAmount: 0,
            transactionId: response.result,
            utxo: response.result ? `${response.result}:1` : undefined,
          });
        } catch (error) {
          console.error('Failed to save etch data:', error);
          // Don't fail the whole operation if save fails
          toast.error('Rune etched but failed to save data');
        }
      }

      toast.success('Rune etched successfully!');
      // Reset form
      setRuneName('');
      setRuneSymbol('');
      setRuneSupply('');
      setRuneDecimals('0');
      setLimitPerMint('');
      // Refresh available runes list (in case this rune gets activated)
      await loadAvailableRunes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to etch rune'
      );
    } finally {
      setEtchProcessing(false);
      setWalletRecord(loadWalletRecord());
    }
  };

  const handleMint = async () => {
    if (!runeId.trim()) {
      toast.error('Enter a rune ID');
      return;
    }
    if (!mintAmount.trim() || Number(mintAmount) <= 0) {
      toast.error('Enter a valid mint amount');
      return;
    }
    if (mintTipIsNegative) {
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
      // First, check if runeId exists in the rune table
      const etchRecord = await getRuneEtchByRuneId(runeId.trim());
      if (!etchRecord) {
        toast.error(
          'Rune ID not found. Please ensure the rune has been etched and activated.'
        );
        return;
      }

      // Validate that mint amount matches the etch's limitPerMint
      const inputMintAmount = mintAmount.trim();
      const etchLimitPerMint = etchRecord.limitPerMint?.trim() || '';

      if (!etchLimitPerMint) {
        toast.error(
          'This rune does not have a limit per mint set. Cannot mint.'
        );
        return;
      }

      if (inputMintAmount !== etchLimitPerMint) {
        toast.error(
          `Mint amount must be exactly ${etchLimitPerMint} (as set during etching).`
        );
        return;
      }

      const wallet = await decryptWalletRecord(walletPassword, record);
      const utxoList = await getUtxos({ address: wallet.address });
      const normalizedUtxos: UtxoInput[] = Array.isArray(utxoList)
        ? (utxoList as UtxoInput[])
        : [];
      if (!normalizedUtxos.length) {
        toast.error('No funds available to cover the mint fee');
        return;
      }
      const feeZatoshis = DEFAULT_TX_FEE + mintTipZatoshis;

      // Create Runes mint transaction
      // Note: Mint amount is not part of the mint runestone - it's determined by the etching terms
      const { hex } = await createRunesMintTransaction({
        utxos: normalizedUtxos,
        changeAddress: wallet.address,
        privateKeyWif: wallet.privateKeyWif,
        mintParams: {
          runeId: runeId.trim(),
        },
        fee: feeZatoshis,
      });

      const response = await sendTransaction({ hex });
      setMintTxResultPayload(response);
      setMintTxResultModalOpen(true);
      if (response.error) {
        toast.error(response.error || 'Please increase fee');
        return;
      }

      // Save mint data to Firestore
      if (response.result) {
        try {
          const mintAmountNum = parseFloat(mintAmount.trim()) || 0;

          // Save mint record with runeTransactionId and runeName from etch record
          await registerRuneMint({
            address: wallet.address,
            runeId: runeId.trim(),
            amount: mintAmount.trim(),
            transactionId: response.result,
            runeTransactionId: etchRecord.transactionId,
            runeName: etchRecord.runeName,
            utxo: response.result ? `${response.result}:1` : undefined,
          });

          // Update mintedAmount in etch record
          if (etchRecord.transactionId) {
            try {
              await updateRuneEtchMintedAmount(
                etchRecord.transactionId,
                mintAmountNum
              );
            } catch (error) {
              console.error('Failed to update mintedAmount:', error);
              // Don't fail the whole operation if update fails
            }
          }
        } catch (error) {
          console.error('Failed to save mint data:', error);
          // Don't fail the whole operation if save fails
          toast.error('Rune minted but failed to save data');
        }
      }

      toast.success('Rune minted successfully!');
      // Reset form
      setRuneId('');
      setMintAmount('');
      // Refresh available runes list to update progress
      await loadAvailableRunes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to mint rune'
      );
    } finally {
      setMintProcessing(false);
      setWalletRecord(loadWalletRecord());
    }
  };

  const closeEtchTxResultModal = () => {
    setEtchTxResultModalOpen(false);
    setEtchTxResultPayload(null);
  };

  const closeMintTxResultModal = () => {
    setMintTxResultModalOpen(false);
    setMintTxResultPayload(null);
  };

  // Load available runes
  const loadAvailableRunes = async () => {
    setLoadingAvailableRunes(true);
    try {
      const runes = await getAvailableRunes();
      setAvailableRunes(runes);
    } catch (error) {
      console.error('Failed to load available runes:', error);
      toast.error('Failed to load available runes');
    } finally {
      setLoadingAvailableRunes(false);
    }
  };

  // Load available runes on mount
  useEffect(() => {
    loadAvailableRunes();
  }, []);

  // Handle mint button click from available runes list
  const handleMintFromList = (rune: RuneEtchDto) => {
    if (!rune.runeId) {
      toast.error('Rune ID not available');
      return;
    }

    // Switch to mint tab
    setActiveTab('mint');

    // Auto-fill runeId
    setRuneId(rune.runeId);

    // Auto-fill amount (use limitPerMint if available, otherwise use a default)
    if (rune.limitPerMint) {
      setMintAmount(rune.limitPerMint);
    } else {
      // Default to 1000 if no limit specified
      setMintAmount('1000');
    }

    // Scroll to mint form
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  // Calculate mint progress percentage
  const calculateMintProgress = (rune: RuneEtchDto): number => {
    if (!rune.runeSupply || !rune.mintedAmount) {
      return 0;
    }
    try {
      const supply = BigInt(rune.runeSupply);
      const minted = BigInt(rune.mintedAmount);
      if (supply === 0n) return 0;
      const percentage = Number((minted * 100n) / supply);
      return Math.min(percentage, 100);
    } catch {
      return 0;
    }
  };

  const rankedRunes = useMemo(() => {
    return availableRunes
      .map((rune) => {
        const progress = calculateMintProgress(rune);
        const minted = toBigIntSafe(rune.mintedAmount);
        const supply = toBigIntSafe(rune.runeSupply);
        const blockHeight = toBlockHeight(rune.runeId);
        return { rune, progress, minted, supply, blockHeight };
      })
      .sort((a, b) => {
        if (b.blockHeight !== a.blockHeight) {
          return a.blockHeight - b.blockHeight;
        }
        if (a.minted !== b.minted) {
          return a.minted < b.minted ? 1 : -1;
        }
        if (a.supply !== b.supply) {
          return a.supply < b.supply ? 1 : -1;
        }
        const nameA = a.rune.runeName?.toLowerCase() ?? '';
        const nameB = b.rune.runeName?.toLowerCase() ?? '';
        return nameA.localeCompare(nameB);
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
  }, [availableRunes]);

  const paginatedRunes = rankedRunes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const topRunes = rankedRunes.slice(0, 3);

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
        <div className='mx-auto w-full max-w-7xl'>
          <div className='flex flex-col gap-4 lg:flex-row'>
            {/* Left Sidebar - Available Runes List */}
            <div className='w-full lg:w-3/5'>
              <div className='rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-2xl shadow-slate-900/50 md:rounded-3xl md:p-6'>
                <h2 className='text-lg font-semibold text-white mb-4'>
                  Available Runes
                </h2>
                {topRunes.length > 0 && (
                  <div className='mb-4 grid gap-3 md:grid-cols-3'>
                    {topRunes.map(({ rune, progress, rank, blockHeight }) => (
                      <div
                        key={`top-rune-${rune.transactionId}-${rank}`}
                        className='rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 shadow-inner shadow-amber-900/20'
                      >
                        <p className='text-xs font-semibold uppercase tracking-wide text-amber-200'>
                          #{rank} Lowest Height
                        </p>
                        <p className='mt-1 text-sm font-semibold text-white truncate'>
                          {rune.runeName || rune.runeId || 'Unnamed Rune'}
                        </p>
                        <p className='text-xs text-amber-100/80'>
                          Block {blockHeight || 'Unknown'}
                        </p>
                        <p className='text-xs text-amber-100/60'>
                          {progress}% minted
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {loadingAvailableRunes ? (
                  <div className='text-center text-slate-400 py-8'>
                    Loading...
                  </div>
                ) : rankedRunes.length === 0 ? (
                  <div className='text-center text-slate-400 py-8'>
                    No available runes
                  </div>
                ) : (
                  <>
                    <div className='overflow-x-auto'>
                      <table className='w-full text-sm'>
                        <thead>
                          <tr className='border-b border-slate-800'>
                            <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                              Rank
                            </th>
                            <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                              Rune ID
                            </th>
                            <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                              Name
                            </th>
                            <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                              Block Height
                            </th>
                            <th className='text-right py-3 px-2 text-slate-400 font-semibold'>
                              Supply
                            </th>
                            <th className='text-right py-3 px-2 text-slate-400 font-semibold'>
                              Minted
                            </th>
                            <th className='text-center py-3 px-2 text-slate-400 font-semibold'>
                              Progress
                            </th>
                            <th className='text-center py-3 px-2 text-slate-400 font-semibold sticky right-0 bg-slate-950/70 z-10'>
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRunes.map(({ rune, progress, rank, blockHeight }) => {
                            const supply = toBigIntSafe(rune.runeSupply);
                            const minted = toBigIntSafe(rune.mintedAmount);
                            const remaining = supply - minted;
                            const isFullyMinted = remaining <= 0n;

                            return (
                              <tr
                                key={rune.transactionId || `${rune.runeId}-${rank}`}
                                className='border-b border-slate-800/50 hover:bg-slate-900/30 transition'
                              >
                                <td className='py-3 px-2'>
                                  <span className='inline-flex items-center rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs font-semibold text-slate-200'>
                                    #{rank}
                                  </span>
                                </td>
                                <td className='py-3 px-2'>
                                  <p
                                    className='text-xs font-mono text-indigo-300 break-all max-w-[120px] truncate'
                                    title={rune.runeId}
                                  >
                                    {rune.runeId}
                                  </p>
                                </td>
                                <td className='py-3 px-2'>
                                  <p className='text-sm font-semibold text-white'>
                                    {rune.runeName || 'N/A'}
                                  </p>
                                </td>
                                <td className='py-3 px-2'>
                                  <p className='text-sm text-slate-200'>
                                    {blockHeight || '—'}
                                  </p>
                                </td>
                                <td className='py-3 px-2 text-right'>
                                  <p className='text-sm text-white'>
                                    {rune.runeSupply || '0'}
                                  </p>
                                </td>
                                <td className='py-3 px-2 text-right'>
                                  <p className='text-sm text-white'>
                                    {rune.mintedAmount || 0}
                                  </p>
                                </td>
                                <td className='py-3 px-2'>
                                  <div className='flex items-center gap-2'>
                                    <div className='flex-1 h-2 bg-slate-800 rounded-full overflow-hidden min-w-[60px]'>
                                      <div
                                        className='h-full bg-indigo-500 transition-all'
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                    <span className='text-xs text-slate-400 min-w-[35px] text-right'>
                                      {progress}%
                                    </span>
                                  </div>
                                </td>
                                <td className='py-3 px-2 text-center sticky right-0 bg-slate-950/70 z-10'>
                                  <button
                                    type='button'
                                    onClick={() => handleMintFromList(rune)}
                                    disabled={isFullyMinted}
                                    className='rounded-lg border border-emerald-500/60 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap'
                                  >
                                    {isFullyMinted ? 'Full' : 'Mint'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    {rankedRunes.length > itemsPerPage && (
                      <div className='mt-4 flex items-center justify-between'>
                        <div className='text-sm text-slate-400'>
                          Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                          {Math.min(
                            currentPage * itemsPerPage,
                            rankedRunes.length
                          )}{' '}
                          of {rankedRunes.length} runes
                        </div>
                        <div className='flex gap-2'>
                          <button
                            type='button'
                            onClick={() =>
                              setCurrentPage((prev) => Math.max(1, prev - 1))
                            }
                            disabled={currentPage === 1}
                            className='rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'
                          >
                            Previous
                          </button>
                          <span className='flex items-center px-3 py-1 text-sm text-slate-300'>
                            Page {currentPage} of{' '}
                            {Math.ceil(rankedRunes.length / itemsPerPage)}
                          </span>
                          <button
                            type='button'
                            onClick={() =>
                              setCurrentPage((prev) =>
                                Math.min(
                                  Math.ceil(rankedRunes.length / itemsPerPage),
                                  prev + 1
                                )
                              )
                            }
                            disabled={
                              currentPage >=
                              Math.ceil(rankedRunes.length / itemsPerPage)
                            }
                            className='rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right Side - Forms */}
            <div className='w-full lg:w-2/5'>
              <div className='rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-2xl shadow-slate-900/50 md:rounded-3xl md:p-8'>
                <h1 className='text-2xl font-semibold text-white'>
                  Zcash Runes
                </h1>
                <p className='mt-2 text-sm text-slate-400'>
                  Etch new Rune tokens or mint tokens from existing Runes.
                </p>

                {/* Tab Navigation */}
                <div className='mt-8 flex gap-2 border-b border-slate-800'>
                  <button
                    type='button'
                    onClick={() => setActiveTab('etch')}
                    className={`px-4 py-3 text-sm font-semibold transition ${
                      activeTab === 'etch'
                        ? 'border-b-2 border-indigo-400 text-indigo-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Etch
                  </button>
                  <button
                    type='button'
                    onClick={() => setActiveTab('mint')}
                    className={`px-4 py-3 text-sm font-semibold transition ${
                      activeTab === 'mint'
                        ? 'border-b-2 border-indigo-400 text-indigo-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Mint
                  </button>
                </div>

                {/* Etch Form */}
                {activeTab === 'etch' && (
                  <div className='mt-6 space-y-6'>
                    <div>
                      <label className='block text-sm font-medium text-slate-300'>
                        Rune Name
                      </label>
                      <input
                        type='text'
                        value={runeName}
                        onChange={(event) => setRuneName(event.target.value)}
                        placeholder='MYRUNETOKEN'
                        disabled={etchProcessing}
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-1 text-xs text-slate-500'>
                        Name of your Rune token (e.g., MYRUNETOKEN)
                      </p>
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-slate-300'>
                        Rune Symbol
                      </label>
                      <input
                        type='text'
                        value={runeSymbol}
                        onChange={(event) => setRuneSymbol(event.target.value)}
                        placeholder='$'
                        disabled={etchProcessing}
                        maxLength={1}
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-1 text-xs text-slate-500'>
                        Symbol for your Rune token (max 1 character)
                      </p>
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-slate-300'>
                        Total Supply
                      </label>
                      <input
                        type='number'
                        value={runeSupply}
                        onChange={(event) => setRuneSupply(event.target.value)}
                        placeholder='1000000'
                        disabled={etchProcessing}
                        min='1'
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-1 text-xs text-slate-500'>
                        Total number of tokens to create
                      </p>
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-slate-300'>
                        Decimals
                      </label>
                      <input
                        type='number'
                        value={runeDecimals}
                        onChange={(event) =>
                          setRuneDecimals(event.target.value)
                        }
                        placeholder='0'
                        disabled={etchProcessing}
                        min='0'
                        max='18'
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-1 text-xs text-slate-500'>
                        Number of decimal places (0-18)
                      </p>
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-slate-300'>
                        Limit Per Mint
                      </label>
                      <input
                        type='number'
                        value={limitPerMint}
                        onChange={(event) =>
                          setLimitPerMint(event.target.value)
                        }
                        placeholder='1000'
                        disabled={etchProcessing}
                        min='1'
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-1 text-xs text-slate-500'>
                        Maximum number of tokens that can be minted per mint
                        transaction
                      </p>
                    </div>

                    <div>
                      <div className='flex items-center justify-between text-sm font-medium text-slate-300'>
                        <span>Fast Tip (ZEC)</span>
                        <button
                          type='button'
                          onClick={() =>
                            setEtchTipAmount(RECOMMENDED_TIP_DISPLAY)
                          }
                          disabled={etchProcessing}
                          className='text-xs uppercase tracking-wide text-indigo-300 hover:text-indigo-200 disabled:opacity-60'
                        >
                          Use {RECOMMENDED_TIP_DISPLAY}
                        </button>
                      </div>
                      <input
                        type='number'
                        step='0.00000001'
                        min='0'
                        value={etchTipAmount}
                        onChange={(event) =>
                          setEtchTipAmount(event.target.value)
                        }
                        placeholder={RECOMMENDED_TIP_DISPLAY}
                        disabled={etchProcessing}
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-2 text-xs text-slate-400'>
                        Base fee {etchBaseFeeZec.toFixed(8)} ZEC · Total fee
                        with tip {etchTotalFeeZec.toFixed(8)} ZEC
                      </p>
                    </div>

                    <div className='rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4'>
                      <p className='text-xs uppercase tracking-widest text-slate-400'>
                        Etching Wallet
                      </p>
                      {walletAddress ? (
                        <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                          {walletAddress}
                        </p>
                      ) : (
                        <p className='mt-2 text-sm text-rose-200'>
                          No wallet detected. Create or unlock a wallet from the
                          Wallet tab.
                        </p>
                      )}
                    </div>

                    <button
                      type='button'
                      onClick={handleEtch}
                      disabled={!walletRecord || etchProcessing}
                      className='mt-8 w-full rounded-2xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-emerald-100 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60'
                    >
                      {etchProcessing ? 'Etching...' : 'Etch Rune'}
                    </button>
                  </div>
                )}

                {/* Mint Form */}
                {activeTab === 'mint' && (
                  <div className='mt-6 space-y-6'>
                    <div>
                      <label className='block text-sm font-medium text-slate-300'>
                        Rune ID
                      </label>
                      <input
                        type='text'
                        value={runeId}
                        onChange={(event) => setRuneId(event.target.value)}
                        placeholder='123456:0'
                        disabled={mintProcessing}
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-1 text-xs text-slate-500'>
                        The Rune ID to mint from (format: block:tx)
                      </p>
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-slate-300'>
                        Mint Amount
                      </label>
                      <input
                        type='number'
                        value={mintAmount}
                        onChange={(event) => setMintAmount(event.target.value)}
                        placeholder='1000'
                        disabled={mintProcessing}
                        min='1'
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-1 text-xs text-slate-500'>
                        Number of tokens to mint
                      </p>
                    </div>

                    <div>
                      <div className='flex items-center justify-between text-sm font-medium text-slate-300'>
                        <span>Fast Tip (ZEC)</span>
                        <button
                          type='button'
                          onClick={() =>
                            setMintTipAmount(RECOMMENDED_TIP_DISPLAY)
                          }
                          disabled={mintProcessing}
                          className='text-xs uppercase tracking-wide text-indigo-300 hover:text-indigo-200 disabled:opacity-60'
                        >
                          Use {RECOMMENDED_TIP_DISPLAY}
                        </button>
                      </div>
                      <input
                        type='number'
                        step='0.00000001'
                        min='0'
                        value={mintTipAmount}
                        onChange={(event) =>
                          setMintTipAmount(event.target.value)
                        }
                        placeholder={RECOMMENDED_TIP_DISPLAY}
                        disabled={mintProcessing}
                        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                      />
                      <p className='mt-2 text-xs text-slate-400'>
                        Base fee {mintBaseFeeZec.toFixed(8)} ZEC · Total fee
                        with tip {mintTotalFeeZec.toFixed(8)} ZEC
                      </p>
                    </div>

                    <div className='rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4'>
                      <p className='text-xs uppercase tracking-widest text-slate-400'>
                        Minting Wallet
                      </p>
                      {walletAddress ? (
                        <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                          {walletAddress}
                        </p>
                      ) : (
                        <p className='mt-2 text-sm text-rose-200'>
                          No wallet detected. Create or unlock a wallet from the
                          Wallet tab.
                        </p>
                      )}
                    </div>

                    <button
                      type='button'
                      onClick={handleMint}
                      disabled={!walletRecord || mintProcessing}
                      className='mt-8 w-full rounded-2xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-emerald-100 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60'
                    >
                      {mintProcessing ? 'Minting...' : 'Mint Rune'}
                    </button>
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Etch Transaction Result Modal */}
      <Modal
        open={etchTxResultModalOpen}
        title='Etch Transaction Status'
        onClose={closeEtchTxResultModal}
      >
        {etchTxResultPayload ? (
          <div className='space-y-4'>
            <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-400'>
                Result
              </p>
              {etchTxResultId ? (
                <a
                  href={etchTxExplorerUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='mt-2 inline-flex break-all font-mono text-sm text-indigo-200 underline'
                >
                  {etchTxResultId}
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
                  etchTxHasError ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {etchTxHasError
                  ? etchTxResultError ?? 'Please increase fee'
                  : 'Success'}
              </p>
            </div>
            {etchTxHasError ? (
              <p className='text-sm text-rose-200'>
                Please increase fee and try again.
              </p>
            ) : (
              <div className='space-y-3'>
                <p className='text-sm text-emerald-200'>
                  Etch transaction broadcasted successfully.
                </p>
                <a
                  href={etchTxExplorerUrl}
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

      {/* Mint Transaction Result Modal */}
      <Modal
        open={mintTxResultModalOpen}
        title='Mint Transaction Status'
        onClose={closeMintTxResultModal}
      >
        {mintTxResultPayload ? (
          <div className='space-y-4'>
            <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-400'>
                Result
              </p>
              {mintTxResultId ? (
                <a
                  href={mintTxExplorerUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='mt-2 inline-flex break-all font-mono text-sm text-indigo-200 underline'
                >
                  {mintTxResultId}
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
                  mintTxHasError ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {mintTxHasError
                  ? mintTxResultError ?? 'Please increase fee'
                  : 'Success'}
              </p>
            </div>
            {mintTxHasError ? (
              <p className='text-sm text-rose-200'>
                Please increase fee and try again.
              </p>
            ) : (
              <div className='space-y-3'>
                <p className='text-sm text-emerald-200'>
                  Mint transaction broadcasted successfully.
                </p>
                <a
                  href={mintTxExplorerUrl}
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

export default RunesPage;
