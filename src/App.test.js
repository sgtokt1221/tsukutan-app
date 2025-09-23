import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the app title after loading', async () => {
  render(<App />);
  const titleElement = await screen.findByText(/つくたん/i);
  expect(titleElement).toBeInTheDocument();
});
