import { router } from './main';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const origin = (request as any).headers.get('Origin');
      const res = await router.handle(request, env);
      if (res.headers.get('Access-Control-Allow-Origin') != null) {
        return res;
      }
      const response = new Response(res.body, res);
      response.headers.set('Access-Control-Allow-Origin', origin);
      return response;
    } catch (e) {
      const headers = new Headers();
      headers.set(
        'Access-Control-Allow-Origin',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (request as any).headers.get('Origin')
      );
      if (e instanceof Error) {
        console.log('Internal Error', e.message);
        return new Response(e.message, { status: 500, headers });
      }
      console.log('Internal Error', e);
      return new Response('Unknown Error', { status: 500, headers });
    }
  }
};

export { Discord } from './discord';
