import { Router } from 'itty-router';

import { discordRouter } from './discord';
import { linkdropRouter } from './linkdrop';
import { twitterRouter } from './twitter';

export const router = Router();

router.all('/discord/*', discordRouter.handle);
router.all('/twitter/*', twitterRouter.handle);
router.all('/linkdrop/*', linkdropRouter.handle);

router.all('*', () => {
  console.log('404');
  return new Response('', { status: 404 });
});
