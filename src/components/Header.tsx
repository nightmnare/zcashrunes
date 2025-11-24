import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const linkClasses = (path: string) =>
    `rounded-2xl border px-5 py-2 text-sm font-semibold transition ${
      location.pathname === path
        ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
        : 'border-slate-700 text-slate-200 hover:border-slate-500'
    }`;

  const mobileLinkClasses = (path: string) =>
    `block rounded-xl border px-4 py-3 text-base font-semibold transition w-[200px] ${
      location.pathname === path
        ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100'
        : 'border-slate-700 text-slate-200 hover:border-slate-500'
    }`;

  const handleNavClick = (path: string) => {
    navigate(path);
    setSidebarOpen(false);
  };

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <>
      <header className='mx-auto flex w-full max-w-6xl items-center justify-between gap-2 rounded-2xl border border-slate-800/80 bg-slate-950/80 px-3 py-2 shadow-lg shadow-slate-900/40 md:gap-4 md:rounded-3xl md:px-6 md:py-4'>
        <Link to='/' className='text-xl font-semibold tracking-wide text-white'>
          Z-NFTS
        </Link>
        {/* Desktop Navigation */}
        <nav className='hidden items-center gap-3 md:flex'>
          <Link to='/' className={linkClasses('/')}>
            Inscribe
          </Link>
          <Link to='/marketplace' className={linkClasses('/marketplace')}>
            Marketplace
          </Link>
          <Link to='/runes' className={linkClasses('/runes')}>
            Runes
          </Link>
          <Link to='/wallet' className={linkClasses('/wallet')}>
            Wallet
          </Link>
        </nav>
        {/* Mobile Hamburger Button */}
        <button
          type='button'
          onClick={() => setSidebarOpen(true)}
          className='flex items-center justify-center rounded-xl border border-slate-700 p-2 text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/50 md:hidden'
          aria-label='Open menu'
        >
          <svg
            className='h-6 w-6'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M4 6h16M4 12h16M4 18h16'
            />
          </svg>
        </button>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className='fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm md:hidden'
          onClick={() => setSidebarOpen(false)}
          aria-hidden='true'
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-64 transform border-r border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-300 ease-in-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className='flex h-full flex-col'>
          {/* Sidebar Header */}
          <div className='flex items-center justify-between border-b border-slate-800 p-4'>
            <Link
              to='/'
              onClick={() => setSidebarOpen(false)}
              className='text-xl font-semibold tracking-wide text-white'
            >
              Z-NFTS
            </Link>
            <button
              type='button'
              onClick={() => setSidebarOpen(false)}
              className='flex items-center justify-center rounded-xl border border-slate-700 p-2 text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/50'
              aria-label='Close menu'
            >
              <svg
                className='h-5 w-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M6 18L18 6M6 6l12 12'
                />
              </svg>
            </button>
          </div>

          {/* Sidebar Navigation */}
          <nav className='flex-1 space-y-2 p-4'>
            <button
              type='button'
              onClick={() => handleNavClick('/')}
              className={mobileLinkClasses('/')}
            >
              💎 Inscribe
            </button>
            <button
              type='button'
              onClick={() => handleNavClick('/marketplace')}
              className={mobileLinkClasses('/marketplace')}
            >
              🛒 Marketplace
            </button>
            <button
              type='button'
              onClick={() => handleNavClick('/runes')}
              className={mobileLinkClasses('/runes')}
            >
              ⚡ Runes
            </button>
            <button
              type='button'
              onClick={() => handleNavClick('/wallet')}
              className={mobileLinkClasses('/wallet')}
            >
              👛 Wallet
            </button>
          </nav>
        </div>
      </aside>
    </>
  );
};

export default Header;
