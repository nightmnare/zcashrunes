import { initializeApp } from 'firebase/app';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: 'AIzaSyAs_67WgpFYOowL56Sv0scUpA50U_1LzT0',
  authDomain: 'z-nfts.firebaseapp.com',
  projectId: 'z-nfts',
  storageBucket: 'z-nfts.firebasestorage.app',
  messagingSenderId: '666747436238',
  appId: '1:666747436238:web:d292ec5d43155050ace49f',
  measurementId: 'G-JTBQBQZFV6',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export { app };
