import { useEffect, useMemo, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import {
  getMintsByAddress,
  getUtxos,
  sendTransaction,
  type SendTransactionResponse,
} from './lib/api';
import {
  DEFAULT_TX_FEE,
  createSignedTransaction,
  type UtxoInput,
} from './lib/transaction';
import CreatePasswordScreen from './components/CreatePasswordScreen';
import DashboardScreen from './components/DashboardScreen';
import HubScreen from './components/HubScreen';
import ImportScreen from './components/ImportScreen';
import LauncherScreen from './components/LauncherScreen';
import MnemonicScreen from './components/MnemonicScreen';
import Modal from './components/Modal';
import UnlockScreen from './components/UnlockScreen';
import {
  generateTransparentAddress,
  walletFromMnemonic,
  walletFromWif,
  type TransparentAddressPayload,
} from './lib/zcash';
import {
  decryptWalletRecord,
  encryptWalletRecord,
  loadWalletRecord,
  removeWalletRecord,
  saveWalletRecord,
  type StoredWalletRecord,
} from './lib/walletStorage';
import {
  setWalletPassword,
  clearWalletPassword,
  getWalletPassword,
  isWalletUnlocked,
} from './lib/passwordStore';

type Screen =
  | 'launcher'
  | 'hub'
  | 'create-password'
  | 'create-mnemonic'
  | 'import'
  | 'unlock'
  | 'dashboard';

type ActiveWallet = {
  name: string;
  payload: TransparentAddressPayload;
};

const DEFAULT_NAME = 'My Zcash Wallet';
const ZATOSHI_PER_ZEC = 10 ** 8;
const FAST_TX_TIP_ZEC = 0.0001;
const RECOMMENDED_TIP_DISPLAY = FAST_TX_TIP_ZEC.toFixed(8);
const ZCASH_TX_EXPLORER_BASE = 'https://blockchair.com/zcash/transaction';
const SAMPLE_TX_ID =
  'd5afd88323924ccc29bc8a7c68137d43690cbaf55c462535ead8ef83dfb745ff';

const getInitialStoredRecord = () =>
  typeof window === 'undefined' ? null : loadWalletRecord();

function WalletApp() {
  const initialStoredRecord = getInitialStoredRecord();
  // Check if wallet is already unlocked on initial load
  const initialScreen: Screen = initialStoredRecord
    ? isWalletUnlocked()
      ? 'dashboard' // Will be set properly by auto-unlock effect
      : 'unlock'
    : 'launcher';
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [pendingPassword, setPendingPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingWallet, setPendingWallet] =
    useState<TransparentAddressPayload | null>(null);
  const [mnemonicInput, setMnemonicInput] = useState('');
  const [wifInput, setWifInput] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [processing, setProcessing] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportProcessing, setExportProcessing] = useState(false);
  const [exportStep, setExportStep] = useState<'password' | 'secrets'>(
    'password'
  );
  const [exportPayload, setExportPayload] =
    useState<TransparentAddressPayload | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [showWif, setShowWif] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendProcessing, setSendProcessing] = useState(false);
  const [tipAmount, setTipAmount] = useState(RECOMMENDED_TIP_DISPLAY);
  const [txResultModalOpen, setTxResultModalOpen] = useState(false);
  const [txResultPayload, setTxResultPayload] =
    useState<SendTransactionResponse | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [utxos, setUtxos] = useState<UtxoInput[]>([]);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [mints, setMints] = useState<
    Array<{
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
    }>
  >([]);
  const [storedRecord, setStoredRecord] = useState<StoredWalletRecord | null>(
    initialStoredRecord
  );
  const [activeWallet, setActiveWallet] = useState<ActiveWallet | null>(null);
  const [walletName, setWalletName] = useState(
    storedRecord?.name ?? DEFAULT_NAME
  );

  const parsedTipAmount = Number(tipAmount);
  const tipAmountIsFinite = Number.isFinite(parsedTipAmount);
  const normalizedTipZec =
    tipAmountIsFinite && parsedTipAmount > 0 ? parsedTipAmount : 0;
  const tipIsNegative = tipAmountIsFinite && parsedTipAmount < 0;
  const baseNetworkFeeZec = DEFAULT_TX_FEE / ZATOSHI_PER_ZEC;
  const tipZatoshis = Math.round(normalizedTipZec * ZATOSHI_PER_ZEC);
  const totalFeeZatoshis = DEFAULT_TX_FEE + tipZatoshis;
  const totalFeeZec = totalFeeZatoshis / ZATOSHI_PER_ZEC;
  const spendableAfterFees = Math.max(walletBalance - totalFeeZec, 0);
  const txResultId = txResultPayload?.result ?? null;
  const txResultError = txResultPayload?.error ?? null;
  const txExplorerUrl = `${ZCASH_TX_EXPLORER_BASE}/${
    txResultId || SAMPLE_TX_ID
  }`;
  const txHasError = Boolean(txResultError);

  // Auto-unlock wallet if password is already stored (wallet was unlocked before)
  useEffect(() => {
    const autoUnlock = async () => {
      if (activeWallet || !storedRecord) {
        return;
      }

      // Check if wallet is already unlocked (password stored)
      if (isWalletUnlocked()) {
        const password = getWalletPassword();
        if (password) {
          setProcessing(true);
          try {
            const payload = await decryptWalletRecord(password, storedRecord);
            setActiveWallet({
              payload,
              name: storedRecord.name,
            });
            // Password is already stored, no need to store again
            // Screen will be set to 'dashboard' by the activeWallet useEffect
          } catch {
            // If decryption fails, clear the stored password and show unlock screen
            clearWalletPassword();
            setScreen('unlock');
          } finally {
            setProcessing(false);
          }
        }
      } else if (!activeWallet && storedRecord) {
        // Only show unlock screen if wallet is not unlocked
        setWalletName(storedRecord.name);
        setScreen((current) => (current === 'unlock' ? current : 'unlock'));
        setWalletBalance(0);
      }
    };

    autoUnlock();
  }, [storedRecord, activeWallet]); // Run when storedRecord or activeWallet changes

  useEffect(() => {
    if (activeWallet) {
      setWalletName(activeWallet.name);
      setScreen('dashboard');
    }
  }, [activeWallet]);

  useEffect(() => {
    if (!activeWallet) {
      setWalletBalance(0);
      setUtxos([]);
      setMints([]);
      return;
    }
    let isCancelled = false;
    const fetchBalance = async () => {
      try {
        const utxoList = await getUtxos({
          address: activeWallet.payload.address,
        });
        if (isCancelled) {
          return;
        }
        const normalizedUtxos = Array.isArray(utxoList) ? utxoList : [];
        setUtxos(normalizedUtxos);
        const total = normalizedUtxos.reduce(
          (sum: number, utxo: { amount?: number }) =>
            sum + (typeof utxo.amount === 'number' ? utxo.amount : 0),
          0
        );
        setWalletBalance(total / 10 ** 8);
      } catch (error) {
        if (!isCancelled) {
          toast.error(
            error instanceof Error ? error.message : 'Unable to load balance'
          );
        }
      }
    };
    fetchBalance();
    return () => {
      isCancelled = true;
    };
  }, [activeWallet, balanceRefreshKey]);

  useEffect(() => {
    if (!activeWallet) {
      setMints([]);
      return;
    }
    let isCancelled = false;
    const fetchMints = async () => {
      try {
        const mintsResponse = await getMintsByAddress({
          address: activeWallet.payload.address,
          limit: 100,
        });
        if (isCancelled) {
          return;
        }
        // Handle response structure: { data: [...], total, page, limit }
        const response = mintsResponse as
          | { data: typeof mints; total: number; page: number; limit: number }
          | typeof mints;
        const normalizedMints = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
          ? response.data
          : [];
        setMints(normalizedMints);
      } catch (error) {
        if (!isCancelled) {
          // Silently fail for mints - not critical
          console.error('Unable to load mints:', error);
        }
      }
    };
    fetchMints();
    return () => {
      isCancelled = true;
    };
  }, [activeWallet, balanceRefreshKey]);
  const mnemonicWords = useMemo(
    () =>
      activeWallet?.payload.mnemonic?.split(' ') ??
      pendingWallet?.mnemonic?.split(' ') ??
      [],
    [activeWallet, pendingWallet]
  );

  const handleCopy = async (value?: string) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied to clipboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Copy failed');
    }
  };

  const resetFlows = () => {
    setPendingPassword('');
    setConfirmPassword('');
    setPendingWallet(null);
    setImportPassword('');
    setMnemonicInput('');
    setWifInput('');
    setUnlockPassword('');
  };

  const resetExportState = () => {
    setExportPassword('');
    setExportProcessing(false);
    setExportStep('password');
    setExportPayload(null);
    setShowMnemonic(false);
    setShowWif(false);
  };

  const persistWallet = async (
    payload: TransparentAddressPayload,
    password: string,
    nameOverride?: string
  ) => {
    const friendlyName =
      nameOverride?.trim() || walletName.trim() || DEFAULT_NAME;
    setProcessing(true);
    try {
      const record = await encryptWalletRecord(payload, password, friendlyName);
      saveWalletRecord(record);
      setStoredRecord(record);
      setActiveWallet({
        payload,
        name: record.name,
      });
      toast.success('Wallet ready');
      resetFlows();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to save wallet'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handlePasswordContinue = () => {
    if (pendingPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (pendingPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    const wallet = generateTransparentAddress();
    setPendingWallet(wallet);
    setScreen('create-mnemonic');
  };

  const finalizeWalletCreation = () => {
    if (!pendingWallet) {
      return;
    }
    persistWallet(pendingWallet, pendingPassword);
  };

  const handleImportSubmit = (mode: 'mnemonic' | 'wif') => {
    if (importPassword.length < 8) {
      toast.error('Set a password to encrypt this wallet locally');
      return;
    }

    try {
      const payload =
        mode === 'mnemonic'
          ? walletFromMnemonic(mnemonicInput)
          : walletFromWif(wifInput);
      persistWallet(payload, importPassword);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to import wallet'
      );
    }
  };

  const handleUnlock = async () => {
    if (!storedRecord) {
      return;
    }
    setProcessing(true);
    try {
      const payload = await decryptWalletRecord(unlockPassword, storedRecord);
      setActiveWallet({
        payload,
        name: storedRecord.name,
      });
      // Store password in memory for use in mint/buy operations
      setWalletPassword(unlockPassword);
      toast.success('Wallet unlocked');
      setUnlockPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unlock failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleRename = (name: string) => {
    setWalletName(name);
    if (activeWallet) {
      setActiveWallet({ ...activeWallet, name });
    }
    if (storedRecord) {
      const updated = { ...storedRecord, name };
      saveWalletRecord(updated);
      setStoredRecord(updated);
    }
  };

  const handleDeleteRequest = () => {
    setDeleteModalOpen(true);
  };

  const handleDelete = () => {
    removeWalletRecord();
    setStoredRecord(null);
    setActiveWallet(null);
    // Clear stored password when deleting wallet
    clearWalletPassword();
    resetFlows();
    setScreen('launcher');
    toast.success('Wallet removed locally');
    setDeleteModalOpen(false);
  };

  const handleExportRequest = () => {
    resetExportState();
    setExportModalOpen(true);
  };

  const handleExportSubmit = async () => {
    if (!storedRecord) {
      toast.error('No wallet stored');
      return;
    }
    if (!exportPassword.trim()) {
      toast.error('Enter your password to continue');
      return;
    }
    setExportProcessing(true);
    try {
      const payload = await decryptWalletRecord(exportPassword, storedRecord);
      setExportPayload(payload);
      setExportStep('secrets');
      toast.success('Secrets unlocked');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unlock failed');
    } finally {
      setExportProcessing(false);
    }
  };

  const closeExportModal = () => {
    resetExportState();
    setExportModalOpen(false);
  };

  const closeReceiveModal = () => {
    setReceiveModalOpen(false);
  };

  const closeSendModal = () => {
    setSendModalOpen(false);
    setSendAddress('');
    setSendAmount('');
    setSendProcessing(false);
    setTipAmount(RECOMMENDED_TIP_DISPLAY);
  };

  const handleSendMax = () => {
    if (walletBalance <= totalFeeZec) {
      toast.error('Insufficient balance to cover fee and tip');
      return;
    }
    setSendAmount(spendableAfterFees.toFixed(8));
  };

  const handleSendSubmit = async () => {
    if (!activeWallet) {
      return;
    }
    if (sendProcessing) {
      return;
    }
    if (!sendAddress.trim()) {
      toast.error('Enter a recipient address');
      return;
    }
    const amountNumber = Number(sendAmount);
    if (!amountNumber || amountNumber <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amountNumber > walletBalance) {
      toast.error('Amount exceeds balance');
      return;
    }
    if (!utxos.length) {
      toast.error('No funds available to spend');
      return;
    }
    if (tipIsNegative) {
      toast.error('Tip amount must be zero or greater');
      return;
    }
    const totalRequired = amountNumber + totalFeeZec;
    if (totalRequired > walletBalance) {
      toast.error('Amount plus fees exceeds available balance');
      return;
    }
    setSendProcessing(true);
    try {
      const { hex } = await createSignedTransaction({
        utxos,
        toAddress: sendAddress.trim(),
        amount: amountNumber,
        changeAddress: activeWallet.payload.address,
        privateKeyWif: activeWallet.payload.privateKeyWif,
        fee: totalFeeZatoshis,
      });
      const response = await sendTransaction({ hex });
      setTxResultPayload(response);
      setTxResultModalOpen(true);
      if (response?.error) {
        toast.error('Please increase fee');
        return;
      }
      // const txId = response?.result;
      // toast.success(
      //   txId ? `Transaction broadcast: ${txId}` : 'Transaction broadcast'
      // );
      closeSendModal();
      setBalanceRefreshKey((prev) => prev + 1);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to send transaction'
      );
    } finally {
      setSendProcessing(false);
    }
  };

  const handleRevealMnemonic = () => setShowMnemonic(true);
  const handleRevealWif = () => setShowWif(true);
  const closeTxResultModal = () => {
    setTxResultModalOpen(false);
    setTxResultPayload(null);
  };

  const renderScreen = () => {
    switch (screen) {
      case 'launcher':
        return <LauncherScreen onEnterHub={() => setScreen('hub')} />;
      case 'hub':
        return (
          <HubScreen
            onCreateWallet={() => {
              resetFlows();
              setScreen('create-password');
            }}
            onImportWallet={() => {
              resetFlows();
              setScreen('import');
            }}
          />
        );
      case 'create-password':
        return (
          <CreatePasswordScreen
            password={pendingPassword}
            confirmPassword={confirmPassword}
            onPasswordChange={setPendingPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onContinue={handlePasswordContinue}
          />
        );
      case 'create-mnemonic':
        return (
          <MnemonicScreen
            mnemonicWords={mnemonicWords}
            mnemonic={pendingWallet?.mnemonic}
            processing={processing}
            onCopy={() => handleCopy(pendingWallet?.mnemonic)}
            onContinue={finalizeWalletCreation}
          />
        );
      case 'import':
        return (
          <ImportScreen
            importPassword={importPassword}
            onPasswordChange={setImportPassword}
            mnemonicInput={mnemonicInput}
            onMnemonicChange={setMnemonicInput}
            onMnemonicImport={() => handleImportSubmit('mnemonic')}
            wifInput={wifInput}
            onWifChange={setWifInput}
            onWifImport={() => handleImportSubmit('wif')}
          />
        );
      case 'unlock':
        return (
          <UnlockScreen
            password={unlockPassword}
            onPasswordChange={setUnlockPassword}
            onUnlock={handleUnlock}
            processing={processing}
          />
        );
      case 'dashboard':
        return (
          activeWallet && (
            <DashboardScreen
              balance={walletBalance}
              address={activeWallet.payload.address}
              walletName={walletName}
              mints={mints}
              privateKeyWif={activeWallet.payload.privateKeyWif}
              onRename={handleRename}
              onCopyAddress={() => handleCopy(activeWallet.payload.address)}
              onDelete={handleDeleteRequest}
              onExportKeys={handleExportRequest}
              onReceive={() => setReceiveModalOpen(true)}
              onSend={() => setSendModalOpen(true)}
              onMintsRefresh={() => setBalanceRefreshKey((prev) => prev + 1)}
            />
          )
        );
      default:
        return null;
    }
  };

  return (
    <main className='min-h-screen bg-transparent px-2 py-4 text-slate-100 md:px-4 md:py-10'>
      <div className='mx-auto flex min-h-[70vh] w-full max-w-6xl flex-col gap-3 md:gap-6'>
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
        <Modal
          open={deleteModalOpen}
          title='Delete Wallet'
          onClose={() => setDeleteModalOpen(false)}
        >
          <p className='text-sm text-slate-300'>
            This removes the encrypted wallet from this device. You&apos;ll need
            your mnemonic or private key to restore it later.
          </p>
          <div className='mt-6 flex gap-3'>
            <button
              type='button'
              onClick={() => setDeleteModalOpen(false)}
              className='flex-1 rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500'
            >
              Cancel
            </button>
            <button
              type='button'
              onClick={handleDelete}
              className='flex-1 rounded-2xl border border-rose-500/60 bg-rose-500/20 px-4 py-2 text-sm text-rose-100 hover:border-rose-400'
            >
              Delete Wallet
            </button>
          </div>
        </Modal>
        <Modal open={sendModalOpen} title='Send ZEC' onClose={closeSendModal}>
          <div className='space-y-5'>
            <div>
              <label className='text-sm font-medium text-slate-300'>
                Recipient Address
              </label>
              <input
                type='text'
                value={sendAddress}
                onChange={(event) => setSendAddress(event.target.value)}
                placeholder='t1...'
                disabled={sendProcessing}
                className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
              />
            </div>
            <div>
              <div className='flex items-center justify-between text-sm font-medium text-slate-300'>
                <span>Amount (ZEC)</span>
                <button
                  type='button'
                  onClick={handleSendMax}
                  disabled={sendProcessing}
                  className='text-xs uppercase tracking-wide text-indigo-300 hover:text-indigo-200 disabled:opacity-60'
                >
                  Send Max
                </button>
              </div>
              <input
                type='number'
                step='0.00000001'
                min='0'
                value={sendAmount}
                onChange={(event) => setSendAmount(event.target.value)}
                placeholder='0.00000000'
                disabled={sendProcessing}
                className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
              />
              <p className='mt-2 text-xs text-slate-400'>
                Wallet: {walletBalance.toFixed(8)} ZEC (after fees:{' '}
                {spendableAfterFees.toFixed(8)} ZEC)
              </p>
            </div>
            <div>
              <div className='flex items-center justify-between text-sm font-medium text-slate-300'>
                <span>Fast Tip (ZEC)</span>
                <button
                  type='button'
                  onClick={() => setTipAmount(RECOMMENDED_TIP_DISPLAY)}
                  disabled={sendProcessing}
                  className='text-xs uppercase tracking-wide text-indigo-300 hover:text-indigo-200 disabled:opacity-60'
                >
                  Use {RECOMMENDED_TIP_DISPLAY}
                </button>
              </div>
              <input
                type='number'
                step='0.00000001'
                min='0'
                value={tipAmount}
                onChange={(event) => setTipAmount(event.target.value)}
                placeholder={RECOMMENDED_TIP_DISPLAY}
                disabled={sendProcessing}
                className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60'
              />
              <p className='mt-2 text-xs text-slate-400'>
                Base fee {baseNetworkFeeZec.toFixed(8)} ZEC · Total fee with tip{' '}
                {totalFeeZec.toFixed(8)} ZEC
              </p>
            </div>
            <div className='flex gap-3'>
              <button
                type='button'
                onClick={closeSendModal}
                disabled={sendProcessing}
                className='flex-1 rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleSendSubmit}
                disabled={sendProcessing}
                className='flex-1 rounded-2xl border border-emerald-500/70 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 hover:border-emerald-400 disabled:opacity-60'
              >
                {sendProcessing ? 'Sending...' : 'Send ZEC'}
              </button>
            </div>
          </div>
        </Modal>
        <Modal
          open={txResultModalOpen}
          title='Transaction Status'
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
              {txHasError ? (
                <p className='text-sm text-rose-200'>
                  Please increase fee and try again.
                </p>
              ) : (
                <div className='space-y-3'>
                  <p className='text-sm text-emerald-200'>
                    Transaction broadcasted successfully.
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
            <p className='text-sm text-slate-300'>
              Awaiting transaction result…
            </p>
          )}
        </Modal>
        <Modal
          open={exportModalOpen}
          title='Export Wallet Secrets'
          onClose={closeExportModal}
        >
          {exportStep === 'password' ? (
            <div className='space-y-4'>
              <p className='text-sm text-slate-300'>
                Enter your wallet password to decrypt and view your mnemonic and
                private key.
              </p>
              <input
                type='password'
                value={exportPassword}
                onChange={(event) => setExportPassword(event.target.value)}
                className='w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
                placeholder='Wallet password'
              />
              <button
                type='button'
                onClick={handleExportSubmit}
                disabled={exportProcessing}
                className='w-full rounded-2xl border border-indigo-500/60 bg-indigo-500/20 px-4 py-2 text-sm text-indigo-100 hover:border-indigo-400 disabled:opacity-60'
              >
                {exportProcessing ? 'Decrypting…' : 'Unlock Secrets'}
              </button>
            </div>
          ) : (
            <div className='space-y-4'>
              <SecretBlock
                label='Mnemonic Phrase'
                value={exportPayload?.mnemonic}
                revealed={showMnemonic}
                onReveal={handleRevealMnemonic}
                onCopy={() => handleCopy(exportPayload?.mnemonic)}
              />
              <SecretBlock
                label='Private Key (WIF)'
                value={exportPayload?.privateKeyWif}
                revealed={showWif}
                onReveal={handleRevealWif}
                onCopy={() => handleCopy(exportPayload?.privateKeyWif)}
              />
            </div>
          )}
        </Modal>
        <Modal
          open={receiveModalOpen}
          title='Receive Funds'
          onClose={closeReceiveModal}
        >
          {activeWallet ? (
            <div className='space-y-6'>
              <div className='flex flex-col items-center gap-3'>
                <div className='rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6'>
                  <QRCodeCanvas
                    value={activeWallet.payload.address}
                    size={200}
                    bgColor='#0f172a'
                    fgColor='#e2e8f0'
                    includeMargin
                  />
                </div>
                <p className='text-xs uppercase tracking-widest text-slate-400'>
                  Scan to receive ZEC
                </p>
              </div>
              <div className='flex flex-col gap-2'>
                <span className='text-sm font-medium text-slate-300'>
                  Wallet Address
                </span>
                <div className='flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:flex-row md:items-center md:gap-4'>
                  <p className='flex-1 break-all font-mono text-sm text-slate-100'>
                    {activeWallet.payload.address}
                  </p>
                  <button
                    type='button'
                    onClick={() => handleCopy(activeWallet.payload.address)}
                    className='rounded-2xl border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-500'
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className='text-sm text-slate-400'>No active wallet detected.</p>
          )}
        </Modal>
        {renderScreen()}
      </div>
    </main>
  );
}

type SecretBlockProps = {
  label: string;
  value?: string;
  revealed: boolean;
  onReveal: () => void;
  onCopy: () => void;
};

const SecretBlock = ({
  label,
  value,
  revealed,
  onReveal,
  onCopy,
}: SecretBlockProps) => {
  if (!value) {
    return (
      <div className='rounded-2xl border border-slate-800/70 bg-slate-900/40 p-4'>
        <p className='text-sm text-slate-400'>{label}</p>
        <p className='mt-2 text-xs uppercase tracking-widest text-slate-500'>
          Not available
        </p>
      </div>
    );
  }

  return (
    <div className='rounded-2xl border border-slate-800/70 bg-slate-900/40 p-4'>
      <p className='text-sm text-slate-400'>{label}</p>
      {revealed ? (
        <div className='mt-3 flex items-start gap-3'>
          <p className='flex-1 break-all font-mono text-sm text-slate-100'>
            {value}
          </p>
          <button
            type='button'
            onClick={onCopy}
            className='rounded-2xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-slate-500'
            title='Copy to clipboard'
          >
            📋
          </button>
        </div>
      ) : (
        <button
          type='button'
          onClick={onReveal}
          className='mt-3 flex w-full items-center justify-between rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-200 hover:border-slate-500'
        >
          <span>Tap to reveal</span>
          <span role='img' aria-label='Reveal'>
            🔑
          </span>
        </button>
      )}
    </div>
  );
};

export default WalletApp;
