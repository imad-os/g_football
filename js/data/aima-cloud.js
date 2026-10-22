/* checkoAI's cloud store: the public web config of its own Firebase project (Firestore + Auth). Not secret: what may be
 * read or written is decided by the Firestore rules (README, "checkoAI"). The app config "aimaFirebase" overrides it. */
(function (NS) {
  'use strict';
  NS.AIMA_CLOUD = {
    apiKey: 'AIzaSyDms78RzK1hEH-Cl8nJxnffEWPpCG22xNY',
    authDomain: 'aima-1904d.firebaseapp.com',
    projectId: 'aima-1904d',
    storageBucket: 'aima-1904d.firebasestorage.app',
    messagingSenderId: '13553357793',
    appId: '1:13553357793:web:83a756d71c129fd3fa78a0'
  };
})(window.RS6 = window.RS6 || {});
