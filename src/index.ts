import { Router } from 'itty-router';

const router = Router();

router.get('/', () => {
  return new Response(
    'Hello, world! This is the root page of your Worker template.'
  );
});

router.all('*', () => new Response('404, not found!', { status: 404 }));

addEventListener('fetch', event => {
  event.respondWith(router.handle(event.request));
});
