import { router } from './main';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return router.handle(request, env);
    } catch (e) {
      return new Response(e.message);
    }
  }
};

export { Airdrop } from './airdrop';
export { FounderNft } from './founder-nft';
export { Users } from './users';
