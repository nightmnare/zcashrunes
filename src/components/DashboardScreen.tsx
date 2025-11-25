import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import ActionIconButton from './ActionIconButton';
import IconBubble from './IconBubble';
import BigModal from './BigModal';
import Modal from './Modal';
import SectionTitle from './SectionTitle';
import {
  saveTransactionHistory,
  updateMint,
  createCollection,
  getMintByInscriptionId,
  getRunesByAddress,
  getRuneMintsByAddress,
  getTransactionData,
  updateRuneEtchRuneId,
  getUtxos,
  sendTransaction,
  type RuneEtchDto,
  type RuneMintDto,
} from '../lib/api';
import {
  createListPsbt,
  createSendNftTransaction,
  DEFAULT_TX_FEE,
  INSCRIPTION_UTXO_SIZE,
} from '../lib/transaction';

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
  [key: string]: unknown;
};

type DashboardScreenProps = {
  balance: number;
  address: string;
  walletName: string;
  mints?: Mint[];
  privateKeyWif?: string;
  onRename: (value: string) => void;
  onCopyAddress: () => void;
  onDelete: () => void;
  onExportKeys: () => void;
  onReceive: () => void;
  onSend: () => void;
  onMintsRefresh?: () => void;
};

const DashboardScreen = ({
  balance,
  address,
  walletName,
  mints = [],
  privateKeyWif,
  onRename,
  onCopyAddress,
  onDelete,
  onExportKeys,
  onReceive,
  onSend,
  onMintsRefresh,
}: DashboardScreenProps) => {
  const [selectedMint, setSelectedMint] = useState<Mint | null>(null);
  const [mintModalOpen, setMintModalOpen] = useState(false);
  const [delistModalOpen, setDelistModalOpen] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendSuccessModalOpen, setSendSuccessModalOpen] = useState(false);
  const [listPrice, setListPrice] = useState('');
  const [receiveAddress, setReceiveAddress] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sendTxId, setSendTxId] = useState<string | null>(null);
  const [uploadCollectionModalOpen, setUploadCollectionModalOpen] =
    useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [collectionImageUrl, setCollectionImageUrl] = useState('');
  const [inscriptionIds, setInscriptionIds] = useState('');
  const [uploadProcessing, setUploadProcessing] = useState(false);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'nft' | 'rune'>('nft');
  const [runeView, setRuneView] = useState<'etch' | 'mint' | 'balance'>('balance');

  // Runes state
  const [runes, setRunes] = useState<RuneEtchDto[]>([]);
  const [runeMints, setRuneMints] = useState<RuneMintDto[]>([]);
  const [loadingRunes, setLoadingRunes] = useState(false);

  // Calculate rune balances
  const runeBalances = useMemo(() => {
    const balanceMap = new Map<string, { runeName: string; runeId: string; totalAmount: bigint }>();
    
    runeMints.forEach((mint) => {
      if (!mint.runeId) return;
      
      const existing = balanceMap.get(mint.runeId);
      const amount = BigInt(mint.amount || '0');
      
      if (existing) {
        existing.totalAmount += amount;
      } else {
        balanceMap.set(mint.runeId, {
          runeName: mint.runeName || 'Unknown',
          runeId: mint.runeId,
          totalAmount: amount,
        });
      }
    });
    
    return Array.from(balanceMap.values()).sort((a, b) => {
      // Sort by rune name, then by runeId
      const nameCompare = a.runeName.localeCompare(b.runeName);
      if (nameCompare !== 0) return nameCompare;
      return a.runeId.localeCompare(b.runeId);
    });
  }, [runeMints]);

  const getIpfsUrl = (cid: string) => {
    return `https://ipfs.io/ipfs/${cid}`;
  };

  const isImageType = (mimeType: string) => {
    return mimeType.startsWith('image/');
  };

  // Load runes data
  const loadRunes = async () => {
    if (activeTab !== 'rune') return;
    setLoadingRunes(true);
    try {
      if (runeView === 'etch') {
        const runesData = await getRunesByAddress(address);
        setRunes(runesData);
      } else {
        // Load mints for both 'mint' and 'balance' views
        const mintsData = await getRuneMintsByAddress(address);
        setRuneMints(mintsData);
      }
    } catch (error) {
      console.error('Failed to load runes:', error);
      toast.error('Failed to load runes data');
    } finally {
      setLoadingRunes(false);
    }
  };

  // Load runes when tab or view changes
  useEffect(() => {
    loadRunes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, runeView, address]);

  // Handle activate button click
  const handleActivate = async (rune: RuneEtchDto) => {
    if (!rune.transactionId) {
      toast.error('Transaction ID not found');
      return;
    }

    setProcessing(true);
    try {
      // Fetch transaction data from Zcash explorer
      const txData = await getTransactionData(rune.transactionId);

      // Get height from transaction data
      const height = txData.height;
      if (!height) {
        throw new Error('Height not found in transaction data');
      }

      // Generate random tx value (transaction index within the block)
      // Using a random number between 0 and 999 for tx index
      const tx = Math.floor(Math.random() * 1000);

      // Create runeId in format "height:tx"
      const runeId = `${height}:${tx}`;

      // Update the rune record with runeId
      await updateRuneEtchRuneId(rune.transactionId, runeId);

      toast.success(`Rune activated! Rune ID: ${runeId}`);

      // Reload runes to show updated data
      await loadRunes();
    } catch (error) {
      console.error('Failed to activate rune:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to activate rune'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleMintClick = (mint: Mint) => {
    setSelectedMint(mint);
    setMintModalOpen(true);
  };

  const closeMintModal = () => {
    setMintModalOpen(false);
    setSelectedMint(null);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleListClick = (e: React.MouseEvent, mint: Mint) => {
    e.stopPropagation();
    setSelectedMint(mint);
    setListPrice(mint.price?.toString() || '');
    setListModalOpen(true);
  };

  const handleSendClick = (e: React.MouseEvent, mint: Mint) => {
    e.stopPropagation();
    setSelectedMint(mint);
    setReceiveAddress('');
    setTipAmount('');
    setSendModalOpen(true);
  };

  const handleDelistClick = (e: React.MouseEvent, mint: Mint) => {
    e.stopPropagation();
    setSelectedMint(mint);
    setDelistModalOpen(true);
  };

  const handleDelistConfirm = async () => {
    if (!selectedMint) return;
    setProcessing(true);
    try {
      await updateMint(selectedMint.inscriptionId, {
        isSale: false,
      });
      await saveTransactionHistory({
        from: address,
        to: '',
        inscriptionId: selectedMint.inscriptionId,
        reason: 'Delist',
        price: selectedMint.price || 0,
      });
      toast.success('NFT delisted successfully');
      setDelistModalOpen(false);
      setSelectedMint(null);
      onMintsRefresh?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delist NFT'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleListConfirm = async () => {
    if (!selectedMint) return;
    if (!privateKeyWif) {
      toast.error('Wallet private key not available');
      return;
    }
    const priceNum = Number(listPrice);
    if (!listPrice.trim() || isNaN(priceNum) || priceNum <= 0) {
      toast.error('Please enter a valid price');
      return;
    }
    if (!selectedMint.utxo) {
      toast.error('NFT UTXO information not available');
      return;
    }

    setProcessing(true);
    try {
      // Parse UTXO: format is "txId:vout"
      const [txid, voutStr] = selectedMint.utxo.split(':');
      const vout = parseInt(voutStr, 10);

      if (!txid || isNaN(vout)) {
        throw new Error('Invalid UTXO format');
      }

      // Create PSBT for listing
      const { psbt: rawPsbt, txHex: signedPsbt } = await createListPsbt({
        nftUtxo: {
          txid,
          vout,
          amount: 10000, // INSCRIPTION_UTXO_SIZE in zatoshis
        },
        priceAmount: priceNum,
        ownerAddress: address,
        privateKeyWif,
      });

      // Update mint with price, isSale, and rawPsbt
      await updateMint(selectedMint.inscriptionId, {
        price: priceNum,
        isSale: true,
        rawPsbt,
        signedPsbt,
      });
      await saveTransactionHistory({
        from: address,
        to: '',
        inscriptionId: selectedMint.inscriptionId,
        reason: 'List',
        price: priceNum,
      });
      toast.success('NFT listed successfully');
      setListModalOpen(false);
      setListPrice('');
      setSelectedMint(null);
      onMintsRefresh?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to list NFT'
      );
    } finally {
      setProcessing(false);
    }
  };

  const closeDelistModal = () => {
    setDelistModalOpen(false);
    setSelectedMint(null);
  };

  const closeListModal = () => {
    setListModalOpen(false);
    setListPrice('');
    setSelectedMint(null);
  };

  const closeSendModal = () => {
    setSendModalOpen(false);
    setReceiveAddress('');
    setTipAmount('');
    setSelectedMint(null);
  };

  const closeSendSuccessModal = () => {
    setSendSuccessModalOpen(false);
    setSendTxId(null);
  };

  const handleSendSave = async () => {
    if (!selectedMint) return;
    if (!privateKeyWif) {
      toast.error('Wallet private key not available');
      return;
    }
    if (!receiveAddress.trim()) {
      toast.error('Please enter a receive wallet address');
      return;
    }
    if (!selectedMint.utxo) {
      toast.error('NFT UTXO information not available');
      return;
    }

    const tipNum = tipAmount.trim() ? Number(tipAmount) : 0;
    if (tipAmount.trim() && (isNaN(tipNum) || tipNum < 0)) {
      toast.error('Please enter a valid tip amount');
      return;
    }

    setProcessing(true);
    try {
      // Parse NFT UTXO: format is "txId:vout"
      const [txid, voutStr] = selectedMint.utxo.split(':');
      const vout = parseInt(voutStr, 10);

      if (!txid || isNaN(vout)) {
        throw new Error('Invalid NFT UTXO format');
      }

      // Get payment UTXOs
      const paymentUtxos = await getUtxos({ address });

      // Calculate tip in zatoshis
      const tipZatoshis = Math.round(tipNum * 10 ** 8);

      // Create send NFT transaction
      const { hex: txHex } = await createSendNftTransaction({
        nftUtxo: {
          txid,
          vout,
          amount: INSCRIPTION_UTXO_SIZE,
        },
        paymentUtxos,
        receiveAddress: receiveAddress.trim(),
        changeAddress: address,
        privateKeyWif,
        tipAmount: tipZatoshis,
        fee: DEFAULT_TX_FEE,
      });

      // Transmit transaction
      const txResult = await sendTransaction({ hex: txHex });

      if (txResult.error || !txResult.result) {
        throw new Error(txResult.error || 'Failed to send transaction');
      }

      const newTxId = txResult.result;
      const trimmedReceiveAddress = receiveAddress.trim();

      // Update NFT data: set utxo to "txId:0" and address to receiveAddress
      await updateMint(selectedMint.inscriptionId, {
        utxo: `${newTxId}:0`,
        address: trimmedReceiveAddress,
      });

      // Save transaction history
      await saveTransactionHistory({
        from: address,
        to: trimmedReceiveAddress,
        inscriptionId: selectedMint.inscriptionId,
        reason: 'send',
        price: 0,
        transactionId: newTxId,
      });

      // Show success modal
      setSendTxId(newTxId);
      setSendModalOpen(false);
      setSendSuccessModalOpen(true);
      setReceiveAddress('');
      setTipAmount('');
      setSelectedMint(null);

      // Refresh NFTs data after all updates are complete
      onMintsRefresh?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to send NFT'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleUploadCollection = async () => {
    if (!collectionName.trim()) {
      toast.error('Please enter a collection name');
      return;
    }
    if (!collectionDescription.trim()) {
      toast.error('Please enter a collection description');
      return;
    }
    if (!collectionImageUrl.trim()) {
      toast.error('Please enter a collection image URL');
      return;
    }
    if (!inscriptionIds.trim()) {
      toast.error('Please enter at least one inscription ID');
      return;
    }

    setUploadProcessing(true);
    try {
      // Generate collectionId (using timestamp + random string for uniqueness)
      const collectionId = `collection_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      // Parse inscription IDs from textarea (one per line)
      const inscriptionIdList = inscriptionIds
        .split('\n')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (inscriptionIdList.length === 0) {
        toast.error('Please enter at least one valid inscription ID');
        return;
      }

      // Create collection document
      await createCollection(collectionId, {
        name: collectionName.trim(),
        description: collectionDescription.trim(),
        imageUrl: collectionImageUrl.trim(),
      });

      // Update each mint with collectionId and collectionName
      let updatedCount = 0;
      let notFoundCount = 0;

      for (const inscriptionId of inscriptionIdList) {
        const mint = await getMintByInscriptionId(inscriptionId);
        if (mint) {
          await updateMint(inscriptionId, {
            collectionId,
            collectionName: collectionName.trim(),
          });
          updatedCount++;
        } else {
          notFoundCount++;
        }
      }

      // Show success message with details
      if (updatedCount > 0) {
        toast.success(
          `Collection created! Updated ${updatedCount} inscription(s)${
            notFoundCount > 0
              ? `. ${notFoundCount} inscription ID(s) not found in inscription table.`
              : ''
          }`
        );
      } else {
        toast.error(
          'Collection created, but no inscriptions were updated. Please check the inscription IDs.'
        );
      }

      // Close modal and reset form
      setUploadCollectionModalOpen(false);
      setCollectionName('');
      setCollectionDescription('');
      setCollectionImageUrl('');
      setInscriptionIds('');
      onMintsRefresh?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to upload collection'
      );
    } finally {
      setUploadProcessing(false);
    }
  };

  return (
    <div className='mx-auto flex w-full max-w-5xl flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 md:gap-8 md:rounded-3xl md:p-8'>
      <div className='flex flex-col gap-2 md:gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-2 md:gap-3'>
          <SectionTitle>Wallet Address</SectionTitle>
          <div className='flex items-center gap-1 md:gap-2'>
            <IconButton
              icon='🔑'
              label='Export key material'
              onClick={onExportKeys}
            />
            <IconButton
              icon='🗑️'
              label='Delete wallet'
              onClick={onDelete}
              variant='danger'
            />
          </div>
        </div>
        <div className='flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 md:rounded-3xl md:p-6'>
          <div>
            <p className='text-sm text-slate-400'>Active Address</p>
            <p className='break-all font-mono text-lg text-white'>{address}</p>
          </div>
          <button
            type='button'
            onClick={onCopyAddress}
            className='rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500'
          >
            Copy Address
          </button>
        </div>
      </div>

      <div className='grid gap-2 md:gap-4 md:grid-cols-3'>
        <div className='rounded-2xl border border-slate-800 bg-slate-900/40 p-3 md:rounded-3xl md:p-5'>
          <div className='flex items-center justify-between'>
            <span className='text-sm text-slate-400'>Wallet balance</span>
            <IconBubble symbol='💰' size='h-12 w-12' />
          </div>
          <p className='mt-3 text-3xl font-semibold text-white'>
            {balance.toFixed(8)} ZEC
          </p>
        </div>
        <div className='rounded-2xl border border-slate-800 bg-slate-900/40 p-3 md:rounded-3xl md:p-5'>
          <span className='text-sm text-slate-400'>Wallet name</span>
          <input
            value={walletName}
            onChange={(event) => onRename(event.target.value)}
            className='mt-3 w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
          />
          <p className='mt-2 text-xs text-slate-500'>Tap to rename.</p>
        </div>
        <div className='rounded-2xl border border-slate-800 bg-slate-900/40 p-3 md:rounded-3xl md:p-5'>
          <span className='text-sm text-slate-400'>Security</span>
          <p className='mt-3 text-base text-slate-200'>
            Locally encrypted with your password. Lock or delete anytime.
          </p>
        </div>
      </div>

      <div className='grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 md:gap-4'>
        <ActionIconButton label='Receive' symbol='📥' onClick={onReceive} />
        <ActionIconButton label='Send' symbol='📤' onClick={onSend} />
        <ActionIconButton
          label='Inscribe'
          symbol='💎'
          onClick={() => {
            window.location.href = '/';
          }}
        />
        <ActionIconButton
          label='Upload Collection'
          symbol='📦'
          onClick={() => setUploadCollectionModalOpen(true)}
        />
      </div>

      {/* Tabs */}
      <div className='mt-8 flex gap-2 border-b border-slate-800'>
        <button
          type='button'
          onClick={() => setActiveTab('nft')}
          className={`px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'nft'
              ? 'border-b-2 border-indigo-400 text-indigo-100'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          NFT
        </button>
        <button
          type='button'
          onClick={() => setActiveTab('rune')}
          className={`px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'rune'
              ? 'border-b-2 border-indigo-400 text-indigo-100'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Rune
        </button>
      </div>

      {/* NFT Tab Content */}
      {activeTab === 'nft' && mints.length > 0 && (
        <div className='mt-8'>
          <h2 className='mb-4 text-lg font-semibold text-white'>
            Inscribed NFTs
          </h2>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5'>
            {mints.map((mint, index) => {
              const ipfsUrl = getIpfsUrl(mint.ipfs_cid);
              const isImage = isImageType(mint.ipfs_type);

              return (
                <div
                  key={mint.inscriptionId || index}
                  className='group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-indigo-500/50'
                >
                  <div
                    onClick={() => handleMintClick(mint)}
                    className='cursor-pointer flex-1 p-2'
                  >
                    {isImage ? (
                      <img
                        src={ipfsUrl}
                        alt={`NFT ${index + 1}`}
                        className='w-full h-[200px] object-cover'
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          if (target.nextElementSibling) {
                            (
                              target.nextElementSibling as HTMLElement
                            ).style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className={`${
                        isImage
                          ? 'absolute inset-0 hidden items-center justify-center bg-slate-900/80'
                          : 'flex min-h-[120px] items-center justify-center'
                      }`}
                    >
                      <div className='text-center'>
                        <p className='text-2xl'>📄</p>
                        <p className='mt-2 text-xs text-slate-400'>
                          {mint.ipfs_type.split('/')[1] || 'File'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className='border-t border-slate-800 p-3'>
                    {mint.isSale ? (
                      <button
                        type='button'
                        onClick={(e) => handleDelistClick(e, mint)}
                        className='w-full rounded-xl border border-rose-500/60 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400 hover:bg-rose-500/30'
                      >
                        Delist
                      </button>
                    ) : (
                      <div className='flex gap-2'>
                        <button
                          type='button'
                          onClick={(e) => handleSendClick(e, mint)}
                          className='flex-1 rounded-xl border border-indigo-500/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 transition hover:border-indigo-400 hover:bg-indigo-500/30'
                        >
                          Send
                        </button>
                        <button
                          type='button'
                          onClick={(e) => handleListClick(e, mint)}
                          className='flex-1 rounded-xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/30'
                        >
                          List
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rune Tab Content */}
      {activeTab === 'rune' && (
        <div className='mt-8'>
          {/* Action Buttons */}
          <div className='mb-6 flex gap-3'>
            <button
              type='button'
              onClick={() => setRuneView('balance')}
              className={`rounded-xl border px-6 py-3 text-sm font-semibold transition ${
                runeView === 'balance'
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-100'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              Balance
            </button>
            <button
              type='button'
              onClick={() => setRuneView('etch')}
              className={`rounded-xl border px-6 py-3 text-sm font-semibold transition ${
                runeView === 'etch'
                  ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-100'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              Etch
            </button>
            <button
              type='button'
              onClick={() => setRuneView('mint')}
              className={`rounded-xl border px-6 py-3 text-sm font-semibold transition ${
                runeView === 'mint'
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-100'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              Mint
            </button>
          </div>

          {/* Etched Runes List */}
          {runeView === 'etch' && (
            <div>
              <h2 className='mb-4 text-lg font-semibold text-white'>
                Etched Runes
              </h2>
              {loadingRunes ? (
                <div className='text-center text-slate-400 py-8'>
                  Loading runes...
                </div>
              ) : runes.length === 0 ? (
                <div className='text-center text-slate-400 py-8'>
                  No runes etched yet
                </div>
              ) : (
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                  {runes.map((rune, index) => (
                    <div
                      key={rune.transactionId || index}
                      className='rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-indigo-500/50'
                    >
                      <div className='space-y-3'>
                        <div>
                          <p className='text-xs text-slate-400'>Token Name</p>
                          <p className='text-sm font-semibold text-white'>
                            {rune.runeName || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-slate-400'>Token Symbol</p>
                          <p className='text-sm font-semibold text-white'>
                            {rune.runeSymbol || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-slate-400'>Total Supply</p>
                          <p className='text-sm font-semibold text-white'>
                            {rune.runeSupply || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-slate-400'>Decimal</p>
                          <p className='text-sm font-semibold text-white'>
                            {rune.runeDecimals || '0'}
                          </p>
                        </div>
                        <div>
                          {rune.runeId ? (
                            <>
                              <p className='text-xs text-slate-400'>Rune ID</p>
                              <p className='text-sm font-mono text-indigo-300 break-all'>
                                {rune.runeId}
                              </p>
                            </>
                          ) : (
                            <button
                              type='button'
                              onClick={() => handleActivate(rune)}
                              disabled={processing}
                              className='w-full rounded-xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed'
                            >
                              {processing ? 'Activating...' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rune Balances */}
          {runeView === 'balance' && (
            <div>
              <h2 className='mb-4 text-lg font-semibold text-white'>
                Rune Balances
              </h2>
              {loadingRunes ? (
                <div className='text-center text-slate-400 py-8'>
                  Loading balances...
                </div>
              ) : runeBalances.length === 0 ? (
                <div className='text-center text-slate-400 py-8'>
                  No rune balances found
                </div>
              ) : (
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                  {runeBalances.map((balance, index) => (
                    <div
                      key={`${balance.runeId}-${index}`}
                      className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 transition hover:border-amber-500/50'
                    >
                      <div className='space-y-3'>
                        <div>
                          <p className='text-xs text-slate-400'>Rune Name</p>
                          <p className='text-sm font-semibold text-white'>
                            {balance.runeName}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-slate-400'>Rune ID</p>
                          <p className='text-sm font-mono text-amber-300 break-all'>
                            {balance.runeId}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-slate-400'>Total Balance</p>
                          <p className='text-lg font-bold text-amber-200'>
                            {balance.totalAmount.toString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Minted Runes List */}
          {runeView === 'mint' && (
            <div>
              <h2 className='mb-4 text-lg font-semibold text-white'>
                Minted Runes
              </h2>
              {loadingRunes ? (
                <div className='text-center text-slate-400 py-8'>
                  Loading mints...
                </div>
              ) : runeMints.length === 0 ? (
                <div className='text-center text-slate-400 py-8'>
                  No runes minted yet
                </div>
              ) : (
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
                  {runeMints.map((mint, index) => (
                    <div
                      key={mint.transactionId || index}
                      className='rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-indigo-500/50'
                    >
                      <div className='space-y-3'>
                        <div>
                          <p className='text-xs text-slate-400'>Rune Name</p>
                          <p className='text-sm font-semibold text-white'>
                            {mint.runeName || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-slate-400'>Rune ID</p>
                          <p className='text-sm font-mono text-indigo-300 break-all'>
                            {mint.runeId}
                          </p>
                        </div>
                        <div>
                          <p className='text-xs text-slate-400'>Amount</p>
                          <p className='text-sm font-semibold text-white'>
                            {mint.amount}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <BigModal
        open={mintModalOpen}
        title='NFT Details'
        onClose={closeMintModal}
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
            <div className='flex flex-1 flex-col gap-4'>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  Inscription ID
                </p>
                <div className='mt-2 flex items-center gap-2'>
                  <p className='break-all font-mono text-sm text-slate-100'>
                    {selectedMint.inscriptionId}
                  </p>
                  <button
                    type='button'
                    onClick={() => handleCopy(selectedMint.inscriptionId)}
                    className='rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500'
                    title='Copy inscription ID'
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  MIME Type
                </p>
                <p className='mt-2 text-sm text-slate-100'>
                  {selectedMint.ipfs_type}
                </p>
              </div>
              <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
                <p className='text-xs uppercase tracking-wide text-slate-400'>
                  IPFS CID
                </p>
                <div className='mt-2 flex items-center gap-2'>
                  <p className='break-all font-mono text-sm text-slate-100'>
                    {selectedMint.ipfs_cid}
                  </p>
                  <button
                    type='button'
                    onClick={() => handleCopy(selectedMint.ipfs_cid)}
                    className='rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500'
                    title='Copy IPFS CID'
                  >
                    Copy
                  </button>
                </div>
                <a
                  href={getIpfsUrl(selectedMint.ipfs_cid)}
                  target='_blank'
                  rel='noreferrer'
                  className='mt-3 inline-block text-xs text-indigo-300 underline hover:text-indigo-200'
                >
                  View on IPFS
                </a>
              </div>
            </div>
          </div>
        )}
      </BigModal>

      <Modal
        open={delistModalOpen}
        title='Delist NFT'
        onClose={closeDelistModal}
      >
        <div className='space-y-4'>
          <p className='text-sm text-slate-300'>
            Are you sure you want to delist this NFT from the marketplace?
          </p>
          <div className='flex gap-3'>
            <button
              type='button'
              onClick={closeDelistModal}
              disabled={processing}
              className='flex-1 rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-60'
            >
              Cancel
            </button>
            <button
              type='button'
              onClick={handleDelistConfirm}
              disabled={processing}
              className='flex-1 rounded-2xl border border-rose-500/60 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400 disabled:opacity-60'
            >
              {processing ? 'Delisting...' : 'Delist'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={listModalOpen}
        title='List NFT for Sale'
        onClose={closeListModal}
      >
        <div className='space-y-4'>
          {selectedMint && (
            <>
              <div className='flex justify-center'>
                {isImageType(selectedMint.ipfs_type) ? (
                  <img
                    src={getIpfsUrl(selectedMint.ipfs_cid)}
                    alt='NFT Preview'
                    className='max-h-64 rounded-2xl object-contain'
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className='flex h-64 w-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60'>
                    <div className='text-center'>
                      <p className='text-6xl'>📄</p>
                      <p className='mt-2 text-xs text-slate-400'>
                        {selectedMint.ipfs_type}
                      </p>
                    </div>
                  </div>
                )}
              </div>
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
                  placeholder='0.00000000'
                  disabled={processing}
                  className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
                />
              </div>
              <div className='flex gap-3'>
                <button
                  type='button'
                  onClick={closeListModal}
                  disabled={processing}
                  className='flex-1 rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-60'
                >
                  Cancel
                </button>
                <button
                  type='button'
                  onClick={handleListConfirm}
                  disabled={processing}
                  className='flex-1 rounded-2xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 disabled:opacity-60'
                >
                  {processing ? 'Listing...' : 'List'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal open={sendModalOpen} title='Send NFT' onClose={closeSendModal}>
        <div className='space-y-4'>
          {selectedMint && (
            <>
              <div className='flex justify-center'>
                {isImageType(selectedMint.ipfs_type) ? (
                  <img
                    src={getIpfsUrl(selectedMint.ipfs_cid)}
                    alt='NFT Preview'
                    className='max-h-64 rounded-2xl object-contain'
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className='flex h-64 w-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60'>
                    <div className='text-center'>
                      <p className='text-6xl'>📄</p>
                      <p className='mt-2 text-xs text-slate-400'>
                        {selectedMint.ipfs_type}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className='block text-sm font-medium text-slate-300'>
                  Receive Wallet Address
                </label>
                <input
                  type='text'
                  value={receiveAddress}
                  onChange={(e) => setReceiveAddress(e.target.value)}
                  placeholder='Enter wallet address'
                  disabled={processing}
                  className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-slate-300'>
                  Tip Amount (ZEC)
                </label>
                <input
                  type='number'
                  step='0.00000001'
                  min='0'
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder='0.00000000 (optional)'
                  disabled={processing}
                  className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
                />
              </div>
              <div className='flex gap-3'>
                <button
                  type='button'
                  onClick={closeSendModal}
                  disabled={processing}
                  className='flex-1 rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-60'
                >
                  Cancel
                </button>
                <button
                  type='button'
                  onClick={handleSendSave}
                  disabled={processing}
                  className='flex-1 rounded-2xl border border-indigo-500/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 transition hover:border-indigo-400 disabled:opacity-60'
                >
                  {processing ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={sendSuccessModalOpen}
        title='NFT Sent Successfully'
        onClose={closeSendSuccessModal}
      >
        <div className='space-y-4'>
          <p className='text-sm text-slate-300'>
            Your NFT has been sent successfully!
          </p>
          {sendTxId && (
            <div className='rounded-2xl border border-slate-800 bg-slate-950/60 p-4'>
              <p className='text-xs uppercase tracking-wide text-slate-400'>
                Transaction ID
              </p>
              <div className='mt-2 flex items-center gap-2'>
                <p className='break-all font-mono text-sm text-slate-100'>
                  {sendTxId}
                </p>
                <button
                  type='button'
                  onClick={() => handleCopy(sendTxId)}
                  className='rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500'
                  title='Copy transaction ID'
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          <button
            type='button'
            onClick={closeSendSuccessModal}
            className='w-full rounded-2xl border border-indigo-500/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 transition hover:border-indigo-400'
          >
            Close
          </button>
        </div>
      </Modal>

      <Modal
        open={uploadCollectionModalOpen}
        title='Upload Collection'
        onClose={() => {
          setUploadCollectionModalOpen(false);
          setCollectionName('');
          setCollectionDescription('');
          setCollectionImageUrl('');
          setInscriptionIds('');
        }}
      >
        <div className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-300'>
              Collection Name
            </label>
            <input
              type='text'
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              placeholder='Enter collection name'
              disabled={uploadProcessing}
              className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-300'>
              Collection Description
            </label>
            <input
              type='text'
              value={collectionDescription}
              onChange={(e) => setCollectionDescription(e.target.value)}
              placeholder='Enter collection description'
              disabled={uploadProcessing}
              className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-300'>
              Collection Image URL
            </label>
            <input
              type='text'
              value={collectionImageUrl}
              onChange={(e) => setCollectionImageUrl(e.target.value)}
              placeholder='Enter image URL'
              disabled={uploadProcessing}
              className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-300'>
              Inscription IDs (one per line)
            </label>
            <textarea
              value={inscriptionIds}
              onChange={(e) => setInscriptionIds(e.target.value)}
              placeholder='Enter inscription IDs, one per line'
              disabled={uploadProcessing}
              rows={6}
              className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
            />
          </div>
          <div className='flex gap-3'>
            <button
              type='button'
              onClick={() => {
                setUploadCollectionModalOpen(false);
                setCollectionName('');
                setCollectionDescription('');
                setCollectionImageUrl('');
                setInscriptionIds('');
              }}
              disabled={uploadProcessing}
              className='flex-1 rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-60'
            >
              Cancel
            </button>
            <button
              type='button'
              onClick={handleUploadCollection}
              disabled={uploadProcessing}
              className='flex-1 rounded-2xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 disabled:opacity-60'
            >
              {uploadProcessing ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

type IconButtonProps = {
  icon: string;
  label: string;
  variant?: 'default' | 'danger';
  onClick: () => void;
};

const IconButton = ({
  icon,
  label,
  variant = 'default',
  onClick,
}: IconButtonProps) => (
  <button
    type='button'
    onClick={onClick}
    className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-xl transition ${
      variant === 'danger'
        ? 'text-rose-200 hover:bg-rose-500/10'
        : 'text-slate-100 hover:bg-slate-700/40'
    }`}
    title={label}
    aria-label={label}
  >
    <span>{icon}</span>
  </button>
);

export default DashboardScreen;
