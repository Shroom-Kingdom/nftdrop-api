import { router } from './main';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const origin = (request as any).headers.get('Origin');
      const res = await router.handle(request, env);
      const response = new Response(res.body, res);
      response.headers.set('Access-Control-Allow-Origin', origin);
      return response;
    } catch (e) {
      const headers = new Headers();
      headers.set(
        'Access-Control-Allow-Origin',
        (request as any).headers.get('Origin')
      );
      if (e instanceof Error) {
        return new Response(e.message, { headers });
      }
      return new Response('Unknown Error', { status: 500, headers });
    }
  }
};

export { Discord } from './discord';
// export { Airdrop } from './airdrop';
// export { FounderNft } from './founder-nft';
// export { Twitter } from './twitter';
// export { Users } from './users';
