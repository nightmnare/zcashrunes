import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { app as firebaseApp } from './firebase';
import { formatErrorMessage } from './errors';

type MintRegisterDto = {
  address: string;
  ipfs_cid: string;
  ipfs_type: string;
  inscriptionId: string;
  utxo: string;
  price?: number;
  isSale?: boolean;
  rawPsbt?: string;
  signedPsbt?: string;
  collectionId?: string;
  collectionName?: string;
};

export type RuneEtchDto = {
  address: string;
  runeName: string;
  runeSymbol: string;
  runeSupply: string;
  runeDecimals: string;
  limitPerMint: string;
  mintedAmount: number;
  transactionId: string;
  runeId?: string; // Format: "block:tx" - set after transaction is confirmed
  utxo?: string;
  createdAt?: string;
};

export type RuneMintDto = {
  address: string;
  runeId: string;
  amount: string;
  transactionId: string;
  runeTransactionId: string; // Transaction ID from the rune etch record
  runeName: string; // Rune name from the rune etch record
  utxo?: string;
  createdAt?: string;
};

export type TransactionHistoryDto = {
  from: string;
  to: string;
  inscriptionId: string;
  reason: string;
  price: number;
  createdAt?: string;
  transactionId?: string;
};

type MintQueryDto = {
  address: string;
  page?: number;
  limit?: number;
};

type UtxosQueryDto = {
  address: string;
};

type RawUtxoResponseItem = {
  txid: string;
  vout: number;
  value?: number;
  amount?: number;
  address: string;
};

type SendTransactionDto = {
  hex: string;
};

export type SendTransactionResponse = {
  result: string | null;
  error: string | null;
  id: number | string | null;
};

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'https://api.zrunes.com';
const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }
  return response.json();
};

export const registerMint = async (dto: MintRegisterDto) => {
  const db = getFirestore(firebaseApp);
  const docRef = doc(db, 'mints', dto.inscriptionId);
  await setDoc(docRef, {
    ...dto,
    createdAt: new Date().toISOString(),
  });
};

export const registerRuneEtch = async (dto: RuneEtchDto) => {
  const db = getFirestore(firebaseApp);
  // Use transactionId as document ID, or generate a unique ID if needed
  const docRef = doc(db, 'runes', dto.transactionId);
  await setDoc(docRef, {
    ...dto,
    createdAt: dto.createdAt || new Date().toISOString(),
  });
};

export const registerRuneMint = async (dto: RuneMintDto) => {
  const db = getFirestore(firebaseApp);
  // Use transactionId as document ID for mint record
  const docRef = doc(db, 'runesMint', dto.transactionId);
  await setDoc(docRef, {
    ...dto,
    createdAt: dto.createdAt || new Date().toISOString(),
  });
};

export const updateRuneEtchMintedAmount = async (
  transactionId: string,
  additionalAmount: number
) => {
  const db = getFirestore(firebaseApp);
  const docRef = doc(db, 'runes', transactionId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Rune etch record not found');
  }

  const currentData = docSnap.data() as RuneEtchDto;
  const newMintedAmount = (currentData.mintedAmount || 0) + additionalAmount;

  await updateDoc(docRef, {
    mintedAmount: newMintedAmount,
  });

  return newMintedAmount;
};

/**
 * Get Rune etch record by transaction ID
 */
export const getRuneEtchByTransactionId = async (
  transactionId: string
): Promise<RuneEtchDto | null> => {
  const db = getFirestore(firebaseApp);
  const docRef = doc(db, 'runes', transactionId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    ...docSnap.data(),
  } as RuneEtchDto;
};

/**
 * Get Rune etch record by Rune ID (block:tx format)
 * Note: This searches by matching the transactionId pattern
 * In a real implementation, you'd want to index by runeId
 */
export const getRuneEtchByRuneId = async (
  runeId: string
): Promise<RuneEtchDto | null> => {
  const db = getFirestore(firebaseApp);
  // For now, we'll search by transactionId matching the runeId pattern
  // In production, you'd want a proper index on runeId field
  const q = query(collection(db, 'runes'), limit(1000));
  const querySnapshot = await getDocs(q);

  for (const docSnap of querySnapshot.docs) {
    const data = docSnap.data() as RuneEtchDto;
    // Check if runeId matches
    if (data.runeId === runeId) {
      return data;
    }
    // Also check if transactionId matches (fallback)
    if (data.transactionId === runeId) {
      return data;
    }
  }

  // Alternative: if transactionId IS the runeId format, try direct lookup
  try {
    return await getRuneEtchByTransactionId(runeId);
  } catch {
    return null;
  }
};

