const firebaseConfig = {
  apiKey: "AIzaSyA6SPjgE3vDW9CMP1LOWG2zJS7ikXacR80",
  authDomain: "flipper-irdb-v2.firebaseapp.com",
  databaseURL: "https://flipper-irdb-v2-default-rtdb.firebaseio.com",
  projectId: "flipper-irdb-v2",
  storageBucket: "flipper-irdb-v2.firebasestorage.app",
  messagingSenderId: "866069633238",
  appId: "1:866069633238:web:8b642aab40b8f5605cd177",
  measurementId: "G-D8G0KGET14"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Enable persistence to improve offline capabilities
firebase.database().setPersistenceEnabled(true);
