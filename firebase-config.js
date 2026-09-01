// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// Substitua os valores abaixo pelos dados do SEU projeto Firebase.
// Console > Configurações do projeto > Seus apps > Config do SDK
// ============================================================
import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyCIolsvRucTxiXLpc2C4l1TyRsr535yhKs",
  authDomain: "frotactrl.firebaseapp.com",
  projectId: "frotactrl",
  storageBucket: "frotactrl.firebasestorage.app",
  messagingSenderId: "850638363776",
  appId: "1:850638363776:web:8e3cae4d365621b5699a65"
};

firebase.initializeApp(firebaseConfig);

const app = initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Ajuda o Firestore a funcionar melhor offline / em conexões ruins de obra/pátio
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