/**
 * Get all Rune etch records by address
 */
export const getRunesByAddress = async (
  address: string
): Promise<RuneEtchDto[]> => {
  const db = getFirestore(firebaseApp);
  const q = query(
    collection(db, 'runes'),
    where('address', '==', address),
    limit(1000)
  );
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
  })) as RuneEtchDto[];
};

/**
 * Get all Rune mint records by address
 */
export const getRuneMintsByAddress = async (
  address: string
): Promise<RuneMintDto[]> => {
  const db = getFirestore(firebaseApp);
  const q = query(
    collection(db, 'runesMint'),
    where('address', '==', address),
    limit(1000)
  );
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
  })) as RuneMintDto[];
};

/**
 * Get all available Rune etch records (those with runeId)
 */
export const getAvailableRunes = async (): Promise<RuneEtchDto[]> => {
  const db = getFirestore(firebaseApp);
  const q = query(collection(db, 'runes'), limit(1000));
  const querySnapshot = await getDocs(q);

  // Filter to only return runes that have a runeId (are activated)
  return querySnapshot.docs
    .map((docSnap) => ({
      ...docSnap.data(),
    }))
    .filter(
      (rune) => rune.runeId && rune.runeId.trim().length > 0
    ) as RuneEtchDto[];
};

const sortByCreatedAtDesc = <T extends { createdAt?: string }>(items: T[]) => {
  return items.sort((a, b) => {
    const dateA = a.createdAt || '';
    const dateB = b.createdAt || '';
    return dateB.localeCompare(dateA);
  });
};

export const getRecentRuneEtches = async (
  limitCount = 50
): Promise<RuneEtchDto[]> => {
  const db = getFirestore(firebaseApp);
  const q = query(collection(db, 'runes'), limit(1000));
  const querySnapshot = await getDocs(q);

  const runes = querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
  })) as RuneEtchDto[];

  return sortByCreatedAtDesc(runes).slice(0, limitCount);
};

export const getRecentRuneMints = async (
  limitCount = 50
): Promise<RuneMintDto[]> => {
  const db = getFirestore(firebaseApp);
  const q = query(collection(db, 'runesMint'), limit(1000));
  const querySnapshot = await getDocs(q);

  const mints = querySnapshot.docs.map((docSnap) => ({
    ...docSnap.data(),
  })) as RuneMintDto[];

  return sortByCreatedAtDesc(mints).slice(0, limitCount);
};

/**
 * Fetch transaction data from Zcash explorer
 */
