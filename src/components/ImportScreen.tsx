import IconBubble from './IconBubble';
import SectionTitle from './SectionTitle';

type ImportScreenProps = {
  importPassword: string;
  onPasswordChange: (value: string) => void;
  mnemonicInput: string;
  onMnemonicChange: (value: string) => void;
  onMnemonicImport: () => void;
  wifInput: string;
  onWifChange: (value: string) => void;
  onWifImport: () => void;
};

const ImportScreen = ({
  importPassword,
  onPasswordChange,
  mnemonicInput,
  onMnemonicChange,
  onMnemonicImport,
  wifInput,
  onWifChange,
  onWifImport,
}: ImportScreenProps) => (
  <div className='mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-8'>
    <SectionTitle>Import Wallet</SectionTitle>
    <div>
      <h2 className='text-2xl font-semibold text-white'>Restore access</h2>
      <p className='mt-2 text-sm text-slate-400'>
        Choose a recovery method and set a password to encrypt it locally.
      </p>
    </div>
    <label className='text-sm text-slate-300'>
      Password
      <input
        type='password'
        value={importPassword}
        onChange={(event) => onPasswordChange(event.target.value)}
        placeholder='Enter a new password for this device'
        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
      />
    </label>
    <div className='grid gap-6 md:grid-cols-2'>
      <div className='flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/40 p-6'>
        <div className='flex items-center gap-3'>
          <IconBubble symbol='📜' size='h-12 w-12' />
          <div className='text-left'>
            <h3 className='text-lg font-semibold text-white'>
              Mnemonic Recovery
            </h3>
            <p className='text-xs text-slate-400'>
              Paste your 12 or 24 word phrase.
            </p>
          </div>
        </div>
        <textarea
          value={mnemonicInput}
          onChange={(event) => onMnemonicChange(event.target.value)}
          rows={5}
          placeholder='abandon ability able ...'
          className='rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
        />
        <button
          type='button'
          onClick={onMnemonicImport}
          className='rounded-2xl border border-indigo-500/40 bg-indigo-500/10 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/20'
        >
          Import via Mnemonic
        </button>
      </div>

      <div className='flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/40 p-6'>
        <div className='flex items-center gap-3'>
          <IconBubble symbol='🔑' size='h-12 w-12' />
          <div className='text-left'>
            <h3 className='text-lg font-semibold text-white'>
              Private Key (WIF)
            </h3>
            <p className='text-xs text-slate-400'>
              Restore from a WIF-formatted key.
            </p>
          </div>
        </div>
        <input
          value={wifInput}
          onChange={(event) => onWifChange(event.target.value.trim())}
          placeholder='L1aW4aubDFB7yfras2S1mN3bqg9w7...'
          className='rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-200 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40'
        />
        <button
          type='button'
          onClick={onWifImport}
          className='rounded-2xl border border-amber-500/40 bg-amber-500/10 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20'
        >
          Import via WIF
        </button>
      </div>
    </div>
  </div>
);

export default ImportScreen;
