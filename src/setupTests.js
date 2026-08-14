import '@testing-library/jest-dom';

// jsdom には ResizeObserver が無い。中身の高さを見張る部品（CardFace）が
// 落ちるので、何もしない実装を置く。
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
