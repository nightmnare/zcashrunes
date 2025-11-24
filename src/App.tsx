import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import MarketplacePage from './pages/MarketplacePage';
import MintPage from './pages/MintPage';
import RunesPage from './pages/RunesPage';
import TestPage from './pages/TestPage';
import WalletApp from './WalletApp';

function App() {
  return (
    <BrowserRouter>
      <div className='min-h-screen bg-slate-950 px-2 py-4 text-slate-100 md:px-4 md:py-10'>
        <div className='mx-auto flex min-h-[70vh] w-full max-w-6xl flex-col gap-3 md:gap-6'>
          <Header />
          <Routes>
            <Route path='/' element={<MintPage />} />
            <Route path='/marketplace' element={<MarketplacePage />} />
            <Route path='/runes' element={<RunesPage />} />
            <Route path='/wallet' element={<WalletApp />} />
            <Route path='/test' element={<TestPage />} />
            <Route path='*' element={<Navigate to='/' replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
