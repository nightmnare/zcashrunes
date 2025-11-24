import type { ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

const BigModal = ({ open, title, onClose, children }: ModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-2 py-4 md:px-4 md:py-8 overflow-y-auto'
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{ touchAction: 'pan-y' }}
    >
      <div className='relative w-full max-w-6xl rounded-2xl border border-slate-800/80 bg-slate-950 p-4 shadow-2xl md:rounded-3xl md:p-6 my-auto'>
        <div className='mb-3 flex items-center justify-between md:mb-4'>
          <h2 className='text-lg font-semibold text-white'>{title}</h2>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wider text-slate-300 hover:border-slate-500'
            style={{ touchAction: 'manipulation' }}
          >
            Close
          </button>
        </div>
        <div
          className='overflow-y-auto max-h-[calc(100vh-200px)] -mx-4 px-4 md:-mx-6 md:px-6'
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
          onTouchMove={(e) => {
            // Allow scrolling to work smoothly
            e.stopPropagation();
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default BigModal;
