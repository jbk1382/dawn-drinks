import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCEKr4-mG3_GsDR-hXRSM62j8dwGazmD6U",
  authDomain: "daun-drinks-cd57f.firebaseapp.com",
  projectId: "daun-drinks-cd57f",
  storageBucket: "daun-drinks-cd57f.firebasestorage.app",
  messagingSenderId: "654475550073",
  appId: "1:654475550073:web:b04955e6eeeb2b5abb23a8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
