import { buildBrowserApiOrigin, normalizeConfiguredOrigin } from './baseUrl';

describe('baseUrl origin resolution', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  function setMockLocation(locationObj) {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: locationObj,
    });
  }

  test('resolves to same origin in production on https without port', () => {
    setMockLocation({
      protocol: 'https:',
      hostname: 'shein-tracker.duckdns.org',
      port: '',
      origin: 'https://shein-tracker.duckdns.org',
    });

    expect(buildBrowserApiOrigin()).toBe('https://shein-tracker.duckdns.org');
    expect(normalizeConfiguredOrigin()).toBe('https://shein-tracker.duckdns.org');
    expect(normalizeConfiguredOrigin('http://127.0.0.1:8081')).toBe('https://shein-tracker.duckdns.org');
  });

  test('resolves to backend port 8081 when running locally on react dev server port 3000', () => {
    setMockLocation({
      protocol: 'http:',
      hostname: 'localhost',
      port: '3000',
      origin: 'http://localhost:3000',
    });

    expect(buildBrowserApiOrigin()).toBe('http://localhost:8081');
    expect(normalizeConfiguredOrigin()).toBe('http://localhost:8081');
  });

  test('preserves external configured origin', () => {
    setMockLocation({
      protocol: 'https:',
      hostname: 'shein-tracker.duckdns.org',
      port: '',
      origin: 'https://shein-tracker.duckdns.org',
    });

    expect(normalizeConfiguredOrigin('https://api.external.com')).toBe('https://api.external.com');
  });
});
