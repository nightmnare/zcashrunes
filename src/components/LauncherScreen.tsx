import IconBubble from './IconBubble';

type LauncherScreenProps = {
  onEnterHub: () => void;
};

const LauncherScreen = ({ onEnterHub }: LauncherScreenProps) => (
  <div className='mx-auto flex w-full max-w-4xl items-center justify-center pt-10'>
    <button
      type='button'
      onClick={onEnterHub}
      className='flex flex-col items-center gap-4 rounded-3xl border border-slate-800 bg-slate-900/60 px-16 py-16 text-center text-white transition hover:border-slate-600'
    >
      <IconBubble
        symbol='💰'
        size='h-24 w-24'
        accent='from-indigo-600 to-blue-500'
      />
      <span className='text-lg uppercase tracking-[0.6em] text-slate-300'>
        Wallet
      </span>
    </button>
  </div>
);

export default LauncherScreen;
