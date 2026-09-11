import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the setup screen for a new visitor', () => {
  render(<App />);
  expect(screen.getByText(/setup account/i)).toBeInTheDocument();
});
