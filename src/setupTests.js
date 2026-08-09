import '@testing-library/jest-dom';

// Mock the firebase/auth module
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth, callback) => {
    // Simulate a logged-out user immediately
    callback(null);
    // Return a mock unsubscribe function
    return () => {};
  },
  signInWithEmailAndPassword: (auth, email, password) => {
    // Mock a successful login
    return Promise.resolve({
      user: { uid: 'test-uid', email: email },
    });
  },
  getAuth: () => ({}),
}));
