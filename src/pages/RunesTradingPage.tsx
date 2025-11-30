import { useCallback, useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import BigModal from '../components/BigModal';
import Modal from '../components/Modal';
import {
  getUtxos,
  sendTransaction,
  getListedRunes,
  getRuneMintsByAddress,
  updateRuneMint,
  saveRuneTransactionHistory,
  type SendTransactionResponse,
  type RuneMintDto,
} from '../lib/api';
import { formatErrorMessage } from '../lib/errors';
import {
  createRunesTransferTransaction,
  DEFAULT_TX_FEE,
  type UtxoInput,
} from '../lib/transaction';
import {
  decryptWalletRecord,
  loadWalletRecord,
  type StoredWalletRecord,
} from '../lib/walletStorage';
import { getWalletPassword } from '../lib/passwordStore';

const ZATOSHI_PER_ZEC = 10 ** 8;
const FAST_TX_TIP_ZEC = 0.0001;
const RECOMMENDED_TIP_DISPLAY = FAST_TX_TIP_ZEC.toFixed(8);
const ZCASH_TX_EXPLORER_BASE = 'https://blockchair.com/zcash/transaction';

type View = 'marketplace' | 'my-runes';

const RunesTradingPage = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('marketplace');
  const [walletRecord, setWalletRecord] = useState<StoredWalletRecord | null>(
    () => (typeof window === 'undefined' ? null : loadWalletRecord())
  );
  const [listedRunes, setListedRunes] = useState<RuneMintDto[]>([]);
  const [myRunes, setMyRunes] = useState<RuneMintDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRune, setSelectedRune] = useState<RuneMintDto | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [buyProcessing, setBuyProcessing] = useState(false);
  const [listProcessing, setListProcessing] = useState(false);
  const [tipAmount, setTipAmount] = useState(RECOMMENDED_TIP_DISPLAY);
  const [listPrice, setListPrice] = useState('');
  const [txResultModalOpen, setTxResultModalOpen] = useState(false);
  const [txResultPayload, setTxResultPayload] =
    useState<SendTransactionResponse | null>(null);
  const txErrorMessage = formatErrorMessage(txResultPayload?.error);

  const walletAddress = walletRecord?.address ?? null;

  const fetchListedRunes = useCallback(async () => {
    setLoading(true);
    try {
      const runes = await getListedRunes();
      setListedRunes(runes);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load listed runes'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyRunes = useCallback(async () => {
    if (!walletAddress) {
      setMyRunes([]);
      return;
    }
    setLoading(true);
    try {
      const runes = await getRuneMintsByAddress(walletAddress);
      setMyRunes(runes);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load your runes'
      );
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (view === 'marketplace') {
      fetchListedRunes();
    } else {
      fetchMyRunes();
    }
  }, [view, fetchListedRunes, fetchMyRunes]);

  const handleRuneClick = (rune: RuneMintDto) => {
    setSelectedRune(rune);
    setDetailModalOpen(true);
  };

  const handleBuyClick = () => {
    if (!selectedRune) return;
    setBuyModalOpen(true);
  };

  const handleListClick = (rune: RuneMintDto) => {
    setSelectedRune(rune);
    setListModalOpen(true);
  };

  const handleUnlistClick = async (rune: RuneMintDto) => {
    if (!rune.transactionId) {
      toast.error('Rune transaction ID not available');
      return;
    }

    try {
      await updateRuneMint(rune.transactionId, {
        isSale: false,
        price: undefined,
      });
      toast.success('Rune unlisted successfully');
      await fetchMyRunes();
      await fetchListedRunes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to unlist rune'
      );
    }
  };

  const handleBuyConfirm = async () => {
    if (!selectedRune) {
      toast.error('No rune selected');
      return;
    }

    const record = loadWalletRecord();
    if (!record) {
      toast.error('Please unlock your wallet first');
      navigate('/wallet');
      return;
    }

    const walletPassword = getWalletPassword();
    if (!walletPassword) {
      toast.error('Wallet password not available. Please unlock your wallet.');
      navigate('/wallet');
      return;
    }

    setBuyProcessing(true);
    try {
      const wallet = await decryptWalletRecord(walletPassword, record);

      // Get buyer's utxos
      const utxoList = await getUtxos({ address: wallet.address });
      const normalizedUtxos: UtxoInput[] = Array.isArray(utxoList)
        ? (utxoList as UtxoInput[])
        : [];

      if (!normalizedUtxos.length) {
        toast.error('No funds available');
        return;
      }

      // Validate and calculate tip
      const parsedTip = Number(tipAmount);
      const tipAmountIsFinite = Number.isFinite(parsedTip);
      const tipIsNegative = tipAmountIsFinite && parsedTip < 0;

      if (tipIsNegative) {
        toast.error('Tip amount must be zero or greater');
        return;
      }

      const normalizedTip = tipAmountIsFinite && parsedTip > 0 ? parsedTip : 0;
      const tipZatoshis = Math.round(normalizedTip * ZATOSHI_PER_ZEC);
      const totalFee = DEFAULT_TX_FEE + tipZatoshis;

      // Parse rune UTXO
      if (!selectedRune.utxo) {
        toast.error('Rune UTXO not available');
        return;
      }

      const [txid, voutStr] = selectedRune.utxo.split(':');
      const vout = parseInt(voutStr, 10);

      if (!txid || isNaN(vout)) {
        throw new Error('Invalid Rune UTXO format');
      }

      // Note: This implementation creates a rune transfer transaction.
      // However, to complete the purchase, the seller's signature is required
      // on the rune UTXO input. In a production system, you would implement:
      // 1. A PSBT-like mechanism for multi-party signing
      // 2. An escrow service
      // 3. Or require the seller to pre-sign their input
      //
      // For now, this demonstrates the structure but may require additional
      // coordination with the seller to complete the transaction.

      const recipientAddressMap = new Map<number, string>();
      recipientAddressMap.set(1, wallet.address); // Buyer receives the rune

      // Note: This transaction will need the seller's rune UTXO as an input
      // which requires the seller's signature. The current implementation
      // only includes the buyer's payment inputs.
      const { hex } = await createRunesTransferTransaction({
        utxos: normalizedUtxos,
        changeAddress: wallet.address,
        privateKeyWif: wallet.privateKeyWif,
        transferParams: [
          {
            runeId: selectedRune.runeId,
            amount: selectedRune.amount,
            output: 1, // Output index 1 (after OP_RETURN at index 0)
          },
        ],
        recipientAddresses: recipientAddressMap,
        fee: totalFee,
      });

      // TODO: Add seller's rune UTXO input and signature before broadcasting
      // For now, this transaction structure is incomplete and will fail validation
      // without the seller's signature on their rune UTXO input.

      // Broadcast transaction
      // Note: This will likely fail without seller's signature on rune UTXO input
      const response = await sendTransaction({ hex });
      setTxResultPayload(response);
      setTxResultModalOpen(true);

      if (response.error) {
        toast.error(
          response.error ||
            'Transaction failed. Seller signature required on rune UTXO input.'
        );
        return;
      }

      const txId = response.result;

      if (!txId) {
        toast.error('Transaction ID not received');
        return;
      }

      // Update rune record
      await updateRuneMint(selectedRune.transactionId, {
        address: wallet.address, // New owner
        utxo: `${txId}:1`, // New UTXO
        isSale: false, // No longer for sale
        price: undefined,
      });

      // Save transaction history
      await saveRuneTransactionHistory({
        from: selectedRune.address, // Seller
        to: wallet.address, // Buyer
        runeId: selectedRune.runeId,
        runeName: selectedRune.runeName,
        amount: selectedRune.amount,
        reason: 'Purchase',
        price: selectedRune.price || 0,
        transactionId: txId,
      });

      toast.success('Rune purchased successfully!');
      setBuyModalOpen(false);
      setDetailModalOpen(false);
      setTipAmount(RECOMMENDED_TIP_DISPLAY);
      setSelectedRune(null);
      await fetchListedRunes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to purchase rune'
      );
    } finally {
      setBuyProcessing(false);
    }
  };

  const handleListConfirm = async () => {
    if (!selectedRune) {
      toast.error('No rune selected');
      return;
    }

    const price = Number(listPrice);
    if (!listPrice.trim() || isNaN(price) || price <= 0) {
      toast.error('Enter a valid price');
      return;
    }

    if (!selectedRune.transactionId) {
      toast.error('Rune transaction ID not available');
      return;
    }

    setListProcessing(true);
    try {
      await updateRuneMint(selectedRune.transactionId, {
        price: price,
        isSale: true,
      });

      toast.success('Rune listed for sale successfully!');
      setListModalOpen(false);
      setListPrice('');
      setSelectedRune(null);
      await fetchMyRunes();
      await fetchListedRunes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to list rune'
      );
    } finally {
      setListProcessing(false);
    }
  };

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedRune(null);
    setTipAmount(RECOMMENDED_TIP_DISPLAY);
  };

  const closeBuyModal = () => {
    setBuyModalOpen(false);
    setTipAmount(RECOMMENDED_TIP_DISPLAY);
  };

  const closeListModal = () => {
    setListModalOpen(false);
    setListPrice('');
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
        <div className='mx-auto w-full max-w-6xl rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-2xl shadow-slate-900/50 md:rounded-3xl md:p-8'>
          <div className='mb-6 flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-semibold text-white'>
                Runes Trading
              </h1>
              <p className='mt-2 text-sm text-slate-400'>
                Buy and sell runes on the marketplace
              </p>
            </div>
            <div className='flex gap-2'>
              <button
                type='button'
                onClick={() => setView('marketplace')}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  view === 'marketplace'
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                    : 'border-slate-700 text-slate-200 hover:border-slate-500'
                }`}
              >
                Marketplace
              </button>
              <button
                type='button'
                onClick={() => setView('my-runes')}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  view === 'my-runes'
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
                    : 'border-slate-700 text-slate-200 hover:border-slate-500'
                }`}
              >
                My Runes
              </button>
            </div>
          </div>

          {view === 'marketplace' ? (
            <>
              {/* Listed Runes Grid */}
              {loading ? (
                <div className='mt-4 text-center text-slate-400 md:mt-8'>
                  Loading...
                </div>
              ) : listedRunes.length === 0 ? (
                <div className='mt-4 text-center text-slate-400 md:mt-8'>
                  No runes listed for sale
                </div>
              ) : (
                <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 md:mt-8'>
                  {listedRunes.map((rune) => (
                    <div
                      key={rune.transactionId}
                      className='group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-indigo-500/50'
                    >
                      <div
                        onClick={() => handleRuneClick(rune)}
                        className='cursor-pointer p-4'
                      >
                        <div className='mb-3 flex items-center justify-center rounded-xl bg-indigo-500/10 p-6'>
                          <div className='text-center'>
                            <p className='text-3xl'>⚡</p>
                            <p className='mt-2 text-xs font-semibold text-indigo-200'>
                              {rune.runeName || 'Rune'}
                            </p>
                          </div>
                        </div>
                        <div className='space-y-2'>
                          <p className='text-xs text-slate-400'>Rune ID</p>
                          <p className='break-all font-mono text-xs text-slate-200'>
                            {rune.runeId}
                          </p>
                          <p className='text-xs text-slate-400'>Amount</p>
                          <p className='text-sm font-semibold text-white'>
                            {rune.amount}
                          </p>
                        </div>
                      </div>
                      <div className='border-t border-slate-800 p-4'>
                        {rune.isSale && rune.price ? (
                          <>
                            <div className='mb-2 text-xs text-slate-400'>
                              {rune.price.toFixed(8)} ZEC
                            </div>
                            <button
                              type='button'
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRuneClick(rune);
                                handleBuyClick();
                              }}
                              className='w-full rounded-xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/30'
                            >
                              Buy
                            </button>
                          </>
                        ) : (
                          <div className='text-xs text-slate-500 text-center py-2'>
                            Not listed
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* My Runes Grid */}
              {loading ? (
                <div className='mt-4 text-center text-slate-400 md:mt-8'>
                  Loading...
                </div>
              ) : myRunes.length === 0 ? (
                <div className='mt-4 text-center text-slate-400 md:mt-8'>
                  {walletAddress
                    ? 'No runes found in your wallet'
                    : 'Please unlock your wallet to view your runes'}
                </div>
              ) : (
                <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 md:mt-8'>
                  {myRunes.map((rune) => (
                    <div
                      key={rune.transactionId}
                      className='group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-indigo-500/50'
                    >
                      <div
                        onClick={() => handleRuneClick(rune)}
                        className='cursor-pointer p-4'
                      >
                        <div className='mb-3 flex items-center justify-center rounded-xl bg-indigo-500/10 p-6'>
                          <div className='text-center'>
                            <p className='text-3xl'>⚡</p>
                            <p className='mt-2 text-xs font-semibold text-indigo-200'>
                              {rune.runeName || 'Rune'}
                            </p>
                          </div>
                        </div>
                        <div className='space-y-2'>
                          <p className='text-xs text-slate-400'>Rune ID</p>
                          <p className='break-all font-mono text-xs text-slate-200'>
                            {rune.runeId}
                          </p>
                          <p className='text-xs text-slate-400'>Amount</p>
                          <p className='text-sm font-semibold text-white'>
                            {rune.amount}
                          </p>
                        </div>
                      </div>
                      <div className='border-t border-slate-800 p-4'>
                        {rune.isSale && rune.price ? (
                          <>
                            <div className='mb-2 text-xs text-slate-400'>
                              Listed: {rune.price.toFixed(8)} ZEC
                            </div>
                            <button
                              type='button'
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnlistClick(rune);
                              }}
                              className='w-full rounded-xl border border-rose-500/60 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400 hover:bg-rose-500/30'
                            >
                              Unlist
                            </button>
                          </>
                        ) : (
                          <button
                            type='button'
                            onClick={(e) => {
                              e.stopPropagation();
                              handleListClick(rune);
                            }}
                            className='w-full rounded-xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/30'
                          >
                            List for Sale
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Rune Detail Modal */}
      <BigModal
        open={detailModalOpen}
        title='Rune Details'
        onClose={closeDetailModal}
      >
        {selectedRune && (
          <div className='flex flex-col gap-6 md:flex-row'>
            <div className='flex-1'>
              <div className='flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60'>
                <div className='text-center'>
                  <p className='text-6xl'>⚡</p>
                  <p className='mt-4 text-lg font-semibold text-white'>
                    {selectedRune.runeName || 'Rune'}
                  </p>
                </div>
              </div>
            </div>
            <div
              className='flex flex-1 flex-col gap-4'
              style={{ touchAction: 'pan-y', minHeight: 0 }}
            >
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Rune Name
                </p>
                <p className='mt-2 text-sm font-semibold text-slate-100'>
                  {selectedRune.runeName || 'N/A'}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Rune ID
                </p>
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  {selectedRune.runeId}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Amount
                </p>
                <p className='mt-2 text-lg font-semibold text-slate-100'>
                  {selectedRune.amount}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Owner
                </p>
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  {selectedRune.address}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  UTXO
                </p>
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  {selectedRune.utxo || 'N/A'}
                </p>
              </div>
              {selectedRune.isSale && selectedRune.price && (
                <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                  <p className='text-xs uppercase tracking-wide text-slate-400'>
                    Price
                  </p>
                  <p className='mt-2 text-lg font-semibold text-slate-100'>
                    {selectedRune.price.toFixed(8)} ZEC
                  </p>
                </div>
              )}
              {selectedRune.createdAt && (
                <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                  <p className='text-xs uppercase tracking-wide text-slate-400'>
                    Created At
                  </p>
                  <p className='mt-2 text-sm text-slate-100'>
                    {new Date(selectedRune.createdAt).toLocaleString()}
                  </p>
                </div>
              )}
              {selectedRune.isSale && selectedRune.price && (
                <>
                  <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                    <div className='flex items-center justify-between'>
                      <label className='block text-xs uppercase tracking-wide text-slate-400'>
                        Fast Tip (ZEC)
                      </label>
                      <button
                        type='button'
                        onClick={() => setTipAmount(RECOMMENDED_TIP_DISPLAY)}
                        className='text-xs uppercase tracking-wide text-indigo-300 hover:text-indigo-200'
                      >
                        Use {RECOMMENDED_TIP_DISPLAY}
                      </button>
                    </div>
                    <input
                      type='number'
                      step='0.00000001'
                      min='0'
                      value={tipAmount}
                      onChange={(e) => setTipAmount(e.target.value)}
                      placeholder={RECOMMENDED_TIP_DISPLAY}
                      className='mt-2 w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
                    />
                    <p className='mt-2 text-xs text-slate-500'>
                      Base fee:{' '}
                      {(DEFAULT_TX_FEE / ZATOSHI_PER_ZEC).toFixed(8)} ZEC
                      {Number(tipAmount) > 0 && (
                        <span>
                          {' '}
                          · Total: (
                          {(
                            DEFAULT_TX_FEE / ZATOSHI_PER_ZEC +
                            Number(tipAmount)
                          ).toFixed(8)}{' '}
                          ZEC)
                        </span>
                      )}
                    </p>
                  </div>
                  <div
                    className='sticky bottom-0 pt-2 bg-slate-950'
                    style={{
                      touchAction: 'pan-y',
                      position: 'sticky',
                      bottom: 0,
                      zIndex: 10,
                      paddingTop: '0.5rem',
                      marginTop: 'auto',
                    }}
                  >
                    <button
                      type='button'
                      onClick={handleBuyClick}
                      className='w-full rounded-2xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 transition active:opacity-80 active:scale-[0.98] hover:border-emerald-400 hover:bg-emerald-500/30'
                      style={{
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'rgba(16, 185, 129, 0.3)',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                      }}
                    >
                      Buy Now
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </BigModal>

      {/* Buy Confirmation Modal */}
      <Modal
        open={buyModalOpen}
        title='Purchase Rune'
        onClose={closeBuyModal}
      >
        <div className='space-y-4'>
          {selectedRune && (
            <>
              <p className='text-sm text-slate-300'>
                You are about to purchase this rune for{' '}
                <span className='font-semibold text-white'>
                  {selectedRune.price?.toFixed(8)} ZEC
                </span>
              </p>
              <div className='flex gap-3'>
                <button
                  type='button'
                  onClick={closeBuyModal}
                  disabled={buyProcessing}
                  className='flex-1 rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-60'
                >
                  Cancel
                </button>
                <button
                  type='button'
                  onClick={handleBuyConfirm}
                  disabled={buyProcessing}
                  className='flex-1 rounded-2xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 disabled:opacity-60'
                >
                  {buyProcessing ? 'Processing...' : 'Confirm Purchase'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* List for Sale Modal */}
      <Modal
        open={listModalOpen}
        title='List Rune for Sale'
        onClose={closeListModal}
      >
        <div className='space-y-4'>
          {selectedRune && (
            <>
              <div>
                <label className='block text-sm font-medium text-slate-300'>
                  Price (ZEC)
                </label>
                <input
                  type='number'
                  step='0.00000001'
                  min='0'
                  value={listPrice}
                  onChange={(e) => setListPrice(e.target.value)}
                  placeholder='0.00000001'
                  disabled={listProcessing}
                  className='mt-2 w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60'
                />
                <p className='mt-1 text-xs text-slate-500'>
                  Enter the price you want to sell this rune for
                </p>
              </div>
              <div className='flex gap-3'>
                <button
                  type='button'
                  onClick={closeListModal}
                  disabled={listProcessing}
                  className='flex-1 rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-60'
                >
                  Cancel
                </button>
                <button
                  type='button'
                  onClick={handleListConfirm}
                  disabled={listProcessing}
                  className='flex-1 rounded-2xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 disabled:opacity-60'
                >
                  {listProcessing ? 'Processing...' : 'List for Sale'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Transaction Result Modal */}
      <Modal
        open={txResultModalOpen}
        title='Transaction Status'
        onClose={closeTxResultModal}
      >
        {txResultPayload ? (
          <div className='space-y-4'>
            <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-400'>
                Transaction ID
              </p>
              {txResultPayload.result ? (
                <a
                  href={`${ZCASH_TX_EXPLORER_BASE}/${txResultPayload.result}`}
                  target='_blank'
                  rel='noreferrer'
                  className='mt-2 inline-flex break-all font-mono text-sm text-indigo-200 underline'
                >
                  {txResultPayload.result}
                </a>
              ) : (
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  No transaction ID
                </p>
              )}
            </div>
            {txErrorMessage ? (
              <p className='text-sm text-rose-200'>{txErrorMessage}</p>
            ) : (
              <p className='text-sm text-emerald-200'>
                Transaction broadcasted successfully!
              </p>
            )}
          </div>
        ) : (
          <p className='text-sm text-slate-300'>Awaiting transaction result…</p>
        )}
      </Modal>
    </>
  );
};

export default RunesTradingPage;

