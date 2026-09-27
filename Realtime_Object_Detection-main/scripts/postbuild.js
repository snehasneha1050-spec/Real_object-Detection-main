import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const indexHtml = path.join(distDir, 'index.html');

if (fs.existsSync(indexHtml)) {
  const routes = ['detection', 'login', 'signup', 'dashboard', 'history', 'statistics', 'settings', 'profile'];
  routes.forEach(route => {
    const routeDir = path.join(distDir, route);
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true });
    }
    fs.copyFileSync(indexHtml, path.join(routeDir, 'index.html'));
  });
  console.log('Successfully generated static SPA routes for:', routes.join(', '));
}