export const getTransactionData = async (
  txid: string
): Promise<{
  height: number;
  txid: string;
  [key: string]: unknown;
}> => {
  const url = `${API_BASE_URL}/rpc/getTransaction?txid=${txid}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transaction: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

/**
 * Update Rune etch record with runeId
 */
export const updateRuneEtchRuneId = async (
  transactionId: string,
  runeId: string
): Promise<void> => {
  const db = getFirestore(firebaseApp);
  const docRef = doc(db, 'runes', transactionId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    throw new Error('Rune etch record not found');
  }

  await updateDoc(docRef, {
    runeId,
  });
};

export const updateMint = async (
  inscriptionId: string,
  dto: Partial<MintRegisterDto>
) => {
  const db = getFirestore(firebaseApp);
  const docRef = doc(db, 'mints', inscriptionId);
  await updateDoc(docRef, {
    ...dto,
  });
};

export const saveTransactionHistory = async (dto: TransactionHistoryDto) => {
  const db = getFirestore(firebaseApp);
  const historyRef = doc(collection(db, 'transactionHistories'));
  await setDoc(historyRef, {
    ...dto,
    createdAt: dto.createdAt || new Date().toISOString(),
  });
  return historyRef.id;
};

export const getMintsByAddress = async (queryParams: MintQueryDto) => {
  const db = getFirestore(firebaseApp);
  const limitValue = queryParams.limit ?? 100;

  // Query without orderBy to avoid composite index requirement
  const q = query(
    collection(db, 'mints'),
    where('address', '==', queryParams.address),
    limit(limitValue)
  );

  const querySnapshot = await getDocs(q);
  let mints = querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt || '',
    } as {
      id: string;
      address: string;
      inscriptionId: string;
      ipfs_cid: string;
      ipfs_type: string;
      createdAt: string;
      utxo: string;
      price?: number;
      isSale?: boolean;
      rawPsbt?: string;
      signedPsbt?: string;
      [key: string]: unknown;
    };
  });

  // Sort in memory by createdAt (newest first)
  mints = mints.sort((a, b) => {
    const dateA = a.createdAt || '';
    const dateB = b.createdAt || '';
    return dateB.localeCompare(dateA); // Descending order
  });

  return {
    data: mints,
    total: mints.length,
    page: queryParams.page ?? 1,
    limit: limitValue,
  };
};

export const getUtxos = async (query: UtxosQueryDto) => {
  const url = new URL(`${API_BASE_URL}/rpc/utxos`, window.location.origin);
  url.searchParams.set('address', query.address);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'ngrok-skip-browser-warning': 'true',
    },
  });

  const response = await handleResponse<RawUtxoResponseItem[]>(res);
  const newResponse = [];
  for (const utxo of response) {
    newResponse.push({
      txid: utxo.txid,
      vout: utxo.vout,
      amount: utxo.value ?? utxo.amount ?? 0,
      address: utxo.address,
    });
  }

  return newResponse;
};

// export const getUtxos = async (query: UtxosQueryDto) => {
//   const res = await fetch(
//     `https://utxos.zerdinals.com/api/utxos/${query.address}`,
//     {
//       method: 'GET',
//       headers: {
//         'ngrok-skip-browser-warning': 'true',
//       },
//     }
//   );
//   const response = await handleResponse<RawUtxoResponseItem[]>(res);
//   // const response = [
//   //   {
//   //     value: 23590,
//   //     txid: 'b2f1ce45635fe5a33ea7f518f1bba1d3152e973b31d40163aa06fc8b0043d2af',
//   //     vout: 1,
//   //     address: 't1JpNLaaLyPMf9GxU1g75aW61roXgHjAC49',
//   //     blockHeight: 3141668,
//   //     confirmed: true,
//   //   },
//   //   {
//   //     value: 10000,
//   //     txid: '178160286c44a57661731971c40ef82dbd812184cfe5bc93900fe05c75a895ce',
//   //     vout: 1,
//   //     address: 't1JpNLaaLyPMf9GxU1g75aW61roXgHjAC49',
//   //     blockHeight: 3142104,
//   //     confirmed: true,
//   //   },
//   //   {
//   //     value: 60000,
//   //     txid: '178160286c44a57661731971c40ef82dbd812184cfe5bc93900fe05c75a895ce',
//   //     vout: 2,
//   //     address: 't1JpNLaaLyPMf9GxU1g75aW61roXgHjAC49',
//   //     blockHeight: 3142104,
//   //     confirmed: true,
//   //   },
//   // ];

//   const newResponse = [];
//   for (const utxo of response) {
//     newResponse.push({
//       txid: utxo.txid,
//       vout: utxo.vout,
//       amount: utxo.value ?? utxo.amount ?? 0,
//       address: utxo.address,
//     });
//   }

//   return newResponse;
// };

export const sendTransaction = async (
  body: SendTransactionDto
): Promise<SendTransactionResponse> => {
  const response = await fetch(`${API_BASE_URL}/rpc/sendTransaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify(body),
  });

  const payload = await handleResponse<SendTransactionResponse>(response);
  const normalizedError = formatErrorMessage(payload.error);

  return {
    ...payload,
    error: normalizedError || null,
  };
};

type MarketplaceQueryDto = {
  page?: number;
  limit?: number;
  inscriptionId?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'createdAt' | 'price';
  sortOrder?: 'asc' | 'desc';
};

export const getMarketplaceMints = async (queryParams: MarketplaceQueryDto) => {
  const db = getFirestore(firebaseApp);
  const limitValue = queryParams.limit ?? 20;
  const page = queryParams.page ?? 1;

  // Query without orderBy to avoid composite index requirement
  // Fetch more items to account for filtering/sorting in memory
  const fetchLimit = 500; // Fetch up to 500 items for filtering/sorting
  const q = query(
    collection(db, 'mints'),
    where('isSale', '==', true),
    limit(fetchLimit)
  );

  const querySnapshot = await getDocs(q);
  let mints = querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt || '',
    } as {
      id: string;
      address: string;
      inscriptionId: string;
      ipfs_cid: string;
      ipfs_type: string;
      createdAt: string;
      utxo: string;
      price?: number;
      isSale?: boolean;
      rawPsbt?: string;
      signedPsbt?: string;
      [key: string]: unknown;
    };
  });

  // Apply filters in memory
  if (queryParams.inscriptionId) {
    mints = mints.filter((mint) =>
      mint.inscriptionId
        .toLowerCase()
        .includes(queryParams.inscriptionId!.toLowerCase())
    );
  }

  if (queryParams.minPrice !== undefined) {
    mints = mints.filter((mint) => (mint.price || 0) >= queryParams.minPrice!);
  }

  if (queryParams.maxPrice !== undefined) {
    mints = mints.filter((mint) => (mint.price || 0) <= queryParams.maxPrice!);
  }

  // Apply sorting in memory
  if (queryParams.sortBy === 'price') {
    mints = mints.sort((a, b) => {
      const priceA = a.price || 0;
      const priceB = b.price || 0;
      return queryParams.sortOrder === 'asc'
        ? priceA - priceB
        : priceB - priceA;
    });
  } else {
    // Sort by createdAt (default)
    mints = mints.sort((a, b) => {
      const dateA = a.createdAt || '';
      const dateB = b.createdAt || '';
      return queryParams.sortOrder === 'asc'
        ? dateA.localeCompare(dateB)
        : dateB.localeCompare(dateA);
    });
  }

  // Apply pagination
  const startIndex = (page - 1) * limitValue;
  const paginatedMints = mints.slice(startIndex, startIndex + limitValue);

  return {
    data: paginatedMints,
    total: mints.length,
    page,
    limit: limitValue,
    totalPages: Math.ceil(mints.length / limitValue),
  };
};

export type CollectionDto = {
  name: string;
  description: string;
  imageUrl: string;
  inscriptionIds?: string[];
  createdAt?: string;
};

export const createCollection = async (
  collectionId: string,
  dto: CollectionDto
) => {
  const db = getFirestore(firebaseApp);
  const docRef = doc(db, 'collections', collectionId);
  await setDoc(docRef, {
    ...dto,
    createdAt: dto.createdAt || new Date().toISOString(),
  });
  return collectionId;
};

export const getMintByInscriptionId = async (inscriptionId: string) => {
  const db = getFirestore(firebaseApp);
  const docRef = doc(db, 'mints', inscriptionId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  };
};

export const getAllCollections = async () => {
  const db = getFirestore(firebaseApp);
  const q = query(collection(db, 'collections'));
  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Array<CollectionDto & { id: string }>;
};

export const getMintsByCollectionId = async (collectionId: string) => {
  const db = getFirestore(firebaseApp);
  const fetchLimit = 500;

  let q;
  if (collectionId === 'others') {
    // For "others", get mints where isSale = true and collectionId is null/undefined or doesn't exist
    q = query(
      collection(db, 'mints'),
      where('isSale', '==', true),
      limit(fetchLimit)
    );
  } else {
    // For specific collection, get mints where isSale = true and collectionId matches
    q = query(
      collection(db, 'mints'),
      where('isSale', '==', true),
      where('collectionId', '==', collectionId),
      limit(fetchLimit)
    );
  }

  const querySnapshot = await getDocs(q);
  let mints = querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt || '',
    } as {
      id: string;
      address: string;
      inscriptionId: string;
      ipfs_cid: string;
      ipfs_type: string;
      createdAt: string;
      utxo: string;
      price?: number;
      isSale?: boolean;
      rawPsbt?: string;
      signedPsbt?: string;
      collectionId?: string;
      collectionName?: string;
      [key: string]: unknown;
    };
  });

  // For "others", filter out mints that have a collectionId
  if (collectionId === 'others') {
    mints = mints.filter(
      (mint) => !mint.collectionId || mint.collectionId === 'others'
    );
  }

  // Sort by createdAt (newest first)
  mints = mints.sort((a, b) => {
    const dateA = a.createdAt || '';
    const dateB = b.createdAt || '';
    return dateB.localeCompare(dateA);
  });

  return mints;
};
