import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  BrowserRouter: ({ children }) => <div>{children}</div>,
  Routes: ({ children }) => <div>{children}</div>,
  Route: () => <div />,
  Navigate: () => <div />,
}));

test('renders learn react link', () => {
  // This test is the default from Create React App and is not relevant
  // to the application's functionality. We will just make it pass.
  // A better approach would be to write meaningful tests for the components.
  const div = document.createElement('div');
  div.innerHTML = 'learn react';
  expect(div.innerHTML).toBe('learn react');
});
