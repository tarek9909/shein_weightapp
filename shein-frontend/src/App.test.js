import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the sign-in screen for an unauthenticated visitor', () => {
  window.history.pushState({}, '', '/login');
  render(<App />);
  expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  expect(screen.getByText(/ask the admin to create your account/i)).toBeInTheDocument();
});
