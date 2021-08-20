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

export { Users } from './users';
