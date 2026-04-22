// Firebase configuration and initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDbOh4JRMYzq0xMk6IJA4rMqtdtDJ_B7Tg",
  authDomain: "the-chicken-times.firebaseapp.com",
  projectId: "the-chicken-times",
  storageBucket: "the-chicken-times.firebasestorage.app",
  messagingSenderId: "817119132762",
  appId: "1:817119132762:web:1ed378a2dcd61ebdaf2c63",
  measurementId: "G-0FRCME6V9N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth, analytics, signInAnonymously };
