import IconBubble from './IconBubble';

type CardButtonProps = {
  title: string;
  description: string;
  symbol: string;
  accent?: string;
  onClick: () => void;
};

const CardButton = ({
  title,
  description,
  symbol,
  accent,
  onClick,
}: CardButtonProps) => (
  <button
    type='button'
    onClick={onClick}
    className='flex flex-col items-start gap-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6 text-left transition hover:border-slate-600'
  >
    <IconBubble symbol={symbol} accent={accent} />
    <div>
      <h3 className='text-xl font-semibold text-white'>{title}</h3>
      <p className='mt-2 text-sm text-slate-400'>{description}</p>
    </div>
  </button>
);

export default CardButton;
