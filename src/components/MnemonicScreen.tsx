import SectionTitle from './SectionTitle';

type MnemonicScreenProps = {
  mnemonicWords: string[];
  mnemonic?: string;
  processing: boolean;
  onCopy: () => void;
  onContinue: () => void;
};

const MnemonicScreen = ({
  mnemonicWords,
  mnemonic,
  processing,
  onCopy,
  onContinue,
}: MnemonicScreenProps) => {
  if (!mnemonic) {
    return null;
  }

  return (
    <div className='mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-8'>
      <SectionTitle>Recovery Phrase</SectionTitle>
      <div>
        <h2 className='text-2xl font-semibold text-white'>
          Secure your 12 words
        </h2>
        <p className='mt-2 text-sm text-slate-400'>
          Write them down and keep them offline. They can recreate this wallet
          anywhere.
        </p>
      </div>
      <div className='rounded-3xl border border-indigo-500/40 bg-indigo-500/10 p-6'>
        <ol className='grid list-decimal gap-x-8 gap-y-3 pl-5 sm:grid-cols-2'>
          {mnemonicWords.map((word, index) => (
            <li
              key={`${word}-${index}`}
              className='font-semibold text-indigo-100'
            >
              {word}
            </li>
          ))}
        </ol>
      </div>
      <div className='flex flex-col gap-4 sm:flex-row'>
        <button
          type='button'
          onClick={onCopy}
          className='w-full rounded-2xl border border-indigo-500/40 bg-indigo-500/10 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/20'
        >
          Copy Mnemonic
        </button>
        <button
          type='button'
          onClick={onContinue}
          disabled={processing}
          className='w-full rounded-2xl border border-emerald-500/50 bg-emerald-500/20 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60'
        >
          {processing ? 'Encrypting...' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default MnemonicScreen;
