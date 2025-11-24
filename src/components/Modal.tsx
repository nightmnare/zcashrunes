import type { ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

const Modal = ({ open, title, onClose, children }: ModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-2 py-4 md:px-4 md:py-8'>
      <div className='relative w-full max-w-lg rounded-2xl border border-slate-800/80 bg-slate-950 p-4 shadow-2xl md:rounded-3xl md:p-6'>
        <div className='mb-3 flex items-center justify-between md:mb-4'>
          <h2 className='text-lg font-semibold text-white'>{title}</h2>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wider text-slate-300 hover:border-slate-500'
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
