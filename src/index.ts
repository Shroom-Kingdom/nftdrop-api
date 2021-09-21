import { router } from './main';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return router.handle(request, env);
    } catch (e) {
      if (e instanceof Error) {
        return new Response(e.message);
      }
      return new Response('Unknown Error', { status: 500 });
    }
  }
};

export { Airdrop } from './airdrop';
export { FounderNft } from './founder-nft';
export { Twitter } from './twitter';
export { Users } from './users';
