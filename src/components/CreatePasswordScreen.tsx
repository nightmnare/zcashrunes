import SectionTitle from './SectionTitle';

type CreatePasswordScreenProps = {
  password: string;
  confirmPassword: string;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onContinue: () => void;
};

const CreatePasswordScreen = ({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  onContinue,
}: CreatePasswordScreenProps) => (
  <div className='mx-auto flex w-full max-w-xl flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-8'>
    <SectionTitle>Create Wallet</SectionTitle>
    <div>
      <h2 className='text-2xl font-semibold text-white'>Set a password</h2>
      <p className='mt-2 text-sm text-slate-400'>
        This password encrypts your wallet locally on this device.
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
    <label className='text-sm text-slate-300'>
      Confirm Password
      <input
        type='password'
        value={confirmPassword}
        onChange={(event) => onConfirmPasswordChange(event.target.value)}
        className='mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
      />
    </label>
    <button
      type='button'
      onClick={onContinue}
      className='rounded-2xl border border-indigo-500/60 bg-indigo-600/30 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600/60'
    >
      Continue
    </button>
  </div>
);

export default CreatePasswordScreen;
