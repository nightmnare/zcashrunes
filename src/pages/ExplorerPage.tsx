import { useState, useEffect, useMemo } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  getRecentRuneEtches,
  getRecentRuneMints,
  type RuneEtchDto,
  type RuneMintDto,
} from '../lib/api';

const ZCASH_TX_EXPLORER_BASE = 'https://blockchair.com/zcash/transaction';

type ActivityType = 'all' | 'etches' | 'mints';

const ExplorerPage = () => {
  const [activeTab, setActiveTab] = useState<ActivityType>('all');
  const [etches, setEtches] = useState<RuneEtchDto[]>([]);
  const [mints, setMints] = useState<RuneMintDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const extractBlockHeight = (runeId?: string): number => {
    if (!runeId) return 0;
    const parts = runeId.split(':');
    if (parts.length > 0) {
      const height = parseInt(parts[0], 10);
      return Number.isNaN(height) ? 0 : height;
    }
    return 0;
  };

  const formatDate = (value?: string): string => {
    if (!value) return 'Unknown';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Unknown'
      : date.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [etchesData, mintsData] = await Promise.all([
        getRecentRuneEtches(100),
        getRecentRuneMints(100),
      ]);
      setEtches(etchesData);
      setMints(mintsData);
    } catch (error) {
      console.error('Failed to load explorer data:', error);
      toast.error('Failed to load explorer data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const combinedActivities = useMemo(() => {
    const etchActivities = etches.map((etch) => ({
      type: 'etch' as const,
      data: etch,
      timestamp: etch.createdAt || '',
      blockHeight: extractBlockHeight(etch.runeId),
    }));

    const mintActivities = mints.map((mint) => ({
      type: 'mint' as const,
      data: mint,
      timestamp: mint.createdAt || '',
      blockHeight: extractBlockHeight(mint.runeId),
    }));

    return [...etchActivities, ...mintActivities].sort((a, b) => {
      // Sort by timestamp descending (newest first)
      if (b.timestamp !== a.timestamp) {
        return b.timestamp.localeCompare(a.timestamp);
      }
      // Then by block height descending
      return b.blockHeight - a.blockHeight;
    });
  }, [etches, mints]);

  const filteredActivities = useMemo(() => {
    if (activeTab === 'all') {
      return combinedActivities;
    }
    // Map tab values to activity types
    const activityType = activeTab === 'etches' ? 'etch' : 'mint';
    return combinedActivities.filter((activity) => activity.type === activityType);
  }, [combinedActivities, activeTab]);

  const paginatedActivities = filteredActivities.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  return (
    <>
      <Toaster
        position='top-center'
        toastOptions={{
          duration: 4000,
          className: 'rounded-2xl text-sm shadow-lg',
          style: {
            background: '#0f172a',
            color: '#e2e8f0',
            border: '1px solid rgba(148, 163, 184, 0.3)',
          },
          success: {
            iconTheme: {
              primary: '#34d399',
              secondary: '#0f172a',
            },
          },
          error: {
            iconTheme: {
              primary: '#f87171',
              secondary: '#0f172a',
            },
          },
        }}
      />
      <main className='w-full px-2 py-4 md:px-4 md:py-10'>
        <div className='mx-auto w-full max-w-7xl'>
          <div className='rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-2xl shadow-slate-900/50 md:rounded-3xl md:p-6'>
            <h1 className='text-2xl font-semibold text-white mb-2'>
              Runes Explorer
            </h1>
            <p className='text-sm text-slate-400 mb-6'>
              Explore all recent rune etches and mints on the Zcash network
            </p>

            {/* Tab Navigation */}
            <div className='flex gap-2 border-b border-slate-800 mb-6'>
              <button
                type='button'
                onClick={() => setActiveTab('all')}
                className={`px-4 py-3 text-sm font-semibold transition ${
                  activeTab === 'all'
                    ? 'border-b-2 border-indigo-400 text-indigo-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({combinedActivities.length})
              </button>
              <button
                type='button'
                onClick={() => setActiveTab('etches')}
                className={`px-4 py-3 text-sm font-semibold transition ${
                  activeTab === 'etches'
                    ? 'border-b-2 border-indigo-400 text-indigo-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Etches ({etches.length})
              </button>
              <button
                type='button'
                onClick={() => setActiveTab('mints')}
                className={`px-4 py-3 text-sm font-semibold transition ${
                  activeTab === 'mints'
                    ? 'border-b-2 border-indigo-400 text-indigo-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mints ({mints.length})
              </button>
            </div>

            {loading ? (
              <div className='text-center text-slate-400 py-12'>
                <p>Loading explorer data...</p>
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className='text-center text-slate-400 py-12'>
                <p>No activities found</p>
              </div>
            ) : (
              <>
                <div className='overflow-x-auto'>
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='border-b border-slate-800'>
                        <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                          Type
                        </th>
                        <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                          Rune Name
                        </th>
                        <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                          Rune ID
                        </th>
                        <th className='text-right py-3 px-2 text-slate-400 font-semibold'>
                          Amount
                        </th>
                        <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                          Address
                        </th>
                        <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                          Transaction
                        </th>
                        <th className='text-left py-3 px-2 text-slate-400 font-semibold'>
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedActivities.map((activity, index) => {
                        const isEtch = activity.type === 'etch';
                        const etchData = isEtch
                          ? (activity.data as RuneEtchDto)
                          : null;
                        const mintData = !isEtch
                          ? (activity.data as RuneMintDto)
                          : null;

                        const transactionId = isEtch
                          ? etchData?.transactionId
                          : mintData?.transactionId;
                        const explorerUrl = transactionId
                          ? `${ZCASH_TX_EXPLORER_BASE}/${transactionId}`
                          : null;

                        return (
                          <tr
                            key={`${activity.type}-${transactionId}-${index}`}
                            className='border-b border-slate-800/50 hover:bg-slate-900/30 transition'
                          >
                            <td className='py-3 px-2'>
                              <span
                                className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold ${
                                  isEtch
                                    ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/40'
                                    : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                                }`}
                              >
                                {isEtch ? 'Etch' : 'Mint'}
                              </span>
                            </td>
                            <td className='py-3 px-2'>
                              <p className='text-sm font-semibold text-white'>
                                {isEtch
                                  ? etchData?.runeName || 'N/A'
                                  : mintData?.runeName || 'N/A'}
                              </p>
                            </td>
                            <td className='py-3 px-2'>
                              <p
                                className='text-xs font-mono text-indigo-300 break-all max-w-[120px] truncate'
                                title={
                                  isEtch
                                    ? etchData?.runeId
                                    : mintData?.runeId
                                }
                              >
                                {isEtch
                                  ? etchData?.runeId || 'N/A'
                                  : mintData?.runeId || 'N/A'}
                              </p>
                            </td>
                            <td className='py-3 px-2 text-right'>
                              <p className='text-sm text-white'>
                                {isEtch
                                  ? etchData?.runeSupply || '0'
                                  : mintData?.amount || '0'}
                              </p>
                            </td>
                            <td className='py-3 px-2'>
                              <p
                                className='text-xs font-mono text-slate-400 break-all max-w-[120px] truncate'
                                title={
                                  isEtch
                                    ? etchData?.address
                                    : mintData?.address
                                }
                              >
                                {isEtch
                                  ? etchData?.address || 'N/A'
                                  : mintData?.address || 'N/A'}
                              </p>
                            </td>
                            <td className='py-3 px-2'>
                              {explorerUrl ? (
                                <a
                                  href={explorerUrl}
                                  target='_blank'
                                  rel='noreferrer'
                                  className='text-xs font-mono text-indigo-300 hover:text-indigo-200 underline break-all max-w-[120px] truncate block'
                                  title={transactionId}
                                >
                                  {transactionId?.slice(0, 16)}...
                                </a>
                              ) : (
                                <p className='text-xs text-slate-500'>N/A</p>
                              )}
                            </td>
                            <td className='py-3 px-2'>
                              <p className='text-xs text-slate-400'>
                                {formatDate(activity.timestamp)}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className='mt-6 flex items-center justify-between'>
                    <div className='text-sm text-slate-400'>
                      Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                      {Math.min(
                        currentPage * itemsPerPage,
                        filteredActivities.length
                      )}{' '}
                      of {filteredActivities.length} activities
                    </div>
                    <div className='flex gap-2'>
                      <button
                        type='button'
                        onClick={() =>
                          setCurrentPage((prev) => Math.max(1, prev - 1))
                        }
                        disabled={currentPage === 1}
                        className='rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        Previous
                      </button>
                      <span className='flex items-center px-3 py-1 text-sm text-slate-300'>
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type='button'
                        onClick={() =>
                          setCurrentPage((prev) =>
                            Math.min(totalPages, prev + 1)
                          )
                        }
                        disabled={currentPage >= totalPages}
                        className='rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default ExplorerPage;

