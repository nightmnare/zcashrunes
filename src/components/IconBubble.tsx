type IconBubbleProps = {
  symbol: string;
  accent?: string;
  size?: string;
};

const IconBubble = ({
  symbol,
  accent,
  size = 'h-14 w-14',
}: IconBubbleProps) => (
  <div
    className={`${size} rounded-3xl bg-gradient-to-br ${
      accent ?? 'from-slate-800 to-slate-900'
    } text-3xl flex items-center justify-center`}
    role='img'
    aria-hidden='true'
  >
    {symbol}
  </div>
);

export default IconBubble;
