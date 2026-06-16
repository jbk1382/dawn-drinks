import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCEKr4-mG3_GsDR-hXRSM62j8dwGazmD6U",
  authDomain: "daun-drinks-cd57f.firebaseapp.com",
  projectId: "daun-drinks-cd57f",
  storageBucket: "daun-drinks-cd57f.firebasestorage.app",
  messagingSenderId: "654475550073",
  appId: "1:654475550073:web:b04955e6eeeb2b5abb23a8"
};

const app = initializeApp(firebaseConfig);

// 오프라인 캐시 활성화 - 데이터를 기기에 저장해 빠르게 로드
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
