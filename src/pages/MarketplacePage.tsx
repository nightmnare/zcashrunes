import { useCallback, useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import BigModal from '../components/BigModal';
import Modal from '../components/Modal';
import {
  getUtxos,
  sendTransaction,
  updateMint,
  saveTransactionHistory,
  getAllCollections,
  getMintsByCollectionId,
  type SendTransactionResponse,
  type CollectionDto,
} from '../lib/api';
import { formatErrorMessage } from '../lib/errors';
import {
  createBuyPsbt,
  DEFAULT_TX_FEE,
  type UtxoInput,
} from '../lib/transaction';
import { decryptWalletRecord, loadWalletRecord } from '../lib/walletStorage';
import { getWalletPassword } from '../lib/passwordStore';

const ZATOSHI_PER_ZEC = 10 ** 8;
const FAST_TX_TIP_ZEC = 0.0001;
const RECOMMENDED_TIP_DISPLAY = FAST_TX_TIP_ZEC.toFixed(8);

type Mint = {
  id: string;
  address: string;
  inscriptionId: string;
  ipfs_cid: string;
  ipfs_type: string;
  createdAt: string;
  utxo: string;
  price?: number;
  isSale?: boolean;
  rawPsbt?: string;
  signedPsbt?: string;
  collectionId?: string;
  collectionName?: string;
  [key: string]: unknown;
};

type Collection = CollectionDto & { id: string };

const MarketplacePage = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<'collections' | 'collection-detail'>(
    'collections'
  );
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] =
    useState<Collection | null>(null);
  const [mints, setMints] = useState<Mint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMint, setSelectedMint] = useState<Mint | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyProcessing, setBuyProcessing] = useState(false);
  const [tipAmount, setTipAmount] = useState(RECOMMENDED_TIP_DISPLAY);
  const [txResultModalOpen, setTxResultModalOpen] = useState(false);
  const [txResultPayload, setTxResultPayload] =
    useState<SendTransactionResponse | null>(null);
  const txErrorMessage = formatErrorMessage(txResultPayload?.error);

  const getIpfsUrl = (cid: string) => {
    return `https://ipfs.io/ipfs/${cid}`;
  };

  const isImageType = (mimeType: string) => {
    return mimeType.startsWith('image/');
  };

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const collectionsList = await getAllCollections();
      setCollections(collectionsList);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load collections'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCollectionMints = useCallback(async (collectionId: string) => {
    setLoading(true);
    try {
      const mintsList = await getMintsByCollectionId(collectionId);
      setMints(mintsList);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to load collection mints'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'collections') {
      fetchCollections();
    }
  }, [view, fetchCollections]);

  const handleCollectionClick = (collection: Collection | 'others') => {
    if (collection === 'others') {
      setSelectedCollection({
        id: 'others',
        name: 'Others',
        description: 'Inscriptions not belonging to any collection',
        imageUrl: '',
      });
      setView('collection-detail');
      fetchCollectionMints('others');
    } else {
      setSelectedCollection(collection);
      setView('collection-detail');
      fetchCollectionMints(collection.id);
    }
  };

  const handleBackToCollections = () => {
    setView('collections');
    setSelectedCollection(null);
    setMints([]);
  };

  const handleMintClick = (mint: Mint) => {
    setSelectedMint(mint);
    setDetailModalOpen(true);
  };

  const handleBuyClick = () => {
    if (!selectedMint) return;
    setBuyModalOpen(true);
  };

  const handleBuyConfirm = async () => {
    if (!selectedMint || !selectedMint.rawPsbt) {
      toast.error('NFT listing information not available');
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
      // Decrypt wallet
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

      // Parse NFT utxo
      const [txid, voutStr] = selectedMint.utxo.split(':');
      const vout = parseInt(voutStr, 10);

      if (!txid || isNaN(vout)) {
        throw new Error('Invalid NFT UTXO format');
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

      // Create buy PSBT
      const { hex } = await createBuyPsbt({
        rawPsbtHex: selectedMint.rawPsbt,
        signedPsbtHex: selectedMint.signedPsbt || '',
        buyerUtxos: normalizedUtxos,
        buyerAddress: wallet.address,
        buyerPrivateKeyWif: wallet.privateKeyWif,
        nftUtxo: {
          txid,
          vout,
          amount: 10000, // INSCRIPTION_UTXO_SIZE
        },
        priceAmount: selectedMint.price || 0,
        fee: totalFee,
      });

      // Broadcast transaction
      const response = await sendTransaction({ hex });
      setTxResultPayload(response);
      setTxResultModalOpen(true);

      if (response.error) {
        toast.error(response.error || 'Transaction failed');
        return;
      }

      const txId = response.result;

      if (!txId) {
        toast.error('Transaction ID not received');
        return;
      }

      // Update mint record
      await updateMint(selectedMint.inscriptionId, {
        address: wallet.address, // New owner
        utxo: `${txId}:1`, // New UTXO (assuming output 1 is the NFT)
        isSale: false, // No longer for sale
        rawPsbt: '', // Clear listing PSBT
        signedPsbt: '',
      });

      // Save transaction history
      await saveTransactionHistory({
        from: selectedMint.address, // Seller
        to: wallet.address, // Buyer
        inscriptionId: selectedMint.inscriptionId,
        reason: 'Purchase',
        price: selectedMint.price || 0,
        transactionId: txId,
      });

      toast.success('NFT purchased successfully!');
      setBuyModalOpen(false);
      setDetailModalOpen(false);
      setTipAmount(RECOMMENDED_TIP_DISPLAY);
      setSelectedMint(null);
      // Refresh collection mints
      if (selectedCollection) {
        fetchCollectionMints(selectedCollection.id);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to purchase NFT'
      );
    } finally {
      setBuyProcessing(false);
    }
  };

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedMint(null);
    setTipAmount(RECOMMENDED_TIP_DISPLAY);
  };

  const closeBuyModal = () => {
    setBuyModalOpen(false);
    setTipAmount(RECOMMENDED_TIP_DISPLAY);
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
          {view === 'collections' ? (
            <>
              <h1 className='text-2xl font-semibold text-white'>Marketplace</h1>
              <p className='mt-2 text-sm text-slate-400'>
                Browse collections and purchase NFTs listed for sale
              </p>

              {/* Collections Grid */}
              {loading ? (
                <div className='mt-4 text-center text-slate-400 md:mt-8'>
                  Loading...
                </div>
              ) : (
                <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:mt-8 md:grid-cols-4 md:gap-4 lg:grid-cols-5'>
                  {collections.map((collection) => (
                    <div
                      key={collection.id}
                      onClick={() => handleCollectionClick(collection)}
                      className='group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-indigo-500/50'
                    >
                      <div className='relative p-2'>
                        {collection.imageUrl ? (
                          <>
                            <img
                              src={collection.imageUrl}
                              alt={collection.name}
                              className='w-full h-[200px] object-cover rounded-xl'
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const placeholder =
                                  target.nextElementSibling as HTMLElement;
                                if (placeholder) {
                                  placeholder.style.display = 'flex';
                                }
                              }}
                            />
                            <div className='absolute inset-0 hidden items-center justify-center bg-slate-900/80 rounded-xl'>
                              <div className='text-center'>
                                <p className='text-4xl'>📦</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className='flex min-h-[200px] items-center justify-center'>
                            <div className='text-center'>
                              <p className='text-4xl'>📦</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className='border-t border-slate-800 p-3'>
                        <h3 className='text-sm font-semibold text-white truncate'>
                          {collection.name}
                        </h3>
                      </div>
                    </div>
                  ))}
                  {/* Others Collection Card */}
                  <div
                    onClick={() => handleCollectionClick('others')}
                    className='group cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-indigo-500/50'
                  >
                    <div className='p-2'>
                      <div className='flex min-h-[200px] items-center justify-center'>
                        <div className='text-center'>
                          <p className='text-4xl'>📋</p>
                        </div>
                      </div>
                    </div>
                    <div className='border-t border-slate-800 p-3'>
                      <h3 className='text-sm font-semibold text-white truncate'>
                        Others
                      </h3>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Collection Detail View */}
              <div className='mb-4 flex flex-col gap-4'>
                <div className='flex items-center justify-between w-full'>
                  <h1 className='text-2xl font-semibold text-white'>
                    {selectedCollection?.name}
                  </h1>
                  <button
                    type='button'
                    onClick={handleBackToCollections}
                    className='rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500'
                  >
                    ← Back to Collections
                  </button>
                </div>
                {selectedCollection?.description && (
                  <p className='mt-1 text-sm text-slate-400'>
                    {selectedCollection.description}
                  </p>
                )}
              </div>

              {/* Collection Mints Grid */}
              {loading ? (
                <div className='mt-4 text-center text-slate-400 md:mt-8'>
                  Loading...
                </div>
              ) : mints.length === 0 ? (
                <div className='mt-4 text-center text-slate-400 md:mt-8'>
                  No listed inscriptions found in this collection
                </div>
              ) : (
                <div className='mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:mt-8 md:grid-cols-4 md:gap-4 lg:grid-cols-5'>
                  {mints.map((mint, index) => {
                    const ipfsUrl = getIpfsUrl(mint.ipfs_cid);
                    const isImage = isImageType(mint.ipfs_type);

                    return (
                      <div
                        key={mint.inscriptionId || index}
                        className='group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-indigo-500/50'
                      >
                        <div
                          onClick={() => handleMintClick(mint)}
                          className='cursor-pointer p-2'
                        >
                          {isImage ? (
                            <img
                              src={ipfsUrl}
                              alt={`NFT ${index + 1}`}
                              className='w-full h-[200px] object-cover'
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className='flex h-[200px] items-center justify-center bg-slate-900/80'>
                              <div className='text-center'>
                                <p className='text-4xl'>📄</p>
                                <p className='mt-2 text-xs text-slate-400'>
                                  {mint.ipfs_type.split('/')[1] || 'File'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className='border-t border-slate-800 p-3'>
                          {mint.isSale && mint.price ? (
                            <>
                              <div className='mb-2 text-xs text-slate-400'>
                                {mint.price.toFixed(8)} ZEC
                              </div>
                              <button
                                type='button'
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMintClick(mint);
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
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* NFT Detail Modal */}
      <BigModal
        open={detailModalOpen}
        title='NFT Details'
        onClose={closeDetailModal}
      >
        {selectedMint && (
          <div className='flex flex-col gap-6 md:flex-row'>
            <div className='flex-1'>
              {isImageType(selectedMint.ipfs_type) ? (
                <img
                  src={getIpfsUrl(selectedMint.ipfs_cid)}
                  alt='NFT'
                  className='h-full w-full rounded-2xl object-contain'
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              ) : (
                <div className='flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60'>
                  <div className='text-center'>
                    <p className='text-6xl'>📄</p>
                    <p className='mt-4 text-sm text-slate-400'>
                      {selectedMint.ipfs_type}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div
              className='flex flex-1 flex-col gap-4'
              style={{ touchAction: 'pan-y', minHeight: 0 }}
            >
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Inscription ID
                </p>
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  {selectedMint.inscriptionId}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  IPFS CID
                </p>
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  {selectedMint.ipfs_cid}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Owner
                </p>
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  {selectedMint.address}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  UTXO
                </p>
                <p className='mt-2 break-all font-mono text-sm text-slate-100'>
                  {selectedMint.utxo}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Price
                </p>
                <p className='mt-2 text-lg font-semibold text-slate-100'>
                  {selectedMint.price?.toFixed(8)} ZEC
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Created At
                </p>
                <p className='mt-2 text-sm text-slate-100'>
                  {new Date(selectedMint.createdAt).toLocaleString()}
                </p>
              </div>
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
                  Base fee: {(DEFAULT_TX_FEE / ZATOSHI_PER_ZEC).toFixed(8)} ZEC
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
            </div>
          </div>
        )}
      </BigModal>

      {/* Buy Confirmation Modal */}
      <Modal open={buyModalOpen} title='Purchase NFT' onClose={closeBuyModal}>
        <div className='space-y-4'>
          {selectedMint && (
            <>
              <p className='text-sm text-slate-300'>
                You are about to purchase this NFT for{' '}
                <span className='font-semibold text-white'>
                  {selectedMint.price?.toFixed(8)} ZEC
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
                  href={`https://blockchair.com/zcash/transaction/${txResultPayload.result}`}
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

export default MarketplacePage;
