import SectionTitle from './SectionTitle';

type UnlockScreenProps = {
  password: string;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  processing: boolean;
};

const UnlockScreen = ({
  password,
  onPasswordChange,
  onUnlock,
  processing,
}: UnlockScreenProps) => (
  <div className='mx-auto flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-8'>
    <SectionTitle>Unlock Wallet</SectionTitle>
    <div>
      <h2 className='text-2xl font-semibold text-white'>Enter your password</h2>
      <p className='mt-2 text-sm text-slate-400'>
        The encrypted wallet remains on this device. Unlock to view details.
      </p>
    </div>
    <label className='text-sm text-slate-300'>
      Password
      <input
        type='password'
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
      />
    </label>
    <button
      type='button'
      onClick={onUnlock}
      disabled={processing}
      className='rounded-2xl border border-emerald-500/50 bg-emerald-500/20 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60'
    >
      {processing ? 'Unlocking...' : 'Unlock Wallet'}
    </button>
  </div>
);

export default UnlockScreen;
