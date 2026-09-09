import { test, expect, type Page } from '@playwright/test';

// These records exist only inside intercepted test responses, never in the application.
const place = {
  placeId: 'test-cafe',
  name: 'Café du test',
  address: '1 Rue Exemple, 75001 Paris, France',
  category: 'Café',
  rating: 4.7,
  reviewCount: 200,
  score: 4.66,
  openNow: true,
  lat: 48.85,
  lng: 2.35,
  distance: 120,
  mapsUrl: 'https://www.google.com/maps/place/?q=place_id:test-cafe',
};
async function mockApi(page: Page) {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/config')
      return route.fulfill({
        json: {
          mapsApiKey: null,
          mapsMapId: null,
          searchAvailable: true,
          adsenseClientId: null,
          adsenseSlotId: null,
        },
      });
    if (path === '/api/geocode')
      return route.fulfill({ json: { lat: 48.85, lng: 2.35, formattedAddress: 'Paris' } });
    if (path === '/api/search')
      return route.fulfill({ json: { count: 1, places: [place], warnings: [], attributions: [] } });
    if (path === '/api/place-details')
      return route.fulfill({
        json: {
          ...place,
          phone: '01 23 45 67 89',
          website: 'https://example.com',
          weekdayText: ['Lundi : 09:00 – 18:00'],
          reviews: [
            {
              author: 'Camille',
              authorUrl: 'https://example.com/camille',
              rating: 5,
              relativeTime: 'il y a un mois',
              text: 'Un accueil chaleureux.',
              photoUrl: null,
            },
          ],
          attributions: [],
        },
      });
    if (path === '/api/shorten')
      return route.fulfill({ status: 503, json: { error: 'Storage unavailable in this test' } });
    return route.fulfill({ status: 404, json: { error: 'Not mocked' } });
  });
}
test.beforeEach(async ({ page }) => {
  await mockApi(page);
});
test('search, decimal filter, details and sharing work without a map key', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Que cherchez-vous ?' }).fill('Café');
  await page.getByLabel('Autour de').fill('Paris');
  await page.getByRole('button', { name: 'Explorer les lieux' }).click();
  await expect(page.getByRole('heading', { name: '1 lieu à découvrir' })).toBeVisible();
  await page.getByRole('button', { name: /Café du test/ }).click();
  await expect(page.getByRole('dialog', { name: 'Café du test' })).toBeVisible();
  await expect(page.getByText('Un accueil chaleureux.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filtres', exact: true }).click();
  await page.getByLabel('Note minimum').fill('4.8');
  await expect(page.getByText('Aucun lieu ne correspond.')).toBeVisible();
  await page.getByRole('button', { name: 'Partager cette recherche' }).click();
  await expect(page.getByLabel('Lien de la recherche')).toHaveValue(/ratingMin=4.8/);
  await expect(page.getByText(/Le lien court est indisponible/)).toBeVisible();
});
test('restores legacy links independently of Maps and supports keyboard department suggestions', async ({
  page,
}) => {
  await page.goto('/?q=Caf%C3%A9&lat=48.85&lng=2.35&radius=5000&day=0&time=10%3A00');
  await expect(page.getByRole('heading', { name: '1 lieu à découvrir' })).toBeVisible();
  await page.getByRole('button', { name: /Préciser la zone/ }).click();
  const zones = page.getByRole('combobox', { name: /Villes ou départements/ });
  await zones.fill('Essonne');
  await zones.press('ArrowDown');
  await zones.press('Enter');
  await expect(page.getByRole('button', { name: 'Retirer Essonne (91)' })).toBeVisible();
  await expect(page.getByLabel('Rayon')).toBeDisabled();
});
test('mobile list/map switching preserves the search', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile view only');
  await page.goto('/?q=Caf%C3%A9&lat=48.85&lng=2.35&radius=5000');
  await expect(page.getByRole('heading', { name: '1 lieu à découvrir' })).toBeVisible();
  await page.getByRole('button', { name: 'Carte', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Carte des lieux' })).toBeVisible();
  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 lieu à découvrir' })).toBeVisible();
});
