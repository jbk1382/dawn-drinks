import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA7SbE8MUMarsXvEPjTx6yZb5GHtRd6Q1w",
  authDomain: "daun-drinks-8ce01.firebaseapp.com",
  projectId: "daun-drinks-8ce01",
  storageBucket: "daun-drinks-8ce01.firebasestorage.app",
  messagingSenderId: "884975663637",
  appId: "1:884975663637:web:d7d6f8ea959f0515a56c1c"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
