// ============================================================
// CONFIGURAÇÃO DO FIREBASE — projeto FrotaCtrl
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCIolsvRucTxiXLpc2C4l1TyRsr535yhKs",
  authDomain: "frotactrl.firebaseapp.com",
  projectId: "frotactrl",
  storageBucket: "frotactrl.firebasestorage.app",
  messagingSenderId: "850638363776",
  appId: "1:850638363776:web:8e3cae4d365621b5699a65"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Ajuda o Firestore a funcionar melhor offline / em conexões ruins de obra/pátio
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ============================================================
// CONFIGURAÇÃO DO CLOUDINARY — usado para anexos (fotos, PDFs, vídeos)
// O plano gratuito do Firebase (Spark) não permite mais usar o Storage
// sem cartão de crédito cadastrado, então os anexos vão para o Cloudinary
// via upload "unsigned" (sem expor nenhuma chave secreta no navegador).
// ============================================================
const CLOUDINARY_CONFIG = {
  cloudName: "ukjt4x0w",
  uploadPreset: "nuvem_frota_ctrl"
};
