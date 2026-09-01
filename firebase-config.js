// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// Substitua os valores abaixo pelos dados do SEU projeto Firebase.
// Console > Configurações do projeto > Seus apps > Config do SDK
// ============================================================
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Ajuda o Firestore a funcionar melhor offline / em conexões ruins de obra/pátio
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
