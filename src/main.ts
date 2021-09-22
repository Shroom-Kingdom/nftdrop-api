import { Router } from 'itty-router';

// import { airdropRouter } from './airdrop';
import { discordRouter } from './discord';
// import { founderNftRouter } from './founder-nft';
// import { usersRouter } from './users';

export const router = Router();

// router.all('/airdrop/*', airdropRouter.handle);
router.all('/discord/*', discordRouter.handle);
// router.all('/foundernft/*', founderNftRouter.handle);
// router.all('/users/*', usersRouter.handle);

router.all('*', () => {
  console.log('404');
  return new Response('', { status: 404 });
});
