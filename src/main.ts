import { Router } from 'itty-router';

import { usersRouter } from './users';

export const router = Router();

router.get('/', () => {
  return new Response(
    'Hello, world! This is the root page of your Worker template.'
  );
});

router.all('/users/*', usersRouter.handle);

router.all('*', () => new Response('404, not found!', { status: 404 }));
