type ActionIconButtonProps = {
  label: string;
  symbol: string;
  onClick: () => void;
  disabled?: boolean;
};

const ActionIconButton = ({
  label,
  symbol,
  onClick,
  disabled = false,
}: ActionIconButtonProps) => (
  <button
    type='button'
    onClick={onClick}
    disabled={disabled}
    className='flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50'
  >
    <span className='text-lg'>{symbol}</span>
    {label}
  </button>
);

export default ActionIconButton;
